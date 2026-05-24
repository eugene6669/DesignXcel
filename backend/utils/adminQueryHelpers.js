'use strict';

const sql = require('mssql');
const { getOrLoad } = require('./adminPageCache');
const {
    resolveExistingLocalProductAssetPath,
    encodeUploadPathForHtml
} = require('./productAssetUrls');

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

/** First variation SKU (parent InventoryProducts rows do not carry SKU). */
const INVENTORY_PRODUCT_SKU_SQL = `(
    SELECT TOP 1 ivSku.SKU
    FROM InventoryProductVariations ivSku
    WHERE ivSku.InventoryProductID = ip.InventoryProductID
      AND ivSku.IsActive = 1
      AND ivSku.SKU IS NOT NULL
      AND LTRIM(RTRIM(ivSku.SKU)) <> ''
    ORDER BY ivSku.VariationID
)`;

const INVENTORY_PRODUCT_LIST_CORE = `
    SELECT
        ip.InventoryProductID,
        ip.Name as InventoryProductName,
        ${INVENTORY_PRODUCT_SKU_SQL} as InventoryProductSKU,
        ip.Category as InventoryProductCategory,
        ip.Price as InventoryProductPrice,
        COALESCE(
            NULLIF(ip.ImageURL, ''),
            NULLIF(pLinked.ImageURL, ''),
            vimg.VariationImageURL,
            vimg.FirstThumb
        ) as InventoryProductImageURL,
        ip.DateAdded,
        COALESCE(vlast.LastVariationAdded, ip.DateAdded) AS LastDateAdded,
        CASE WHEN vagg.HasActiveVariations = 1 THEN vagg.VariationTotalSum
            ELSE (COALESCE(ip.AvailableQuantity, 0) + COALESCE(ip.DamagedQuantity, 0) + COALESCE(ip.RepairedQuantity, 0)) END as TotalQuantity,
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
        CASE
            WHEN ip.ProductID IS NULL THEN 0
            WHEN CAST(ISNULL(pLinked.IsActive, 0) AS INT) = 1 THEN 1
            ELSE 0
        END AS ShowOnStorefront,
        ip.Dimensions,
        ip.InventoryNotes as Notes,
        ip.DateUpdated,
        ip.ProductID as LinkedProductID,
        pd.DiscountID,
        pd.DiscountType,
        pd.DiscountValue,
        pd.StartDate as DiscountStartDate,
        pd.EndDate as DiscountEndDate,
        CASE
            WHEN pd.DiscountID IS NULL THEN NULL
            WHEN pd.DiscountType = 'percentage' THEN
                pLinked.Price - (pLinked.Price * pd.DiscountValue / 100)
            WHEN pd.DiscountType = 'fixed' THEN
                CASE WHEN pLinked.Price - pd.DiscountValue < 0 THEN 0 ELSE pLinked.Price - pd.DiscountValue END
            ELSE pLinked.Price
        END as DiscountedPrice
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
                    + COALESCE(iv2.RepairedQuantity, 0)
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
    LEFT JOIN ProductDiscounts pd ON pLinked.ProductID = pd.ProductID
        AND pd.IsActive = 1
        AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
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

/** Products with return stock, items in inspection, or post-inspection damaged/repaired/disposed. */
function applyReturnsListFilters(request, filters = {}) {
    let clause = applyInventoryListFilters(request, filters);
    clause += ` AND EXISTS (
            SELECT 1 FROM InventoryProductVariations iv
            WHERE iv.InventoryProductID = ip.InventoryProductID AND iv.IsActive = 1
            AND (
                COALESCE(iv.DamagedQuantity, 0) > 0
                OR COALESCE(iv.RepairedQuantity, 0) > 0
                OR COALESCE(iv.DisposedQuantity, 0) > 0
            )
        )
        OR EXISTS (
            SELECT 1
            FROM Orders o
            CROSS APPLY OPENJSON(o.ReturnItems) AS ri
            INNER JOIN InventoryProductVariations ipv ON ipv.VariationID = TRY_CAST(
                COALESCE(JSON_VALUE(ri.value, '$.variationId'), JSON_VALUE(ri.value, '$.VariationID')) AS INT
            )
            WHERE o.Status = 'Awaiting Inspection'
              AND o.ReturnItems IS NOT NULL
              AND ipv.InventoryProductID = ip.InventoryProductID
              AND ipv.IsActive = 1
              AND TRY_CAST(COALESCE(JSON_VALUE(ri.value, '$.quantity'), JSON_VALUE(ri.value, '$.Quantity')) AS INT) > 0
        )`;
    return clause;
}

async function fetchPendingInspectionQtyByVariation(pool) {
    const pendingMap = new Map();
    try {
        const ordersSchema = await getOrdersSchemaFlags(pool);
        if (!ordersSchema.hasReturnItems) return pendingMap;
        const ordersResult = await pool.request().query(`
            SELECT ReturnItems FROM Orders WHERE Status = 'Awaiting Inspection' AND ReturnItems IS NOT NULL
        `);
        for (const row of ordersResult.recordset || []) {
            let items = [];
            try {
                items = typeof row.ReturnItems === 'string' ? JSON.parse(row.ReturnItems) : row.ReturnItems;
            } catch (e) { continue; }
            if (!Array.isArray(items)) continue;
            items.forEach(function (item) {
                const vid = parseInt(item.variationId || item.VariationID, 10);
                const qty = parseInt(item.quantity || item.Quantity, 10) || 0;
                if (!vid || qty <= 0) return;
                pendingMap.set(vid, (pendingMap.get(vid) || 0) + qty);
            });
        }
    } catch (err) {
        console.warn('[fetchPendingInspectionQtyByVariation]', err.message);
    }
    return pendingMap;
}

async function sumVariationReturnAggregatesForProducts(pool, inventoryProductIds) {
    const map = new Map();
    const ids = [...new Set((inventoryProductIds || []).map((id) => parseInt(id, 10)).filter(Boolean))];
    if (!ids.length) return map;

    const pendingMap = await fetchPendingInspectionQtyByVariation(pool);
    const request = pool.request();
    ids.forEach((id, idx) => request.input(`ipid${idx}`, sql.Int, id));
    const placeholders = ids.map((_, idx) => `@ipid${idx}`).join(', ');
    const result = await request.query(`
        SELECT
            ipv.InventoryProductID,
            ipv.VariationID,
            COALESCE(ipv.ReturnedQuantity, 0) AS ReturnedQuantity,
            COALESCE(ipv.DamagedQuantity, 0) AS DamagedQuantity,
            COALESCE(ipv.RepairedQuantity, 0) AS RepairedQuantity
        FROM InventoryProductVariations ipv
        WHERE ipv.InventoryProductID IN (${placeholders}) AND ipv.IsActive = 1
    `);

    for (const row of result.recordset || []) {
        const pid = row.InventoryProductID;
        if (!map.has(pid)) {
            map.set(pid, { returned: 0, damaged: 0, repaired: 0 });
        }
        const agg = map.get(pid);
        agg.returned += pendingMap.get(row.VariationID) || 0;
        agg.damaged += Number(row.DamagedQuantity) || 0;
        agg.repaired += Number(row.RepairedQuantity) || 0;
    }
    return map;
}

function applyReturnAggregatesToRow(row, agg) {
    if (!row || !agg) return row;
    return {
        ...row,
        ReturnedQuantity: agg.returned,
        DamagedQuantity: agg.damaged,
        RepairedQuantity: agg.repaired
    };
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

    const rows = (result.recordset || []).map((row) => {
        if (!row.InventoryProductImageURL) return row;
        const resolved = resolveExistingLocalProductAssetPath(row.InventoryProductImageURL);
        return {
            ...row,
            InventoryProductImageURL: encodeUploadPathForHtml(resolved)
        };
    });

    return {
        rows,
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

    const { ensureBomBundleSchema, loadActiveBomBundles } = require('./bomBundleSchema');
    await ensureBomBundleSchema(pool);

    const [materials, units, categories, totalCount, pageResult, bomBundles] = await Promise.all([
        cacheLoad('admin:rawMaterials', () =>
            pool.request().query(`
                SELECT MaterialID, SKU, Name, QuantityAvailable, Unit, Supplier, LastUpdated
                FROM RawMaterials WHERE IsActive = 1 ORDER BY Name
            `).then((r) => r.recordset || [])
        ),
        cacheLoad('admin:measurementUnits', () =>
            pool.request().query(`
                SELECT UnitID, UnitName FROM MeasurementUnits WHERE IsActive = 1 ORDER BY UnitName
            `).then((r) => r.recordset || [])
        ),
        fetchProductCategoriesList(pool),
        countInventoryProducts(pool, filters),
        fetchInventoryProductsPage(pool, filters),
        loadActiveBomBundles(pool)
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
        inventoryProductIdFocus: focusId || null,
        bomBundles: bomBundles || []
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
    const inventoryIds = (pageResult.rows || []).map((r) => r.InventoryProductID).filter(Boolean);
    const returnAggMap = await sumVariationReturnAggregatesForProducts(pool, inventoryIds);
    const enrichedRows = (pageResult.rows || []).map((row) =>
        applyReturnAggregatesToRow(row, returnAggMap.get(row.InventoryProductID))
    );
    const totalPages = Math.max(1, Math.ceil(totalCount / pageResult.limit));
    const page = Math.min(pageResult.page, totalPages);
    return {
        categories,
        allInventoryProducts: enrichedRows,
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

    const aggMap = await sumVariationReturnAggregatesForProducts(pool, [id]);
    const agg = aggMap.get(id);

    return {
        inventoryProductId: row.InventoryProductID,
        totalQuantity: Number(row.TotalQuantity) || 0,
        availableQuantity: Number(row.AvailableQuantity) || 0,
        damagedQuantity: agg ? agg.damaged : (Number(row.DamagedQuantity) || 0),
        returnedQuantity: agg ? agg.returned : (Number(row.ReturnedQuantity) || 0),
        repairedQuantity: agg ? agg.repaired : (Number(row.RepairedQuantity) || 0),
        disposedQuantity: Number(row.DisposedQuantity) || 0,
        inventoryStatus: row.InventoryStatus || 'available'
    };
}

async function fetchActiveRawMaterialsList(pool) {
    const { ensureBomBundleSchema } = require('./bomBundleSchema');
    await ensureBomBundleSchema(pool);
    const result = await pool.request().query(`
        SELECT
            MaterialID as id,
            SKU as sku,
            Name as name,
            QuantityAvailable as stockQuantity,
            Unit as unit,
            Supplier as supplier,
            LastUpdated as createdAt,
            IsActive as active
        FROM RawMaterials
        WHERE IsActive = 1
        ORDER BY Name ASC
    `);
    return result.recordset || [];
}

async function ensureProductCategoriesSchema(pool) {
    await pool.request().query(`
        IF OBJECT_ID('dbo.Categories', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.Categories (
                CategoryID INT IDENTITY(1,1) PRIMARY KEY,
                CategoryName NVARCHAR(120) NOT NULL,
                Description NVARCHAR(500) NULL,
                IsActive BIT NOT NULL DEFAULT 1,
                CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE UNIQUE INDEX UX_Categories_CategoryName ON dbo.Categories (CategoryName);
        END
    `);
}

async function fetchProductCategoriesList(pool, options = {}) {
    const { getOrLoad: cacheLoad, invalidateAdminPageCache } = require('./adminPageCache');
    if (options.skipCache) {
        invalidateAdminPageCache('admin:productCategories');
    }
    await ensureProductCategoriesSchema(pool);
    return cacheLoad('admin:productCategories', () =>
        pool.request().query(`
            SELECT DISTINCT Category FROM (
                SELECT LTRIM(RTRIM(CategoryName)) AS Category
                FROM Categories
                WHERE IsActive = 1 AND CategoryName IS NOT NULL AND LTRIM(RTRIM(CategoryName)) <> ''
                UNION
                SELECT LTRIM(RTRIM(Category)) AS Category
                FROM Products
                WHERE IsActive = 1 AND Category IS NOT NULL AND LTRIM(RTRIM(Category)) <> ''
                UNION
                SELECT LTRIM(RTRIM(Category)) AS Category
                FROM InventoryProducts
                WHERE IsActive = 1 AND Category IS NOT NULL AND LTRIM(RTRIM(Category)) <> ''
            ) c
            ORDER BY Category
        `).then((r) => (r.recordset || []).map((row) => row.Category).filter(Boolean))
    );
}

async function isProductCategoryInUse(pool, categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) return false;
    const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .query(`
            SELECT TOP 1 1 AS inUse FROM (
                SELECT Category FROM Products WHERE IsActive = 1 AND Category = @name
                UNION ALL
                SELECT Category FROM InventoryProducts WHERE IsActive = 1 AND Category = @name
            ) x
        `);
    return result.recordset.length > 0;
}

async function addProductCategory(pool, categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) {
        return { success: false, message: 'Category name is required.' };
    }
    if (name.length > 120) {
        return { success: false, message: 'Category name must be 120 characters or less.' };
    }
    await ensureProductCategoriesSchema(pool);
    const existing = await pool.request()
        .input('name', sql.NVarChar, name)
        .query(`
            SELECT TOP 1 CategoryID, IsActive FROM Categories WHERE CategoryName = @name
        `);
    if (existing.recordset.length > 0) {
        const row = existing.recordset[0];
        if (row.IsActive === 1 || row.IsActive === true) {
            return { success: false, message: 'This category already exists.' };
        }
        await pool.request()
            .input('id', sql.Int, row.CategoryID)
            .query(`UPDATE Categories SET IsActive = 1 WHERE CategoryID = @id`);
        return { success: true, message: 'Category restored.', category: name };
    }
    await pool.request()
        .input('name', sql.NVarChar, name)
        .query(`
            INSERT INTO Categories (CategoryName, IsActive, CreatedAt)
            VALUES (@name, 1, SYSUTCDATETIME())
        `);
    return { success: true, message: 'Category added.', category: name };
}

async function removeProductCategory(pool, categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) {
        return { success: false, message: 'Category name is required.' };
    }
    if (await isProductCategoryInUse(pool, name)) {
        return { success: false, message: 'Cannot delete "' + name + '". It is used by one or more products.' };
    }
    await ensureProductCategoriesSchema(pool);
    const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .query(`
            UPDATE Categories SET IsActive = 0 WHERE CategoryName = @name AND IsActive = 1
        `);
    if (result.rowsAffected[0] > 0) {
        return { success: true, message: 'Category removed.' };
    }
    return { success: true, message: 'Category removed from list.' };
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
    const repairedQty = Number(row.RepairedQuantity) || 0;
    const totalQty = (availableQty + damagedQty + repairedQty) > 0
        ? (availableQty + damagedQty + repairedQty)
        : baseQuantity;
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

function mapInventoryReportStatus(availableQty, totalQty) {
    if (availableQty === 0 && totalQty === 0) return 'Out of Stock';
    if (availableQty > 0 && availableQty <= 10) return 'Low Stock';
    if (availableQty === 0 && totalQty > 0) return 'No Available Stock';
    return 'Active';
}

function inventoryReportRowMatchesFilters(row, filters = {}) {
    const avail = Number(row.AvailableQuantity) || 0;
    const total = Number(row.StockQuantity) || 0;
    const status = String(filters.status || '').trim().toLowerCase();
    const stockMin = filters.stockMin !== undefined && filters.stockMin !== ''
        ? parseInt(filters.stockMin, 10) : null;
    const stockMax = filters.stockMax !== undefined && filters.stockMax !== ''
        ? parseInt(filters.stockMax, 10) : null;
    if (stockMin !== null && !Number.isNaN(stockMin) && avail < stockMin) return false;
    if (stockMax !== null && !Number.isNaN(stockMax) && avail > stockMax) return false;
    if (!status) return true;
    if (status === 'low-stock') return avail > 0 && avail <= 10;
    if (status === 'out-of-stock') return avail === 0 && total === 0;
    if (status === 'no-available-stock') return avail === 0 && total > 0;
    if (status === 'active') return avail > 0;
    return true;
}

function filterInventoryReportRows(rows, filters = {}) {
    const hasRowFilter = !!(String(filters.status || '').trim()
        || (filters.stockMin !== undefined && filters.stockMin !== '')
        || (filters.stockMax !== undefined && filters.stockMax !== ''));
    if (!hasRowFilter) return rows;

    const out = [];
    const parents = rows.filter((r) => r.RowType === 'Parent');
    for (const parent of parents) {
        const variations = rows.filter(
            (r) => r.RowType === 'Variation' && r.InventoryProductID === parent.InventoryProductID
        );
        if (parent.HasVariations) {
            const matching = variations.filter((v) => inventoryReportRowMatchesFilters(v, filters));
            if (matching.length) {
                out.push(parent);
                matching.forEach((v) => out.push(v));
            }
        } else if (inventoryReportRowMatchesFilters(parent, filters)) {
            out.push(parent);
        }
    }
    return out;
}

function mapParentInventoryReportRow(row, hasVariations) {
    const totalQty = Number(row.TotalQuantity) || 0;
    const availableQty = Number(row.AvailableQuantity) || 0;
    return {
        RowType: 'Parent',
        HasVariations: !!hasVariations,
        InventoryProductID: row.InventoryProductID,
        VariationID: null,
        Name: row.InventoryProductName || 'N/A',
        SKU: '',
        CategoryName: row.InventoryProductCategory || 'Uncategorized',
        StockQuantity: totalQty,
        AvailableQuantity: availableQty,
        DamagedQuantity: Number(row.DamagedQuantity) || 0,
        RepairedQuantity: Number(row.RepairedQuantity) || 0,
        ReturnedQuantity: Number(row.ReturnedQuantity) || 0,
        Price: null,
        IsActive: availableQty > 0 || totalQty > 0,
        Status: mapInventoryReportStatus(availableQty, totalQty),
        LastUpdated: row.DateUpdated || row.LastDateAdded || row.DateAdded
    };
}

function mapVariationInventoryReportRow(parentRow, variationRow) {
    const sellable = Number(variationRow.AvailableQuantity) || 0;
    const damaged = Number(variationRow.DamagedQuantity) || 0;
    const totalQty = Number(variationRow.TotalQuantity) || (sellable + damaged);
    return {
        RowType: 'Variation',
        HasVariations: false,
        InventoryProductID: variationRow.InventoryProductID,
        VariationID: variationRow.VariationID,
        Name: variationRow.VariationName || 'N/A',
        ParentName: parentRow.InventoryProductName || 'N/A',
        SKU: variationRow.SKU || '',
        CategoryName: parentRow.InventoryProductCategory || 'Uncategorized',
        StockQuantity: totalQty,
        AvailableQuantity: sellable,
        DamagedQuantity: damaged,
        RepairedQuantity: 0,
        ReturnedQuantity: 0,
        Price: Number(variationRow.VariationPrice) || Number(parentRow.InventoryProductPrice) || 0,
        IsActive: sellable > 0 || totalQty > 0,
        Status: mapInventoryReportStatus(sellable, totalQty),
        LastUpdated: variationRow.UpdatedAt || variationRow.CreatedAt || parentRow.DateUpdated
    };
}

/** Inventory report rows: product parent + variation lines (aligned with Product Inventory). */
async function fetchInventoryReportProducts(pool, filters = {}) {
    const request = pool.request();
    const filterClause = applyInventoryListFilters(request, filters);
    const parentResult = await request.query(`
        ${INVENTORY_PRODUCT_LIST_CORE}
        WHERE ip.IsActive = 1
        ${filterClause}
        ORDER BY ip.Name ASC
    `);
    const parents = parentResult.recordset || [];
    if (!parents.length) return [];

    const sellableSql = variationSellableQtySql('ipv');
    const varRequest = pool.request();
    const idParams = parents.map((row, idx) => {
        const key = `invPid${idx}`;
        varRequest.input(key, sql.Int, row.InventoryProductID);
        return `@${key}`;
    });
    const varResult = await varRequest.query(`
        SELECT
            ipv.InventoryProductID,
            ipv.VariationID,
            ipv.VariationName,
            ipv.SKU,
            COALESCE(NULLIF(ipv.Price, 0), ip.Price, 0) AS VariationPrice,
            ${sellableSql} AS AvailableQuantity,
            (${sellableSql}) + ISNULL(ipv.DamagedQuantity, 0) AS TotalQuantity,
            ISNULL(ipv.DamagedQuantity, 0) AS DamagedQuantity,
            ipv.UpdatedAt,
            ipv.CreatedAt
        FROM InventoryProductVariations ipv
        INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
        WHERE ipv.IsActive = 1
          AND ip.IsActive = 1
          AND ipv.InventoryProductID IN (${idParams.join(', ')})
        ORDER BY ip.Name ASC, ipv.VariationName ASC
    `);

    const variationsByParent = new Map();
    for (const v of varResult.recordset || []) {
        if (!variationsByParent.has(v.InventoryProductID)) {
            variationsByParent.set(v.InventoryProductID, []);
        }
        variationsByParent.get(v.InventoryProductID).push(v);
    }

    const rows = [];
    for (const parent of parents) {
        const variations = variationsByParent.get(parent.InventoryProductID) || [];
        rows.push(mapParentInventoryReportRow(parent, variations.length > 0));
        for (const variation of variations) {
            rows.push(mapVariationInventoryReportRow(parent, variation));
        }
    }
    return filterInventoryReportRows(rows, filters);
}

/** Raw materials rows aligned with Product Inventory raw-materials tab. */
async function fetchInventoryReportRawMaterials(pool, filters = {}) {
    const { search, status, stockMin, stockMax } = filters;
    let query = `
        SELECT
            rm.Name,
            ISNULL(rm.SKU, '') AS SKU,
            ISNULL(rm.Unit, '') AS Unit,
            ISNULL(rm.QuantityAvailable, 0) AS QuantityAvailable,
            ISNULL(rm.IsActive, 0) AS IsActive,
            ISNULL(rm.LastUpdated, GETDATE()) AS LastUpdated
        FROM RawMaterials rm
        WHERE 1=1
    `;
    const request = pool.request();
    if (search && String(search).trim()) {
        query += ` AND (rm.Name LIKE @searchMaterials OR ISNULL(rm.SKU, '') LIKE @searchMaterials)`;
        request.input('searchMaterials', sql.NVarChar, `%${String(search).trim()}%`);
    }
    if (status === 'active') {
        query += ` AND rm.IsActive = 1`;
    } else if (status === 'inactive') {
        query += ` AND rm.IsActive = 0`;
    } else if (status === 'low-stock') {
        query += ` AND rm.IsActive = 1 AND ISNULL(rm.QuantityAvailable, 0) < 10 AND ISNULL(rm.QuantityAvailable, 0) > 0`;
    } else if (status === 'out-of-stock') {
        query += ` AND rm.IsActive = 1 AND ISNULL(rm.QuantityAvailable, 0) = 0`;
    } else {
        query += ` AND rm.IsActive = 1`;
    }
    if (stockMin !== undefined && stockMin !== '') {
        query += ` AND ISNULL(rm.QuantityAvailable, 0) >= @stockMinMaterials`;
        request.input('stockMinMaterials', sql.Int, parseInt(stockMin, 10));
    }
    if (stockMax !== undefined && stockMax !== '') {
        query += ` AND ISNULL(rm.QuantityAvailable, 0) <= @stockMaxMaterials`;
        request.input('stockMaxMaterials', sql.Int, parseInt(stockMax, 10));
    }
    query += ` ORDER BY rm.Name ASC`;
    const result = await request.query(query);
    return (result.recordset || []).map((row) => ({
        Name: row.Name,
        SKU: row.SKU || '',
        Unit: row.Unit,
        QuantityAvailable: Number(row.QuantityAvailable) || 0,
        IsActive: row.IsActive === 1 || row.IsActive === true,
        LastUpdated: row.LastUpdated
    }));
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
    ensureProductCategoriesSchema,
    isProductCategoryInUse,
    addProductCategory,
    removeProductCategory,
    variationSellableQtySql,
    mapVariationStockFields,
    fetchLowStockVariationAlerts,
    fetchLowStockRawMaterials,
    buildInventoryAlertsPayload,
    fetchInventoryReportProducts,
    fetchInventoryReportRawMaterials
};
