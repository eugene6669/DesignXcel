'use strict';

const sql = require('mssql');

const MOVEMENT_LABELS = {
    returned_to_damaged: 'Returned → Damaged',
    damaged_to_repaired: 'Damaged → Repaired',
    repaired_to_available: 'Repaired → Available',
    restock_available: 'Restock → Available',
    restock_variation: 'Restock variation',
    restock_product: 'Restock product',
    restock_raw_material: 'Restock raw material',
    return_received: 'Return received',
    status_adjustment: 'Status adjustment'
};

async function ensureInventoryStockMovementSchema(pool) {
    await pool.request().query(`
        IF NOT EXISTS (
            SELECT 1 FROM sys.tables
            WHERE name = 'InventoryStockMovements' AND schema_id = SCHEMA_ID('dbo')
        )
        BEGIN
            CREATE TABLE dbo.InventoryStockMovements (
                MovementID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                InventoryProductID INT NULL,
                VariationID INT NULL,
                MovementType NVARCHAR(64) NOT NULL,
                FromStatus NVARCHAR(32) NULL,
                ToStatus NVARCHAR(32) NULL,
                Quantity INT NOT NULL CONSTRAINT DF_InventoryStockMovements_Qty DEFAULT (0),
                Notes NVARCHAR(500) NULL,
                CreatedBy INT NULL,
                CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryStockMovements_CreatedAt DEFAULT (SYSUTCDATETIME())
            );
            CREATE INDEX IX_InventoryStockMovements_CreatedAt ON dbo.InventoryStockMovements(CreatedAt DESC);
            CREATE INDEX IX_InventoryStockMovements_Variation ON dbo.InventoryStockMovements(VariationID, CreatedAt DESC);
            CREATE INDEX IX_InventoryStockMovements_Product ON dbo.InventoryStockMovements(InventoryProductID, CreatedAt DESC);
        END
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.InventoryStockMovements') AND name = 'RawMaterialID'
        )
        BEGIN
            ALTER TABLE dbo.InventoryStockMovements ADD RawMaterialID INT NULL;
            CREATE INDEX IX_InventoryStockMovements_RawMaterial ON dbo.InventoryStockMovements(RawMaterialID, CreatedAt DESC);
        END
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.InventoryStockMovements') AND name = 'IsArchived'
        )
        BEGIN
            ALTER TABLE dbo.InventoryStockMovements ADD IsArchived BIT NOT NULL CONSTRAINT DF_InventoryStockMovements_IsArchived DEFAULT (0);
        END
    `);
}

function movementLabel(type) {
    return MOVEMENT_LABELS[type] || type || 'Movement';
}

async function insertStockMovement(pool, row) {
    await ensureInventoryStockMovementSchema(pool);
    const qty = Math.max(0, parseInt(row.quantity, 10) || 0);
    if (qty <= 0) return;

    await pool.request()
        .input('inventoryProductId', sql.Int, row.inventoryProductId || null)
        .input('variationId', sql.Int, row.variationId || null)
        .input('rawMaterialId', sql.Int, row.rawMaterialId || null)
        .input('movementType', sql.NVarChar(64), row.movementType)
        .input('fromStatus', sql.NVarChar(32), row.fromStatus || null)
        .input('toStatus', sql.NVarChar(32), row.toStatus || null)
        .input('quantity', sql.Int, qty)
        .input('notes', sql.NVarChar(500), row.notes || null)
        .input('createdBy', sql.Int, row.createdBy || null)
        .query(`
            INSERT INTO InventoryStockMovements (
                InventoryProductID, VariationID, RawMaterialID, MovementType, FromStatus, ToStatus, Quantity, Notes, CreatedBy
            )
            VALUES (
                @inventoryProductId, @variationId, @rawMaterialId, @movementType, @fromStatus, @toStatus, @quantity, @notes, @createdBy
            )
        `);
}

function inferMovementFromNotes(notes, deltas) {
    const n = String(notes || '');
    if (/Returned\s*→\s*damaged/i.test(n)) {
        return { movementType: 'returned_to_damaged', fromStatus: 'returned', toStatus: 'damaged', quantity: deltas.damagedDelta || deltas.returnedDelta };
    }
    if (/Repair from damaged/i.test(n)) {
        return { movementType: 'damaged_to_repaired', fromStatus: 'damaged', toStatus: 'repaired', quantity: deltas.repairedDelta || deltas.damagedDelta };
    }
    if (/Repaired\s*→\s*available/i.test(n)) {
        return { movementType: 'repaired_to_available', fromStatus: 'repaired', toStatus: 'available', quantity: deltas.availableDelta || deltas.repairedDelta };
    }
    return null;
}

async function logInventoryStockMovementFromVariationUpdate(pool, payload) {
    const {
        variationBefore,
        availableQty,
        returnedQty,
        damagedQty,
        repairedQty,
        notes,
        variationId,
        inventoryProductId,
        userId
    } = payload;

    if (!variationBefore || !variationId) return;

    const before = {
        available: Number(variationBefore.AvailableQuantity ?? variationBefore.Quantity) || 0,
        returned: Number(variationBefore.ReturnedQuantity) || 0,
        damaged: Number(variationBefore.DamagedQuantity) || 0,
        repaired: Number(variationBefore.RepairedQuantity) || 0
    };
    const deltas = {
        availableDelta: Math.max(0, availableQty - before.available),
        returnedDelta: Math.max(0, before.returned - returnedQty),
        damagedDelta: Math.max(0, damagedQty - before.damaged),
        repairedDelta: Math.max(0, repairedQty - before.repaired)
    };

    const inferred = inferMovementFromNotes(notes, deltas);
    if (inferred && inferred.quantity > 0) {
        await insertStockMovement(pool, {
            inventoryProductId,
            variationId,
            movementType: inferred.movementType,
            fromStatus: inferred.fromStatus,
            toStatus: inferred.toStatus,
            quantity: inferred.quantity,
            notes,
            createdBy: userId
        });
        return;
    }

    if (deltas.availableDelta > 0 && deltas.damagedDelta === 0 && deltas.repairedDelta === 0 && deltas.returnedDelta === 0) {
        await insertStockMovement(pool, {
            inventoryProductId,
            variationId,
            movementType: 'restock_available',
            fromStatus: null,
            toStatus: 'available',
            quantity: deltas.availableDelta,
            notes: notes || 'Available quantity increased',
            createdBy: userId
        });
    }
}

/** Log manual restock from Inventory → restock variation button / API. */
async function logRestockVariationMovement(pool, payload) {
    const inventoryProductId = parseInt(payload.inventoryProductId, 10);
    const variationId = parseInt(payload.variationId, 10);
    const quantity = parseInt(payload.quantity, 10);
    if (!inventoryProductId || !variationId || !quantity || quantity <= 0) return;

    const qtyNote = payload.notes || ('Restock variation (+' + quantity + ')');
    await insertStockMovement(pool, {
        inventoryProductId,
        variationId,
        movementType: 'restock_variation',
        fromStatus: null,
        toStatus: 'available',
        quantity,
        notes: qtyNote,
        createdBy: payload.userId || null
    });
}

/** Log manual restock for products without variations. */
/** Log manual restock from Raw Materials tab. */
async function logRestockRawMaterialMovement(pool, payload) {
    const rawMaterialId = parseInt(payload.rawMaterialId, 10);
    const quantity = parseInt(payload.quantity, 10);
    if (!rawMaterialId || !quantity || quantity <= 0) return;

    const materialName = payload.materialName ? String(payload.materialName).trim() : '';
    const unit = payload.unit ? String(payload.unit).trim() : '';
    const noteBase = materialName
        ? ('Restock raw material: ' + materialName + (unit ? ' (' + unit + ')' : ''))
        : ('Restock raw material #' + rawMaterialId);

    await insertStockMovement(pool, {
        rawMaterialId,
        movementType: 'restock_raw_material',
        fromStatus: null,
        toStatus: 'available',
        quantity,
        notes: payload.notes || (noteBase + ' (+' + quantity + ')'),
        createdBy: payload.userId || null
    });
}

async function logRestockProductMovement(pool, payload) {
    const inventoryProductId = parseInt(payload.inventoryProductId, 10);
    const quantity = parseInt(payload.quantity, 10);
    if (!inventoryProductId || !quantity || quantity <= 0) return;

    await insertStockMovement(pool, {
        inventoryProductId,
        variationId: null,
        movementType: 'restock_product',
        fromStatus: null,
        toStatus: 'available',
        quantity,
        notes: payload.notes || ('Restock product (+' + quantity + ')'),
        createdBy: payload.userId || null
    });
}

async function resolveInventoryVariationForReturnPool(pool, productId, variationId) {
    const invResult = await pool.request()
        .input('productId', sql.Int, productId)
        .query(`
            SELECT TOP 1 InventoryProductID
            FROM InventoryProducts
            WHERE ProductID = @productId AND IsActive = 1
            ORDER BY InventoryProductID DESC
        `);
    if (!invResult.recordset.length) return null;
    const inventoryProductId = invResult.recordset[0].InventoryProductID;

    if (variationId) {
        const byId = await pool.request()
            .input('inventoryProductId', sql.Int, inventoryProductId)
            .input('variationId', sql.Int, variationId)
            .query(`
                SELECT TOP 1 VariationID, InventoryProductID
                FROM InventoryProductVariations
                WHERE InventoryProductID = @inventoryProductId AND VariationID = @variationId AND IsActive = 1
            `);
        if (byId.recordset.length) return byId.recordset[0];

        const byPv = await pool.request()
            .input('inventoryProductId', sql.Int, inventoryProductId)
            .input('variationId', sql.Int, variationId)
            .input('productId', sql.Int, productId)
            .query(`
                SELECT TOP 1 ipv.VariationID, ipv.InventoryProductID
                FROM InventoryProductVariations ipv
                INNER JOIN ProductVariations pv ON pv.VariationID = ipv.VariationID AND pv.ProductID = @productId
                WHERE ipv.InventoryProductID = @inventoryProductId AND pv.VariationID = @variationId AND ipv.IsActive = 1
            `);
        if (byPv.recordset.length) return byPv.recordset[0];
    }

    const singleVar = await pool.request()
        .input('inventoryProductId', sql.Int, inventoryProductId)
        .query(`
            SELECT TOP 1 VariationID, InventoryProductID
            FROM InventoryProductVariations
            WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
            ORDER BY VariationID
        `);
    if (singleVar.recordset.length === 1) return singleVar.recordset[0];
    return { VariationID: null, InventoryProductID: inventoryProductId };
}

/** Log when returned order items are marked received (Awaiting Inspection). */
async function logReturnOrderReceivedMovements(pool, payload) {
    const orderId = parseInt(payload.orderId, 10);
    if (!orderId) return;

    let items = [];
    try {
        const raw = payload.returnItemsJson;
        items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return;
    }
    if (!Array.isArray(items)) return;

    for (const item of items) {
        const catalogProductId = parseInt(item.productId || item.ProductID, 10);
        const catalogVariationId = item.variationId != null && item.variationId !== ''
            ? parseInt(item.variationId || item.VariationID, 10)
            : null;
        const qty = parseInt(item.quantity || item.Quantity, 10) || 0;
        if (!catalogProductId || qty <= 0) continue;

        const resolved = await resolveInventoryVariationForReturnPool(pool, catalogProductId, catalogVariationId);
        if (!resolved || !resolved.InventoryProductID) continue;

        await insertStockMovement(pool, {
            inventoryProductId: resolved.InventoryProductID,
            variationId: resolved.VariationID || null,
            movementType: 'return_received',
            fromStatus: 'customer',
            toStatus: 'pending_inspection',
            quantity: qty,
            notes: 'Return order #' + orderId + ' received',
            createdBy: payload.userId || null
        });
    }
}

function bindMovementFilters(request, options) {
    let where = ' WHERE (m.IsArchived = 0 OR m.IsArchived IS NULL)';
    const productId = parseInt(options.inventoryProductId, 10);
    const variationId = parseInt(options.variationId, 10);
    const rawMaterialId = parseInt(options.rawMaterialId, 10);
    if (options.scope === 'products') {
        where += ' AND m.RawMaterialID IS NULL';
    } else if (options.scope === 'rawMaterials') {
        where += ' AND m.RawMaterialID IS NOT NULL';
    }
    if (productId) {
        request.input('productId', sql.Int, productId);
        where += ' AND m.InventoryProductID = @productId';
    }
    if (variationId) {
        request.input('variationId', sql.Int, variationId);
        where += ' AND m.VariationID = @variationId';
    }
    if (rawMaterialId) {
        request.input('rawMaterialId', sql.Int, rawMaterialId);
        where += ' AND m.RawMaterialID = @rawMaterialId';
    }
    return where;
}

async function fetchInventoryStockMovements(pool, options = {}) {
    await ensureInventoryStockMovementSchema(pool);
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 10), 200);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const countReq = pool.request();
    const where = bindMovementFilters(countReq, options);

    const countResult = await countReq.query(`
        SELECT COUNT(*) AS total FROM InventoryStockMovements m ${where}
    `);
    const totalCount = parseInt(countResult.recordset[0]?.total, 10) || 0;

    const rowsReq = pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit);
    const rowsWhere = bindMovementFilters(rowsReq, options);
    const rowsResult = await rowsReq.query(`
            SELECT
                m.MovementID,
                m.InventoryProductID,
                m.VariationID,
                m.MovementType,
                m.FromStatus,
                m.ToStatus,
                m.Quantity,
                m.Notes,
                m.CreatedAt,
                ip.Name AS ProductName,
                ipv.VariationName,
                ipv.SKU AS VariationSKU
            FROM InventoryStockMovements m
            LEFT JOIN InventoryProducts ip ON ip.InventoryProductID = m.InventoryProductID
            LEFT JOIN InventoryProductVariations ipv ON ipv.VariationID = m.VariationID
            ${rowsWhere}
            ORDER BY m.CreatedAt DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

    const movements = (rowsResult.recordset || []).map((row) => ({
        movementId: row.MovementID,
        inventoryProductId: row.InventoryProductID,
        variationId: row.VariationID,
        movementType: row.MovementType,
        movementLabel: movementLabel(row.MovementType),
        fromStatus: row.FromStatus,
        toStatus: row.ToStatus,
        quantity: row.Quantity,
        notes: row.Notes,
        createdAt: row.CreatedAt,
        productName: row.ProductName,
        variationName: row.VariationName,
        variationSku: row.VariationSKU
    }));

    return {
        movements,
        pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / limit))
        }
    };
}

function mapMovementRow(row) {
    return {
        movementId: row.MovementID,
        inventoryProductId: row.InventoryProductID,
        variationId: row.VariationID,
        rawMaterialId: row.RawMaterialID,
        movementType: row.MovementType,
        movementLabel: movementLabel(row.MovementType),
        fromStatus: row.FromStatus,
        toStatus: row.ToStatus,
        quantity: row.Quantity,
        notes: row.Notes,
        createdAt: row.CreatedAt,
        productName: row.ProductName,
        variationName: row.VariationName,
        variationSku: row.VariationSKU,
        materialName: row.MaterialName,
        materialUnit: row.MaterialUnit
    };
}

/** Paginate by product; each product expands to variations, then movement lines. */
async function fetchInventoryStockMovementsGrouped(pool, options = {}) {
    await ensureInventoryStockMovementSchema(pool);
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 5), 100);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const countReq = pool.request();
    const where = bindMovementFilters(countReq, { ...options, scope: 'products' });
    const countResult = await countReq.query(`
        SELECT COUNT(DISTINCT m.InventoryProductID) AS total
        FROM InventoryStockMovements m
        ${where}
        AND m.InventoryProductID IS NOT NULL
    `);
    const totalProducts = parseInt(countResult.recordset[0]?.total, 10) || 0;

    const pageReq = pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit);
    const pageWhere = bindMovementFilters(pageReq, { ...options, scope: 'products' });
    const pageResult = await pageReq.query(`
        SELECT pp.InventoryProductID
        FROM (
            SELECT m.InventoryProductID, MAX(m.CreatedAt) AS LastAt
            FROM InventoryStockMovements m
            ${pageWhere}
            AND m.InventoryProductID IS NOT NULL
            GROUP BY m.InventoryProductID
        ) pp
        ORDER BY pp.LastAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const productIds = (pageResult.recordset || [])
        .map((r) => parseInt(r.InventoryProductID, 10))
        .filter(Boolean);

    if (!productIds.length) {
        return {
            products: [],
            pagination: {
                page,
                limit,
                totalCount: totalProducts,
                totalMovementCount: 0,
                totalPages: Math.max(1, Math.ceil(totalProducts / limit))
            }
        };
    }

    const rowsReq = pool.request();
    productIds.forEach((id, idx) => rowsReq.input(`pid${idx}`, sql.Int, id));
    const idPlaceholders = productIds.map((_, idx) => `@pid${idx}`).join(', ');
    const rowsWhere = bindMovementFilters(rowsReq, { ...options, scope: 'products' });
    const rowsResult = await rowsReq.query(`
        SELECT
            m.MovementID,
            m.InventoryProductID,
            m.VariationID,
            m.RawMaterialID,
            m.MovementType,
            m.FromStatus,
            m.ToStatus,
            m.Quantity,
            m.Notes,
            m.CreatedAt,
            ip.Name AS ProductName,
            ipv.VariationName,
            ipv.SKU AS VariationSKU
        FROM InventoryStockMovements m
        LEFT JOIN InventoryProducts ip ON ip.InventoryProductID = m.InventoryProductID
        LEFT JOIN InventoryProductVariations ipv ON ipv.VariationID = m.VariationID
        ${rowsWhere}
        AND m.InventoryProductID IN (${idPlaceholders})
        ORDER BY m.InventoryProductID, m.VariationID, m.CreatedAt DESC
    `);

    const movements = (rowsResult.recordset || []).map(mapMovementRow);
    const productMap = new Map();

    for (const mv of movements) {
        const pid = mv.inventoryProductId || 0;
        if (!productMap.has(pid)) {
            productMap.set(pid, {
                inventoryProductId: pid,
                productName: mv.productName || ('Product #' + pid),
                movementCount: 0,
                lastMovementAt: null,
                variations: new Map()
            });
        }
        const product = productMap.get(pid);
        product.movementCount += 1;
        if (!product.lastMovementAt || new Date(mv.createdAt) > new Date(product.lastMovementAt)) {
            product.lastMovementAt = mv.createdAt;
        }

        const vid = mv.variationId != null ? mv.variationId : 0;
        const varKey = String(vid);
        if (!product.variations.has(varKey)) {
            product.variations.set(varKey, {
                variationId: mv.variationId,
                variationName: mv.variationName || (vid ? 'Variation #' + vid : 'No variation'),
                variationSku: mv.variationSku || null,
                movementCount: 0,
                lastMovementAt: null,
                movements: []
            });
        }
        const variation = product.variations.get(varKey);
        variation.movementCount += 1;
        variation.movements.push(mv);
        if (!variation.lastMovementAt || new Date(mv.createdAt) > new Date(variation.lastMovementAt)) {
            variation.lastMovementAt = mv.createdAt;
        }
    }

    const products = productIds
        .map((pid) => productMap.get(pid))
        .filter(Boolean)
        .map((p) => ({
            inventoryProductId: p.inventoryProductId,
            productName: p.productName,
            movementCount: p.movementCount,
            lastMovementAt: p.lastMovementAt,
            variations: Array.from(p.variations.values()).sort((a, b) => {
                const ta = a.lastMovementAt ? new Date(a.lastMovementAt).getTime() : 0;
                const tb = b.lastMovementAt ? new Date(b.lastMovementAt).getTime() : 0;
                return tb - ta;
            })
        }));

    const totalMovementCount = movements.length;

    return {
        products,
        pagination: {
            page,
            limit,
            totalCount: totalProducts,
            totalMovementCount,
            totalPages: Math.max(1, Math.ceil(totalProducts / limit))
        }
    };
}

/** Paginate by raw material for restock history. */
async function fetchRawMaterialStockMovementsGrouped(pool, options = {}) {
    await ensureInventoryStockMovementSchema(pool);
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 5), 200);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const countReq = pool.request();
    const where = bindMovementFilters(countReq, { ...options, scope: 'rawMaterials' });
    const countResult = await countReq.query(`
        SELECT COUNT(DISTINCT m.RawMaterialID) AS total
        FROM InventoryStockMovements m
        ${where}
    `);
    const totalMaterials = parseInt(countResult.recordset[0]?.total, 10) || 0;

    const pageReq = pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit);
    const pageWhere = bindMovementFilters(pageReq, { ...options, scope: 'rawMaterials' });
    const pageResult = await pageReq.query(`
        SELECT pp.RawMaterialID
        FROM (
            SELECT m.RawMaterialID, MAX(m.CreatedAt) AS LastAt
            FROM InventoryStockMovements m
            ${pageWhere}
            GROUP BY m.RawMaterialID
        ) pp
        ORDER BY pp.LastAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const materialIds = (pageResult.recordset || [])
        .map((r) => parseInt(r.RawMaterialID, 10))
        .filter(Boolean);

    if (!materialIds.length) {
        return {
            materials: [],
            pagination: {
                page,
                limit,
                totalCount: totalMaterials,
                totalMovementCount: 0,
                totalPages: Math.max(1, Math.ceil(totalMaterials / limit))
            }
        };
    }

    const rowsReq = pool.request();
    materialIds.forEach((id, idx) => rowsReq.input(`rmid${idx}`, sql.Int, id));
    const idPlaceholders = materialIds.map((_, idx) => `@rmid${idx}`).join(', ');
    const rowsWhere = bindMovementFilters(rowsReq, { ...options, scope: 'rawMaterials' });
    const rowsResult = await rowsReq.query(`
        SELECT
            m.MovementID,
            m.InventoryProductID,
            m.VariationID,
            m.RawMaterialID,
            m.MovementType,
            m.FromStatus,
            m.ToStatus,
            m.Quantity,
            m.Notes,
            m.CreatedAt,
            rm.Name AS MaterialName,
            rm.Unit AS MaterialUnit
        FROM InventoryStockMovements m
        LEFT JOIN RawMaterials rm ON rm.MaterialID = m.RawMaterialID
        ${rowsWhere}
        AND m.RawMaterialID IN (${idPlaceholders})
        ORDER BY m.RawMaterialID, m.CreatedAt DESC
    `);

    const movements = (rowsResult.recordset || []).map(mapMovementRow);
    const materialMap = new Map();

    for (const mv of movements) {
        const mid = mv.rawMaterialId || 0;
        if (!materialMap.has(mid)) {
            materialMap.set(mid, {
                rawMaterialId: mid,
                materialName: mv.materialName || ('Material #' + mid),
                materialUnit: mv.materialUnit || null,
                movementCount: 0,
                lastMovementAt: null,
                movements: []
            });
        }
        const material = materialMap.get(mid);
        material.movementCount += 1;
        material.movements.push(mv);
        if (!material.lastMovementAt || new Date(mv.createdAt) > new Date(material.lastMovementAt)) {
            material.lastMovementAt = mv.createdAt;
        }
    }

    const materials = materialIds
        .map((mid) => materialMap.get(mid))
        .filter(Boolean);

    return {
        materials,
        pagination: {
            page,
            limit,
            totalCount: totalMaterials,
            totalMovementCount: movements.length,
            totalPages: Math.max(1, Math.ceil(totalMaterials / limit))
        }
    };
}

async function archiveStockMovementsWhere(pool, extraWhere, inputs = {}) {
    await ensureInventoryStockMovementSchema(pool);
    const req = pool.request();
    Object.keys(inputs).forEach((key) => {
        req.input(key, inputs[key].type, inputs[key].value);
    });
    const result = await req.query(`
        UPDATE InventoryStockMovements
        SET IsArchived = 1
        WHERE (IsArchived = 0 OR IsArchived IS NULL)
        ${extraWhere}
    `);
    return { ok: true, count: result.rowsAffected[0] || 0 };
}

async function archiveAllProductInventoryMovements(pool) {
    return archiveStockMovementsWhere(pool, ' AND RawMaterialID IS NULL');
}

async function archiveAllRawMaterialMovements(pool) {
    return archiveStockMovementsWhere(pool, ' AND RawMaterialID IS NOT NULL');
}

async function archiveStockMovementsForProduct(pool, inventoryProductId) {
    const id = parseInt(inventoryProductId, 10);
    if (!id) return { ok: false, message: 'Invalid product ID.', count: 0 };
    const result = await archiveStockMovementsWhere(
        pool,
        ' AND InventoryProductID = @inventoryProductId AND RawMaterialID IS NULL',
        { inventoryProductId: { type: sql.Int, value: id } }
    );
    return { ...result, message: result.count ? 'Archived ' + result.count + ' movement(s).' : 'No movements to archive.' };
}

async function archiveStockMovementsForRawMaterial(pool, rawMaterialId) {
    const id = parseInt(rawMaterialId, 10);
    if (!id) return { ok: false, message: 'Invalid material ID.', count: 0 };
    const result = await archiveStockMovementsWhere(
        pool,
        ' AND RawMaterialID = @rawMaterialId',
        { rawMaterialId: { type: sql.Int, value: id } }
    );
    return { ...result, message: result.count ? 'Archived ' + result.count + ' movement(s).' : 'No movements to archive.' };
}

async function archiveStockMovement(pool, movementId) {
    await ensureInventoryStockMovementSchema(pool);
    const id = parseInt(movementId, 10);
    if (!id) return { ok: false, message: 'Invalid movement ID.' };

    const result = await pool.request()
        .input('movementId', sql.Int, id)
        .query(`
            UPDATE InventoryStockMovements
            SET IsArchived = 1
            WHERE MovementID = @movementId AND (IsArchived = 0 OR IsArchived IS NULL)
        `);

    if (!result.rowsAffected[0]) {
        return { ok: false, message: 'Movement not found or already archived.' };
    }
    return { ok: true };
}

async function reactivateStockMovement(pool, movementId) {
    await ensureInventoryStockMovementSchema(pool);
    const id = parseInt(movementId, 10);
    if (!id) return { ok: false, message: 'Invalid movement ID.' };

    const result = await pool.request()
        .input('movementId', sql.Int, id)
        .query(`
            UPDATE InventoryStockMovements
            SET IsArchived = 0
            WHERE MovementID = @movementId AND IsArchived = 1
        `);

    if (!result.rowsAffected[0]) {
        return { ok: false, message: 'Archived movement not found.' };
    }
    return { ok: true };
}

async function fetchArchivedStockMovements(pool, limit = 200) {
    await ensureInventoryStockMovementSchema(pool);
    const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 10), 500);
    const result = await pool.request()
        .input('limit', sql.Int, cap)
        .query(`
            SELECT TOP (@limit)
                m.MovementID,
                m.InventoryProductID,
                m.VariationID,
                m.RawMaterialID,
                m.MovementType,
                m.FromStatus,
                m.ToStatus,
                m.Quantity,
                m.Notes,
                m.CreatedAt,
                ip.Name AS ProductName,
                ipv.VariationName,
                ipv.SKU AS VariationSKU,
                rm.Name AS MaterialName,
                rm.Unit AS MaterialUnit
            FROM InventoryStockMovements m
            LEFT JOIN InventoryProducts ip ON ip.InventoryProductID = m.InventoryProductID
            LEFT JOIN InventoryProductVariations ipv ON ipv.VariationID = m.VariationID
            LEFT JOIN RawMaterials rm ON rm.MaterialID = m.RawMaterialID
            WHERE m.IsArchived = 1
            ORDER BY m.CreatedAt DESC
        `);

    return (result.recordset || []).map((row) => ({
        movementId: row.MovementID,
        inventoryProductId: row.InventoryProductID,
        variationId: row.VariationID,
        rawMaterialId: row.RawMaterialID,
        movementType: row.MovementType,
        movementLabel: movementLabel(row.MovementType),
        fromStatus: row.FromStatus,
        toStatus: row.ToStatus,
        quantity: row.Quantity,
        notes: row.Notes,
        createdAt: row.CreatedAt,
        productName: row.ProductName,
        variationName: row.VariationName,
        variationSku: row.VariationSKU,
        materialName: row.MaterialName,
        materialUnit: row.MaterialUnit,
        entityLabel: row.RawMaterialID
            ? (row.MaterialName || ('Raw material #' + row.RawMaterialID))
            : row.VariationID
                ? ((row.ProductName || 'Product') + ' — ' + (row.VariationName || 'Variation'))
                : (row.ProductName || ('Product #' + (row.InventoryProductID || '—')))
    }));
}

module.exports = {
    ensureInventoryStockMovementSchema,
    insertStockMovement,
    logInventoryStockMovementFromVariationUpdate,
    fetchInventoryStockMovements,
    fetchInventoryStockMovementsGrouped,
    fetchRawMaterialStockMovementsGrouped,
    fetchArchivedStockMovements,
    archiveStockMovement,
    archiveStockMovementsForProduct,
    archiveStockMovementsForRawMaterial,
    archiveAllProductInventoryMovements,
    archiveAllRawMaterialMovements,
    reactivateStockMovement,
    logRestockVariationMovement,
    logRestockProductMovement,
    logRestockRawMaterialMovement,
    logReturnOrderReceivedMovements,
    movementLabel,
    MOVEMENT_LABELS
};
