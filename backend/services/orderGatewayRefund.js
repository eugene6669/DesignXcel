'use strict';

const { processGatewayRefund } = require('../utils/processGatewayRefund');

/**
 * Stripe/PayMongo full refund for a Pending order; throws if gateway refund was required and failed.
 */
async function refundGatewayForPendingCancel(pool, sql, orderId, getStripe, logPrefix) {
    const row = await pool
        .request()
        .input('orderId', sql.Int, orderId)
        .query(`
            SELECT OrderID, Status, StripeSessionID, TransactionID, PaymentMethod, TotalAmount, PaymentStatus
            FROM Orders WHERE OrderID = @orderId
        `);
    if (!row.recordset.length) {
        throw new Error('Order not found');
    }
    const o = row.recordset[0];
    if (o.Status !== 'Pending') {
        throw new Error('Order is not pending');
    }
    const refundRes = await processGatewayRefund(o, getStripe, {
        refundAmountPhp: parseFloat(o.TotalAmount || 0),
        logPrefix,
        context: 'employee_pending_cancel',
        refundInitiator: 'admin'
    });
    if (
        refundRes.gatewayAttempted &&
        refundRes.refundError &&
        !refundRes.stripeRefundId &&
        !refundRes.paymongoRefundId &&
        !refundRes.alreadyFullyRefunded
    ) {
        throw new Error(refundRes.refundError);
    }
}

/**
 * Same gateway rules as pending cancel: Stripe/PayMongo full refund for paid orders; COD skipped.
 * Used when admin cancels from Processing, Shipping, or Delivery.
 */
async function refundGatewayForAdminFulfilmentStageCancel(
    pool,
    sql,
    orderId,
    expectedStatus,
    getStripe,
    logPrefix,
    contextSlug
) {
    const row = await pool
        .request()
        .input('orderId', sql.Int, orderId)
        .query(`
            SELECT OrderID, Status, StripeSessionID, TransactionID, PaymentMethod, TotalAmount, PaymentStatus
            FROM Orders WHERE OrderID = @orderId
        `);
    if (!row.recordset.length) {
        throw new Error('Order not found');
    }
    const o = row.recordset[0];
    if (o.Status !== expectedStatus) {
        throw new Error(`Order is not in ${expectedStatus} status`);
    }
    const refundRes = await processGatewayRefund(o, getStripe, {
        refundAmountPhp: parseFloat(o.TotalAmount || 0),
        logPrefix,
        context: `admin_${contextSlug}_cancel`,
        refundInitiator: 'admin'
    });
    if (
        refundRes.gatewayAttempted &&
        refundRes.refundError &&
        !refundRes.stripeRefundId &&
        !refundRes.paymongoRefundId &&
        !refundRes.alreadyFullyRefunded
    ) {
        throw new Error(refundRes.refundError);
    }
}

module.exports = {
    refundGatewayForPendingCancel,
    refundGatewayForAdminFulfilmentStageCancel
};
