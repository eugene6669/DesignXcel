/**
 * Parent products with active variations are not directly sellable.
 * Stock for checkout/display comes from variations (inventory source of truth).
 */
const sql = require('mssql');
const { normalizeProductAssetUrl, normalizeThumbnailList } = require('./productAssetUrls');

function parseThumbnailUrlsField(raw) {
    return normalizeThumbnailList(raw);
}

const UUID_IDENTIFIER_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VARIATION_SELLABLE_QTY_SQL = `
    CASE
        WHEN ipv.AvailableQuantity IS NULL OR ipv.AvailableQuantity = 0
        THEN COALESCE(ipv.Quantity, 0)
        ELSE ipv.AvailableQuantity
    END
`;

async function productHasActiveProductVariations(pool, productId, transaction = null) {
    if (!productId) return false;
    const request = transaction ? transaction.request() : pool.request();
    const result = await request
        .input('productId', sql.Int, productId)
        .query(`
            SELECT
                (SELECT COUNT(*) FROM ProductVariations WHERE ProductID = @productId AND IsActive = 1) as PvCnt,
                (SELECT COUNT(*) FROM InventoryProductVariations ipv
                 INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
                 WHERE ip.ProductID = @productId AND ip.IsActive = 1 AND ipv.IsActive = 1) as InvCnt
        `);
    const row = result.recordset[0] || {};
    return (row.PvCnt || 0) > 0 || (row.InvCnt || 0) > 0;
}

async function getInventoryVariationStockSum(pool, productId, transaction = null) {
    if (!productId) return 0;
    const request = transaction ? transaction.request() : pool.request();
    const result = await request
        .input('productId', sql.Int, productId)
        .query(`
            SELECT ISNULL(SUM(${VARIATION_SELLABLE_QTY_SQL}), 0) as Total
            FROM InventoryProductVariations ipv
            INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
            WHERE ip.ProductID = @productId AND ip.IsActive = 1 AND ipv.IsActive = 1
        `);
    return result.recordset[0]?.Total || 0;
}

async function getProductVariationStockSum(pool, productId, transaction = null) {
    if (!productId) return 0;
    const inventorySum = await getInventoryVariationStockSum(pool, productId, transaction);
    if (inventorySum > 0) return inventorySum;

    const request = transaction ? transaction.request() : pool.request();
    const result = await request
        .input('productId', sql.Int, productId)
        .query(`
            SELECT ISNULL(SUM(COALESCE(Quantity, 0)), 0) as Total
            FROM ProductVariations
            WHERE ProductID = @productId AND IsActive = 1
        `);
    return result.recordset[0]?.Total || 0;
}

async function getProductVariationQuantity(pool, productId, variationId, transaction = null) {
    if (!productId || !variationId) return 0;
    const request = transaction ? transaction.request() : pool.request();
    const invResult = await request
        .input('productId', sql.Int, productId)
        .input('variationId', sql.Int, variationId)
        .query(`
            SELECT ${VARIATION_SELLABLE_QTY_SQL} as Quantity
            FROM InventoryProductVariations ipv
            INNER JOIN InventoryProducts ip ON ip.InventoryProductID = ipv.InventoryProductID
            WHERE ip.ProductID = @productId AND ipv.VariationID = @variationId AND ipv.IsActive = 1
        `);
    if (invResult.recordset.length) {
        return invResult.recordset[0].Quantity || 0;
    }

    const pvRequest = transaction ? transaction.request() : pool.request();
    const result = await pvRequest
        .input('productId', sql.Int, productId)
        .input('variationId', sql.Int, variationId)
        .query(`
            SELECT COALESCE(Quantity, 0) as Quantity
            FROM ProductVariations
            WHERE ProductID = @productId AND VariationID = @variationId AND IsActive = 1
        `);
    return result.recordset[0]?.Quantity || 0;
}

async function resolveCatalogProductId(pool, product) {
    if (!product) return null;
    if (product.productId) return product.productId;
    if (product.ProductID) return product.ProductID;
    const rawId = product.id;
    if (rawId == null) return null;
    if (/^\d+$/.test(String(rawId))) return parseInt(rawId, 10);

    if (UUID_IDENTIFIER_RE.test(String(rawId))) {
        const r = await pool.request()
            .input('id', sql.UniqueIdentifier, rawId)
            .query('SELECT ProductID FROM Products WHERE PublicId = @id AND IsActive = 1');
        return r.recordset[0]?.ProductID || null;
    }
    const r2 = await pool.request()
        .input('slug', sql.NVarChar, String(rawId))
        .query('SELECT ProductID FROM Products WHERE Slug = @slug AND IsActive = 1');
    return r2.recordset[0]?.ProductID || null;
}

async function loadVariationAggByProductId(pool) {
    const invAgg = await pool.request().query(`
        SELECT
            ip.ProductID,
            COUNT(*) as VariationCount,
            ISNULL(SUM(${VARIATION_SELLABLE_QTY_SQL}), 0) as VariationStockSum
        FROM InventoryProducts ip
        INNER JOIN InventoryProductVariations ipv
            ON ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
        WHERE ip.IsActive = 1 AND ip.ProductID IS NOT NULL
        GROUP BY ip.ProductID
    `);

    const pvAgg = await pool.request().query(`
        SELECT
            ProductID,
            COUNT(*) as VariationCount,
            ISNULL(SUM(COALESCE(Quantity, 0)), 0) as VariationStockSum
        FROM ProductVariations
        WHERE IsActive = 1
        GROUP BY ProductID
    `);

    const byProductId = new Map();
    for (const row of pvAgg.recordset || []) {
        byProductId.set(row.ProductID, row);
    }
    for (const row of invAgg.recordset || []) {
        const existing = byProductId.get(row.ProductID);
        const invStock = row.VariationStockSum || 0;
        const invCount = row.VariationCount || 0;
        if (!existing || invStock > 0 || invCount > (existing.VariationCount || 0)) {
            byProductId.set(row.ProductID, {
                ProductID: row.ProductID,
                VariationCount: Math.max(invCount, existing?.VariationCount || 0),
                VariationStockSum: invStock > 0 ? invStock : (existing?.VariationStockSum || 0)
            });
        } else if (existing && invCount > 0) {
            existing.VariationCount = Math.max(existing.VariationCount || 0, invCount);
        }
    }
    return byProductId;
}

/**
 * Apply sellable-stock rules to a product record returned to the storefront.
 */
async function enrichProductWithVariationPolicy(pool, product) {
    if (!product) return product;

    const productId = await resolveCatalogProductId(pool, product);
    const hasVariations = productId
        ? await productHasActiveProductVariations(pool, productId)
        : false;
    const variationStockSum = hasVariations
        ? await getProductVariationStockSum(pool, productId)
        : 0;

    const listedAvailable = Number(product.availableStock);
    const listedStock = Number(product.stockQuantity) || 0;
    const pendingFromProduct = Math.max(
        0,
        listedStock - (Number.isFinite(listedAvailable) ? listedAvailable : listedStock)
    );

    const enriched = {
        ...product,
        productId: productId || product.productId,
        hasVariations,
        requiresVariationSelection: hasVariations,
        variationStockSum
    };

    if (hasVariations) {
        enriched.stockQuantity = 0;
        enriched.availableStock = Math.max(0, variationStockSum - pendingFromProduct);
    }

    return enriched;
}

async function enrichProductsWithVariationPolicy(pool, products) {
    if (!Array.isArray(products) || products.length === 0) return products;

    const byProductId = await loadVariationAggByProductId(pool);

    const resolved = await Promise.all(
        products.map(async (product) => {
            const productId = await resolveCatalogProductId(pool, product);
            const row = productId ? byProductId.get(productId) : null;
            const hasVariations = (row?.VariationCount || 0) > 0;
            const variationStockSum = row?.VariationStockSum || 0;

            const listedAvailable = Number(product.availableStock);
            const listedStock = Number(product.stockQuantity) || 0;
            const pendingFromProduct = Math.max(
                0,
                listedStock - (Number.isFinite(listedAvailable) ? listedAvailable : listedStock)
            );

            const enriched = {
                ...product,
                productId: productId || product.productId,
                hasVariations,
                requiresVariationSelection: hasVariations,
                variationStockSum
            };

            if (hasVariations) {
                enriched.stockQuantity = 0;
                enriched.availableStock = Math.max(0, variationStockSum - pendingFromProduct);
            }

            return enriched;
        })
    );

    return resolved;
}

/**
 * Prefer first active inventory variation media for storefront catalog cards.
 */
async function enrichProductsAssetsFromInventory(pool, products) {
    if (!Array.isArray(products) || products.length === 0) return products;

    const ids = [];
    const idByIndex = [];
    for (let i = 0; i < products.length; i++) {
        const pid = await resolveCatalogProductId(pool, products[i]);
        idByIndex[i] = pid;
        if (pid) ids.push(pid);
    }
    if (!ids.length) return products;

    const uniqueIds = [...new Set(ids)];
    const inList = uniqueIds.join(',');
    let assetRows = [];
    try {
        const result = await pool.request().query(`
            SELECT ip.ProductID,
                ipv.VariationImageURL as mainImage,
                ipv.ThumbnailURLs as thumbnails,
                ipv.Model3D as model3d,
                ipv.VariationID
            FROM InventoryProducts ip
            INNER JOIN InventoryProductVariations ipv
                ON ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
            WHERE ip.IsActive = 1 AND ip.ProductID IN (${inList})
            ORDER BY ip.ProductID, ipv.VariationID
        `);
        assetRows = result.recordset || [];
    } catch (err) {
        console.warn('[enrichProductsAssetsFromInventory]', err.message);
        return products;
    }

    const firstByProduct = new Map();
    for (const row of assetRows) {
        if (!firstByProduct.has(row.ProductID)) {
            firstByProduct.set(row.ProductID, row);
        }
    }

    return products.map((product, i) => {
        const pid = idByIndex[i];
        const assets = pid ? firstByProduct.get(pid) : null;
        if (!assets) return product;

        const thumbs = parseThumbnailUrlsField(assets.thumbnails);
        const mainImage = assets.mainImage
            ? normalizeProductAssetUrl(assets.mainImage)
            : (thumbs[0] || product.images?.[0]);
        const model3d = assets.model3d ? normalizeProductAssetUrl(assets.model3d) : product.model3d;

        return {
            ...product,
            images: mainImage ? [mainImage] : (product.images || []),
            thumbnails: thumbs.length ? thumbs : (product.thumbnails || []),
            model3d: model3d || product.model3d,
            has3dModel: !!(model3d || product.has3dModel)
        };
    });
}

async function enrichProductAssetsFromInventory(pool, product) {
    const [enriched] = await enrichProductsAssetsFromInventory(pool, [product]);
    return enriched || product;
}

module.exports = {
    productHasActiveProductVariations,
    getInventoryVariationStockSum,
    getProductVariationStockSum,
    getProductVariationQuantity,
    resolveCatalogProductId,
    enrichProductWithVariationPolicy,
    enrichProductsWithVariationPolicy,
    enrichProductsAssetsFromInventory,
    enrichProductAssetsFromInventory,
    parseThumbnailUrlsField
};
