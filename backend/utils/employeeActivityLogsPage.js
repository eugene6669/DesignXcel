'use strict';

const { getRoleViewPath } = require('./employeeRoleViewSync');

async function fetchActivityLogsFilterOptions(pool) {
    const actionsResult = await pool.request()
        .query(`SELECT DISTINCT Action FROM ActivityLogs WHERE Action IS NOT NULL ORDER BY Action`);

    const tablesResult = await pool.request()
        .query(`SELECT DISTINCT TableAffected FROM ActivityLogs WHERE TableAffected IS NOT NULL ORDER BY TableAffected`);

    const rolesResult = await pool.request()
        .query(`
            SELECT DISTINCT r.RoleName
            FROM ActivityLogs al
            JOIN Users u ON al.UserID = u.UserID
            JOIN Roles r ON u.RoleID = r.RoleID
            WHERE r.RoleName IS NOT NULL
            ORDER BY r.RoleName
        `);

    return {
        uniqueActions: actionsResult.recordset.map((r) => r.Action),
        uniqueTables: tablesResult.recordset.map((r) => r.TableAffected),
        uniqueRoles: rolesResult.recordset.map((r) => r.RoleName)
    };
}

function makeRenderRoleActivityLogsPage(pool) {
    return async function renderRoleActivityLogsPage(req, res, role) {
        const viewPath = getRoleViewPath(role, 'AdminLogs');
        const emptyFilters = { uniqueActions: [], uniqueTables: [], uniqueRoles: [] };

        try {
            await pool.connect();
            const filters = await fetchActivityLogsFilterOptions(pool);
            res.render(viewPath, {
                user: req.session.user,
                ...filters
            });
        } catch (err) {
            console.error(`Error rendering ${role.roleName} activity logs page:`, err);
            res.render(viewPath, {
                user: req.session.user,
                ...emptyFilters
            });
        }
    };
}

module.exports = {
    fetchActivityLogsFilterOptions,
    makeRenderRoleActivityLogsPage
};
