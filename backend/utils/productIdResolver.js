'use strict';

const sql = require('mssql');

/** Resolve ProductID, PublicId, Slug, or SKU to catalog ProductID. */
async function resolveProductId(pool, identifier) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    const isNumeric = /^\d+$/.test(value);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const result = await pool.request()
        .input('identifier', sql.NVarChar, value)
        .input('isNumeric', sql.Bit, isNumeric ? 1 : 0)
        .input('isUUID', sql.Bit, isUUID ? 1 : 0)
        .query(`
            SELECT TOP 1 ProductID
            FROM Products WITH (NOLOCK)
            WHERE IsActive = 1
              AND (
                    (@isNumeric = 1 AND ProductID = TRY_CAST(@identifier AS INT))
                 OR (@isUUID = 1 AND PublicId = TRY_CAST(@identifier AS UNIQUEIDENTIFIER))
                 OR Slug = @identifier
                 OR SKU = @identifier
              )
            ORDER BY DateAdded DESC, ProductID DESC
        `);

    if (!result.recordset.length) return null;
    return result.recordset[0].ProductID || null;
}

module.exports = { resolveProductId };
