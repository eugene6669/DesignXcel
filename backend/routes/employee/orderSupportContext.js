'use strict';

/**
 * Page/API routes for Order Support (dashboard, materials, orders list, etc.).
 */
function buildOrderSupportPageRouteContext(deps) {
    return {
        pool: deps.pool,
        sql: deps.sql,
        isAuthenticated: deps.isAuthenticated,
        checkPermission: deps.checkPermission,
        EMPLOYEE_SYNC_ROLES: deps.EMPLOYEE_SYNC_ROLES,
        makeRenderRoleActivityLogsPage: deps.makeRenderRoleActivityLogsPage,
        sendActivityLogsData: deps.sendActivityLogsData,
        buildInventoryAlertsPayload: deps.buildInventoryAlertsPayload,
        USER_PERMISSION_LEGACY_KEYS: deps.USER_PERMISSION_LEGACY_KEYS
    };
}

module.exports = { buildOrderSupportPageRouteContext };
