'use strict';

function returnedOrderStatusLabel(order) {
    const status = String(order?.Status || '').trim();
    if (status === 'Refunded') return 'Refunded';
    if (status === 'Completed Returned') return 'Replaced';
    if (status === 'Pickup Received') return 'Pickup Received';
    if (status === 'Inspection Complete') return 'Inspection Complete';
    if (status === 'Awaiting Inspection') return 'Awaiting Inspection';
    if (status === 'Processing (Pickup)' || (status === 'Processing' && order?.ActionType)) {
        return 'Waiting for Receiving Item';
    }
    if (status === 'Returned') return 'Returned';
    if (status === 'Declined') return 'Declined';
    return status || 'Returned';
}

function returnedOrderStatusClass(order) {
    const label = returnedOrderStatusLabel(order);
    if (label === 'Refunded') return 'status-refunded';
    if (label === 'Replaced') return 'status-replaced';
    if (label === 'Pickup Received') return 'status-pickup-received';
    if (label === 'Inspection Complete') return 'status-inspection-complete';
    if (label === 'Awaiting Inspection') return 'status-awaiting-inspection';
    if (label === 'Waiting for Receiving Item') return 'status-processing';
    if (label === 'Declined') return 'status-declined';
    return 'status-returned';
}

function returnedOrderTypeLabel(order) {
    const actionType = String(order?.ActionType || '').toLowerCase().trim();
    if (actionType === 'refund') return 'Refund';
    if (actionType === 'replacement') return 'Replacement';
    return '—';
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

    const unmet = returnConditionsUnmetCount(order);
    if (unmet === 0) return Math.round(subtotal * 100) / 100;
    if (unmet <= 2) return Math.round(subtotal * 0.5 * 100) / 100;
    return 0;
}

function refundPolicySummary(order) {
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
    returnedOrderStatusLabel,
    returnedOrderStatusClass,
    returnedOrderTypeLabel,
    returnedOrderTypeClass,
    showProductReturnsLink,
    returnConditionsUnmetCount,
    returnConditionsAllMet,
    computeRefundAmountForOrder,
    refundPolicySummary,
    conditionMet
};
