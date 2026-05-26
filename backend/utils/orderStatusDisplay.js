'use strict';

/** DB status value → customer-facing label (DB values unchanged). */
const ORDER_STATUS_LABELS = {
    Pending: 'Pending Verification',
    Processing: 'Processing',
    'Processing (Pickup)': 'Processing (Pickup)',
    Shipping: 'Shipping',
    Delivery: 'Delivery',
    Received: 'Received',
    Completed: 'Completed',
    Cancelled: 'Cancelled',
    Returned: 'Returned',
    Return: 'Returned',
    Refunded: 'Completed Refunded',
    'Completed Returned': 'Replacement',
    Declined: 'Declined',
    'Awaiting Inspection': 'Awaiting Inspection',
    'Inspection Complete': 'Inspection Complete',
    'Pickup Received': 'Pickup Received'
};

/** Statuses where payment collected — count toward gross sales. */
const GROSS_SALES_STATUSES = new Set([
    'pending',
    'processing',
    'processing (pickup)',
    'shipping',
    'delivery',
    'received',
    'completed'
]);

/** Accounting recognition — only after customer confirmation / finalized. */
const NET_REVENUE_STATUSES = new Set([
    'received',
    'completed'
]);

/**
 * Sales report reference: how each status affects gross vs net revenue.
 * grossSales / netRevenue: Yes | No | Conditional | Negative
 */
const SALES_REPORT_STATUS_RULES = [
    { status: 'Pending', label: 'Pending Verification (Paid)', grossSales: 'Yes', netRevenue: 'No', notes: 'Payment received but not fulfilled' },
    { status: 'Processing', label: 'Processing', grossSales: 'Yes', netRevenue: 'No', notes: 'Order being prepared' },
    { status: 'Processing (Pickup)', label: 'Processing (Pickup)', grossSales: 'Yes', netRevenue: 'No', notes: 'Ready for courier' },
    { status: 'Shipping', label: 'Shipping', grossSales: 'Yes', netRevenue: 'No', notes: 'In transit' },
    { status: 'Delivery', label: 'Delivery', grossSales: 'Yes', netRevenue: 'Conditional', notes: 'Delivered but not confirmed' },
    { status: 'Received', label: 'Received', grossSales: 'Yes', netRevenue: 'Yes', notes: 'Customer confirmed' },
    { status: 'Completed', label: 'Completed', grossSales: 'Yes', netRevenue: 'Yes', notes: 'Finalized sale' },
    { status: 'Cancelled', label: 'Cancelled', grossSales: 'No', netRevenue: 'No', notes: 'Reverse / restock' },
    { status: 'Returned', label: 'Returned', grossSales: 'No', netRevenue: 'Negative', notes: 'Reverse revenue' },
    { status: 'Refunded', label: 'Completed Refunded', grossSales: 'No', netRevenue: 'Negative', notes: 'Refund deducted' },
    { status: 'Completed Returned', label: 'Replacement', grossSales: 'No', netRevenue: 'No', notes: 'Service transaction' },
    { status: 'Declined', label: 'Declined', grossSales: 'No', netRevenue: 'No', notes: 'Failed / rejected' }
];

function normalizeStatus(status) {
    return (status || '').toString().toLowerCase().trim();
}

function normalizeAction(action) {
    return (action || '').toString().toLowerCase().trim();
}

function getOrderStatusLabel(status) {
    if (!status) return 'N/A';
    const key = String(status).trim();
    if (ORDER_STATUS_LABELS[key]) return ORDER_STATUS_LABELS[key];
    if (key === 'Completed Returned') return 'Replacement';
    return key;
}

function isNegativeRevenueStatus(order) {
    const s = normalizeStatus(order && order.Status);
    return s === 'returned' || s === 'return' || s === 'refunded' || s === 'completed returned';
}

function isReplacementServiceOrder(order) {
    return normalizeAction(order && order.ActionType) === 'replacement'
        && !isNegativeRevenueStatus(order);
}

function countsTowardGrossSales(order) {
    if (!order) return false;
    const s = normalizeStatus(order.Status);
    if (s === 'cancelled' || s === 'declined') return false;
    if (isNegativeRevenueStatus(order)) return false;
    if (isReplacementServiceOrder(order)) return false;
    if (normalizeAction(order.ActionType) === 'refund') return false;
    return GROSS_SALES_STATUSES.has(s);
}

function countsTowardNetRevenue(order) {
    if (!countsTowardGrossSales(order)) return false;
    return NET_REVENUE_STATUSES.has(normalizeStatus(order.Status));
}

module.exports = {
    ORDER_STATUS_LABELS,
    GROSS_SALES_STATUSES,
    NET_REVENUE_STATUSES,
    SALES_REPORT_STATUS_RULES,
    normalizeStatus,
    getOrderStatusLabel,
    countsTowardGrossSales,
    countsTowardNetRevenue,
    isNegativeRevenueStatus,
    isReplacementServiceOrder
};
