'use strict';

const { serializeActivityLogChanges } = require('../utils/activityLogHelpers');

/**
 * Helper function to capture changes for UPDATE operations
 */
function captureChanges(oldData, newData, fieldsToTrack = []) {
    if (!oldData || !newData) return null;

    const changes = [];
    const fields = fieldsToTrack.length > 0 ? fieldsToTrack : Object.keys(newData);

    for (const field of fields) {
        if (oldData[field] !== newData[field]) {
            changes.push(`${field}: "${oldData[field]}" → "${newData[field]}"`);
        }
    }

    return changes.length > 0 ? changes.join(', ') : null;
}

function createActivityLogger(pool, sql) {
    /**
     * Log user activity to ActivityLogs table
     */
    async function logActivity(userId, action, tableAffected, recordId, description, changes = null) {
        try {
            await pool.connect();

            const recordIdValue = recordId !== undefined && recordId !== null ? String(recordId) : null;
            const changesValue = serializeActivityLogChanges(changes);

            await pool.request()
                .input('userId', sql.Int, userId)
                .input('action', sql.NVarChar, action)
                .input('tableAffected', sql.NVarChar, tableAffected)
                .input('recordId', sql.NVarChar, recordIdValue)
                .input('description', sql.NVarChar, description)
                .input('changes', sql.NVarChar, changesValue)
                .query(`
                    INSERT INTO ActivityLogs (UserID, Action, TableAffected, RecordID, Description, Changes, Timestamp)
                    VALUES (@userId, @action, @tableAffected, @recordId, @description, @changes, GETDATE())
                `);
        } catch (err) {
            console.error('Error logging activity:', err);
            // Don't throw error - logging failure shouldn't break the main operation
        }
    }

    return { logActivity };
}

module.exports = {
    captureChanges,
    createActivityLogger
};
