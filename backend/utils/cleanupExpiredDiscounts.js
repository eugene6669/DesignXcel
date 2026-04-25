const sql = require('mssql');

/**
 * Cleanup expired discounts from ProductDiscounts table
 * Deletes all discounts where EndDate has passed
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @returns {Promise<number>} Number of deleted discounts
 */
async function cleanupExpiredDiscounts(pool) {
    try {
        if (!pool || !pool.connected) {
            console.log('[Cleanup Discounts] Database pool not connected, skipping cleanup.');
            return 0;
        }

        const result = await pool.request().query(`
            DELETE FROM ProductDiscounts
            WHERE EndDate < GETDATE()
        `);

        const deletedCount = result.rowsAffected[0] || 0;
        
        if (deletedCount > 0) {
            console.log(`[Cleanup Discounts] Deleted ${deletedCount} expired discount(s).`);
        }
        
        return deletedCount;
    } catch (error) {
        console.error('[Cleanup Discounts] Error cleaning up expired discounts:', error);
        return 0;
    }
}

/**
 * Cleanup expired discounts and return the count
 * This is a wrapper that handles connection checking
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @returns {Promise<number>} Number of deleted discounts
 */
async function cleanupExpiredDiscountsSafe(pool) {
    try {
        // Ensure connection is established
        if (!pool || !pool.connected) {
            await pool.connect();
        }
        
        return await cleanupExpiredDiscounts(pool);
    } catch (error) {
        console.error('[Cleanup Discounts] Error in safe cleanup:', error);
        return 0;
    }
}

module.exports = {
    cleanupExpiredDiscounts,
    cleanupExpiredDiscountsSafe
};

