/**
 * Sales report metrics for furniture / manufacturing (standard P&L layout).
 */

async function columnExists(pool, tableName, columnName) {
    const result = await pool.request()
        .input('table', tableName)
        .input('column', columnName)
        .query(`
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @table AND COLUMN_NAME = @column
        `);
    return (result.recordset[0]?.cnt || 0) > 0;
}

async function detectSalesReportSchema(pool) {
    const [hasReturnShippingFee, hasCostPriceInventory, hasCostPriceVariations, hasActionType, hasReturnType] = await Promise.all([
        columnExists(pool, 'Orders', 'ReturnShippingFee'),
        columnExists(pool, 'InventoryProducts', 'CostPrice'),
        columnExists(pool, 'InventoryProductVariations', 'CostPrice'),
        columnExists(pool, 'Orders', 'ActionType'),
        columnExists(pool, 'Orders', 'ReturnType')
    ]);
    return {
        hasReturnShippingFee,
        hasCostPrice: hasCostPriceInventory || hasCostPriceVariations,
        hasActionType,
        hasReturnType
    };
}

function unitCostSql(hasCostPrice) {
    if (!hasCostPrice) return '0';
    return `CASE
        WHEN oi.VariationID IS NOT NULL THEN COALESCE(ipv.CostPrice, ip.CostPrice, 0)
        ELSE COALESCE(ip.CostPrice, 0)
    END`;
}

function unitCostJoins(hasCostPrice) {
    if (!hasCostPrice) return '';
    return `
        LEFT JOIN InventoryProducts ip ON ip.ProductID = oi.ProductID
        LEFT JOIN InventoryProductVariations ipv ON ipv.VariationID = oi.VariationID
    `;
}

function normalizeStatus(status) {
    return (status || '').toString().toLowerCase().trim();
}

function normalizeAction(action) {
    return (action || '').toString().toLowerCase().trim();
}

function orderDelivery(order) {
    return parseFloat(order.DeliveryCost || 0) + parseFloat(order.ExtraDeliveryFee || 0);
}

function isRefundMerchandiseOrder(order) {
    const status = normalizeStatus(order.Status);
    const action = normalizeAction(order.ActionType);
    if (status === 'refunded') return true;
    if (status === 'completed returned' && action === 'refund') return true;
    if (order.IsRefunded === 1 || order.IsRefunded === true) {
        if (status === 'completed returned' && action === 'replacement') return false;
        return true;
    }
    if (status === 'cancelled' && (order.IsRefunded === 1 || order.IsRefunded === true)) return true;
    return false;
}

function isReplacementFulfillmentOrder(order) {
    return normalizeAction(order.ActionType) === 'replacement';
}

function isRefundOrReplacementOrder(order) {
    const action = normalizeAction(order.ActionType);
    return action === 'refund' || action === 'replacement';
}

function isReturnWorkflowStatus(order) {
    const status = normalizeStatus(order.Status);
    return status === 'refunded'
        || status === 'completed returned'
        || status === 'processing (pickup)'
        || status === 'processing'
        || status === 'returned'
        || status === 'receive'
        || status === 'received';
}

/** Count orders with any return/refund closure in the report period. */
function countReturnedOrders(recordset) {
    return recordset.filter(o => {
        const s = normalizeStatus(o.Status);
        return s === 'refunded' || s === 'completed returned'
            || s === 'returned' || s === 'processing (pickup)';
    }).length;
}

/** Product + delivery portions reversed on refund (full refund reverses both). */
function getRefundReversalAmounts(order) {
    if (!isRefundMerchandiseOrder(order)) {
        return { productRefund: 0, deliveryRefund: 0 };
    }

    const merchandise = parseFloat(order.Subtotal || 0);
    const delivery = orderDelivery(order);
    const refundTotal = parseFloat(order.RefundAmount || 0);
    const orderTotal = parseFloat(order.TotalAmount || 0);
    const status = normalizeStatus(order.Status);

    const isFullRefund = status === 'refunded'
        || status === 'completed returned'
        || (orderTotal > 0 && refundTotal >= orderTotal - 0.02)
        || (refundTotal <= 0 && merchandise > 0);

    if (isFullRefund) {
        return {
            productRefund: merchandise,
            deliveryRefund: delivery
        };
    }

    const productRefund = refundTotal > 0 ? Math.min(refundTotal, merchandise) : merchandise;
    const deliveryRefund = refundTotal >= merchandise + delivery - 0.02 ? delivery : 0;

    return { productRefund, deliveryRefund };
}

function sumRefundMerchandise(recordset) {
    return recordset.reduce((sum, o) => sum + getRefundReversalAmounts(o).productRefund, 0);
}

function sumRefundDelivery(recordset) {
    return recordset.reduce((sum, o) => sum + getRefundReversalAmounts(o).deliveryRefund, 0);
}

function countRefundMerchandiseOrders(recordset) {
    return recordset.filter(isRefundMerchandiseOrder).length;
}

/** Return shipping (pickup + lost outbound) and replacement reship — seller-paid. */
function computeReturnLogisticsCosts(recordset) {
    let returnShipping = 0;
    let replacementShipping = 0;

    recordset.forEach(order => {
        if (!isRefundOrReplacementOrder(order) || !isReturnWorkflowStatus(order)) return;
        const d = orderDelivery(order);
        if (d <= 0) return;
        returnShipping += d * 2;
        if (normalizeAction(order.ActionType) === 'replacement') {
            replacementShipping += d;
        }
    });

    return { returnShipping, replacementShipping };
}

async function computeMerchandiseCostMetrics(pool, sql, orderIds, hasCostPrice, batchSize = 1000) {
    let cogs = 0;
    let replacementCost = 0;
    const unitCost = unitCostSql(hasCostPrice);
    const joins = unitCostJoins(hasCostPrice);

    if (!orderIds.length) {
        return { cogs, replacementCost };
    }

    for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const orderIdParams = batch.map((id, idx) => `@cogsOrderId${i + idx}`).join(',');

        const q = `
            SELECT
                SUM(CASE
                    WHEN o.Status NOT IN ('Cancelled', 'Refunded', 'Completed Returned')
                    THEN ISNULL(oi.Quantity, 0) * (${unitCost})
                    ELSE 0
                END) AS Cogs,
                SUM(CASE
                    WHEN LOWER(LTRIM(RTRIM(ISNULL(o.ActionType, '')))) = 'replacement'
                        AND o.Status NOT IN ('Cancelled', 'Refunded')
                    THEN ISNULL(oi.Quantity, 0) * (${unitCost})
                    ELSE 0
                END) AS ReplacementCost
            FROM OrderItems oi
            INNER JOIN Orders o ON oi.OrderID = o.OrderID
            ${joins}
            WHERE oi.OrderID IN (${orderIdParams})
        `;

        const req = pool.request();
        batch.forEach((id, idx) => {
            req.input(`cogsOrderId${i + idx}`, sql.Int, id);
        });

        const row = (await req.query(q)).recordset[0] || {};
        cogs += parseFloat(row.Cogs || 0);
        replacementCost += parseFloat(row.ReplacementCost || 0);
    }

    return { cogs, replacementCost };
}

async function computeInventoryLossAtCost(pool, sql, returnedOrders, hasReturnItemsColumn, hasCostPrice, batchSize = 1000) {
    let damageInventoryCost = 0;
    let totalUnitsDamaged = 0;
    const unitCost = unitCostSql(hasCostPrice);
    const joins = unitCostJoins(hasCostPrice);

    if (!returnedOrders.length) {
        return { damageInventoryCost, totalUnitsDamaged };
    }

    const returnedOrderIds = returnedOrders.map(o => o.OrderID);

    for (let i = 0; i < returnedOrderIds.length; i += batchSize) {
        const batch = returnedOrderIds.slice(i, i + batchSize);
        const orderIdParams = batch.map((id, idx) => `@lossOrderId${i + idx}`).join(',');

        const ordersWithReturnItemsQuery = `
            SELECT o.OrderID, o.ReturnItems, o.ReturnType
            FROM Orders o
            WHERE o.OrderID IN (${orderIdParams})
            ${hasReturnItemsColumn ? 'AND o.ReturnItems IS NOT NULL' : ''}
        `;
        const ordersRequest = pool.request();
        batch.forEach((id, idx) => {
            ordersRequest.input(`lossOrderId${i + idx}`, sql.Int, id);
        });
        const ordersWithReturnItems = await ordersRequest.query(ordersWithReturnItemsQuery);

        const orderReturnItemsMap = new Map();
        const orderReturnTypes = new Map();

        for (const order of ordersWithReturnItems.recordset) {
            if (!order.ReturnItems) continue;
            try {
                const returnItemsJson = typeof order.ReturnItems === 'string'
                    ? JSON.parse(order.ReturnItems)
                    : order.ReturnItems;
                if (Array.isArray(returnItemsJson) && returnItemsJson.length > 0) {
                    orderReturnItemsMap.set(order.OrderID, returnItemsJson);
                    orderReturnTypes.set(order.OrderID, order.ReturnType);
                }
            } catch (e) {
                console.error('[SALES REPORT] Error parsing ReturnItems:', e);
            }
        }

        const inventoryLossQuery = `
            SELECT oi.OrderID, oi.ProductID, oi.VariationID, oi.Quantity,
                (${unitCost}) AS UnitCost, o.ReturnType
            FROM OrderItems oi
            INNER JOIN Orders o ON oi.OrderID = o.OrderID
            ${joins}
            WHERE oi.OrderID IN (${orderIdParams})
            AND o.ReturnType = 'damage'
        `;

        const inventoryLossRequest = pool.request();
        batch.forEach((id, idx) => {
            inventoryLossRequest.input(`lossOrderId${i + idx}`, sql.Int, id);
        });

        const inventoryLossResult = await inventoryLossRequest.query(inventoryLossQuery);

        inventoryLossResult.recordset.forEach(item => {
            const orderId = item.OrderID;
            const returnItems = orderReturnItemsMap.get(orderId);
            const returnType = orderReturnTypes.get(orderId) || item.ReturnType;
            if (returnType !== 'damage') return;

            const unitCostVal = parseFloat(item.UnitCost || 0);

            if (returnItems && Array.isArray(returnItems) && returnItems.length > 0) {
                const returnItem = returnItems.find(ri => {
                    const returnProductId = ri.productId || ri.ProductID;
                    const returnVariationId = ri.variationId || ri.VariationID || null;
                    const itemProductId = item.ProductID;
                    const itemVariationId = item.VariationID || null;
                    const productMatch = String(returnProductId) === String(itemProductId);
                    const variationMatch = (returnVariationId == null && (itemVariationId == null || itemVariationId === undefined))
                        || (returnVariationId != null && itemVariationId != null && String(returnVariationId) === String(itemVariationId));
                    return productMatch && variationMatch;
                });
                if (returnItem) {
                    const returnQty = parseInt(returnItem.quantity || returnItem.Quantity || 0, 10);
                    damageInventoryCost += unitCostVal * returnQty;
                    totalUnitsDamaged += returnQty;
                }
            } else {
                const quantity = parseFloat(item.Quantity || 0);
                damageInventoryCost += unitCostVal * quantity;
                totalUnitsDamaged += quantity;
            }
        });
    }

    return { damageInventoryCost, totalUnitsDamaged };
}

/**
 * ERP-style aggregation: discounts applied once; refunds reverse product + delivery separately.
 */
function aggregateSalesReportFromOrders(recordset, options = {}) {
    const {
        cogs = 0,
        damageInventoryCost = 0,
        replacementCost = 0,
        totalOrders = 0,
        returnedOrdersCount = 0
    } = options;

    let grossProductSales = 0;
    let totalDiscounts = 0;
    let productRefunds = 0;
    let deliveryRevenueGross = 0;
    let deliveryRefunds = 0;

    recordset.forEach(order => {
        if (normalizeStatus(order.Status) === 'cancelled') return;

        const discount = parseFloat(order.TotalDiscounts || 0);
        const merchandise = parseFloat(order.Subtotal || 0);
        const delivery = orderDelivery(order);
        const reversals = getRefundReversalAmounts(order);

        // Gross = list product value (subtotal + discounts); net product = gross − discounts
        grossProductSales += merchandise + discount;
        totalDiscounts += discount;
        deliveryRevenueGross += delivery;
        productRefunds += reversals.productRefund;
        deliveryRefunds += reversals.deliveryRefund;
    });

    // Sales module: net product = gross − discounts only (refunds are separate reversals)
    const netProductSales = Math.max(0, grossProductSales - totalDiscounts);

    // Recognized revenue after reversals (used for net revenue & profit — never negative)
    const recognizedProductRevenue = Math.max(0, netProductSales - productRefunds);
    const netDeliveryRevenue = Math.max(0, deliveryRevenueGross - deliveryRefunds);
    const netRevenue = recognizedProductRevenue + netDeliveryRevenue;

    const returnLogistics = computeReturnLogisticsCosts(recordset);
    const returnShippingPickup = returnLogistics.returnShipping;
    const replacementReshipExpense = returnLogistics.replacementShipping;
    const returnShippingExpense = returnShippingPickup + replacementReshipExpense;
    const damageCost = parseFloat(damageInventoryCost || 0);

    const cogsVal = parseFloat(cogs || 0);
    const replacementCostVal = parseFloat(replacementCost || 0);
    const grossProfit = netRevenue
        - cogsVal
        - returnShippingExpense
        - damageCost
        - replacementCostVal;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const orders = parseInt(totalOrders || recordset.length, 10);
    const returned = parseInt(returnedOrdersCount || 0, 10);
    const returnRate = orders > 0 ? (returned / orders) * 100 : 0;
    const refundRate = grossProductSales > 0
        ? Math.min(100, (productRefunds / grossProductSales) * 100)
        : 0;

    return {
        grossSales: grossProductSales,
        grossProductSales,
        netProductSales,
        netProductSalesBeforeRefunds: netProductSales,
        recognizedProductRevenue,
        netSales: recognizedProductRevenue,
        totalDiscounts,
        productRefunds,
        deliveryRefunds,
        salesReturns: productRefunds,
        deliveryRevenue: deliveryRevenueGross,
        deliveryRevenueGross,
        netDeliveryRevenue,
        netRevenue,
        returnShippingExpense,
        returnShipping: returnShippingPickup,
        replacementShipping: replacementReshipExpense,
        damageInventoryCost: damageCost,
        damageCost,
        returnRate,
        refundRate,
        cogs: cogsVal,
        replacementCost: replacementCostVal,
        grossProfit,
        grossMargin
    };
}

/** @deprecated Use aggregateSalesReportFromOrders */
function buildSalesReportStats(params) {
    return aggregateSalesReportFromOrders([], {
        cogs: params.cogs,
        damageInventoryCost: params.damageInventoryCost,
        replacementCost: params.replacementCost,
        totalOrders: params.totalOrders,
        returnedOrdersCount: params.returnedOrdersCount
    });
}

/**
 * Sales report order row: amounts are VAT-inclusive (no separate tax column).
 * Subtotal = merchandise after discount; delivery from order or TotalAmount − merchandise.
 */
function applySalesReportOrderRowDisplay(order, items) {
    const total = parseFloat(order.TotalAmount || 0);
    const extra = parseFloat(order.ExtraDeliveryFee || 0);
    const discount = parseFloat(order.TotalDiscounts || 0);

    let merchandise = (items || []).reduce((sum, item) => {
        return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0);
    }, 0);

    if (merchandise <= 0) {
        const refundAmt = parseFloat(order.RefundAmount || 0);
        const dbSubtotal = Math.max(0, parseFloat(order.Subtotal || 0));
        if (refundAmt > 0 && total > 0 && refundAmt < total) {
            merchandise = refundAmt;
        } else {
            merchandise = dbSubtotal;
        }
    }

    let delivery = parseFloat(order.DeliveryCost || 0);
    if (delivery <= 0 && total > merchandise + extra) {
        delivery = Math.max(0, Math.round((total - merchandise - extra) * 100) / 100);
    }

    order.Subtotal = merchandise;
    order.DeliveryCost = delivery;
    order.ExtraDeliveryFee = extra;
    order.TotalAmount = total > 0 ? total : Math.round((merchandise + delivery + extra) * 100) / 100;
    order.TotalTaxes = 0;
    order.__merchandiseSubtotal = merchandise + discount;

    return order;
}

module.exports = {
    detectSalesReportSchema,
    isRefundMerchandiseOrder,
    isReplacementFulfillmentOrder,
    isRefundOrReplacementOrder,
    computeReturnLogisticsCosts,
    sumRefundMerchandise,
    sumRefundDelivery,
    getRefundReversalAmounts,
    countRefundMerchandiseOrders,
    countReturnedOrders,
    computeMerchandiseCostMetrics,
    computeInventoryLossAtCost,
    aggregateSalesReportFromOrders,
    buildSalesReportStats,
    applySalesReportOrderRowDisplay
};
