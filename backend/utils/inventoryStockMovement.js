'use strict';

const sql = require('mssql');

let schemaReady = false;

const MOVEMENT_LABELS = {
    returned_to_damaged: 'Returned → Damaged',
    damaged_to_repaired: 'Damaged → Repaired',
    repaired_to_available: 'Repaired → Available',
    restock_available: 'Restock → Available',
    restock_variation: 'Restock variation',
    restock_product: 'Restock product',
    status_adjustment: 'Status adjustment'
};

async function ensureInventoryStockMovementSchema(pool) {
    if (schemaReady) return;
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
    `);
    schemaReady = true;
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
        .input('movementType', sql.NVarChar(64), row.movementType)
        .input('fromStatus', sql.NVarChar(32), row.fromStatus || null)
        .input('toStatus', sql.NVarChar(32), row.toStatus || null)
        .input('quantity', sql.Int, qty)
        .input('notes', sql.NVarChar(500), row.notes || null)
        .input('createdBy', sql.Int, row.createdBy || null)
        .query(`
            INSERT INTO InventoryStockMovements (
                InventoryProductID, VariationID, MovementType, FromStatus, ToStatus, Quantity, Notes, CreatedBy
            )
            VALUES (
                @inventoryProductId, @variationId, @movementType, @fromStatus, @toStatus, @quantity, @notes, @createdBy
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

function bindMovementFilters(request, options) {
    let where = ' WHERE 1=1';
    const productId = parseInt(options.inventoryProductId, 10);
    const variationId = parseInt(options.variationId, 10);
    if (productId) {
        request.input('productId', sql.Int, productId);
        where += ' AND m.InventoryProductID = @productId';
    }
    if (variationId) {
        request.input('variationId', sql.Int, variationId);
        where += ' AND m.VariationID = @variationId';
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
    };
}

/** Paginate by product; each product expands to variations, then movement lines. */
async function fetchInventoryStockMovementsGrouped(pool, options = {}) {
    await ensureInventoryStockMovementSchema(pool);
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 5), 100);
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const countReq = pool.request();
    const where = bindMovementFilters(countReq, options);
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
    const pageWhere = bindMovementFilters(pageReq, options);
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

module.exports = {
    ensureInventoryStockMovementSchema,
    insertStockMovement,
    logInventoryStockMovementFromVariationUpdate,
    fetchInventoryStockMovements,
    fetchInventoryStockMovementsGrouped,
    logRestockVariationMovement,
    logRestockProductMovement,
    movementLabel,
    MOVEMENT_LABELS
};
