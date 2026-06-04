/**
 * Sales report metrics for furniture / manufacturing (standard P&L layout).
 */

const {
    countsTowardGrossSales,
    countsTowardNetRevenue
} = require('./orderStatusDisplay');

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

/** Seller delivery costs for reporting. */
function computeDeliveryExpenseBreakdown(recordset) {
    let originalDeliveryCost = 0;
    let returnPickupCost = 0;
    let replacementDeliveryCost = 0;

    recordset.forEach(order => {
        if (normalizeStatus(order.Status) === 'cancelled') return;

        const delivery = orderDelivery(order);
        if (delivery <= 0) return;

        if (countsTowardGrossSales(order)) {
            originalDeliveryCost += delivery;
        }

        if (isRefundOrReplacementOrder(order) && isReturnWorkflowStatus(order)) {
            returnPickupCost += delivery;
            if (normalizeAction(order.ActionType) === 'replacement') {
                replacementDeliveryCost += delivery;
            }
        }
    });

    const totalDeliveryExpense = originalDeliveryCost + returnPickupCost + replacementDeliveryCost;

    return {
        originalDeliveryCost,
        returnPickupCost,
        replacementDeliveryCost,
        totalDeliveryExpense,
        deliveryExpense: totalDeliveryExpense
    };
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
                    WHEN o.Status IN ('Received', 'Completed')
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
    let netRecognizedMerchandise = 0;
    let netRecognizedDelivery = 0;

    recordset.forEach(order => {
        if (normalizeStatus(order.Status) === 'cancelled') return;

        const discount = parseFloat(order.TotalDiscounts || 0);
        const merchandise = parseFloat(order.Subtotal || 0);
        const delivery = orderDelivery(order);
        const reversals = getRefundReversalAmounts(order);

        productRefunds += reversals.productRefund;
        deliveryRefunds += reversals.deliveryRefund;

        if (!countsTowardGrossSales(order)) return;

        // Gross = list product value (subtotal + discounts) for paid / in-fulfillment orders
        grossProductSales += merchandise + discount;
        totalDiscounts += discount;
        deliveryRevenueGross += delivery;

        if (countsTowardNetRevenue(order)) {
            netRecognizedMerchandise += merchandise;
            netRecognizedDelivery += delivery;
        }
    });

    const netProductSales = Math.max(0, grossProductSales - totalDiscounts);
    const grossRevenue = grossProductSales + deliveryRevenueGross;

    // Accounting net revenue: only Received + Completed, after refund reversals
    const recognizedProductRevenue = Math.max(0, netRecognizedMerchandise - productRefunds);
    const netDeliveryRevenue = Math.max(0, netRecognizedDelivery - deliveryRefunds);
    const netRevenue = recognizedProductRevenue + netDeliveryRevenue;

    const returnLogistics = computeReturnLogisticsCosts(recordset);
    const deliveryExpenseBreakdown = computeDeliveryExpenseBreakdown(recordset);
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
        grossRevenue,
        netProductSales,
        netSales: netProductSales,
        netProductSalesBeforeRefunds: netProductSales,
        recognizedProductRevenue,
        netSalesRecognized: recognizedProductRevenue,
        totalDiscounts,
        productRefunds,
        deliveryRefunds,
        salesReturns: productRefunds,
        deliveryRevenue: deliveryRevenueGross,
        deliveryRevenueGross,
        netDeliveryRevenue,
        netRevenue,
        originalDeliveryCost: deliveryExpenseBreakdown.originalDeliveryCost,
        returnPickupCost: deliveryExpenseBreakdown.returnPickupCost,
        replacementDeliveryCost: deliveryExpenseBreakdown.replacementDeliveryCost,
        totalDeliveryExpense: deliveryExpenseBreakdown.totalDeliveryExpense,
        deliveryExpense: deliveryExpenseBreakdown.deliveryExpense,
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

/**
 * Order status lists for formula text (DB Status values; aligned with orderStatusDisplay).
 * @see ./orderStatusDisplay.js GROSS_SALES_STATUSES, NET_REVENUE_STATUSES
 */
const SALES_REPORT_FORMULA_STATUS_ORDERS = {
    grossSales: 'Pending, Processing, Processing (Pickup), Shipping, Delivery, Received, Completed',
    netRevenue: 'Received, Completed',
    refunds: 'Refunded, Returned, Completed Returned',
    allFiltered: 'all statuses in current filter'
};

/** Broad / breakdown metrics — never shown in UI summary or Excel export. */
const SALES_REPORT_HIDDEN_METRICS = new Set([
    'Original Delivery Cost',
    'Return Pick-Up Cost',
    'Replacement Delivery Cost',
    'Total Delivery Expense',
    'Product Refunds',
    'Delivery Refunds',
    'Net Delivery Revenue',
    'Return Shipping Expense',
    'Damage Inventory Cost',
    'Replacement Cost',
    'Gross Margin',
    'Return Rate',
    'Refund Rate'
]);

/** Shown in UI cards, detail table, and Excel summary. */
const SALES_REPORT_VISIBLE_METRICS = new Set([
    'Gross Sales',
    'Discounts',
    'Net Sales',
    'Gross Revenue',
    'Delivery Revenue',
    'Refunds',
    'Net Revenue',
    'COGS',
    'Gross Profit',
    'Total Orders',
    'Total Customers',
    'Average Order Value'
]);

/** Per-metric formula text and applicable order statuses (separate columns in UI / Excel). */
const SALES_REPORT_METRIC_DEFINITIONS = {
    'Gross Sales': {
        formula: 'Sum of merchandise before discounts',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    Discounts: {
        formula: 'Sum of order discounts',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    'Net Sales': {
        formula: 'Gross Sales − Discounts',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    'Gross Revenue': {
        formula: 'Net Sales + Delivery Revenue',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    'Delivery Revenue': {
        formula: 'Sum of delivery + extra delivery fees',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    Refunds: {
        formula: 'Product + delivery refunds reversed',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.refunds
    },
    'Net Revenue': {
        formula: 'Recognized sales after refunds',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.netRevenue
    },
    COGS: {
        formula: 'Quantity × unit cost',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.netRevenue
    },
    'Gross Profit': {
        formula: 'Net Revenue − COGS',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.netRevenue
    },
    'Total Orders': {
        formula: 'Count of orders',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.allFiltered
    },
    'Total Customers': {
        formula: 'Distinct customer emails',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.allFiltered
    },
    'Average Order Value': {
        formula: 'Sum of order totals ÷ Total Orders',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.allFiltered
    },
    'Delivery Fees': {
        formula: 'Sum of delivery fees',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.grossSales
    },
    'Sales Total': {
        formula: 'Sum of order totals',
        statuses: SALES_REPORT_FORMULA_STATUS_ORDERS.allFiltered
    }
};

/** @deprecated Combined formula+status string; prefer SALES_REPORT_METRIC_DEFINITIONS */
const SALES_REPORT_METRIC_FORMULAS = Object.fromEntries(
    Object.entries(SALES_REPORT_METRIC_DEFINITIONS).map(([label, def]) => [
        label,
        `${def.formula} — order status: ${def.statuses}`
    ])
);

function formulaForMetricLabel(label) {
    return SALES_REPORT_METRIC_DEFINITIONS[label]?.formula || '';
}

function statusesForMetricLabel(label) {
    return SALES_REPORT_METRIC_DEFINITIONS[label]?.statuses || '';
}

function attachFormula(rows) {
    return rows.map((row) => ({
        ...row,
        formula: formulaForMetricLabel(row.label),
        statuses: statusesForMetricLabel(row.label)
    }));
}

function filterVisibleSummaryRows(rows) {
    return rows.filter((row) =>
        SALES_REPORT_VISIBLE_METRICS.has(row.label)
        && !SALES_REPORT_HIDDEN_METRICS.has(row.label)
    );
}

/** Excel / CSV summary — visible metrics only (no broad breakdown rows). */
function buildSalesReportExportSummaryRows(stats) {
    return buildSalesReportSummaryRows(stats);
}

/** Flat summary rows for UI table and Excel/CSV export. */
function buildSalesReportSummaryRows(stats) {
    const n = (v) => parseFloat(v || 0);
    const i = (v) => parseInt(v || 0, 10);
    const hasErpMetrics = stats.netRevenue != null
        || stats.grossProductSales != null
        || stats.grossSales != null;

    if (hasErpMetrics) {
        const grossSales = n(stats.grossProductSales ?? stats.grossSales);
        const deliveryRevenue = n(stats.deliveryRevenueGross ?? stats.deliveryRevenue ?? stats.deliveryTotal);
        const grossRevenue = n(stats.grossRevenue ?? (grossSales + deliveryRevenue));
        const productRefunds = n(stats.productRefunds ?? stats.salesReturns);
        const deliveryRefunds = n(stats.deliveryRefunds);

        return filterVisibleSummaryRows(attachFormula([
            { label: 'Gross Sales', value: grossSales, currency: true },
            { label: 'Discounts', value: n(stats.totalDiscounts), currency: true },
            { label: 'Net Sales', value: n(stats.netSales ?? stats.netProductSales), currency: true },
            { label: 'Gross Revenue', value: grossRevenue, currency: true },
            { label: 'Delivery Revenue', value: deliveryRevenue, currency: true },
            { label: 'Refunds', value: productRefunds + deliveryRefunds, currency: true },
            { label: 'Net Revenue', value: n(stats.netRevenue), currency: true },
            { label: 'COGS', value: n(stats.cogs), currency: true },
            { label: 'Gross Profit', value: n(stats.grossProfit), currency: true },
            { label: 'Total Orders', value: i(stats.totalOrders), currency: false },
            { label: 'Total Customers', value: i(stats.totalCustomers), currency: false },
            { label: 'Average Order Value', value: n(stats.averageOrderValue), currency: true }
        ]));
    }

    return filterVisibleSummaryRows(attachFormula([
        { label: 'Total Orders', value: i(stats.totalOrders), currency: false },
        { label: 'Total Customers', value: i(stats.totalCustomers), currency: false },
        { label: 'Discounts', value: n(stats.totalDiscounts), currency: true },
        { label: 'Delivery Fees', value: n(stats.deliveryTotal), currency: true },
        { label: 'Sales Total', value: n(stats.salesTotal), currency: true },
        { label: 'Average Order Value', value: n(stats.averageOrderValue), currency: true }
    ]));
}

module.exports = {
    SALES_REPORT_METRIC_DEFINITIONS,
    SALES_REPORT_METRIC_FORMULAS,
    SALES_REPORT_FORMULA_STATUS_ORDERS,
    SALES_REPORT_VISIBLE_METRICS,
    SALES_REPORT_HIDDEN_METRICS,
    formulaForMetricLabel,
    statusesForMetricLabel,
    buildSalesReportSummaryRows,
    buildSalesReportExportSummaryRows,
    detectSalesReportSchema,
    isRefundMerchandiseOrder,
    isReplacementFulfillmentOrder,
    isRefundOrReplacementOrder,
    computeReturnLogisticsCosts,
    computeDeliveryExpenseBreakdown,
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
