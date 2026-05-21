/**
 * Per-customer localStorage keys + helpers for in-app notifications (receipts, refunds, order status).
 */

export const getNotificationUserId = (user) => {
  const fromContext = user?.email || user?.id || user?.CustomerID;
  if (fromContext) {
    return String(fromContext).toLowerCase();
  }
  try {
    const raw = localStorage.getItem('userData');
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.email || parsed?.id || parsed?.CustomerID || 'guest').toLowerCase();
  } catch {
    return 'guest';
  }
};

export const getNotificationUserStorageKey = (baseKey, user) => {
  return `${baseKey}:${getNotificationUserId(user)}`;
};

/**
 * Store one in-app "order receipt sent" notification per order (per checkout session).
 */
export function persistOrderReceiptNotification(orderNumber, user) {
  if (!orderNumber) return;

  const receiptId = `order-receipt-${String(orderNumber)}`;
  const receiptKey = getNotificationUserStorageKey('orderReceiptNotifications', user);
  const legacyReceiptKey = getNotificationUserStorageKey('orderReceiptNotification', user);
  const readReceiptKey = getNotificationUserStorageKey('readReceiptNotifications', user);
  const notificationData = {
    id: receiptId,
    orderNumber: String(orderNumber),
    timestamp: new Date().toISOString(),
    dismissed: false
  };

  try {
    const existing = JSON.parse(localStorage.getItem(receiptKey) || '[]');
    const withoutCurrent = Array.isArray(existing)
      ? existing.filter((item) => item.id !== receiptId)
      : [];
    localStorage.setItem(receiptKey, JSON.stringify([notificationData, ...withoutCurrent]));
  } catch {
    localStorage.setItem(receiptKey, JSON.stringify([notificationData]));
  }

  localStorage.setItem(legacyReceiptKey, JSON.stringify(notificationData));

  try {
    const read = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
    const next = Array.isArray(read) ? read.filter((id) => id !== receiptId) : [];
    localStorage.setItem(readReceiptKey, JSON.stringify(next));
  } catch {
    localStorage.setItem(readReceiptKey, '[]');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
  }
}

/** Idempotent wrapper — avoids duplicate bell/popup notifications on effect re-runs. */
export function persistOrderReceiptNotificationOnce(orderNumber, user, checkoutSessionId = null) {
  if (!orderNumber) return false;
  const dedupeKey = checkoutSessionId
    ? `checkout:${String(checkoutSessionId)}`
    : `order:${String(orderNumber)}`;
  const flagKey = `orderReceiptPersisted:${dedupeKey}`;
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(flagKey) === '1') {
    return false;
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(flagKey, '1');
  }
  persistOrderReceiptNotification(orderNumber, user);
  return true;
}

/**
 * Remove all stored customer notifications: receipt list, legacy receipt, refund banner,
 * and dismiss every order-status notification returned by the API.
 */
export async function clearAllCustomerNotifications(user, options = {}) {
  const apiBaseUrl = options.apiBaseUrl || process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const credentials = options.credentials ?? 'include';

  try {
    const receiptKey = getNotificationUserStorageKey('orderReceiptNotifications', user);
    const legacyReceiptKey = getNotificationUserStorageKey('orderReceiptNotification', user);
    const readReceiptKey = getNotificationUserStorageKey('readReceiptNotifications', user);
    const refundKey = getNotificationUserStorageKey('orderRefundNotification', user);
    const readRefundKey = getNotificationUserStorageKey('readRefundNotifications', user);
    const dismissedOrderKey = getNotificationUserStorageKey('dismissedOrderNotifications', user);
    const readOrderKey = getNotificationUserStorageKey('readOrderNotifications', user);

    localStorage.setItem(receiptKey, '[]');
    localStorage.removeItem(legacyReceiptKey);
    localStorage.removeItem(refundKey);
    localStorage.setItem(readRefundKey, JSON.stringify(['order-refund']));

    try {
      const res = await fetch(`${apiBaseUrl}/api/customer/order-notifications`, {
        method: 'GET',
        credentials,
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const list =
          data.success && Array.isArray(data.notifications)
            ? data.notifications
            : Array.isArray(data.notifications)
              ? data.notifications
              : [];
        const dismissed = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
        const dismissedArr = Array.isArray(dismissed) ? [...dismissed] : [];
        list.forEach((n) => {
          if (n && n.id && !dismissedArr.includes(n.id)) {
            dismissedArr.push(n.id);
          }
        });
        localStorage.setItem(dismissedOrderKey, JSON.stringify(dismissedArr));
      }
    } catch {
      // ignore network errors; still cleared local items
    }

    try {
      localStorage.setItem(readReceiptKey, '[]');
      localStorage.setItem(readOrderKey, '[]');
    } catch {
      // ignore
    }
  } catch (e) {
    console.error('[notifications] clearAllCustomerNotifications:', e);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
  }
}
