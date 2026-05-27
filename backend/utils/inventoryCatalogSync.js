'use strict';

const sql = require('mssql');
const { generateProductIdentifiers, generateVariationSKU, generateGuid } = require('./generateProductIdentifiers');

let variationSchemaReady = false;

/**
 * Parent rows have no SKU; only variations are uniquely identified by SKU.
 * SQL Server UNIQUE allows a single NULL — drop legacy parent constraints.
 */
async function ensureVariationSkuSchema(pool) {
    await pool.request().query(`
        IF EXISTS (
            SELECT 1 FROM sys.key_constraints
            WHERE name = N'UQ_InventoryProducts_SKU' AND parent_object_id = OBJECT_ID(N'dbo.InventoryProducts')
        )
            ALTER TABLE dbo.InventoryProducts DROP CONSTRAINT UQ_InventoryProducts_SKU;

        IF EXISTS (
            SELECT 1 FROM sys.key_constraints
            WHERE name = N'UQ_Products_SKU' AND parent_object_id = OBJECT_ID(N'dbo.Products')
        )
            ALTER TABLE dbo.Products DROP CONSTRAINT UQ_Products_SKU;

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'UX_Products_SKU_NotNull' AND object_id = OBJECT_ID(N'dbo.Products')
        )
            CREATE UNIQUE NONCLUSTERED INDEX UX_Products_SKU_NotNull
            ON dbo.Products(SKU) WHERE SKU IS NOT NULL;

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'UX_InventoryProductVariations_SKU' AND object_id = OBJECT_ID(N'dbo.InventoryProductVariations')
        )
            CREATE UNIQUE NONCLUSTERED INDEX UX_InventoryProductVariations_SKU
            ON dbo.InventoryProductVariations(SKU) WHERE SKU IS NOT NULL;

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'UX_ProductVariations_SKU' AND object_id = OBJECT_ID(N'dbo.ProductVariations')
        )
            CREATE UNIQUE NONCLUSTERED INDEX UX_ProductVariations_SKU
            ON dbo.ProductVariations(SKU) WHERE SKU IS NOT NULL;
    `);
}

async function ensureVariationMediaColumns(pool) {
    if (variationSchemaReady) return;
    const checks = [
        { table: 'InventoryProductVariations', column: 'Model3D', ddl: 'ALTER TABLE InventoryProductVariations ADD Model3D NVARCHAR(500) NULL' },
        { table: 'InventoryProductVariations', column: 'ThumbnailURLs', ddl: 'ALTER TABLE InventoryProductVariations ADD ThumbnailURLs NVARCHAR(MAX) NULL' },
        { table: 'InventoryProductVariations', column: 'SKU', ddl: 'ALTER TABLE InventoryProductVariations ADD SKU NVARCHAR(100) NULL' },
        { table: 'ProductVariations', column: 'Model3D', ddl: 'ALTER TABLE ProductVariations ADD Model3D NVARCHAR(500) NULL' },
        { table: 'ProductVariations', column: 'ThumbnailURLs', ddl: 'ALTER TABLE ProductVariations ADD ThumbnailURLs NVARCHAR(MAX) NULL' },
        { table: 'ProductVariations', column: 'SKU', ddl: 'ALTER TABLE ProductVariations ADD SKU NVARCHAR(100) NULL' },
        { table: 'InventoryProducts', column: 'ThumbnailURLs', ddl: 'ALTER TABLE InventoryProducts ADD ThumbnailURLs NVARCHAR(MAX) NULL' },
        { table: 'InventoryProducts', column: 'Model3D', ddl: 'ALTER TABLE InventoryProducts ADD Model3D NVARCHAR(500) NULL' },
        { table: 'InventoryProducts', column: 'CostPrice', ddl: 'ALTER TABLE InventoryProducts ADD CostPrice DECIMAL(10, 2) NULL' },
        { table: 'InventoryProductVariations', column: 'CostPrice', ddl: 'ALTER TABLE InventoryProductVariations ADD CostPrice DECIMAL(10, 2) NULL' },
        { table: 'InventoryProductVariations', column: 'Dimensions', ddl: 'ALTER TABLE InventoryProductVariations ADD Dimensions NVARCHAR(MAX) NULL' }
    ];
    for (const { table, column, ddl } of checks) {
        const exists = await pool.request()
            .input('table', sql.NVarChar, table)
            .input('column', sql.NVarChar, column)
            .query(`
                SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @table AND COLUMN_NAME = @column
            `);
        if (!exists.recordset.length) {
            await pool.request().query(ddl);
        }
    }
    await ensureVariationSkuSchema(pool);
    variationSchemaReady = true;
}

/**
 * Map multer file arrays to per-variation media (files appended in row order).
 */
function buildVariationDimensionsJson(v) {
    const src = v || {};
    const length = src.length != null && src.length !== '' ? parseFloat(src.length) : null;
    const width = src.width != null && src.width !== '' ? parseFloat(src.width) : null;
    const height = src.height != null && src.height !== '' ? parseFloat(src.height) : null;
    if (length == null && width == null && height == null) {
        if (src.dimensions) {
            return typeof src.dimensions === 'string' ? src.dimensions : JSON.stringify(src.dimensions);
        }
        return '{}';
    }
    return JSON.stringify({
        length: Number.isFinite(length) ? length : null,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
        unit: 'cm'
    });
}

function mapVariationMediaFiles(files, variationsList) {
    const mainFiles = (files && files.variationMainImage) ? files.variationMainImage : [];
    const modelFiles = (files && files.variationModel3d) ? files.variationModel3d : [];
    const thumbFiles = [
        ...((files && files.variationThumbnail) ? files.variationThumbnail : []),
        ...((files && files.variationThumbnails) ? files.variationThumbnails : [])
    ];
    let mainIndex = 0;
    let thumbIndex = 0;
    let modelIndex = 0;
    return (variationsList || []).map((v) => {
        const thumbCount = Math.min(4, parseInt(v.thumbCount, 10) || 0);
        const thumbs = thumbFiles.slice(thumbIndex, thumbIndex + thumbCount);
        thumbIndex += thumbCount;
        const mainFile = v.hasMainImage && mainFiles[mainIndex] ? mainFiles[mainIndex++] : null;
        const modelFile = v.hasModel3d && modelFiles[modelIndex] ? modelFiles[modelIndex++] : null;
        return { mainFile, thumbFiles: thumbs, modelFile };
    });
}

function parseSingleVariationMediaFiles(files) {
    return {
        mainFile: (files && files.variationMainImage && files.variationMainImage[0]) || null,
        thumbFiles: (files && files.variationThumbnail)
            ? files.variationThumbnail.slice(0, 4)
            : ((files && files.variationThumbnails) ? files.variationThumbnails.slice(0, 4) : []),
        modelFile: (files && files.variationModel3d && files.variationModel3d[0]) || null
    };
}

function resolveVariationMediaUrls(media, urlFn) {
    const thumbUrls = (media.thumbFiles || []).map((f) => urlFn(f)).filter(Boolean);
    const mainUrl = media.mainFile
        ? urlFn(media.mainFile)
        : null;
    const model3dUrl = media.modelFile ? urlFn(media.modelFile) : null;
    return {
        imageUrl: mainUrl,
        thumbnailUrls: thumbUrls,
        thumbJson: thumbUrls.length ? JSON.stringify(thumbUrls) : null,
        model3d: model3dUrl
    };
}

async function assignVariationSku(executor, variationId, variationName, existingSku = null) {
    const sku = existingSku || generateVariationSKU(variationId, variationName).sku;
    await executor.request()
        .input('variationId', sql.Int, variationId)
        .input('sku', sql.NVarChar, sku)
        .query(`
            UPDATE InventoryProductVariations SET SKU = @sku, UpdatedAt = GETDATE()
            WHERE VariationID = @variationId
        `);
    await executor.request()
        .input('variationId', sql.Int, variationId)
        .input('sku', sql.NVarChar, sku)
        .query(`
            UPDATE ProductVariations SET SKU = @sku, UpdatedAt = GETDATE()
            WHERE VariationID = @variationId
        `);
    return sku;
}

async function upsertProductVariationWithId(transaction, variationId, productId, row, userId) {
    const qty = row.quantity || 0;
    const thumbJson = row.thumbnailUrls && row.thumbnailUrls.length
        ? JSON.stringify(row.thumbnailUrls)
        : null;
    const variationSku = row.sku || generateVariationSKU(variationId, row.variationName).sku;
    const existing = await transaction.request()
        .input('variationId', sql.Int, variationId)
        .query('SELECT VariationID, SKU FROM ProductVariations WHERE VariationID = @variationId');

    if (existing.recordset.length) {
        const skuToUse = row.sku || existing.recordset[0].SKU || variationSku;
        await transaction.request()
            .input('variationId', sql.Int, variationId)
            .input('quantity', sql.Int, qty)
            .input('price', sql.Decimal(10, 2), row.price != null ? row.price : null)
            .input('imageUrl', sql.NVarChar, row.imageUrl || null)
            .input('thumbJson', sql.NVarChar, thumbJson)
            .input('model3d', sql.NVarChar, row.model3d || null)
            .input('sku', sql.NVarChar, skuToUse)
            .query(`
                UPDATE ProductVariations
                SET Quantity = @quantity, Price = @price, SKU = @sku,
                    VariationImageURL = COALESCE(@imageUrl, VariationImageURL),
                    ThumbnailURLs = COALESCE(@thumbJson, ThumbnailURLs),
                    Model3D = COALESCE(@model3d, Model3D),
                    UpdatedAt = GETDATE()
                WHERE VariationID = @variationId
            `);
        return skuToUse;
    }

    await transaction.request()
        .input('variationId', sql.Int, variationId)
        .input('productId', sql.Int, productId)
        .input('variationName', sql.NVarChar, row.variationName)
        .input('color', sql.NVarChar, row.color || null)
        .input('quantity', sql.Int, qty)
        .input('price', sql.Decimal(10, 2), row.price != null ? row.price : null)
        .input('imageUrl', sql.NVarChar, row.imageUrl || null)
        .input('thumbJson', sql.NVarChar, thumbJson)
        .input('model3d', sql.NVarChar, row.model3d || null)
        .input('sku', sql.NVarChar, variationSku)
        .input('createdBy', sql.Int, userId || null)
        .query(`
            SET IDENTITY_INSERT ProductVariations ON;
            INSERT INTO ProductVariations (VariationID, ProductID, VariationName, Color, Quantity, Price, VariationImageURL, ThumbnailURLs, Model3D, SKU, IsActive, CreatedBy)
            VALUES (@variationId, @productId, @variationName, @color, @quantity, @price, @imageUrl, @thumbJson, @model3d, @sku, 1, @createdBy);
            SET IDENTITY_INSERT ProductVariations OFF;
        `);
    return variationSku;
}

/**
 * Create or refresh linked Products + ProductVariations for storefront from inventory.
 */
async function createStorefrontProductFromInventory(transaction, inventoryProductId, userId, variationRows) {
    const invResult = await transaction.request()
        .input('inventoryProductId', sql.Int, inventoryProductId)
        .query(`
            SELECT InventoryProductID, ProductID, Name, Description, Price, Category, Dimensions,
                COALESCE(AvailableQuantity, 0) as AvailableQuantity, SKU, Slug, PublicId
            FROM InventoryProducts
            WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
        `);

    if (!invResult.recordset.length) {
        throw new Error('Inventory product not found');
    }

    const inv = invResult.recordset[0];
    let productId = inv.ProductID;

    if (!productId) {
        const tempSku = `TEMP-SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const tempSlug = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const insertResult = await transaction.request()
            .input('name', sql.NVarChar, inv.Name)
            .input('description', sql.NVarChar, inv.Description || '')
            .input('price', sql.Decimal(10, 2), inv.Price)
            .input('stock', sql.Int, inv.AvailableQuantity || 0)
            .input('category', sql.NVarChar, inv.Category)
            .input('dimensions', sql.NVarChar, inv.Dimensions || '{}')
            .input('tempSku', sql.NVarChar, tempSku)
            .input('tempSlug', sql.NVarChar, tempSlug)
            .query(`
                INSERT INTO Products (Name, Description, Price, StockQuantity, Category, Dimensions, DateAdded, IsActive, SKU, PublicId, Slug)
                VALUES (@name, @description, @price, @stock, @category, @dimensions, GETDATE(), 1, @tempSku, NEWID(), @tempSlug);
                SELECT SCOPE_IDENTITY() AS ProductID;
            `);
        productId = insertResult.recordset[0].ProductID;
        const { slug } = generateProductIdentifiers(productId, inv.Name);
        const finalPublicId = generateGuid();
        await transaction.request()
            .input('productId', sql.Int, productId)
            .input('publicId', sql.NVarChar, finalPublicId)
            .input('slug', sql.NVarChar, slug)
            .query(`
                UPDATE Products SET SKU = NULL, PublicId = CAST(@publicId AS UNIQUEIDENTIFIER), Slug = @slug
                WHERE ProductID = @productId
            `);
        await transaction.request()
            .input('inventoryProductId', sql.Int, inventoryProductId)
            .input('productId', sql.Int, productId)
            .query(`
                UPDATE InventoryProducts SET ProductID = @productId
                WHERE InventoryProductID = @inventoryProductId
            `);
    }

    for (const row of variationRows) {
        if (!row.variationId) continue;
        if (!row.sku) {
            row.sku = await assignVariationSku(transaction, row.variationId, row.variationName);
        }
        await upsertProductVariationWithId(transaction, row.variationId, productId, row, userId);
    }

    await transaction.request()
        .input('inventoryProductId', sql.Int, inventoryProductId)
        .query(`
            UPDATE InventoryProducts SET SKU = NULL, DateUpdated = GETDATE()
            WHERE InventoryProductID = @inventoryProductId
        `);
    await transaction.request()
        .input('productId', sql.Int, productId)
        .query(`
            UPDATE Products SET SKU = NULL, UpdatedAt = GETDATE()
            WHERE ProductID = @productId
        `);

    const first = variationRows[0] || {};
    const mainImage = first.imageUrl || (first.thumbnailUrls && first.thumbnailUrls[0]) || null;
    const thumbs = first.thumbnailUrls && first.thumbnailUrls.length ? JSON.stringify(first.thumbnailUrls) : null;
    const model3d = first.model3d || null;

    await transaction.request()
        .input('productId', sql.Int, productId)
        .input('imageUrl', sql.NVarChar, mainImage)
        .input('thumbs', sql.NVarChar, thumbs)
        .input('model3d', sql.NVarChar, model3d)
        .input('has3d', sql.Bit, model3d ? 1 : 0)
        .input('inventoryProductId', sql.Int, inventoryProductId)
        .query(`
            UPDATE Products
            SET ImageURL = COALESCE(@imageUrl, ImageURL),
                ThumbnailURLs = COALESCE(@thumbs, ThumbnailURLs),
                Model3DURL = COALESCE(@model3d, Model3DURL),
                Has3DModel = CASE WHEN @model3d IS NOT NULL THEN 1 ELSE Has3DModel END,
                StockQuantity = (SELECT COALESCE(AvailableQuantity, 0) FROM InventoryProducts WHERE InventoryProductID = @inventoryProductId),
                UpdatedAt = GETDATE()
            WHERE ProductID = @productId
        `);

    return productId;
}

module.exports = {
    ensureVariationMediaColumns,
    buildVariationDimensionsJson,
    mapVariationMediaFiles,
    parseSingleVariationMediaFiles,
    resolveVariationMediaUrls,
    assignVariationSku,
    upsertProductVariationWithId,
    createStorefrontProductFromInventory
};
