const sql = require('mssql');

/**
 * Find an existing order for a Stripe/PayMongo checkout session (idempotent checkout).
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} sessionId
 * @param {{ lock?: boolean }} [options] - UPDLOCK when true (use inside transactions)
 * @returns {Promise<{ OrderID: number, ReferenceNumber?: string, Status?: string }|null>}
 */
async function findExistingOrderByCheckoutSessionId(pool, sessionId, options = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;

    const lockClause = options.lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await pool
        .request()
        .input('stripeSessionId', sql.NVarChar, sid)
        .query(`
            SELECT TOP 1 OrderID, ReferenceNumber, Status
            FROM Orders ${lockClause}
            WHERE StripeSessionID = @stripeSessionId
            ORDER BY OrderID ASC
        `);

    return result.recordset[0] || null;
}

/**
 * Drop duplicate rows that share the same checkout session (keeps earliest OrderID).
 * @param {Array<Record<string, unknown>>} orders
 */
function dedupeOrdersByCheckoutSession(orders) {
    if (!Array.isArray(orders) || orders.length === 0) return [];

    const sessionMap = new Map();
    const noSession = [];

    for (const order of orders) {
        const sid = String(order.StripeSessionID || '').trim();
        if (!sid) {
            noSession.push(order);
            continue;
        }
        const existing = sessionMap.get(sid);
        if (!existing || Number(order.OrderID) < Number(existing.OrderID)) {
            sessionMap.set(sid, order);
        }
    }

    const merged = [...sessionMap.values(), ...noSession];
    merged.sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate));
    return merged;
}

module.exports = {
    findExistingOrderByCheckoutSessionId,
    dedupeOrdersByCheckoutSession
};
