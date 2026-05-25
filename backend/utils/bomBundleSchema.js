'use strict';

const sql = require('mssql');
const { generateRawMaterialSKU } = require('./generateMaterialIdentifiers');

let schemaReady = false;

async function columnExists(pool, tableName, columnName) {
    const result = await pool.request()
        .input('table', sql.NVarChar, tableName)
        .input('column', sql.NVarChar, columnName)
        .query(`
            SELECT 1 AS ok
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @table AND COLUMN_NAME = @column
        `);
    return result.recordset.length > 0;
}

async function tableExists(pool, tableName) {
    const result = await pool.request()
        .input('table', sql.NVarChar, tableName)
        .query(`
            SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @table
        `);
    return result.recordset.length > 0;
}

async function runDdl(pool, label, sqlText) {
    try {
        await pool.request().query(sqlText);
    } catch (err) {
        console.error(`[BOM schema] ${label} failed:`, err.message);
        throw err;
    }
}

/**
 * Ensures RawMaterials SKU/Supplier and BOM bundle tables exist.
 * Re-runs if columns are missing (does not trust schemaReady alone).
 */
async function ensureBomBundleSchema(pool) {
    const hasRmSku = await columnExists(pool, 'RawMaterials', 'SKU');
    const hasRmSupplier = await columnExists(pool, 'RawMaterials', 'Supplier');
    const hasBundles = await tableExists(pool, 'BomBundles');
    const hasIpBomBundle = await columnExists(pool, 'InventoryProducts', 'BomBundleID');

    if (schemaReady && hasRmSku && hasRmSupplier && hasBundles && hasIpBomBundle) {
        return;
    }

    schemaReady = false;

    if (!hasRmSku) {
        await runDdl(pool, 'RawMaterials.SKU', `
            ALTER TABLE dbo.RawMaterials ADD SKU NVARCHAR(50) NULL;
        `);
    }

    if (!hasRmSupplier) {
        await runDdl(pool, 'RawMaterials.Supplier', `
            ALTER TABLE dbo.RawMaterials ADD Supplier NVARCHAR(255) NULL;
        `);
    }

    if (!hasBundles) {
        await runDdl(pool, 'BomBundles', `
            CREATE TABLE dbo.BomBundles (
                BomBundleID INT IDENTITY(1,1) PRIMARY KEY,
                BundleCode NVARCHAR(50) NOT NULL,
                Name NVARCHAR(255) NOT NULL,
                Description NVARCHAR(MAX) NULL,
                IsActive BIT NOT NULL DEFAULT 1,
                CreatedBy INT NULL,
                UpdatedBy INT NULL,
                DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                DateUpdated DATETIME2(0) NULL,
                CONSTRAINT UQ_BomBundles_BundleCode UNIQUE (BundleCode)
            );
            CREATE INDEX IX_BomBundles_IsActive ON dbo.BomBundles(IsActive);
        `);
    }

    if (!await columnExists(pool, 'InventoryProducts', 'BomBundleID')) {
        await runDdl(pool, 'InventoryProducts.BomBundleID', `
            ALTER TABLE dbo.InventoryProducts ADD BomBundleID INT NULL;
        `);
        try {
            await runDdl(pool, 'FK_InventoryProducts_BomBundle', `
                ALTER TABLE dbo.InventoryProducts
                ADD CONSTRAINT FK_InventoryProducts_BomBundle FOREIGN KEY (BomBundleID)
                    REFERENCES dbo.BomBundles(BomBundleID);
            `);
        } catch (fkErr) {
            if (!/already exists|duplicate/i.test(fkErr.message)) {
                console.warn('[BOM schema] FK_InventoryProducts_BomBundle:', fkErr.message);
            }
        }
    }

    if (!await tableExists(pool, 'BomBundleMaterials')) {
        await runDdl(pool, 'BomBundleMaterials', `
            CREATE TABLE dbo.BomBundleMaterials (
                BomBundleMaterialID INT IDENTITY(1,1) PRIMARY KEY,
                BomBundleID INT NOT NULL,
                MaterialID INT NOT NULL,
                QuantityRequired INT NOT NULL DEFAULT 1,
                CONSTRAINT FK_BomBundleMaterials_Bundle FOREIGN KEY (BomBundleID)
                    REFERENCES dbo.BomBundles(BomBundleID) ON DELETE CASCADE,
                CONSTRAINT FK_BomBundleMaterials_Material FOREIGN KEY (MaterialID)
                    REFERENCES dbo.RawMaterials(MaterialID),
                CONSTRAINT UQ_BomBundleMaterials_BundleMaterial UNIQUE (BomBundleID, MaterialID),
                CONSTRAINT CK_BomBundleMaterials_Qty CHECK (QuantityRequired > 0)
            );
            CREATE INDEX IX_BomBundleMaterials_Bundle ON dbo.BomBundleMaterials(BomBundleID);
        `);
    }

    const indexExists = await pool.request().query(`
        SELECT 1 AS ok FROM sys.indexes
        WHERE name = N'UX_RawMaterials_SKU' AND object_id = OBJECT_ID(N'dbo.RawMaterials')
    `);
    if (!indexExists.recordset.length) {
        await runDdl(pool, 'UX_RawMaterials_SKU', `
            CREATE UNIQUE NONCLUSTERED INDEX UX_RawMaterials_SKU
            ON dbo.RawMaterials(SKU) WHERE SKU IS NOT NULL;
        `);
    }

    const missingSku = await pool.request().query(`
        SELECT MaterialID, Name FROM dbo.RawMaterials
        WHERE SKU IS NULL OR LTRIM(RTRIM(SKU)) = ''
    `);
    for (const row of missingSku.recordset || []) {
        const sku = generateRawMaterialSKU(row.MaterialID, row.Name);
        await pool.request()
            .input('id', sql.Int, row.MaterialID)
            .input('sku', sql.NVarChar, sku)
            .query('UPDATE dbo.RawMaterials SET SKU = @sku WHERE MaterialID = @id');
    }

    if (!await columnExists(pool, 'RawMaterials', 'SKU')) {
        throw new Error('RawMaterials.SKU column could not be created.');
    }

    try {
        const { invalidateAdminPageCache } = require('./adminPageCache');
        invalidateAdminPageCache('admin:');
    } catch (_) { /* optional */ }

    schemaReady = true;
    console.log('[BOM schema] RawMaterials SKU/Supplier and BOM tables ready.');
}

async function loadActiveBomBundles(pool) {
    await ensureBomBundleSchema(pool);
    const result = await pool.request().query(`
        SELECT
            b.BomBundleID,
            b.BundleCode,
            b.Name,
            b.Description,
            b.DateAdded,
            b.DateUpdated,
            (SELECT COUNT(*) FROM BomBundleMaterials bm WHERE bm.BomBundleID = b.BomBundleID) AS MaterialCount
        FROM BomBundles b
        WHERE b.IsActive = 1
        ORDER BY b.Name ASC
    `);
    return result.recordset || [];
}

async function loadArchivedBomBundles(pool) {
    await ensureBomBundleSchema(pool);
    const result = await pool.request().query(`
        SELECT
            b.BomBundleID,
            b.BundleCode,
            b.Name,
            b.Description,
            b.DateAdded,
            b.DateUpdated,
            (SELECT COUNT(*) FROM BomBundleMaterials bm WHERE bm.BomBundleID = b.BomBundleID) AS MaterialCount
        FROM BomBundles b
        WHERE b.IsActive = 0
        ORDER BY b.DateUpdated DESC, b.DateAdded DESC
    `);
    return result.recordset || [];
}

async function loadBomBundleWithMaterials(pool, bomBundleId) {
    await ensureBomBundleSchema(pool);
    const bundleResult = await pool.request()
        .input('id', sql.Int, bomBundleId)
        .query(`
            SELECT BomBundleID, BundleCode, Name, Description, IsActive, DateAdded, DateUpdated
            FROM BomBundles
            WHERE BomBundleID = @id AND IsActive = 1
        `);
    if (!bundleResult.recordset.length) return null;

    const materialsResult = await pool.request()
        .input('id', sql.Int, bomBundleId)
        .query(`
            SELECT
                bm.BomBundleMaterialID,
                bm.MaterialID,
                bm.QuantityRequired,
                rm.Name AS MaterialName,
                rm.SKU AS MaterialSKU,
                rm.Unit,
                rm.QuantityAvailable
            FROM BomBundleMaterials bm
            LEFT JOIN RawMaterials rm ON rm.MaterialID = bm.MaterialID
            WHERE bm.BomBundleID = @id
            ORDER BY COALESCE(rm.Name, 'Material')
        `);

    return {
        bundle: bundleResult.recordset[0],
        materials: materialsResult.recordset || []
    };
}

/**
 * Merge duplicate material lines; sum quantities per material.
 */
function normalizeBundleMaterials(materialsData) {
    const map = new Map();
    const list = Array.isArray(materialsData) ? materialsData : [];
    for (const m of list) {
        const materialId = parseInt(m.materialId || m.MaterialID, 10);
        const qty = parseInt(m.quantityRequired || m.QuantityRequired, 10);
        if (!materialId || qty <= 0) continue;
        map.set(materialId, (map.get(materialId) || 0) + qty);
    }
    return Array.from(map.entries()).map(([materialId, quantityRequired]) => ({
        materialId,
        quantityRequired
    }));
}

/**
 * Ensure qty per unit does not exceed available raw material stock.
 */
async function assertBundleMaterialsWithinStock(poolOrTransaction, materials) {
    const req = poolOrTransaction.request ? poolOrTransaction.request.bind(poolOrTransaction) : null;
    if (!req) return;

    for (const m of materials) {
        const stockRow = await poolOrTransaction.request()
            .input('materialId', sql.Int, m.materialId)
            .query(`
                SELECT Name, QuantityAvailable
                FROM RawMaterials
                WHERE MaterialID = @materialId AND IsActive = 1
            `);
        if (!stockRow.recordset.length) {
            throw new Error(`Raw material ID ${m.materialId} is missing or inactive.`);
        }
        const row = stockRow.recordset[0];
        const available = row.QuantityAvailable || 0;
        const name = row.Name || 'Material';
        if (m.quantityRequired > available) {
            throw new Error(
                `"${name}": qty per unit (${m.quantityRequired}) cannot exceed current stock (${available}).`
            );
        }
    }
}

function recipeSignature(materials) {
    const normalized = normalizeBundleMaterials(materials);
    return normalized
        .map((m) => `${m.materialId}:${m.quantityRequired}`)
        .sort()
        .join('|');
}

/**
 * Find an active BOM bundle whose materials exactly match the given recipe.
 */
async function findBomBundleMatchingMaterials(pool, materials) {
    await ensureBomBundleSchema(pool);
    const targetKey = recipeSignature(materials);
    if (!targetKey) return null;

    const bundles = await loadActiveBomBundles(pool);
    for (const b of bundles) {
        const data = await loadBomBundleWithMaterials(pool, b.BomBundleID);
        if (!data || !data.materials.length) continue;
        const bundleKey = recipeSignature(data.materials.map((m) => ({
            materialId: m.MaterialID,
            quantityRequired: m.QuantityRequired
        })));
        if (bundleKey === targetKey) {
            return data.bundle;
        }
    }
    return null;
}

async function saveBomBundleMaterials(transaction, bomBundleId, materialsData) {
    const normalized = normalizeBundleMaterials(materialsData);
    await assertBundleMaterialsWithinStock(transaction, normalized);

    await transaction.request()
        .input('bomBundleId', sql.Int, bomBundleId)
        .query('DELETE FROM BomBundleMaterials WHERE BomBundleID = @bomBundleId');

    for (const m of normalized) {
        await transaction.request()
            .input('bomBundleId', sql.Int, bomBundleId)
            .input('materialId', sql.Int, m.materialId)
            .input('qty', sql.Int, m.quantityRequired)
            .query(`
                INSERT INTO BomBundleMaterials (BomBundleID, MaterialID, QuantityRequired)
                VALUES (@bomBundleId, @materialId, @qty)
            `);
    }
}

module.exports = {
    ensureBomBundleSchema,
    loadActiveBomBundles,
    loadArchivedBomBundles,
    loadBomBundleWithMaterials,
    findBomBundleMatchingMaterials,
    saveBomBundleMaterials,
    normalizeBundleMaterials,
    assertBundleMaterialsWithinStock,
    columnExists
};
