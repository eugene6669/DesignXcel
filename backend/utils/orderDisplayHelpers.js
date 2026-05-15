/**
 * Display helpers for orders (payment labels, transaction ID cleanup).
 */

function isStripeCheckoutSessionId(sessionId) {
    return /^cs_(test_|live_)/i.test(String(sessionId || '').trim());
}

/**
 * If TransactionID was accidentally stored as the same string twice (concatenated), return a single copy.
 */
function dedupeDoubledTransactionId(tid) {
    const s = String(tid || '').trim();
    if (!s) return s;
    // e.g. pay_xxx,pay_xxx from a bad double-write — show one id
    if (s.includes(',')) {
        const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
        const uniq = [...new Set(parts)];
        if (uniq.length === 1) {
            return uniq[0];
        }
        const payPick = uniq.find((p) => p.startsWith('pay_'));
        if (payPick) {
            return payPick;
        }
        return uniq[0];
    }
    const halfLen = Math.floor(s.length / 2);
    if (halfLen > 10 && s.slice(0, halfLen) === s.slice(halfLen)) {
        return s.slice(0, halfLen);
    }
    return s;
}

/**
 * Human-readable payment method for admin and customer views.
 * Stripe Checkout (card) uses session ids starting with cs_test_ / cs_live_.
 * DB may still store "Bank Transfer" for Stripe/PayMongo card flows; COD uses "Bank Transfer" with no gateway ids.
 */
function paymentMethodDisplayForOrder(order) {
    if (!order) return 'N/A';
    const raw = order.PaymentMethod != null && order.PaymentMethod !== '' ? String(order.PaymentMethod) : 'N/A';
    if (raw === 'N/A') return 'N/A';

    const txn = String(order.TransactionID || '').trim();
    const sid = String(order.StripeSessionID || '').trim();
    const rawLower = raw.toLowerCase();

    // Defensive: don't surface gateway error strings as "payment method".
    if (rawLower.includes('access token') && (rawLower.includes('invalid') || rawLower.includes('expired'))) {
        return txn.startsWith('pay_') ? 'E-Wallet' : 'Bank Card (Stripe)';
    }

    if (txn.startsWith('pay_')) {
        return 'E-Wallet';
    }
    if (txn.startsWith('pi_')) {
        return 'Bank Card (Stripe)';
    }
    if (isStripeCheckoutSessionId(sid)) {
        return 'Bank Card (Stripe)';
    }

    // COD placeholder in DB: PaymentMethod "Bank Transfer" (or legacy "Stripe") with no checkout session / txn
    const looksLikeCodPlaceholder =
        (rawLower === 'bank transfer' || rawLower === 'stripe') && !sid && !txn;
    if (looksLikeCodPlaceholder) {
        return 'Cash on Delivery';
    }

    if (rawLower === 'bank transfer' || rawLower === 'stripe') {
        if (sid && !isStripeCheckoutSessionId(sid)) {
            return 'Card (PayMongo)';
        }
        return 'Bank Card (Stripe)';
    }
    if (rawLower === 'bank card') {
        return 'Bank Card (Stripe)';
    }
    return raw;
}

module.exports = {
    isStripeCheckoutSessionId,
    dedupeDoubledTransactionId,
    paymentMethodDisplayForOrder
};
