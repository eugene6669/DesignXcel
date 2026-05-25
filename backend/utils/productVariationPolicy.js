/**
 * Parent products with active variations are not directly sellable.
 * Stock for checkout/display comes from variations (inventory source of truth).
 */
const sql = require('mssql');
const { applyDiscountToProductRecord } = require('./productDiscountHelpers');
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

/** Any CMS variation rows (product uses variation stock model on storefront). */
async function productHasAnyCatalogVariations(pool, productId, transaction = null) {
    if (!productId) return false;
    const request = transaction ? transaction.request() : pool.request();
    const result = await request
        .input('productId', sql.Int, productId)
        .query(`
            SELECT COUNT(*) as Cnt
            FROM ProductVariations
            WHERE ProductID = @productId
        `);
    return (result.recordset[0]?.Cnt || 0) > 0;
}

/** Storefront-visible variations (Admin Products "Storefront" checkbox → ProductVariations.IsActive). */
async function productHasActiveProductVariations(pool, productId, transaction = null) {
    if (!productId) return false;
    const request = transaction ? transaction.request() : pool.request();
    const result = await request
        .input('productId', sql.Int, productId)
        .query(`
            SELECT COUNT(*) as PvCnt
            FROM ProductVariations
            WHERE ProductID = @productId AND IsActive = 1
        `);
    return (result.recordset[0]?.PvCnt || 0) > 0;
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
            INNER JOIN ProductVariations pv
                ON pv.VariationID = ipv.VariationID AND pv.ProductID = @productId AND pv.IsActive = 1
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
            INNER JOIN ProductVariations pv
                ON pv.VariationID = ipv.VariationID AND pv.ProductID = @productId AND pv.IsActive = 1
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
            COUNT(*) as ActiveVariationCount,
            ISNULL(SUM(${VARIATION_SELLABLE_QTY_SQL}), 0) as VariationStockSum
        FROM InventoryProducts ip
        INNER JOIN InventoryProductVariations ipv
            ON ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
        INNER JOIN ProductVariations pv
            ON pv.VariationID = ipv.VariationID AND pv.ProductID = ip.ProductID AND pv.IsActive = 1
        WHERE ip.IsActive = 1 AND ip.ProductID IS NOT NULL
        GROUP BY ip.ProductID
    `);

    const pvActiveAgg = await pool.request().query(`
        SELECT
            ProductID,
            COUNT(*) as ActiveVariationCount,
            ISNULL(SUM(COALESCE(Quantity, 0)), 0) as VariationStockSum
        FROM ProductVariations
        WHERE IsActive = 1
        GROUP BY ProductID
    `);

    const pvAnyAgg = await pool.request().query(`
        SELECT ProductID, COUNT(*) as AnyVariationCount
        FROM ProductVariations
        GROUP BY ProductID
    `);

    const byProductId = new Map();
    for (const row of pvAnyAgg.recordset || []) {
        byProductId.set(row.ProductID, {
            ProductID: row.ProductID,
            AnyVariationCount: row.AnyVariationCount || 0,
            ActiveVariationCount: 0,
            VariationStockSum: 0
        });
    }
    for (const row of pvActiveAgg.recordset || []) {
        const existing = byProductId.get(row.ProductID) || {
            ProductID: row.ProductID,
            AnyVariationCount: 0,
            ActiveVariationCount: 0,
            VariationStockSum: 0
        };
        existing.ActiveVariationCount = Math.max(
            existing.ActiveVariationCount || 0,
            row.ActiveVariationCount || 0
        );
        existing.VariationStockSum = Math.max(
            existing.VariationStockSum || 0,
            row.VariationStockSum || 0
        );
        byProductId.set(row.ProductID, existing);
    }
    for (const row of invAgg.recordset || []) {
        const existing = byProductId.get(row.ProductID) || {
            ProductID: row.ProductID,
            AnyVariationCount: 0,
            ActiveVariationCount: 0,
            VariationStockSum: 0
        };
        const invStock = row.VariationStockSum || 0;
        existing.ActiveVariationCount = Math.max(
            existing.ActiveVariationCount || 0,
            row.ActiveVariationCount || 0
        );
        if (invStock > 0) {
            existing.VariationStockSum = invStock;
        }
        byProductId.set(row.ProductID, existing);
    }
    return byProductId;
}

/**
 * Apply sellable-stock rules to a product record returned to the storefront.
 */
async function enrichProductWithVariationPolicy(pool, product) {
    if (!product) return product;

    const productId = await resolveCatalogProductId(pool, product);
    const hasAnyVariations = productId
        ? await productHasAnyCatalogVariations(pool, productId)
        : false;
    const hasActiveVariations = productId
        ? await productHasActiveProductVariations(pool, productId)
        : false;
    const variationStockSum = hasAnyVariations
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
        hasVariations: hasAnyVariations,
        requiresVariationSelection: hasActiveVariations,
        variationStockSum
    };

    if (hasAnyVariations) {
        enriched.stockQuantity = 0;
        enriched.availableStock = Math.max(0, variationStockSum - pendingFromProduct);
    }

    return enriched;
}

async function enrichProductsWithVariationPolicy(pool, products) {
    if (!Array.isArray(products) || products.length === 0) return products;

    const byProductId = await loadVariationAggByProductId(pool);
    let getCatalogPendingQuantity;
    try {
        ({ getCatalogPendingQuantity } = require('./availableStockCalculator'));
    } catch {
        getCatalogPendingQuantity = null;
    }

    const resolved = await Promise.all(
        products.map(async (product) => {
            const productId = await resolveCatalogProductId(pool, product);
            const row = productId ? byProductId.get(productId) : null;
            const hasAnyVariations = (row?.AnyVariationCount || 0) > 0;
            const hasActiveVariations = (row?.ActiveVariationCount || 0) > 0;
            const variationStockSum = row?.VariationStockSum || 0;

            const enriched = {
                ...product,
                productId: productId || product.productId,
                hasVariations: hasAnyVariations,
                requiresVariationSelection: hasActiveVariations,
                variationStockSum
            };

            if (hasAnyVariations) {
                enriched.stockQuantity = 0;
                let pendingQty = 0;
                if (productId && getCatalogPendingQuantity) {
                    pendingQty = await getCatalogPendingQuantity(pool, productId);
                } else {
                    const listedAvailable = Number(product.availableStock);
                    const listedStock = Number(product.stockQuantity) || 0;
                    pendingQty = Math.max(
                        0,
                        listedStock - (Number.isFinite(listedAvailable) ? listedAvailable : listedStock)
                    );
                }
                enriched.availableStock = Math.max(0, variationStockSum - pendingQty);
            }

            return enriched;
        })
    );

    return resolved;
}

function dedupeThumbsExcludingMain(thumbSources, mainImage) {
    const thumbnails = [];
    const seen = new Set();
    const mainKey = assetBasenameKey(mainImage);
    if (mainImage) seen.add(String(mainImage).trim());
    if (mainKey) seen.add(mainKey);
    for (const raw of thumbSources || []) {
        const url = normalizeProductAssetUrl(raw);
        if (!url) continue;
        const baseKey = assetBasenameKey(url);
        if (seen.has(url) || (baseKey && seen.has(baseKey))) continue;
        seen.add(url);
        if (baseKey) seen.add(baseKey);
        thumbnails.push(url);
        if (thumbnails.length >= 4) break;
    }
    return thumbnails;
}

function assetBasenameKey(url) {
    if (!url) return '';
    const path = String(url).trim().replace(/\\/g, '/').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    return (parts[parts.length - 1] || '').toLowerCase();
}

/**
 * Parent product media for storefront detail (main image + thumbnail strip).
 */
function buildParentStorefrontMedia(product, parentImage, parentThumbnails, parentModel3d, catalogImage, catalogThumbnails) {
    const parentMain = parentImage ? normalizeProductAssetUrl(parentImage) : null;
    const catalogMain = catalogImage ? normalizeProductAssetUrl(catalogImage) : null;
    const existingMain = product.images?.[0] ? normalizeProductAssetUrl(product.images[0]) : null;
    const mainImage = parentMain || catalogMain || existingMain || null;

    const thumbSources = [
        ...parseThumbnailUrlsField(parentThumbnails),
        ...parseThumbnailUrlsField(catalogThumbnails),
        ...(Array.isArray(product.thumbnails) ? product.thumbnails : [])
    ];
    const thumbnails = dedupeThumbsExcludingMain(thumbSources, mainImage);
    const parentModel = parentModel3d ? normalizeProductAssetUrl(parentModel3d) : null;

    return {
        images: mainImage ? [mainImage] : (product.images || []),
        thumbnails,
        model3d: parentModel || product.model3d,
        has3dModel: !!(parentModel || product.model3d || product.has3dModel)
    };
}

/**
 * Catalog card / list media — main image never comes from thumbnail URLs.
 */
function buildCatalogCardMedia(product, assets) {
    const parentMain = assets.parentImage ? normalizeProductAssetUrl(assets.parentImage) : null;
    const varMain = assets.mainImage ? normalizeProductAssetUrl(assets.mainImage) : null;
    const existingMain = product.images?.[0] ? normalizeProductAssetUrl(product.images[0]) : null;
    const mainImage = parentMain || varMain || existingMain || null;

    const parentThumbs = parseThumbnailUrlsField(assets.parentThumbnails);
    const varThumbs = parseThumbnailUrlsField(assets.thumbnails);
    const existingThumbs = Array.isArray(product.thumbnails) ? product.thumbnails : [];
    const hasParentLevelThumbs = parentThumbs.length > 0 || existingThumbs.length > 0;
    const thumbSources = [
        ...parentThumbs,
        ...existingThumbs,
        ...(hasParentLevelThumbs ? [] : varThumbs)
    ];
    const thumbnails = dedupeThumbsExcludingMain(thumbSources, mainImage);

    const parentModel = assets.parentModel3d ? normalizeProductAssetUrl(assets.parentModel3d) : null;
    const varModel = assets.model3d ? normalizeProductAssetUrl(assets.model3d) : null;
    const model3d = parentModel || varModel || product.model3d;

    return {
        images: mainImage ? [mainImage] : (product.images || []),
        thumbnails,
        model3d: model3d || product.model3d,
        has3dModel: !!(model3d || product.has3dModel)
    };
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
                ip.ImageURL as parentImage,
                ip.ThumbnailURLs as parentThumbnails,
                ip.Model3D as parentModel3d,
                firstVar.VariationImageURL as mainImage,
                firstVar.ThumbnailURLs as thumbnails,
                firstVar.Model3D as model3d,
                firstVar.VariationID
            FROM InventoryProducts ip
            OUTER APPLY (
                SELECT TOP 1
                    ipv.VariationImageURL,
                    ipv.ThumbnailURLs,
                    ipv.Model3D,
                    ipv.VariationID
                FROM InventoryProductVariations ipv
                WHERE ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
                ORDER BY ipv.VariationID
            ) firstVar
            WHERE ip.IsActive = 1 AND ip.ProductID IN (${inList})
            ORDER BY ip.ProductID
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

        const media = buildCatalogCardMedia(product, assets);
        return {
            ...product,
            ...media
        };
    });
}

/**
 * Use inventory parent / min-variation price as catalog list price and recalculate discounts.
 */
async function enrichProductsCatalogPricingFromInventory(pool, products) {
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
    let priceRows = [];
    try {
        const result = await pool.request().query(`
            SELECT
                ip.ProductID,
                ISNULL(ip.Price, 0) AS ParentPrice,
                (
                    SELECT MIN(vpr.unitPrice)
                    FROM (
                        SELECT
                            COALESCE(
                                NULLIF(ipv.Price, 0),
                                NULLIF(pv.Price, 0)
                            ) AS unitPrice
                        FROM InventoryProductVariations ipv
                        LEFT JOIN ProductVariations pv
                            ON pv.VariationID = ipv.VariationID AND pv.IsActive = 1
                        WHERE ipv.InventoryProductID = ip.InventoryProductID AND ipv.IsActive = 1
                        UNION ALL
                        SELECT NULLIF(pv2.Price, 0) AS unitPrice
                        FROM ProductVariations pv2
                        WHERE pv2.ProductID = ip.ProductID AND pv2.IsActive = 1
                    ) vpr
                    WHERE vpr.unitPrice IS NOT NULL AND vpr.unitPrice > 0
                ) AS MinVariationPrice,
                CASE WHEN EXISTS (
                    SELECT 1 FROM InventoryProductVariations ipv2
                    WHERE ipv2.InventoryProductID = ip.InventoryProductID AND ipv2.IsActive = 1
                ) OR EXISTS (
                    SELECT 1 FROM ProductVariations pv3
                    WHERE pv3.ProductID = ip.ProductID AND pv3.IsActive = 1
                ) THEN 1 ELSE 0 END AS HasVariations
            FROM InventoryProducts ip
            WHERE ip.IsActive = 1 AND ip.ProductID IN (${inList})
        `);
        priceRows = result.recordset || [];
    } catch (err) {
        console.warn('[enrichProductsCatalogPricingFromInventory]', err.message);
        return products;
    }

    const priceByProduct = new Map();
    const hasVariationsByProduct = new Map();
    for (const row of priceRows) {
        const parent = Number(row.ParentPrice) || 0;
        const minVar = Number(row.MinVariationPrice) || 0;
        const hasVariations = !!row.HasVariations;
        hasVariationsByProduct.set(row.ProductID, hasVariations);
        let catalogPrice = 0;
        if (hasVariations) {
            catalogPrice = minVar > 0 ? minVar : 0;
        } else {
            catalogPrice = parent > 0 ? parent : minVar;
        }
        if (catalogPrice > 0 || parent > 0 || minVar > 0) {
            priceByProduct.set(row.ProductID, {
                catalogPrice: hasVariations
                    ? (minVar > 0 ? minVar : 0)
                    : (catalogPrice > 0 ? catalogPrice : parent),
                parentListPrice: parent > 0 ? parent : 0,
                variationMinPrice: minVar > 0 ? minVar : 0,
                hasVariations
            });
        }
    }

    return products.map((product, i) => {
        const pid = idByIndex[i];
        const pricing = pid ? priceByProduct.get(pid) : null;
        if (!pricing) return product;
        const { catalogPrice, parentListPrice, variationMinPrice, hasVariations } = pricing;
        const sellBase =
            hasVariations && variationMinPrice > 0
                ? variationMinPrice
                : catalogPrice > 0
                    ? catalogPrice
                    : parentListPrice;
        if (!sellBase) return product;
        const discountBase = parentListPrice > 0 ? parentListPrice : sellBase;
        const enriched = applyDiscountToProductRecord(product, discountBase);
        const listPrice = discountBase;
        let cardPrice = sellBase;
        if (enriched.hasDiscount && enriched.discountInfo?.discountedPrice != null) {
            cardPrice = Number(enriched.discountInfo.discountedPrice);
            if (hasVariations && variationMinPrice > 0 && variationMinPrice < listPrice) {
                cardPrice = variationMinPrice;
            }
        } else if (hasVariations && variationMinPrice > 0) {
            cardPrice = variationMinPrice;
        }
        return {
            ...enriched,
            price: listPrice,
            cardPrice,
            variationMinPrice: variationMinPrice > 0 ? variationMinPrice : sellBase,
            catalogListPrice: sellBase,
            parentListPrice: parentListPrice > 0 ? parentListPrice : listPrice,
            hasVariations: enriched.hasVariations || hasVariations || false
        };
    });
}

async function enrichProductAssetsFromInventory(pool, product) {
    const [enriched] = await enrichProductsAssetsFromInventory(pool, [product]);
    return enriched || product;
}

function parseInventoryDimensionsJson(raw) {
    if (raw == null || !String(raw).trim()) return {};
    try {
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!d || typeof d !== 'object') return {};
        return {
            length: d.length ?? d.Length ?? null,
            width: d.width ?? d.Width ?? null,
            height: d.height ?? d.Height ?? null,
            weight: d.weight ?? d.Weight ?? null,
            notes: d.notes ?? d.Notes ?? null,
            unit: d.unit ?? d.Unit ?? 'cm'
        };
    } catch {
        return {};
    }
}

function mergeSpecificationsFromInventory(existingSpecs, inventoryDims) {
    const base = existingSpecs && typeof existingSpecs === 'object' ? { ...existingSpecs } : {};
    if (!inventoryDims || typeof inventoryDims !== 'object') return base;
    const pick = (key, invKey) => {
        const v = inventoryDims[invKey];
        if (v !== null && v !== undefined && v !== '') base[key] = v;
    };
    pick('length', 'length');
    pick('width', 'width');
    pick('height', 'height');
    pick('weight', 'weight');
    pick('notes', 'notes');
    if (inventoryDims.unit) base.unit = inventoryDims.unit;
    return base;
}

/**
 * Pull display fields for Additional Information from Product Inventory (source of truth).
 */
async function enrichProductDetailFromInventory(pool, product) {
    if (!product) return product;

    const productId = await resolveCatalogProductId(pool, product);
    if (!productId) return product;

    let invRow = null;
    try {
        const invResult = await pool.request()
            .input('productId', sql.Int, productId)
            .query(`
                SELECT TOP 1
                    ip.InventoryProductID,
                    ip.Name,
                    ip.Description,
                    ip.Category,
                    ip.Price,
                    ip.Dimensions,
                    ip.ImageURL,
                    ip.ThumbnailURLs,
                    ip.Model3D,
                    COALESCE(ip.AvailableQuantity, 0) AS AvailableQuantity,
                    (COALESCE(ip.AvailableQuantity, 0) + COALESCE(ip.DamagedQuantity, 0)) AS TotalQuantity,
                    ip.InventoryStatus
                FROM InventoryProducts ip
                WHERE ip.IsActive = 1 AND ip.ProductID = @productId
                ORDER BY ip.InventoryProductID DESC
            `);
        invRow = invResult.recordset[0] || null;

        if (!invRow) {
            const legacy = await pool.request()
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT TOP 1
                        ip.InventoryProductID,
                        ip.Name,
                        ip.Description,
                        ip.Category,
                        ip.Price,
                        ip.Dimensions,
                        ip.ImageURL,
                        ip.ThumbnailURLs,
                        ip.Model3D,
                        COALESCE(ip.AvailableQuantity, 0) AS AvailableQuantity,
                        (COALESCE(ip.AvailableQuantity, 0) + COALESCE(ip.DamagedQuantity, 0)) AS TotalQuantity,
                        ip.InventoryStatus
                    FROM InventoryProducts ip
                    WHERE ip.IsActive = 1 AND ip.InventoryProductID = @productId
                    ORDER BY ip.InventoryProductID DESC
                `);
            invRow = legacy.recordset[0] || null;
        }
    } catch (err) {
        console.warn('[enrichProductDetailFromInventory]', err.message);
        return product;
    }

    if (!invRow) {
        invRow = {};
    }

    let catalogRow = {};
    try {
        const catalogResult = await pool.request()
            .input('productId', sql.Int, productId)
            .query(`
                SELECT ImageURL, ThumbnailURLs, Model3DURL
                FROM Products
                WHERE ProductID = @productId AND IsActive = 1
            `);
        catalogRow = catalogResult.recordset[0] || {};
    } catch (err) {
        console.warn('[enrichProductDetailFromInventory] catalog media:', err.message);
    }

    const inventoryProductId = invRow.InventoryProductID;
    let materialNames = [];
    let colorOptions = [];

    if (inventoryProductId) {
    try {
        const matResult = await pool.request()
            .input('invId', sql.Int, inventoryProductId)
            .query(`
                SELECT rm.Name
                FROM InventoryProductMaterials ipm
                INNER JOIN RawMaterials rm ON rm.MaterialID = ipm.MaterialID AND rm.IsActive = 1
                WHERE ipm.InventoryProductID = @invId
                ORDER BY rm.Name
            `);
        materialNames = (matResult.recordset || []).map((r) => r.Name).filter(Boolean);
    } catch (err) {
        console.warn('[enrichProductDetailFromInventory] materials:', err.message);
    }

    try {
        const colorResult = await pool.request()
            .input('invId', sql.Int, inventoryProductId)
            .query(`
                SELECT DISTINCT LTRIM(RTRIM(Color)) AS Color
                FROM InventoryProductVariations
                WHERE InventoryProductID = @invId AND IsActive = 1
                  AND Color IS NOT NULL AND LTRIM(RTRIM(Color)) <> ''
                ORDER BY Color
            `);
        colorOptions = (colorResult.recordset || []).map((r) => r.Color).filter(Boolean);
    } catch (err) {
        console.warn('[enrichProductDetailFromInventory] colors:', err.message);
    }
    }

    const inventoryDims = parseInventoryDimensionsJson(invRow.Dimensions);
    const specifications = mergeSpecificationsFromInventory(product.specifications, inventoryDims);
    const materialLabel = materialNames.length
        ? materialNames.join(', ')
        : (product.material || null);

    const parentMedia = buildParentStorefrontMedia(
        product,
        invRow.ImageURL,
        invRow.ThumbnailURLs,
        invRow.Model3D,
        catalogRow.ImageURL,
        catalogRow.ThumbnailURLs
    );

    let detailModel3d = parentMedia.model3d;
    if (!detailModel3d && inventoryProductId) {
        try {
            const varModelResult = await pool.request()
                .input('invId', sql.Int, inventoryProductId)
                .query(`
                    SELECT TOP 1 COALESCE(ipv.Model3D, pv.Model3D) AS Model3D
                    FROM InventoryProductVariations ipv
                    INNER JOIN ProductVariations pv
                        ON pv.VariationID = ipv.VariationID AND pv.IsActive = 1
                    WHERE ipv.InventoryProductID = @invId AND ipv.IsActive = 1
                      AND COALESCE(ipv.Model3D, pv.Model3D) IS NOT NULL
                      AND LTRIM(RTRIM(COALESCE(ipv.Model3D, pv.Model3D))) <> ''
                    ORDER BY ipv.VariationID
                `);
            const varModelRaw = varModelResult.recordset[0]?.Model3D;
            if (varModelRaw) {
                detailModel3d = normalizeProductAssetUrl(varModelRaw);
            }
        } catch (err) {
            console.warn('[enrichProductDetailFromInventory] variation model:', err.message);
        }
    }

    const resolvedMedia = {
        ...parentMedia,
        model3d: detailModel3d || parentMedia.model3d,
        has3dModel: !!(detailModel3d || parentMedia.model3d || parentMedia.has3dModel)
    };

    const catalogPrice = parseFloat(invRow.Price) || product.price;
    const merged = {
        ...product,
        ...resolvedMedia,
        name: invRow.Name || product.name,
        categoryName: invRow.Category || product.categoryName,
        description: invRow.Description || product.description,
        price: catalogPrice,
        inventoryProductId,
        specifications,
        material: materialLabel,
        materials: materialNames,
        colors: colorOptions.length ? colorOptions : (product.colors || []),
        color: colorOptions.length === 1 ? colorOptions[0] : (product.color || null),
        inventoryAvailableQuantity: invRow.AvailableQuantity,
        inventoryTotalQuantity: invRow.TotalQuantity,
        inventoryStatus: invRow.InventoryStatus
    };
    return applyDiscountToProductRecord(merged, catalogPrice);
}

module.exports = {
    productHasAnyCatalogVariations,
    productHasActiveProductVariations,
    getInventoryVariationStockSum,
    getProductVariationStockSum,
    getProductVariationQuantity,
    resolveCatalogProductId,
    enrichProductWithVariationPolicy,
    enrichProductsWithVariationPolicy,
    enrichProductsAssetsFromInventory,
    enrichProductsCatalogPricingFromInventory,
    enrichProductAssetsFromInventory,
    enrichProductDetailFromInventory,
    parseThumbnailUrlsField
};

