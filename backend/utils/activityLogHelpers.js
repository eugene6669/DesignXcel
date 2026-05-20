'use strict';

const sql = require('mssql');

function serializeActivityLogChanges(changes) {
    if (changes === null || changes === undefined) return null;
    if (typeof changes === 'string') return changes;
    try {
        return JSON.stringify(changes);
    } catch (_e) {
        return String(changes);
    }
}

/**
 * Fetch activity logs (shared by Admin and role-specific dashboard log APIs).
 */
async function fetchActivityLogs(pool, queryParams = {}) {
    const {
        action,
        tableAffected,
        userRole,
        dateFrom,
        dateTo,
        search,
        limit = 1000,
        offset = 0
    } = queryParams;

    let query = `
        SELECT 
            al.LogID,
            al.UserID,
            u.FullName,
            r.RoleName,
            al.Action,
            al.TableAffected,
            al.RecordID,
            al.Description,
            al.Changes,
            al.Timestamp
        FROM ActivityLogs al
        JOIN Users u ON al.UserID = u.UserID
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE 1=1
    `;

    const request = pool.request();

    if (action) {
        query += ` AND al.Action = @action`;
        request.input('action', sql.NVarChar, action);
    }
    if (tableAffected) {
        query += ` AND al.TableAffected = @tableAffected`;
        request.input('tableAffected', sql.NVarChar, tableAffected);
    }
    if (userRole) {
        query += ` AND r.RoleName = @userRole`;
        request.input('userRole', sql.NVarChar, userRole);
    }
    if (dateFrom) {
        query += ` AND al.Timestamp >= @dateFrom`;
        request.input('dateFrom', sql.DateTime, new Date(dateFrom));
    }
    if (dateTo) {
        query += ` AND al.Timestamp <= @dateTo`;
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        request.input('dateTo', sql.DateTime, end);
    }
    if (search) {
        query += ` AND (
            al.Description LIKE @search
            OR al.TableAffected LIKE @search
            OR al.RecordID LIKE @search
            OR u.FullName LIKE @search
            OR r.RoleName LIKE @search
        )`;
        request.input('search', sql.NVarChar, `%${search}%`);
    }

    query += ` ORDER BY al.Timestamp DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    request.input('offset', sql.Int, Math.max(parseInt(offset, 10) || 0, 0));
    request.input('limit', sql.Int, Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 5000));

    const result = await request.query(query);
    return result.recordset || [];
}

module.exports = {
    serializeActivityLogChanges,
    fetchActivityLogs
};
