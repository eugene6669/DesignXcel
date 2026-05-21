'use strict';

const sql = require('mssql');
const { ORDER_ITEMS_CATALOG_CROSS_APPLY } = require('./orderItemCatalogResolveSql');
const {
    productHasAnyCatalogVariations,
    productHasActiveProductVariations,
    getProductVariationStockSum,
    getProductVariationQuantity
} = require('./productVariationPolicy');

let hasBulkOrdersOrderIdColumn = null;

async function ensureBulkOrderColumnFlag(pool) {
    if (hasBulkOrdersOrderIdColumn !== null) return hasBulkOrdersOrderIdColumn;
    try {
        const bulkOrderCheck = await pool.request().query(`
            SELECT COUNT(*) as columnExists
            FROM sys.columns
            WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]')
            AND name = 'OrderID'
        `);
        hasBulkOrdersOrderIdColumn = bulkOrderCheck.recordset[0].columnExists > 0;
    } catch {
        hasBulkOrdersOrderIdColumn = false;
    }
    return hasBulkOrdersOrderIdColumn;
}

async function getBulkPendingQuantity(pool, productId) {
    try {
        if (!(await ensureBulkOrderColumnFlag(pool))) return 0;
        const bulkItemsResult = await pool.request()
            .input('productId', sql.Int, productId)
            .query(`
                SELECT ISNULL(SUM(boi.Quantity), 0) as BulkPendingQuantity
                FROM BulkOrderItems boi
                INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                WHERE boi.ProductID = @productId
                AND bo.Status = N'Pending'
                AND (bo.OrderID IS NULL)
            `);
        return bulkItemsResult.recordset[0].BulkPendingQuantity || 0;
    } catch {
        return 0;
    }
}

async function getPendingQuantity(pool, productId, { hasVariations, variationId } = {}) {
    let pendingQuery = `
        SELECT ISNULL(SUM(oi.Quantity), 0) as PendingQuantity
        FROM OrderItems oi
        INNER JOIN Orders o ON oi.OrderID = o.OrderID
        ${ORDER_ITEMS_CATALOG_CROSS_APPLY}
        WHERE cat.CatalogProductID = @productId
        AND o.Status = N'Pending'
    `;
    const pendingRequest = pool.request().input('productId', sql.Int, productId);
    if (hasVariations && variationId) {
        pendingQuery += ' AND oi.VariationID = @variationId';
        pendingRequest.input('variationId', sql.Int, variationId);
    } else if (hasVariations) {
        pendingQuery += ' AND oi.VariationID IS NOT NULL';
    }
    const pendingOrdersResult = await pendingRequest.query(pendingQuery);
    const orderPending = pendingOrdersResult.recordset[0].PendingQuantity || 0;
    const bulkPending = await getBulkPendingQuantity(pool, productId);
    return orderPending + bulkPending;
}

/**
 * Sellable quantity for a catalog product (optional variation), after pending checkout reservations.
 */
async function computeAvailableStock(pool, catalogProductId, options = {}) {
    const variationId =
        options.variationId != null && options.variationId !== ''
            ? parseInt(options.variationId, 10)
            : null;
    const parsedVariationId =
        variationId != null && !Number.isNaN(variationId) ? variationId : null;

    const productResult = await pool.request()
        .input('productId', sql.Int, catalogProductId)
        .query('SELECT StockQuantity, Name FROM Products WHERE ProductID = @productId AND IsActive = 1');

    if (!productResult.recordset.length) {
        return { success: false, message: 'Product not found' };
    }

    const hasAnyVariations = await productHasAnyCatalogVariations(pool, catalogProductId);
    const hasActiveVariations = await productHasActiveProductVariations(pool, catalogProductId);
    const usesVariationStock = hasAnyVariations;

    let actualStock = productResult.recordset[0].StockQuantity || 0;
    if (usesVariationStock) {
        if (parsedVariationId) {
            actualStock = await getProductVariationQuantity(pool, catalogProductId, parsedVariationId);
        } else {
            actualStock = await getProductVariationStockSum(pool, catalogProductId);
        }
    }

    const totalPending = await getPendingQuantity(pool, catalogProductId, {
        hasVariations: usesVariationStock,
        variationId: parsedVariationId
    });
    const availableStock = Math.max(0, actualStock - totalPending);

    const variationStockSum = usesVariationStock
        ? await getProductVariationStockSum(pool, catalogProductId)
        : null;

    return {
        success: true,
        productId: catalogProductId,
        productName: productResult.recordset[0].Name,
        actualStock,
        pendingQuantity: totalPending,
        availableStock,
        hasVariations: hasAnyVariations,
        requiresVariationSelection: hasActiveVariations,
        variationStockSum,
        variationId: parsedVariationId
    };
}

/**
 * Pending qty for a catalog product (all variation lines).
 */
async function getCatalogPendingQuantity(pool, catalogProductId) {
    const hasVariations = await productHasAnyCatalogVariations(pool, catalogProductId);
    return getPendingQuantity(pool, catalogProductId, { hasVariations, variationId: null });
}

/**
 * Batch sellable stock for many product identifiers (PublicId, slug, SKU, or numeric id).
 */
async function computeAvailableStockBatch(pool, resolveProductId, identifiers = []) {
    const unique = [...new Set((identifiers || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const stocks = {};

    await Promise.all(
        unique.map(async (rawId) => {
            try {
                const catalogId = await resolveProductId(rawId);
                if (!catalogId || catalogId <= 0) {
                    stocks[rawId] = { success: false, message: 'Product not found' };
                    return;
                }
                const row = await computeAvailableStock(pool, catalogId);
                stocks[rawId] = row;
            } catch (err) {
                stocks[rawId] = { success: false, message: err.message };
            }
        })
    );

    return { success: true, stocks };
}

/**
 * Per-variation sellable map for product detail (one round-trip).
 */
async function computeVariationAvailableStockMap(pool, catalogProductId) {
    const hasAnyVariations = await productHasAnyCatalogVariations(pool, catalogProductId);
    const hasActiveVariations = await productHasActiveProductVariations(pool, catalogProductId);
    if (!hasAnyVariations) {
        const single = await computeAvailableStock(pool, catalogProductId);
        return { success: true, hasVariations: false, availableStock: single.availableStock, byVariationId: {} };
    }
    if (!hasActiveVariations) {
        const single = await computeAvailableStock(pool, catalogProductId);
        return {
            success: true,
            hasVariations: true,
            availableStock: single.availableStock,
            byVariationId: {}
        };
    }

    const variationsResult = await pool.request()
        .input('productId', sql.Int, catalogProductId)
        .query(`
            SELECT pv.VariationID as id
            FROM ProductVariations pv
            WHERE pv.ProductID = @productId AND pv.IsActive = 1
            UNION
            SELECT ipv.VariationID as id
            FROM InventoryProductVariations ipv
            INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
            WHERE ip.ProductID = @productId AND ip.IsActive = 1 AND ipv.IsActive = 1
        `);

    const variationIds = [
        ...new Set(
            (variationsResult.recordset || [])
                .map((r) => parseInt(r.id, 10))
                .filter((id) => Number.isFinite(id) && id > 0)
        )
    ];

    const byVariationId = {};
    await Promise.all(
        variationIds.map(async (variationId) => {
            const row = await computeAvailableStock(pool, catalogProductId, { variationId });
            byVariationId[variationId] = row.availableStock ?? 0;
        })
    );

    const aggregate = await computeAvailableStock(pool, catalogProductId);
    return {
        success: true,
        hasVariations: true,
        availableStock: aggregate.availableStock,
        byVariationId
    };
}

module.exports = {
    computeAvailableStock,
    computeAvailableStockBatch,
    computeVariationAvailableStockMap,
    getCatalogPendingQuantity
};
