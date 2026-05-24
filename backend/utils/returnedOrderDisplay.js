'use strict';

const PRE_RECEIVE_RETURN_PREFIX = '[PRE_RECEIVE]';
const APPEALED_RETURN_PREFIX = 'APPEALED:';

function isPreReceiveReturn(order) {
    return String(order?.ReturnReason || '').trim().startsWith(PRE_RECEIVE_RETURN_PREFIX);
}

function isAppealedReturn(order) {
    return String(order?.ReturnReason || '').trim().startsWith(APPEALED_RETURN_PREFIX);
}

function stripReturnReasonPrefix(reason) {
    const s = String(reason || '').trim();
    if (s.startsWith('DECLINED:')) return s.replace(/^DECLINED:\s*/, '');
    if (s.startsWith(APPEALED_RETURN_PREFIX)) return s.replace(/^APPEALED:\s*/, '');
    if (s.startsWith(PRE_RECEIVE_RETURN_PREFIX)) {
        return s.slice(PRE_RECEIVE_RETURN_PREFIX.length).trim();
    }
    return s;
}

function returnedOrderStatusLabel(order) {
    const status = String(order?.Status || '').trim();
    if (status === 'Refunded') return 'Refunded';
    if (status === 'Completed Returned') return 'Replaced';
    if (status === 'Pickup Received') {
        const actionType = String(order?.ActionType || '').toLowerCase().trim();
        if (actionType === 'refund') return 'Process Refund';
        if (actionType === 'replacement') return 'Process Replacement';
        return 'Pickup Received';
    }
    if (status === 'Inspection Complete') return 'Inspection Complete';
    if (status === 'Awaiting Inspection') return 'Waiting for Inspection';
    if (status === 'Processing (Pickup)' || (status === 'Processing' && order?.ActionType)) {
        return 'Process Pickup';
    }
    if (status === 'Return') {
        return isAppealedReturn(order) ? 'Appealed' : 'Return';
    }
    if (status === 'Returned') {
        return 'Returned';
    }
    if (status === 'Declined') return 'Declined';
    return status || 'Returned';
}

function returnedOrderStatusClass(order) {
    const label = returnedOrderStatusLabel(order);
    if (label === 'Refunded') return 'status-refunded';
    if (label === 'Replaced') return 'status-replaced';
    if (label === 'Pickup Received') return 'status-pickup-received';
    if (label === 'Inspection Complete') return 'status-inspection-complete';
    if (label === 'Waiting for Inspection') return 'status-awaiting-inspection';
    if (label === 'Waiting for Receiving Item') return 'status-processing';
    if (label === 'Declined') return 'status-declined';
    if (label === 'Appealed') return 'status-appealed';
    return 'status-returned';
}

function returnReasonTypeLabel(returnType) {
    const t = String(returnType || '').toLowerCase().trim();
    if (t === 'damage') return 'Damaged Item';
    if (t === 'wrong_item') return 'Wrong Item';
    if (t === 'mixed') return 'Mixed Reason Type';
    if (t === 'other') return 'Other Reason';
    return returnType ? String(returnType) : '—';
}

function returnedOrderTypeLabel(order) {
    const actionType = String(order?.ActionType || '').toLowerCase().trim();
    if (actionType === 'refund') return 'Refund';
    if (actionType === 'replacement') return 'Replacement';
    return '—';
}

/** Primary workflow button after inspection complete. */
function returnProcessButtonLabel(order) {
    const actionType = String(order?.ActionType || '').toLowerCase().trim();
    if (actionType === 'refund') return 'Process Refund';
    if (actionType === 'replacement') return 'Process Replacement';
    return 'Proceed';
}

function returnedOrderTypeClass(order) {
    const actionType = String(order?.ActionType || '').toLowerCase().trim();
    if (actionType === 'refund') return 'refunded';
    if (actionType === 'replacement') return 'replacement';
    return '';
}

function showProductReturnsLink(order) {
    const status = String(order?.Status || '').trim();
    return status === 'Refunded' || status === 'Completed Returned';
}

function conditionMet(value) {
    return value === 1 || value === true || value === '1';
}

function returnConditionsUnmetCount(order) {
    let count = 0;
    if (!conditionMet(order?.OriginalPackaging)) count += 1;
    if (!conditionMet(order?.AllParts)) count += 1;
    if (!conditionMet(order?.Unused)) count += 1;
    if (!conditionMet(order?.ProofOfPurchase)) count += 1;
    return count;
}

function returnConditionsAllMet(order) {
    return returnConditionsUnmetCount(order) === 0;
}

/** Product refund amount from conditions (excludes delivery). Uses stored RefundAmount when set. */
function computeRefundAmountForOrder(order) {
    const actionType = String(order?.ActionType || '').toLowerCase().trim();
    if (actionType !== 'refund') return null;

    const stored = parseFloat(order?.RefundAmount);
    if (!Number.isNaN(stored) && stored > 0) {
        return Math.round(stored * 100) / 100;
    }

    const subtotal = parseFloat(order?.Subtotal || 0);
    if (!subtotal || subtotal <= 0) return 0;

    if (isPreReceiveReturn(order)) {
        const delivery = (parseFloat(order?.DeliveryCost || 0) || 0) + (parseFloat(order?.ExtraDeliveryFee || 0) || 0);
        return Math.round((subtotal + delivery) * 100) / 100;
    }

    const unmet = returnConditionsUnmetCount(order);
    if (unmet === 0) return Math.round(subtotal * 100) / 100;
    if (unmet <= 2) return Math.round(subtotal * 0.5 * 100) / 100;
    return 0;
}

function refundPolicySummary(order) {
    if (isPreReceiveReturn(order)) {
        const actionType = String(order?.ActionType || '').toLowerCase().trim();
        if (actionType === 'replacement') {
            return 'Pre-receipt replacement — seller pays return shipping; replacement delivery is free.';
        }
        return 'Pre-receipt refund — full refund including delivery and return shipping (seller pays all fees).';
    }
    const unmet = returnConditionsUnmetCount(order);
    if (unmet === 0) {
        return 'All conditions met — full product refund (delivery fee not included).';
    }
    if (unmet <= 2) {
        return `${unmet} requirement${unmet === 1 ? '' : 's'} not met — 50% of product price deducted.`;
    }
    return `${unmet} requirements not met — no product refund (delivery fee not included).`;
}

module.exports = {
    PRE_RECEIVE_RETURN_PREFIX,
    APPEALED_RETURN_PREFIX,
    isPreReceiveReturn,
    isAppealedReturn,
    stripReturnReasonPrefix,
    returnedOrderStatusLabel,
    returnedOrderStatusClass,
    returnReasonTypeLabel,
    returnedOrderTypeLabel,
    returnedOrderTypeClass,
    returnProcessButtonLabel,
    showProductReturnsLink,
    returnConditionsUnmetCount,
    returnConditionsAllMet,
    computeRefundAmountForOrder,
    refundPolicySummary,
    conditionMet
};
