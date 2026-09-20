'use strict';

/**
 * Shared dependency bundle for employee order workflow routes.
 */
function buildEmployeeOrderRouteContext(deps) {
    return {
        pool: deps.pool,
        sql: deps.sql,
        isAuthenticated: deps.isAuthenticated,
        logActivity: deps.logActivity,
        decrementStockFromInventory: deps.decrementStockFromInventory,
        refundGatewayForPendingCancel: deps.refundGatewayForPendingCancel,
        refundGatewayForAdminFulfilmentStageCancel: deps.refundGatewayForAdminFulfilmentStageCancel,
        sendgridHelper: deps.sendgridHelper
    };
}

module.exports = { buildEmployeeOrderRouteContext };
