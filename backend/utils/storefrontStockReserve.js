'use strict';

const sql = require('mssql');
const {
    usesStorefrontDisplayStock,
    getStorefrontDisplayQuantityForCatalogProduct
} = require('./productVariationPolicy');

let ordersDisplayReservedColumnReady = false;
let ordersInventoryReservedColumnReady = false;

async function ensureOrdersStorefrontDisplayReservedColumn(pool) {
    if (ordersDisplayReservedColumnReady) return;
    const check = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'StorefrontDisplayReserved'
    `);
    if (!check.recordset.length) {
        await pool.request().query(`ALTER TABLE Orders ADD StorefrontDisplayReserved BIT NULL`);
        await pool.request().query(`
            UPDATE Orders SET StorefrontDisplayReserved = 0 WHERE StorefrontDisplayReserved IS NULL
        `);
    }
    ordersDisplayReservedColumnReady = true;
}

async function ensureOrdersInventoryStockReservedColumn(pool) {
    if (ordersInventoryReservedColumnReady) return;
    const check = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'InventoryStockReserved'
    `);
    if (!check.recordset.length) {
        await pool.request().query(`ALTER TABLE Orders ADD InventoryStockReserved BIT NULL`);
        await pool.request().query(`
            UPDATE Orders SET InventoryStockReserved = 0 WHERE InventoryStockReserved IS NULL
        `);
    }
    ordersInventoryReservedColumnReady = true;
}

async function resolveCatalogProductIdForOrderLine(pool, rawProductId, transaction = null) {
    const id = parseInt(rawProductId, 10);
    if (!id) return null;
    const req = transaction ? transaction.request() : pool.request();
    const result = await req.input('id', sql.Int, id).query(`
        SELECT COALESCE(
            (SELECT TOP 1 p.ProductID FROM Products p WHERE p.ProductID = @id AND p.IsActive = 1),
            (SELECT TOP 1 ip.ProductID FROM InventoryProducts ip
             WHERE ip.InventoryProductID = @id AND ISNULL(ip.IsActive, 1) = 1
             ORDER BY ip.InventoryProductID DESC),
            (SELECT TOP 1 ip2.ProductID FROM InventoryProducts ip2
             WHERE ip2.ProductID = @id AND ISNULL(ip2.IsActive, 1) = 1
             ORDER BY ip2.InventoryProductID DESC)
        ) AS CatalogProductID
    `);
    const catalogId = result.recordset[0]?.CatalogProductID;
    return catalogId != null ? parseInt(catalogId, 10) : null;
}

async function getOrderItemsWithCatalogProductIds(pool, orderId, transaction = null) {
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return [];
    const req = transaction ? transaction.request() : pool.request();
    const itemsResult = await req
        .input('orderId', sql.Int, orderIdInt)
        .query(`
            SELECT oi.ProductID, oi.VariationID, oi.Quantity
            FROM OrderItems oi
            WHERE oi.OrderID = @orderId
        `);
    const items = [];
    for (const row of itemsResult.recordset || []) {
        const catalogProductId = await resolveCatalogProductIdForOrderLine(pool, row.ProductID, transaction);
        if (!catalogProductId) continue;
        items.push({
            catalogProductId,
            variationId: row.VariationID != null ? parseInt(row.VariationID, 10) : null,
            quantity: parseInt(row.Quantity, 10) || 0
        });
    }
    return items;
}

async function orderHasStorefrontDisplayReserved(pool, orderId, transaction = null) {
    await ensureOrdersStorefrontDisplayReservedColumn(pool);
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return false;
    const req = transaction ? transaction.request() : pool.request();
    const result = await req
        .input('orderId', sql.Int, orderIdInt)
        .query(`
            SELECT CAST(ISNULL(StorefrontDisplayReserved, 0) AS INT) AS Reserved
            FROM Orders WHERE OrderID = @orderId
        `);
    return (result.recordset[0]?.Reserved || 0) === 1;
}

async function orderHasInventoryStockReserved(pool, orderId, transaction = null) {
    await ensureOrdersInventoryStockReservedColumn(pool);
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return false;
    const req = transaction ? transaction.request() : pool.request();
    const result = await req
        .input('orderId', sql.Int, orderIdInt)
        .query(`
            SELECT CAST(ISNULL(InventoryStockReserved, 0) AS INT) AS Reserved
            FROM Orders WHERE OrderID = @orderId
        `);
    return (result.recordset[0]?.Reserved || 0) === 1;
}

async function markOrderInventoryStockReserved(pool, orderId, reserved, transaction = null) {
    await ensureOrdersInventoryStockReservedColumn(pool);
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return;
    const req = transaction ? transaction.request() : pool.request();
    await req
        .input('orderId', sql.Int, orderIdInt)
        .input('reserved', sql.Bit, reserved ? 1 : 0)
        .query(`
            UPDATE Orders SET InventoryStockReserved = @reserved WHERE OrderID = @orderId
        `);
}

async function markOrderStorefrontDisplayReserved(pool, orderId, reserved, transaction = null) {
    await ensureOrdersStorefrontDisplayReservedColumn(pool);
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return;
    const req = transaction ? transaction.request() : pool.request();
    await req
        .input('orderId', sql.Int, orderIdInt)
        .input('reserved', sql.Bit, reserved ? 1 : 0)
        .query(`
            UPDATE Orders SET StorefrontDisplayReserved = @reserved WHERE OrderID = @orderId
        `);
}

async function getProductVariationDisplayQty(pool, catalogProductId, variationId, transaction = null) {
    const req = transaction ? transaction.request() : pool.request();
    const result = await req
        .input('productId', sql.Int, catalogProductId)
        .input('variationId', sql.Int, variationId)
        .query(`
            SELECT COALESCE(Quantity, 0) AS Qty
            FROM ProductVariations
            WHERE ProductID = @productId AND VariationID = @variationId AND IsActive = 1
        `);
    return parseInt(result.recordset[0]?.Qty, 10) || 0;
}

async function getInventoryVariationSellableQty(pool, catalogProductId, variationId, transaction = null) {
    const req = transaction ? transaction.request() : pool.request();
    const result = await req
        .input('productId', sql.Int, catalogProductId)
        .input('variationId', sql.Int, variationId)
        .query(`
            SELECT CASE
                WHEN ipv.AvailableQuantity IS NULL OR ipv.AvailableQuantity = 0
                THEN COALESCE(ipv.Quantity, 0)
                ELSE COALESCE(ipv.AvailableQuantity, 0)
            END AS Sellable
            FROM InventoryProductVariations ipv
            INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
            WHERE ip.ProductID = @productId
              AND ipv.VariationID = @variationId
              AND ipv.IsActive = 1
              AND ip.IsActive = 1
        `);
    return parseInt(result.recordset[0]?.Sellable, 10) || 0;
}

async function getInventoryProductAvailableQty(pool, catalogProductId, transaction = null) {
    const req = transaction ? transaction.request() : pool.request();
    const result = await req
        .input('productId', sql.Int, catalogProductId)
        .query(`
            SELECT TOP 1 COALESCE(AvailableQuantity, 0) AS Available
            FROM InventoryProducts
            WHERE ProductID = @productId AND IsActive = 1
            ORDER BY InventoryProductID DESC
        `);
    return parseInt(result.recordset[0]?.Available, 10) || 0;
}

/**
 * After inventory was decremented on Processing, true if storefront display still needs the same decrease.
 */
async function orderNeedsDisplayDecrementOnProcessing(pool, orderId, transaction = null) {
    const items = await getOrderItemsWithCatalogProductIds(pool, orderId, transaction);
    for (const item of items) {
        if (!await usesStorefrontDisplayStock(pool, item.catalogProductId, transaction)) continue;

        if (item.variationId) {
            const pvQty = await getProductVariationDisplayQty(
                pool, item.catalogProductId, item.variationId, transaction
            );
            const invQty = await getInventoryVariationSellableQty(
                pool, item.catalogProductId, item.variationId, transaction
            );
            if (pvQty > invQty) return true;
        } else {
            const display = await getStorefrontDisplayQuantityForCatalogProduct(
                pool, item.catalogProductId, transaction
            );
            if (display == null) continue;
            const invAvail = await getInventoryProductAvailableQty(pool, item.catalogProductId, transaction);
            if (display > invAvail) return true;
        }
    }
    return false;
}

/**
 * Decrease ProductVariations.Quantity and InventoryProducts.StorefrontDisplayQuantity.
 */
async function decrementStorefrontDisplayLines(pool, items, transaction = null) {
    let displayDecremented = 0;
    const productQtyMap = new Map();

    for (const item of items) {
        const qty = item.quantity;
        const catalogProductId = item.catalogProductId;
        const variationId = item.variationId;
        if (!qty || !catalogProductId) continue;

        productQtyMap.set(catalogProductId, (productQtyMap.get(catalogProductId) || 0) + qty);

        if (variationId) {
            const uReq = transaction ? transaction.request() : pool.request();
            const updateResult = await uReq
                .input('variationId', sql.Int, variationId)
                .input('productId', sql.Int, catalogProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE ProductVariations
                    SET Quantity = CASE WHEN COALESCE(Quantity, 0) >= @qty
                        THEN COALESCE(Quantity, 0) - @qty ELSE 0 END,
                        UpdatedAt = GETDATE()
                    WHERE VariationID = @variationId AND ProductID = @productId AND IsActive = 1
                `);
            if ((updateResult.rowsAffected[0] || 0) > 0) {
                displayDecremented += qty;
            }
        } else {
            const uReq = transaction ? transaction.request() : pool.request();
            await uReq
                .input('productId', sql.Int, catalogProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE Products
                    SET StockQuantity = CASE WHEN COALESCE(StockQuantity, 0) >= @qty
                        THEN COALESCE(StockQuantity, 0) - @qty ELSE 0 END,
                        UpdatedAt = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
            displayDecremented += qty;
        }
    }

    for (const [catalogProductId, orderQty] of productQtyMap) {
        const usesDisplay = await usesStorefrontDisplayStock(pool, catalogProductId, transaction);
        if (usesDisplay) {
            const decReq = transaction ? transaction.request() : pool.request();
            await decReq
                .input('productId', sql.Int, catalogProductId)
                .input('qty', sql.Int, orderQty)
                .query(`
                    UPDATE InventoryProducts
                    SET StorefrontDisplayQuantity = CASE
                            WHEN COALESCE(StorefrontDisplayQuantity, 0) >= @qty
                            THEN COALESCE(StorefrontDisplayQuantity, 0) - @qty
                            ELSE 0
                        END,
                        DateUpdated = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
            const readReq = transaction ? transaction.request() : pool.request();
            const displayResult = await readReq
                .input('productId', sql.Int, catalogProductId)
                .query(`
                    SELECT TOP 1 StorefrontDisplayQuantity
                    FROM InventoryProducts
                    WHERE ProductID = @productId AND IsActive = 1
                    ORDER BY InventoryProductID DESC
                `);
            const newDisplay = parseInt(displayResult.recordset[0]?.StorefrontDisplayQuantity, 10) || 0;
            const pReq = transaction ? transaction.request() : pool.request();
            await pReq
                .input('productId', sql.Int, catalogProductId)
                .input('stockQty', sql.Int, newDisplay)
                .query(`
                    UPDATE Products
                    SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
        }
        await syncStorefrontDisplayAggregates(pool, catalogProductId, transaction);
    }

    return { displayDecremented, itemCount: items.length };
}

/**
 * Decrease warehouse sellable stock (InventoryProducts / InventoryProductVariations) for Pending orders.
 */
async function decrementInventoryStockLines(pool, items, transaction = null) {
    let inventoryDecremented = 0;
    const catalogProductsTouched = new Set();

    for (const item of items) {
        const qty = item.quantity;
        const catalogProductId = item.catalogProductId;
        const variationId = item.variationId;
        if (!qty || !catalogProductId) continue;

        const invReq = transaction ? transaction.request() : pool.request();
        const invResult = await invReq
            .input('productId', sql.Int, catalogProductId)
            .query(`
                SELECT TOP 1 InventoryProductID, COALESCE(AvailableQuantity, 0) AS AvailableQuantity
                FROM InventoryProducts
                WHERE ProductID = @productId AND IsActive = 1
                ORDER BY InventoryProductID DESC
            `);

        if (!invResult.recordset.length) {
            const fallbackReq = transaction ? transaction.request() : pool.request();
            if (variationId) {
                await fallbackReq
                    .input('variationId', sql.Int, variationId)
                    .input('qty', sql.Int, qty)
                    .query(`
                        UPDATE ProductVariations
                        SET Quantity = CASE WHEN COALESCE(Quantity, 0) >= @qty
                            THEN COALESCE(Quantity, 0) - @qty ELSE 0 END,
                            UpdatedAt = GETDATE()
                        WHERE VariationID = @variationId AND IsActive = 1
                    `);
            } else {
                await fallbackReq
                    .input('productId', sql.Int, catalogProductId)
                    .input('qty', sql.Int, qty)
                    .query(`
                        UPDATE Products
                        SET StockQuantity = CASE WHEN COALESCE(StockQuantity, 0) >= @qty
                            THEN COALESCE(StockQuantity, 0) - @qty ELSE 0 END,
                            UpdatedAt = GETDATE()
                        WHERE ProductID = @productId AND IsActive = 1
                    `);
            }
            inventoryDecremented += qty;
            continue;
        }

        const inventoryProductId = invResult.recordset[0].InventoryProductID;
        catalogProductsTouched.add(catalogProductId);

        if (variationId) {
            const varReq = transaction ? transaction.request() : pool.request();
            const varUpdate = await varReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .input('variationId', sql.Int, variationId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE InventoryProductVariations
                    SET Quantity = CASE WHEN COALESCE(Quantity, 0) >= @qty THEN COALESCE(Quantity, 0) - @qty ELSE 0 END,
                        AvailableQuantity = CASE WHEN COALESCE(AvailableQuantity, 0) >= @qty
                            THEN COALESCE(AvailableQuantity, 0) - @qty ELSE 0 END,
                        UpdatedAt = GETDATE()
                    WHERE InventoryProductID = @inventoryProductId
                      AND VariationID = @variationId
                      AND IsActive = 1
                `);
            if ((varUpdate.rowsAffected[0] || 0) > 0) {
                inventoryDecremented += qty;
            }
            const pvSyncReq = transaction ? transaction.request() : pool.request();
            const invQtyResult = await pvSyncReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .input('variationId', sql.Int, variationId)
                .query(`
                    SELECT COALESCE(AvailableQuantity, Quantity, 0) AS Sellable
                    FROM InventoryProductVariations
                    WHERE InventoryProductID = @inventoryProductId AND VariationID = @variationId
                `);
            const sellable = parseInt(invQtyResult.recordset[0]?.Sellable, 10) || 0;
            const skipPvQty = await usesStorefrontDisplayStock(pool, catalogProductId, transaction);
            if (!skipPvQty) {
                const pvReq = transaction ? transaction.request() : pool.request();
                await pvReq
                    .input('variationId', sql.Int, variationId)
                    .input('sellable', sql.Int, sellable)
                    .query(`
                        UPDATE ProductVariations
                        SET Quantity = @sellable, UpdatedAt = GETDATE()
                        WHERE VariationID = @variationId AND IsActive = 1
                    `);
            }
        } else {
            const mainReq = transaction ? transaction.request() : pool.request();
            await mainReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE InventoryProducts
                    SET AvailableQuantity = CASE WHEN COALESCE(AvailableQuantity, 0) >= @qty
                        THEN COALESCE(AvailableQuantity, 0) - @qty ELSE 0 END,
                        DateUpdated = GETDATE()
                    WHERE InventoryProductID = @inventoryProductId
                `);
            inventoryDecremented += qty;
            const readReq = transaction ? transaction.request() : pool.request();
            const availResult = await readReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .query(`SELECT COALESCE(AvailableQuantity, 0) AS Available FROM InventoryProducts WHERE InventoryProductID = @inventoryProductId`);
            const available = parseInt(availResult.recordset[0]?.Available, 10) || 0;
            const pReq = transaction ? transaction.request() : pool.request();
            await pReq
                .input('productId', sql.Int, catalogProductId)
                .input('stockQty', sql.Int, available)
                .query(`
                    UPDATE Products SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
        }
    }

    for (const catalogProductId of catalogProductsTouched) {
        await syncStorefrontDisplayAggregates(pool, catalogProductId, transaction);
    }

    return { inventoryDecremented, itemCount: items.length };
}

async function reserveInventoryStockForOrder(pool, orderId, transaction = null) {
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return { inventoryDecremented: 0 };

    if (await orderHasInventoryStockReserved(pool, orderIdInt, transaction)) {
        return { inventoryDecremented: 0, skipped: true };
    }

    const items = await getOrderItemsWithCatalogProductIds(pool, orderIdInt, transaction);
    const result = await decrementInventoryStockLines(pool, items, transaction);

    if (result.inventoryDecremented > 0) {
        await markOrderInventoryStockReserved(pool, orderIdInt, true, transaction);
    }

    return result;
}

async function decrementStorefrontDisplayForOrder(pool, orderId, transaction = null) {
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return { displayDecremented: 0 };

    const items = await getOrderItemsWithCatalogProductIds(pool, orderIdInt, transaction);
    const result = await decrementStorefrontDisplayLines(pool, items, transaction);

    if (result.displayDecremented > 0) {
        await markOrderStorefrontDisplayReserved(pool, orderIdInt, true, transaction);
    }

    return result;
}

/**
 * Reserve storefront "Available Stock" when order is Pending (display qty only).
 * Warehouse / Actual Stock is decremented when order moves to Processing.
 */
async function reserveStorefrontDisplayStockForOrder(pool, orderId, transaction = null) {
    const displayResult = await decrementStorefrontDisplayForOrder(pool, orderId, transaction);
    return {
        reserved: displayResult.displayDecremented,
        itemCount: displayResult.itemCount
    };
}

/**
 * On Pending → Processing (after inventory decrement): cap display stock to inventory sellable qty.
 * Does not subtract order qty again (avoids double-decrement when checkout already reserved display).
 */
async function finalizeStorefrontDisplayForProcessingOrder(pool, orderId) {
    const needsSync = await orderNeedsDisplayDecrementOnProcessing(pool, orderId);
    if (!needsSync) {
        return { skipped: true, reason: 'display_in_sync', displayDecremented: 0 };
    }

    const items = await getOrderItemsWithCatalogProductIds(pool, orderId);
    let unitsAdjusted = 0;
    const productIdsTouched = new Set();

    for (const item of items) {
        if (!await usesStorefrontDisplayStock(pool, item.catalogProductId)) continue;
        productIdsTouched.add(item.catalogProductId);

        if (item.variationId) {
            const invQty = await getInventoryVariationSellableQty(
                pool, item.catalogProductId, item.variationId
            );
            const pvQty = await getProductVariationDisplayQty(
                pool, item.catalogProductId, item.variationId
            );
            if (pvQty > invQty) {
                unitsAdjusted += pvQty - invQty;
                const uReq = pool.request();
                await uReq
                    .input('variationId', sql.Int, item.variationId)
                    .input('productId', sql.Int, item.catalogProductId)
                    .input('qty', sql.Int, invQty)
                    .query(`
                        UPDATE ProductVariations
                        SET Quantity = @qty, UpdatedAt = GETDATE()
                        WHERE VariationID = @variationId AND ProductID = @productId AND IsActive = 1
                    `);
            }
        } else {
            const display = await getStorefrontDisplayQuantityForCatalogProduct(pool, item.catalogProductId);
            const invAvail = await getInventoryProductAvailableQty(pool, item.catalogProductId);
            if (display != null && display > invAvail) {
                unitsAdjusted += display - invAvail;
                const ipReq = pool.request();
                await ipReq
                    .input('productId', sql.Int, item.catalogProductId)
                    .input('qty', sql.Int, invAvail)
                    .query(`
                        UPDATE InventoryProducts
                        SET StorefrontDisplayQuantity = @qty, DateUpdated = GETDATE()
                        WHERE ProductID = @productId AND IsActive = 1
                    `);
                await pool.request()
                    .input('productId', sql.Int, item.catalogProductId)
                    .input('stockQty', sql.Int, invAvail)
                    .query(`
                        UPDATE Products
                        SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                        WHERE ProductID = @productId AND IsActive = 1
                    `);
            }
        }
    }

    for (const catalogProductId of productIdsTouched) {
        const sumReq = pool.request();
        const sumResult = await sumReq
            .input('productId', sql.Int, catalogProductId)
            .query(`
                SELECT ISNULL(SUM(COALESCE(pv.Quantity, 0)), 0) AS DisplaySum
                FROM ProductVariations pv
                WHERE pv.ProductID = @productId AND pv.IsActive = 1
            `);
        const displaySum = parseInt(sumResult.recordset[0]?.DisplaySum, 10) || 0;
        await pool.request()
            .input('productId', sql.Int, catalogProductId)
            .input('displaySum', sql.Int, displaySum)
            .query(`
                UPDATE InventoryProducts
                SET StorefrontDisplayQuantity = @displaySum, DateUpdated = GETDATE()
                WHERE ProductID = @productId AND IsActive = 1
            `);
        await pool.request()
            .input('productId', sql.Int, catalogProductId)
            .input('stockQty', sql.Int, displaySum)
            .query(`
                UPDATE Products
                SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                WHERE ProductID = @productId AND IsActive = 1
            `);
    }

    if (unitsAdjusted > 0) {
        await markOrderStorefrontDisplayReserved(pool, orderId, true);
    }

    return { skipped: false, displayDecremented: unitsAdjusted };
}

/**
 * Restore storefront display stock when a Pending order is cancelled.
 */
async function restoreStorefrontDisplayStockForOrder(pool, orderId, transaction = null) {
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return { restored: 0 };

    if (!(await orderHasStorefrontDisplayReserved(pool, orderIdInt, transaction))) {
        return { restored: 0, skipped: true };
    }

    const items = await getOrderItemsWithCatalogProductIds(pool, orderIdInt, transaction);
    let restored = 0;
    const productQtyMap = new Map();

    for (const item of items) {
        const qty = item.quantity;
        const catalogProductId = item.catalogProductId;
        const variationId = item.variationId;
        if (!qty || !catalogProductId) continue;
        productQtyMap.set(catalogProductId, (productQtyMap.get(catalogProductId) || 0) + qty);

        if (variationId) {
            const uReq = transaction ? transaction.request() : pool.request();
            await uReq
                .input('variationId', sql.Int, variationId)
                .input('productId', sql.Int, catalogProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE ProductVariations
                    SET Quantity = COALESCE(Quantity, 0) + @qty,
                        UpdatedAt = GETDATE()
                    WHERE VariationID = @variationId AND ProductID = @productId AND IsActive = 1
                `);
            restored += qty;
        } else {
            const uReq = transaction ? transaction.request() : pool.request();
            await uReq
                .input('productId', sql.Int, catalogProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE Products
                    SET StockQuantity = COALESCE(StockQuantity, 0) + @qty,
                        UpdatedAt = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
            restored += qty;
        }
    }

    for (const [catalogProductId, orderQty] of productQtyMap) {
        const current = await getStorefrontDisplayQuantityForCatalogProduct(pool, catalogProductId, transaction);
        const newDisplay = (current != null ? current : 0) + orderQty;
        const ipReq = transaction ? transaction.request() : pool.request();
        await ipReq
            .input('productId', sql.Int, catalogProductId)
            .input('display', sql.Int, newDisplay)
            .query(`
                UPDATE InventoryProducts
                SET StorefrontDisplayQuantity = @display, DateUpdated = GETDATE()
                WHERE ProductID = @productId AND IsActive = 1
            `);
        const pReq = transaction ? transaction.request() : pool.request();
        await pReq
            .input('productId', sql.Int, catalogProductId)
            .input('stockQty', sql.Int, newDisplay)
            .query(`
                UPDATE Products
                SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                WHERE ProductID = @productId AND IsActive = 1
            `);
    }

    await markOrderStorefrontDisplayReserved(pool, orderIdInt, false, transaction);
    return { restored, itemCount: items.length };
}

/**
 * Restore warehouse sellable stock when a Pending order is cancelled.
 */
async function restoreInventoryStockForOrder(pool, orderId, transaction = null) {
    const orderIdInt = parseInt(orderId, 10);
    if (!orderIdInt) return { restored: 0 };

    if (!(await orderHasInventoryStockReserved(pool, orderIdInt, transaction))) {
        return { restored: 0, skipped: true };
    }

    const items = await getOrderItemsWithCatalogProductIds(pool, orderIdInt, transaction);
    let restored = 0;
    const catalogProductsTouched = new Set();

    for (const item of items) {
        const qty = item.quantity;
        const catalogProductId = item.catalogProductId;
        const variationId = item.variationId;
        if (!qty || !catalogProductId) continue;

        const invReq = transaction ? transaction.request() : pool.request();
        const invResult = await invReq
            .input('productId', sql.Int, catalogProductId)
            .query(`
                SELECT TOP 1 InventoryProductID
                FROM InventoryProducts
                WHERE ProductID = @productId AND IsActive = 1
                ORDER BY InventoryProductID DESC
            `);

        if (!invResult.recordset.length) {
            const fallbackReq = transaction ? transaction.request() : pool.request();
            if (variationId) {
                await fallbackReq
                    .input('variationId', sql.Int, variationId)
                    .input('qty', sql.Int, qty)
                    .query(`
                        UPDATE ProductVariations
                        SET Quantity = COALESCE(Quantity, 0) + @qty, UpdatedAt = GETDATE()
                        WHERE VariationID = @variationId AND IsActive = 1
                    `);
            } else {
                await fallbackReq
                    .input('productId', sql.Int, catalogProductId)
                    .input('qty', sql.Int, qty)
                    .query(`
                        UPDATE Products
                        SET StockQuantity = COALESCE(StockQuantity, 0) + @qty, UpdatedAt = GETDATE()
                        WHERE ProductID = @productId AND IsActive = 1
                    `);
            }
            restored += qty;
            continue;
        }

        const inventoryProductId = invResult.recordset[0].InventoryProductID;
        catalogProductsTouched.add(catalogProductId);

        if (variationId) {
            const varReq = transaction ? transaction.request() : pool.request();
            await varReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .input('variationId', sql.Int, variationId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE InventoryProductVariations
                    SET Quantity = COALESCE(Quantity, 0) + @qty,
                        AvailableQuantity = COALESCE(AvailableQuantity, 0) + @qty,
                        UpdatedAt = GETDATE()
                    WHERE InventoryProductID = @inventoryProductId AND VariationID = @variationId
                `);
            restored += qty;
            const skipPvQty = await usesStorefrontDisplayStock(pool, catalogProductId, transaction);
            if (!skipPvQty) {
                const invQtyResult = await (transaction ? transaction.request() : pool.request())
                    .input('inventoryProductId', sql.Int, inventoryProductId)
                    .input('variationId', sql.Int, variationId)
                    .query(`
                        SELECT COALESCE(AvailableQuantity, Quantity, 0) AS Sellable
                        FROM InventoryProductVariations
                        WHERE InventoryProductID = @inventoryProductId AND VariationID = @variationId
                    `);
                const sellable = parseInt(invQtyResult.recordset[0]?.Sellable, 10) || 0;
                await (transaction ? transaction.request() : pool.request())
                    .input('variationId', sql.Int, variationId)
                    .input('sellable', sql.Int, sellable)
                    .query(`
                        UPDATE ProductVariations SET Quantity = @sellable, UpdatedAt = GETDATE()
                        WHERE VariationID = @variationId AND IsActive = 1
                    `);
            }
        } else {
            const mainReq = transaction ? transaction.request() : pool.request();
            await mainReq
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .input('qty', sql.Int, qty)
                .query(`
                    UPDATE InventoryProducts
                    SET AvailableQuantity = COALESCE(AvailableQuantity, 0) + @qty, DateUpdated = GETDATE()
                    WHERE InventoryProductID = @inventoryProductId
                `);
            restored += qty;
            const availResult = await (transaction ? transaction.request() : pool.request())
                .input('inventoryProductId', sql.Int, inventoryProductId)
                .query(`SELECT COALESCE(AvailableQuantity, 0) AS Available FROM InventoryProducts WHERE InventoryProductID = @inventoryProductId`);
            const available = parseInt(availResult.recordset[0]?.Available, 10) || 0;
            await (transaction ? transaction.request() : pool.request())
                .input('productId', sql.Int, catalogProductId)
                .input('stockQty', sql.Int, available)
                .query(`
                    UPDATE Products SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                    WHERE ProductID = @productId AND IsActive = 1
                `);
        }
    }

    for (const catalogProductId of catalogProductsTouched) {
        await syncStorefrontDisplayAggregates(pool, catalogProductId, transaction);
    }

    await markOrderInventoryStockReserved(pool, orderIdInt, false, transaction);
    return { restored, itemCount: items.length };
}

async function syncStorefrontDisplayAggregates(pool, productId, transaction = null) {
    const pid = parseInt(productId, 10);
    if (!pid) return;

    const sumReq = transaction ? transaction.request() : pool.request();
    const sumResult = await sumReq
        .input('productId', sql.Int, pid)
        .query(`
            SELECT ISNULL(SUM(COALESCE(pv.Quantity, 0)), 0) AS DisplaySum
            FROM ProductVariations pv
            WHERE pv.ProductID = @productId AND pv.IsActive = 1
        `);
    const displaySum = parseInt(sumResult.recordset[0]?.DisplaySum, 10) || 0;

    const ipReq = transaction ? transaction.request() : pool.request();
    await ipReq
        .input('productId', sql.Int, pid)
        .input('displaySum', sql.Int, displaySum)
        .query(`
            UPDATE InventoryProducts
            SET StorefrontDisplayQuantity = @displaySum, DateUpdated = GETDATE()
            WHERE ProductID = @productId AND IsActive = 1
        `);

    const hasVarReq = transaction ? transaction.request() : pool.request();
    const hasVar = await hasVarReq
        .input('productId', sql.Int, pid)
        .query(`
            SELECT COUNT(*) AS Cnt FROM ProductVariations
            WHERE ProductID = @productId AND IsActive = 1
        `);
    const variationCount = parseInt(hasVar.recordset[0]?.Cnt, 10) || 0;

    if (variationCount > 0) {
        const pReq = transaction ? transaction.request() : pool.request();
        await pReq
            .input('productId', sql.Int, pid)
            .input('stockQty', sql.Int, displaySum)
            .query(`
                UPDATE Products
                SET StockQuantity = @stockQty, UpdatedAt = GETDATE()
                WHERE ProductID = @productId AND IsActive = 1
            `);
    }
}

module.exports = {
    ensureOrdersStorefrontDisplayReservedColumn,
    ensureOrdersInventoryStockReservedColumn,
    reserveStorefrontDisplayStockForOrder,
    reserveInventoryStockForOrder,
    finalizeStorefrontDisplayForProcessingOrder,
    restoreStorefrontDisplayStockForOrder,
    restoreInventoryStockForOrder,
    orderHasInventoryStockReserved,
    syncStorefrontDisplayAggregates,
    resolveCatalogProductIdForOrderLine
};
