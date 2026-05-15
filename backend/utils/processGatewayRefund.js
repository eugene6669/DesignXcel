'use strict';

const { isStripeCheckoutSessionId } = require('./orderDisplayHelpers');

/**
 * Refund via Stripe Checkout or PayMongo for a single order row.
 *
 * @param {object} order — at least StripeSessionID, TransactionID, PaymentMethod, TotalAmount; OrderID optional (metadata)
 * @param {function|null} getStripe — same factory passed into routes.js / server.js
 * @param {object} [options]
 * @param {number|null} [options.refundAmountPhp] — PHP amount to refund; capped to captured amount. If null/undefined, refunds full captured amount.
 * @param {string} [options.logPrefix]
 * @param {string} [options.context] — refund metadata / notes
 * @param {'admin'|'customer'} [options.refundInitiator] — controls PayMongo notes and Stripe metadata wording
 * @returns {Promise<{ stripeRefundId: string|null, paymongoRefundId: string|null, refundAmount: number, refundError: string|null, skipped: boolean, gatewayAttempted: boolean, alreadyFullyRefunded: boolean }>}
 */
async function processGatewayRefund(order, getStripe, options = {}) {
    const logPrefix = options.logPrefix || '[GATEWAY-REFUND]';
    const context = options.context || 'gateway_refund';
    const initiator = options.refundInitiator === 'admin' ? 'admin' : 'customer';
    const paymongoReasonNote = initiator === 'admin' ? 'requested_by_admin' : 'requested_by_customer';
    const stripeRefundDescription =
        initiator === 'admin'
            ? 'Successfully refunded due to admin request'
            : 'Successfully refunded due to customer request';

    let stripeRefundId = null;
    let paymongoRefundId = null;
    let refundError = null;
    let refundAmount = 0;
    let alreadyFullyRefunded = false;

    const paymentMethodLower = String(order.PaymentMethod || '').toLowerCase();
    if (paymentMethodLower.includes('cash on delivery') || paymentMethodLower.includes('cod')) {
        return {
            stripeRefundId,
            paymongoRefundId,
            refundAmount,
            refundError,
            skipped: true,
            gatewayAttempted: false,
            alreadyFullyRefunded: false
        };
    }

    let resolvedPaymongoPaymentId = null;
    const txnForPaymongo = String(order.TransactionID || '').trim();
    const payIdMatch = txnForPaymongo.match(/pay_[a-zA-Z0-9]+/);
    if (payIdMatch) {
        resolvedPaymongoPaymentId = payIdMatch[0];
    } else if (process.env.PAYMONGO_SECRET_KEY && order.StripeSessionID && !isStripeCheckoutSessionId(order.StripeSessionID)) {
        try {
            const pmAuth = `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`;
            const pmSessionResp = await fetch(
                `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(String(order.StripeSessionID).trim())}`,
                {
                    method: 'GET',
                    headers: { accept: 'application/json', authorization: pmAuth }
                }
            );
            const pmSessionJson = await pmSessionResp.json().catch(() => ({}));
            resolvedPaymongoPaymentId = pmSessionJson?.data?.attributes?.payments?.[0]?.id || null;
            if (!resolvedPaymongoPaymentId) {
                const detail = pmSessionJson?.errors?.[0]?.detail || pmSessionResp.statusText || String(pmSessionResp.status);
                console.warn(`${logPrefix} PayMongo session lookup did not return payment id:`, detail);
            }
        } catch (pmLookupErr) {
            console.warn(`${logPrefix} PayMongo session lookup failed:`, pmLookupErr.message);
        }
    }

    const explicitRefundPhp =
        options.refundAmountPhp != null && Number.isFinite(Number(options.refundAmountPhp))
            ? Number(options.refundAmountPhp)
            : null;

    if (isStripeCheckoutSessionId(order.StripeSessionID) && getStripe) {
        let gatewayAttempted = true;
        try {
            const stripeInstance = getStripe();
            if (!stripeInstance) {
                throw new Error('Stripe not configured');
            }

            const session = await stripeInstance.checkout.sessions.retrieve(order.StripeSessionID);
            if (!session.payment_intent) {
                refundError = 'No payment intent found in session';
                return {
                    stripeRefundId,
                    paymongoRefundId,
                    refundAmount,
                    refundError,
                    skipped: false,
                    gatewayAttempted,
                    alreadyFullyRefunded: false
                };
            }

            const paymentIntent = await stripeInstance.paymentIntents.retrieve(session.payment_intent);
            if (paymentIntent.status === 'canceled' || paymentIntent.charges?.data?.[0]?.refunded) {
                console.warn(`${logPrefix} Payment intent already refunded or canceled`);
                refundAmount = (paymentIntent.amount || 0) / 100;
                return {
                    stripeRefundId,
                    paymongoRefundId,
                    refundAmount,
                    refundError: null,
                    skipped: false,
                    gatewayAttempted,
                    alreadyFullyRefunded: true
                };
            }

            let refundAmountInCents;
            let refundType;
            if (explicitRefundPhp != null && explicitRefundPhp > 0) {
                refundAmountInCents = Math.round(explicitRefundPhp * 100);
                refundAmount = explicitRefundPhp;
                refundType = 'amount_request';
            } else {
                refundAmountInCents = paymentIntent.amount;
                refundAmount = refundAmountInCents / 100;
                refundType = 'full_capture';
            }
            if (refundAmountInCents > paymentIntent.amount) {
                refundAmountInCents = paymentIntent.amount;
                refundAmount = refundAmountInCents / 100;
                refundType = 'capped_full_capture';
            }

            const refund = await stripeInstance.refunds.create({
                payment_intent: session.payment_intent,
                amount: refundAmountInCents,
                reason: 'requested_by_customer',
                metadata: {
                    order_id: String(order.OrderID || ''),
                    refund_context: context,
                    refund_type: refundType,
                    refund_initiator: initiator,
                    refund_note: stripeRefundDescription
                }
            });
            stripeRefundId = refund.id;
            console.log(`${logPrefix} Stripe refund created: ${stripeRefundId}`);
        } catch (stripeErr) {
            console.error(`${logPrefix} Stripe refund error:`, stripeErr.message || stripeErr);
            refundError = stripeErr.message || 'Stripe refund failed';
        }
        return {
            stripeRefundId,
            paymongoRefundId,
            refundAmount,
            refundError,
            skipped: false,
            gatewayAttempted,
            alreadyFullyRefunded: false
        };
    }

    if (resolvedPaymongoPaymentId && process.env.PAYMONGO_SECRET_KEY) {
        const gatewayAttempted = true;
        try {
            const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;
            const paymentId = String(resolvedPaymongoPaymentId).trim();
            const authHeader = `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString('base64')}`;
            const storedOrTotalAmount =
                explicitRefundPhp != null && explicitRefundPhp > 0
                    ? explicitRefundPhp
                    : parseFloat(order.TotalAmount || 0);
            let refundAmountInCentavos = Math.max(0, Math.round(storedOrTotalAmount * 100));
            refundAmount = refundAmountInCentavos / 100;
            let refundType =
                explicitRefundPhp != null && explicitRefundPhp > 0 ? 'amount_request' : 'full_return_refund';

            const paymentResponse = await fetch(`https://api.paymongo.com/v1/payments/${encodeURIComponent(paymentId)}`, {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    authorization: authHeader
                }
            });
            const paymentResult = await paymentResponse.json();
            if (!paymentResponse.ok || !paymentResult?.data?.attributes) {
                throw new Error(paymentResult?.errors?.[0]?.detail || 'Failed to retrieve PayMongo payment details');
            }

            const paymongoPaymentAmount = parseInt(paymentResult.data.attributes.amount || 0, 10);
            if (paymongoPaymentAmount > 0 && refundAmountInCentavos > paymongoPaymentAmount) {
                refundAmountInCentavos = paymongoPaymentAmount;
                refundAmount = refundAmountInCentavos / 100;
                refundType = 'capped_full_capture';
            }

            const refundPayload = {
                data: {
                    attributes: {
                        amount: refundAmountInCentavos,
                        payment_id: paymentId,
                        reason: 'requested_by_customer',
                        notes: paymongoReasonNote
                    }
                }
            };

            const paymongoRefundResponse = await fetch('https://api.paymongo.com/v1/refunds', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: authHeader
                },
                body: JSON.stringify(refundPayload)
            });

            const paymongoRefundResult = await paymongoRefundResponse.json();
            if (!paymongoRefundResponse.ok || !paymongoRefundResult?.data?.id) {
                const errorDetail = paymongoRefundResult?.errors?.[0]?.detail || 'PayMongo refund failed';
                if (/already|refunded|not refundable|paid/i.test(String(errorDetail))) {
                    console.warn(`${logPrefix} PayMongo treat as already handled:`, errorDetail);
                    return {
                        stripeRefundId,
                        paymongoRefundId,
                        refundAmount,
                        refundError: null,
                        skipped: false,
                        gatewayAttempted,
                        alreadyFullyRefunded: true
                    };
                }
                throw new Error(errorDetail);
            }

            paymongoRefundId = paymongoRefundResult.data.id;
            console.log(`${logPrefix} PayMongo refund created: ${paymongoRefundId}`);
        } catch (paymongoErr) {
            console.error(`${logPrefix} PayMongo refund error:`, paymongoErr.message || paymongoErr);
            refundError = paymongoErr.message || 'PayMongo refund failed';
        }
        return {
            stripeRefundId,
            paymongoRefundId,
            refundAmount,
            refundError,
            skipped: false,
            gatewayAttempted,
            alreadyFullyRefunded: false
        };
    }

    return {
        stripeRefundId,
        paymongoRefundId,
        refundAmount,
        refundError,
        skipped: true,
        gatewayAttempted: false,
        alreadyFullyRefunded: false
    };
}

module.exports = { processGatewayRefund };
