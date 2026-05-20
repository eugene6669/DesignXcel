'use strict';

const sql = require('mssql');
const { getOrLoad } = require('./adminPageCache');

const INVENTORY_LIST_PAGE_SIZE = 25;

/** Cached Orders table column flags (checked once per minute). */
async function getOrdersSchemaFlags(pool) {
    return getOrLoad(
        'ordersSchemaFlags',
        async () => {
            const result = await pool.request().query(`
                SELECT name
                FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Orders')
                  AND name IN (N'ReturnItems', N'RefundAmount', N'ExtraDeliveryFee', N'TransactionID')
            `);
            const names = new Set((result.recordset || []).map((r) => r.name));
            return {
                hasReturnItems: names.has('ReturnItems'),
                hasRefundAmount: names.has('RefundAmount'),
                hasExtraDeliveryFee: names.has('ExtraDeliveryFee'),
                hasTransactionID: names.has('TransactionID')
            };
        },
        120000
    );
}

/**
 * Load order line items for many orders in one query (fixes N+1 on admin order pages).
 */
async function attachOrderItemsBatch(pool, orders) {
    if (!Array.isArray(orders) || orders.length === 0) return orders;

    const orderIds = [...new Set(orders.map((o) => o.OrderID).filter(Boolean))];
    if (orderIds.length === 0) {
        orders.forEach((o) => {
            o.items = [];
        });
        return orders;
    }

    const request = pool.request();
    const paramNames = orderIds.map((id, idx) => {
        const name = `oid${idx}`;
        request.input(name, sql.Int, id);
        return `@${name}`;
    });

    const itemsResult = await request.query(`
        SELECT
            oi.OrderID,
            oi.ProductID,
            oi.VariationID,
            SUM(oi.Quantity) AS Quantity,
            AVG(oi.PriceAtPurchase) AS PriceAtPurchase,
            MAX(oi.OrderItemID) AS OrderItemID,
            COALESCE(MAX(p.Name), MAX(oi.Name)) AS Name,
            MAX(p.ImageURL) AS ImageURL,
            MAX(pv.VariationName) AS VariationName,
            MAX(pv.Color) AS Color,
            MAX(pv.VariationImageURL) AS VariationImageURL
        FROM OrderItems oi
        LEFT JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
        WHERE oi.OrderID IN (${paramNames.join(', ')})
        GROUP BY oi.OrderID, oi.ProductID, oi.VariationID
        ORDER BY oi.OrderID, MAX(oi.OrderItemID)
    `);

    const byOrderId = new Map();
    for (const row of itemsResult.recordset || []) {
        if (!byOrderId.has(row.OrderID)) byOrderId.set(row.OrderID, []);
        byOrderId.get(row.OrderID).push(row);
    }

    for (const order of orders) {
        order.items = byOrderId.get(order.OrderID) || [];
    }
    return orders;
}

const INVENTORY_PRODUCT_LIST_CORE = `
    SELECT
        ip.InventoryProductID,
        ip.Name as InventoryProductName,
        ip.SKU as InventoryProductSKU,
        ip.Category as InventoryProductCategory,
        ip.Price as InventoryProductPrice,
        COALESCE(
            vimg.VariationImageURL,
            vimg.FirstThumb,
            NULLIF(pLinked.ImageURL, ''),
            NULLIF(ip.ImageURL, '')
        ) as InventoryProductImageURL,
        ip.DateAdded,
        COALESCE(vlast.LastVariationAdded, ip.DateAdded) AS LastDateAdded,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationTotalSum
            ELSE (COALESCE(ip.AvailableQuantity, 0) + COALESCE(ip.DamagedQuantity, 0)) END as TotalQuantity,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationSellableSum
            ELSE COALESCE(ip.AvailableQuantity, 0) END as AvailableQuantity,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationDamagedSum
            ELSE COALESCE(ip.DamagedQuantity, 0) END as DamagedQuantity,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationReturnedSum
            ELSE COALESCE(ip.ReturnedQuantity, 0) END as ReturnedQuantity,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationRepairedSum
            ELSE COALESCE(ip.RepairedQuantity, 0) END as RepairedQuantity,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationDisposedSum
            ELSE COALESCE(ip.DisposedQuantity, 0) END as DisposedQuantity,
        CASE
            WHEN (CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationSellableSum ELSE COALESCE(ip.AvailableQuantity, 0) END) > 0 THEN 'available'
            WHEN COALESCE(ip.RepairedQuantity, 0) > 0 THEN 'repaired'
            WHEN (CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationDamagedSum ELSE COALESCE(ip.DamagedQuantity, 0) END) > 0 THEN 'damaged'
            WHEN COALESCE(ip.ReturnedQuantity, 0) > 0 THEN 'returned'
            WHEN COALESCE(ip.DisposedQuantity, 0) > 0 THEN 'disposed'
            ELSE COALESCE(ip.InventoryStatus, 'available')
        END as InventoryStatus,
        ip.Dimensions,
        ip.InventoryNotes as Notes,
        ip.DateUpdated
    FROM InventoryProducts ip
    CROSS APPLY (
        SELECT
            CASE WHEN EXISTS (
                SELECT 1 FROM InventoryProductVariations x
                WHERE x.InventoryProductID = ip.InventoryProductID AND x.IsActive = 1
            ) THEN 1 ELSE 0 END AS HasActiveVariations,
            ISNULL((
                SELECT SUM(
                    CASE WHEN iv.AvailableQuantity IS NULL OR iv.AvailableQuantity = 0
                        THEN COALESCE(iv.Quantity, 0) ELSE iv.AvailableQuantity END
                )
                FROM InventoryProductVariations iv
                WHERE iv.InventoryProductID = ip.InventoryProductID AND iv.IsActive = 1
            ), 0) AS VariationSellableSum,
            ISNULL((
                SELECT SUM(
                    CASE WHEN iv2.AvailableQuantity IS NULL OR iv2.AvailableQuantity = 0
                        THEN COALESCE(iv2.Quantity, 0) ELSE iv2.AvailableQuantity END
                    + COALESCE(iv2.DamagedQuantity, 0)
                )
                FROM InventoryProductVariations iv2
                WHERE iv2.InventoryProductID = ip.InventoryProductID AND iv2.IsActive = 1
            ), 0) AS VariationTotalSum,
            ISNULL((
                SELECT SUM(COALESCE(iv3.DamagedQuantity, 0))
                FROM InventoryProductVariations iv3
                WHERE iv3.InventoryProductID = ip.InventoryProductID AND iv3.IsActive = 1
            ), 0) AS VariationDamagedSum,
            ISNULL((
                SELECT SUM(COALESCE(iv4.ReturnedQuantity, 0))
                FROM InventoryProductVariations iv4
                WHERE iv4.InventoryProductID = ip.InventoryProductID AND iv4.IsActive = 1
            ), 0) AS VariationReturnedSum,
            ISNULL((
                SELECT SUM(COALESCE(iv5.RepairedQuantity, 0))
                FROM InventoryProductVariations iv5
                WHERE iv5.InventoryProductID = ip.InventoryProductID AND iv5.IsActive = 1
            ), 0) AS VariationRepairedSum,
            ISNULL((
                SELECT SUM(COALESCE(iv6.DisposedQuantity, 0))
                FROM InventoryProductVariations iv6
                WHERE iv6.InventoryProductID = ip.InventoryProductID AND iv6.IsActive = 1
            ), 0) AS VariationDisposedSum
    ) vagg
    OUTER APPLY (
        SELECT TOP 1
            ipv.VariationImageURL,
            NULLIF(JSON_VALUE(ipv.ThumbnailURLs, '$[0]'), '') AS FirstThumb
        FROM InventoryProductVariations ipv
        WHERE ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
        ORDER BY ipv.VariationID
    ) vimg
    LEFT JOIN Products pLinked ON pLinked.ProductID = ip.ProductID AND pLinked.IsActive = 1
    OUTER APPLY (
        SELECT MAX(iv.CreatedAt) AS LastVariationAdded
        FROM InventoryProductVariations iv
        WHERE iv.InventoryProductID = ip.InventoryProductID AND iv.IsActive = 1
    ) vlast
`;

function applyInventoryListFilters(request, filters = {}) {
    let clause = '';
    const search = String(filters.search || '').trim();
    if (search) {
        request.input('search', sql.NVarChar, `%${search}%`);
        clause += ` AND (
            ip.Name LIKE @search
            OR ip.SKU LIKE @search
            OR EXISTS (
                SELECT 1
                FROM InventoryProductVariations iv
                WHERE iv.InventoryProductID = ip.InventoryProductID
                  AND iv.IsActive = 1
                  AND (
                      iv.SKU LIKE @search
                      OR iv.VariationName LIKE @search
                  )
            )
        )`;
    }
    const category = String(filters.category || '').trim();
    if (category) {
        request.input('category', sql.NVarChar, category);
        clause += ` AND ip.Category = @category`;
    }
    return clause;
}

/** Products with variation-level returned / damaged / repaired / disposed stock only. */
function applyReturnsListFilters(request, filters = {}) {
    let clause = applyInventoryListFilters(request, filters);
    clause += ` AND EXISTS (
            SELECT 1 FROM InventoryProductVariations iv
            WHERE iv.InventoryProductID = ip.InventoryProductID AND iv.IsActive = 1
            AND (
                COALESCE(iv.ReturnedQuantity, 0) > 0
                OR COALESCE(iv.DamagedQuantity, 0) > 0
                OR COALESCE(iv.RepairedQuantity, 0) > 0
                OR COALESCE(iv.DisposedQuantity, 0) > 0
            )
        )`;
    return clause;
}

async function countInventoryProducts(pool, filters = {}, options = {}) {
    const request = pool.request();
    const filterClause = options.returnsOnly
        ? applyReturnsListFilters(request, filters)
        : applyInventoryListFilters(request, filters);
    const result = await request.query(`
        SELECT COUNT(*) as total
        FROM InventoryProducts ip
        WHERE ip.IsActive = 1
        ${filterClause}
    `);
    return parseInt(result.recordset[0]?.total, 10) || 0;
}

async function fetchInventoryProductsPage(pool, filters = {}, options = {}) {
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || INVENTORY_LIST_PAGE_SIZE, 5), 100);
    const page = Math.max(parseInt(filters.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const request = pool.request();
    const filterClause = options.returnsOnly
        ? applyReturnsListFilters(request, filters)
        : applyInventoryListFilters(request, filters);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(`
        ${INVENTORY_PRODUCT_LIST_CORE}
        WHERE ip.IsActive = 1
        ${filterClause}
        ORDER BY ip.DateAdded DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
        rows: result.recordset || [],
        page,
        limit,
        offset
    };
}

/** Page number (1-based) where a product appears in the filtered list. */
async function findInventoryProductPage(pool, inventoryProductId, filters = {}) {
    const id = parseInt(inventoryProductId, 10);
    if (!id) return null;

    const request = pool.request().input('id', sql.Int, id);
    const filterClause = applyInventoryListFilters(request, filters);
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || INVENTORY_LIST_PAGE_SIZE, 5), 100);

    const result = await request.query(`
        WITH ordered AS (
            SELECT
                ip.InventoryProductID,
                ROW_NUMBER() OVER (ORDER BY ip.DateAdded DESC) AS rn
            FROM InventoryProducts ip
            WHERE ip.IsActive = 1
            ${filterClause}
        )
        SELECT rn FROM ordered WHERE InventoryProductID = @id
    `);

    if (!result.recordset.length) return null;
    const rn = parseInt(result.recordset[0].rn, 10);
    return Math.ceil(rn / limit);
}

async function loadProductInventoryPageData(pool, options = {}) {
    const { getOrLoad: cacheLoad } = require('./adminPageCache');

    const filters = {
        search: options.search || '',
        category: options.category || '',
        limit: options.limit || INVENTORY_LIST_PAGE_SIZE,
        page: options.page || 1
    };

    const focusId = parseInt(options.inventoryProductId, 10);
    if (focusId) {
        const focusPage = await findInventoryProductPage(pool, focusId, filters);
        if (focusPage && focusPage !== filters.page) {
            return {
                redirectToPage: focusPage,
                filters
            };
        }
    }

    const [materials, units, categories, totalCount, pageResult] = await Promise.all([
        cacheLoad('admin:rawMaterials', () =>
            pool.request().query(`
                SELECT MaterialID, Name, QuantityAvailable, Unit, LastUpdated
                FROM RawMaterials WHERE IsActive = 1 ORDER BY Name
            `).then((r) => r.recordset || [])
        ),
        cacheLoad('admin:measurementUnits', () =>
            pool.request().query(`
                SELECT UnitID, UnitName FROM MeasurementUnits WHERE IsActive = 1 ORDER BY UnitName
            `).then((r) => r.recordset || [])
        ),
        cacheLoad('admin:productCategories', () =>
            pool.request().query(`
                SELECT DISTINCT Category FROM (
                    SELECT Category FROM Products WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                    UNION
                    SELECT Category FROM InventoryProducts WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                ) c ORDER BY Category
            `).then((r) => r.recordset.map((row) => row.Category))
        ),
        countInventoryProducts(pool, filters),
        fetchInventoryProductsPage(pool, filters)
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageResult.limit));
    const page = Math.min(pageResult.page, totalPages);

    return {
        materials,
        units,
        categories,
        allInventoryProducts: pageResult.rows,
        inventoryItems: pageResult.rows,
        products: [],
        pagination: {
            page,
            limit: pageResult.limit,
            totalCount,
            totalPages
        },
        listFilters: {
            search: filters.search,
            category: filters.category
        },
        inventoryProductIdFocus: focusId || null
    };
}

async function loadProductReturnsPageData(pool, options = {}) {
    const filters = {
        search: options.search || '',
        category: options.category || '',
        limit: options.limit || INVENTORY_LIST_PAGE_SIZE,
        page: options.page || 1
    };
    const returnsOpt = { returnsOnly: true };
    const [categories, totalCount, pageResult] = await Promise.all([
        pool.request().query(`
            SELECT DISTINCT Category FROM (
                SELECT Category FROM Products WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                UNION
                SELECT Category FROM InventoryProducts WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
            ) c ORDER BY Category
        `).then((r) => (r.recordset || []).map((row) => row.Category)),
        countInventoryProducts(pool, filters, returnsOpt),
        fetchInventoryProductsPage(pool, filters, returnsOpt)
    ]);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageResult.limit));
    const page = Math.min(pageResult.page, totalPages);
    return {
        categories,
        allInventoryProducts: pageResult.rows,
        pagination: {
            page,
            limit: pageResult.limit,
            totalCount,
            totalPages
        },
        listFilters: {
            search: filters.search,
            category: filters.category
        }
    };
}

async function fetchInventoryProductSummary(pool, inventoryProductId) {
    const id = parseInt(inventoryProductId, 10);
    if (!id || Number.isNaN(id)) return null;

    const request = pool.request();
    request.input('id', sql.Int, id);
    const result = await request.query(`
        ${INVENTORY_PRODUCT_LIST_CORE}
        WHERE ip.IsActive = 1 AND ip.InventoryProductID = @id
    `);
    const row = result.recordset[0];
    if (!row) return null;

    return {
        inventoryProductId: row.InventoryProductID,
        totalQuantity: Number(row.TotalQuantity) || 0,
        availableQuantity: Number(row.AvailableQuantity) || 0,
        damagedQuantity: Number(row.DamagedQuantity) || 0,
        returnedQuantity: Number(row.ReturnedQuantity) || 0,
        repairedQuantity: Number(row.RepairedQuantity) || 0,
        disposedQuantity: Number(row.DisposedQuantity) || 0,
        inventoryStatus: row.InventoryStatus || 'available'
    };
}

async function fetchActiveRawMaterialsList(pool) {
    const result = await pool.request().query(`
        SELECT
            MaterialID as id,
            Name as name,
            QuantityAvailable as stockQuantity,
            Unit as unit,
            LastUpdated as createdAt,
            IsActive as active
        FROM RawMaterials
        WHERE IsActive = 1
        ORDER BY Name ASC
    `);
    return result.recordset || [];
}

async function fetchProductCategoriesList(pool) {
    const { getOrLoad: cacheLoad } = require('./adminPageCache');
    return cacheLoad('admin:productCategories', () =>
        pool.request().query(`
            SELECT DISTINCT Category FROM (
                SELECT Category FROM Products WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                UNION
                SELECT Category FROM InventoryProducts WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
            ) c ORDER BY Category
        `).then((r) => (r.recordset || []).map((row) => row.Category).filter(Boolean))
    );
}

async function buildInventoryStockRefreshPayload(pool, inventoryProductId) {
    const [summary, materials] = await Promise.all([
        fetchInventoryProductSummary(pool, inventoryProductId),
        fetchActiveRawMaterialsList(pool)
    ]);
    return { summary, materials };
}

/** Same sellable-qty expression as Product Inventory API and listing. */
function variationSellableQtySql(alias = 'ipv') {
    return `CASE WHEN ${alias}.AvailableQuantity IS NULL OR ${alias}.AvailableQuantity = 0
        THEN COALESCE(${alias}.Quantity, 0) ELSE ${alias}.AvailableQuantity END`;
}

/** Mirrors product-inventory.js variation row stock display. */
function mapVariationStockFields(row) {
    const baseQuantity = Number(row.Quantity) || 0;
    let availableQty = row.AvailableQuantity;
    if ((availableQty === null || availableQty === undefined || Number(availableQty) === 0) && baseQuantity > 0) {
        availableQty = baseQuantity;
    } else {
        availableQty = Number(availableQty) || 0;
    }
    const damagedQty = Number(row.DamagedQuantity) || 0;
    const totalQty = (availableQty + damagedQty) > 0 ? (availableQty + damagedQty) : baseQuantity;
    return { availableQty, totalQty, damagedQty, baseQuantity };
}

function mapVariationAlertRow(row) {
    const parent = String(row.ParentProductName || '').trim();
    const variation = String(row.VariationName || '').trim();
    const sku = String(row.SKU || '').trim();
    const color = String(row.Color || '').trim();
    const { availableQty, totalQty, damagedQty } = mapVariationStockFields(row);
    const displayName = parent && variation
        ? `${parent} · ${variation}`
        : (variation || parent || sku || 'Variation');

    return {
        VariationID: row.VariationID,
        SKU: sku || null,
        VariationName: variation || null,
        Color: color || null,
        ParentProductName: parent || null,
        InventoryProductID: row.InventoryProductID,
        ProductID: row.VariationID,
        Name: displayName,
        AvailableQuantity: availableQty,
        TotalQuantity: totalQty,
        DamagedQuantity: damagedQty,
        StockQuantity: availableQty
    };
}

/** Low-stock alerts at variation level (matches Product Inventory stock). */
async function fetchLowStockVariationAlerts(pool, maxQuantity = 20) {
    const sellable = variationSellableQtySql('ipv');
    const result = await pool.request()
        .input('maxQty', sql.Int, maxQuantity)
        .query(`
            SELECT
                ipv.VariationID,
                ipv.SKU,
                ipv.VariationName,
                ipv.Color,
                ipv.Quantity,
                ipv.AvailableQuantity,
                ISNULL(ipv.DamagedQuantity, 0) AS DamagedQuantity,
                ip.Name AS ParentProductName,
                ip.InventoryProductID
            FROM InventoryProductVariations ipv
            INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
            WHERE ipv.IsActive = 1 AND ip.IsActive = 1
              AND (${sellable}) <= @maxQty
            ORDER BY (${sellable}) ASC, ip.Name ASC, ipv.VariationName ASC
        `);

    return (result.recordset || []).map(mapVariationAlertRow);
}

async function fetchLowStockRawMaterials(pool, maxQuantity = 20) {
    const result = await pool.request()
        .input('maxQty', sql.Int, maxQuantity)
        .query(`
            SELECT MaterialID, Name, QuantityAvailable, Unit
            FROM RawMaterials
            WHERE IsActive = 1 AND QuantityAvailable <= @maxQty
            ORDER BY QuantityAvailable ASC
        `);
    return result.recordset || [];
}

async function buildInventoryAlertsPayload(pool, maxQuantity = 20) {
    const [products, rawMaterials] = await Promise.all([
        fetchLowStockVariationAlerts(pool, maxQuantity),
        fetchLowStockRawMaterials(pool, maxQuantity)
    ]);
    return { success: true, products, rawMaterials };
}

module.exports = {
    getOrdersSchemaFlags,
    attachOrderItemsBatch,
    loadProductInventoryPageData,
    loadProductReturnsPageData,
    INVENTORY_LIST_PAGE_SIZE,
    countInventoryProducts,
    fetchInventoryProductsPage,
    fetchInventoryProductSummary,
    fetchActiveRawMaterialsList,
    buildInventoryStockRefreshPayload,
    fetchProductCategoriesList,
    variationSellableQtySql,
    mapVariationStockFields,
    fetchLowStockVariationAlerts,
    fetchLowStockRawMaterials,
    buildInventoryAlertsPayload
};
