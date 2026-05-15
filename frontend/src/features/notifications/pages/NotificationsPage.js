import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import { PageLoader } from '../../../shared/components/ui';
import {
  getNotificationUserStorageKey as getUserStorageKey,
  clearAllCustomerNotifications
} from '../../../shared/utils/customerNotificationStorage';
import './NotificationsPage.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const PAGE_SIZE = 10;

const NotificationsPage = () => {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [clearingAll, setClearingAll] = useState(false);

  const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
  const paginatedNotifications = notifications.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
    if (currentPage > pages) {
      setCurrentPage(pages);
    }
  }, [notifications.length, currentPage]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const loadedNotifications = [];

        // Load order receipt notifications from localStorage (persist until dismissed).
        // Data is scoped per customer account to avoid cross-account leakage.
        try {
          const receiptNotifications = [];
          const receiptKey = getUserStorageKey('orderReceiptNotifications', user);
          const legacyReceiptKey = getUserStorageKey('orderReceiptNotification', user);
          const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);

          const savedReceipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
          const normalizedSavedReceipts = Array.isArray(savedReceipts) ? [...savedReceipts] : [];
          receiptNotifications.push(...normalizedSavedReceipts);

          const legacyReceipt = localStorage.getItem(legacyReceiptKey);
          if (legacyReceipt) {
            const parsedLegacy = JSON.parse(legacyReceipt);
            if (parsedLegacy && parsedLegacy.orderNumber) {
              const legacyId = parsedLegacy.id || `order-receipt-${parsedLegacy.orderNumber}`;
              const exists = receiptNotifications.some((item) => item.id === legacyId);
              if (!exists) {
                receiptNotifications.push({
                  ...parsedLegacy,
                  id: legacyId
                });
              }
            }
          }

          const readReceipts = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
          const normalizedReadReceipts = Array.isArray(readReceipts) ? readReceipts : [];
          receiptNotifications.forEach((data) => {
              const receiptId = data.id || `order-receipt-${data.orderNumber || Date.now()}`;
              loadedNotifications.push({
                id: receiptId,
                type: 'order_receipt',
                title: 'Order Receipt Sent!',
                message: data.orderNumber
                  ? `Receipt for Order #${data.orderNumber} sent to your email.`
                  : 'Your order receipt has been sent to your email.',
                orderNumber: data.orderNumber,
                timestamp: data.timestamp,
                read: normalizedReadReceipts.includes(receiptId)
              });
            });
        } catch (error) {
          console.error('Error parsing receipt notification data:', error);
        }

        // Load refund receipt notification from localStorage (persists until dismissed)
        const refundNotificationKey = getUserStorageKey('orderRefundNotification', user);
        const readRefundKey = getUserStorageKey('readRefundNotifications', user);
        const refundNotificationData = localStorage.getItem(refundNotificationKey);
        if (refundNotificationData) {
          try {
            const data = JSON.parse(refundNotificationData);
            // Check if notification was dismissed
            if (!data.dismissed) {
              // Check if it was marked as read
              const readRefunds = JSON.parse(localStorage.getItem(readRefundKey) || '[]');
              const isRead = readRefunds.includes('order-refund');
              
              loadedNotifications.push({
                id: 'order-refund',
                type: 'order_refund',
                title: 'Refund Receipt Sent!',
                message: data.orderNumber
                  ? `Refund receipt for cancelled Order #${data.orderNumber} sent to your email. Refund amount: ₱${(data.refundAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                  : 'Your refund receipt has been sent to your email.',
                orderNumber: data.orderNumber,
                refundAmount: data.refundAmount,
                timestamp: data.timestamp,
                read: isRead
              });
            }
          } catch (error) {
            console.error('Error parsing refund notification data:', error);
          }
        }

        // Fetch order status notifications from API
        try {
          if (isAuthenticated) {
            const response = await fetch(`${API_BASE_URL}/api/customer/order-notifications`, {
              method: 'GET',
              credentials: 'include', // Include cookies for session-based authentication
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (response.ok) {
              const data = await response.json();
              console.log('[NOTIFICATIONS] Fetched order notifications:', data);
              if (data.success && data.notifications) {
                // Load dismissed notifications from localStorage
                const dismissedOrderKey = getUserStorageKey('dismissedOrderNotifications', user);
                const readOrderKey = getUserStorageKey('readOrderNotifications', user);
                const dismissedNotifications = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
                const readNotifications = JSON.parse(localStorage.getItem(readOrderKey) || '[]');

                // Filter out dismissed notifications and mark read ones
                const orderStatusNotifications = data.notifications
                  .filter(notif => !dismissedNotifications.includes(notif.id))
                  .map(notif => ({
                    ...notif,
                    read: readNotifications.includes(notif.id)
                  }));

                console.log('[NOTIFICATIONS] Processed order status notifications:', orderStatusNotifications);
                loadedNotifications.push(...orderStatusNotifications);
              }
            } else {
              console.error('[NOTIFICATIONS] Failed to fetch notifications:', response.status, response.statusText);
              const errorData = await response.json().catch(() => ({}));
              console.error('[NOTIFICATIONS] Error data:', errorData);
            }
          }
        } catch (error) {
          console.error('[NOTIFICATIONS] Error fetching order notifications:', error);
        }

        // Sort by timestamp (newest first); invalid dates sort to the end
        loadedNotifications.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          const safeA = Number.isFinite(timeA) ? timeA : 0;
          const safeB = Number.isFinite(timeB) ? timeB : 0;
          return safeB - safeA;
        });

        setNotifications(loadedNotifications);
      } catch (error) {
        console.error('Error loading notifications:', error);
      } finally {
        setLoadingNotifications(false);
      }
    };

    if (isAuthenticated) {
      loadNotifications();

      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        if (isAuthenticated) {
          loadNotifications();
        }
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user]);

  const handleDismiss = (notificationId) => {
    if (notificationId.startsWith('order-receipt-')) {
      // Remove receipt notification from storage entirely.
      try {
        const receiptKey = getUserStorageKey('orderReceiptNotifications', user);
        const legacyReceiptKey = getUserStorageKey('orderReceiptNotification', user);
        const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);

        const savedReceipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
        const receipts = Array.isArray(savedReceipts) ? savedReceipts : [];
        const nextReceipts = receipts.filter((r) => (r?.id || `order-receipt-${r?.orderNumber || ''}`) !== notificationId);
        localStorage.setItem(receiptKey, JSON.stringify(nextReceipts));

        // Also mark as read to avoid legacy fallback reappearing.
        const read = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
        const readArr = Array.isArray(read) ? read : [];
        if (!readArr.includes(notificationId)) {
          readArr.push(notificationId);
          localStorage.setItem(readReceiptKey, JSON.stringify(readArr));
        }

        // Update legacy single receipt key if it pointed to this one
        const legacyRaw = localStorage.getItem(legacyReceiptKey);
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw);
            const legacyId = legacy?.id || (legacy?.orderNumber ? `order-receipt-${legacy.orderNumber}` : null);
            if (legacyId === notificationId) {
              if (nextReceipts[0]) {
                localStorage.setItem(legacyReceiptKey, JSON.stringify(nextReceipts[0]));
              } else {
                localStorage.removeItem(legacyReceiptKey);
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    } else if (notificationId === 'order-refund') {
      // Remove refund notification from storage entirely.
      try {
        const refundNotificationKey = getUserStorageKey('orderRefundNotification', user);
        const readRefundKey = getUserStorageKey('readRefundNotifications', user);
        localStorage.removeItem(refundNotificationKey);

        // Also mark as read so it won't be treated as new if legacy code re-adds it.
        const read = JSON.parse(localStorage.getItem(readRefundKey) || '[]');
        const readArr = Array.isArray(read) ? read : [];
        if (!readArr.includes('order-refund')) {
          readArr.push('order-refund');
          localStorage.setItem(readRefundKey, JSON.stringify(readArr));
        }
      } catch (e) {
        // ignore
      }
    } else if (notificationId.startsWith('order-status-')) {
      // Store dismissed order status notifications
      const dismissedOrderKey = getUserStorageKey('dismissedOrderNotifications', user);
      const dismissed = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
      if (!dismissed.includes(notificationId)) {
        dismissed.push(notificationId);
        localStorage.setItem(dismissedOrderKey, JSON.stringify(dismissed));
      }
    }

    if (notificationId.startsWith('order-receipt-')) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } else {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }

    // Dispatch custom event to update notification icon
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
  };

  const handleOpenGmail = () => {
    window.open('https://mail.google.com', '_blank');
  };

  const handleMarkAsRead = (notificationId) => {
    if (notificationId.startsWith('order-receipt-')) {
      // Store read receipt notifications
      const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);
      const read = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
      if (!read.includes(notificationId)) {
        read.push(notificationId);
        localStorage.setItem(readReceiptKey, JSON.stringify(read));
      }
    } else if (notificationId === 'order-refund') {
      // Store read refund notifications
      const readRefundKey = getUserStorageKey('readRefundNotifications', user);
      const read = JSON.parse(localStorage.getItem(readRefundKey) || '[]');
      if (!read.includes(notificationId)) {
        read.push(notificationId);
        localStorage.setItem(readRefundKey, JSON.stringify(read));
      }
    } else if (notificationId.startsWith('order-status-')) {
      // Store read order status notifications
      const readOrderKey = getUserStorageKey('readOrderNotifications', user);
      const read = JSON.parse(localStorage.getItem(readOrderKey) || '[]');
      if (!read.includes(notificationId)) {
        read.push(notificationId);
        localStorage.setItem(readOrderKey, JSON.stringify(read));
      }
    }

    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    );

    // Dispatch custom event to update notification icon
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
  };

  const handleClearAll = async () => {
    if (notifications.length === 0 || clearingAll) return;
    setClearingAll(true);
    try {
      await clearAllCustomerNotifications(user, { apiBaseUrl: API_BASE_URL });
      setNotifications([]);
      setCurrentPage(1);
    } finally {
      setClearingAll(false);
    }
  };

  // Function to remove emojis and special characters from title
  const cleanTitle = (title) => {
    if (!title) return title;
    // Remove emojis and other Unicode symbols (keeps regular text, numbers, and basic punctuation)
    return title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  };

  const getNotificationIcon = (notification) => {
    if (notification.type === 'order_receipt') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
      );
    }
    if (notification.type === 'order_refund') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      );
    }
    if (notification.type === 'order_status') {
      switch (notification.status) {
        case 'Processing':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          );
        case 'Shipping':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          );
        case 'Delivery':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"></path>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          );
        case 'Delivered':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          );
        case 'Received':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          );
        case 'Completed':
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          );
        default:
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          );
      }
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    );
  };

  if (loading || loadingNotifications) {
    return (
      <div className="notifications-page">
        <div className="notifications-container">
          <PageLoader />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="notifications-page">
      <div className="notifications-container">
        {/* Header */}
        <div className="notifications-header">
          <div className="notifications-header-inner">
            <div className="notifications-header-content">
              <h1 className="notifications-title">Notifications</h1>
              <p className="notifications-subtitle">
                {notifications.length === 0
                  ? 'No new notifications'
                  : `${notifications.filter(n => !n.read).length} unread • ${notifications.length} ${notifications.length === 1 ? 'notification' : 'notifications'}`
                }
              </p>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                className="notifications-clear-all-btn"
                disabled={clearingAll}
                onClick={handleClearAll}
                title="Clear all notifications"
              >
                {clearingAll ? 'Clearing…' : 'Clear all'}
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="notifications-content">
          {notifications.length === 0 ? (
            <div className="empty-notifications">
              <div className="empty-notifications-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </div>
              <h3 className="empty-notifications-title">No Notifications</h3>
              <p className="empty-notifications-message">
                You're all caught up! When you receive order receipts or other updates, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="notifications-list">
              {paginatedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-card ${notification.read ? 'read' : 'unread'}`}
                >
                  <div className="notification-card-content">
                    <div className="notification-card-icon">
                      {getNotificationIcon(notification)}
                    </div>
                    <div className="notification-card-body">
                      <div className="notification-card-header">
                        <h3 className="notification-card-title">{cleanTitle(notification.title)}</h3>
                        {!notification.read && (
                          <span className="notification-unread-badge">New</span>
                        )}
                      </div>
                      <p className="notification-card-message">{notification.message}</p>
                      {notification.type === 'order_status' && notification.orderNumber && (
                        <div className="notification-order-details-compact">
                          <span className="notification-order-compact-item">
                            Order #{notification.orderNumber}
                          </span>
                          {notification.transactionId && (
                            <span className="notification-order-compact-item">
                              Txn: {notification.transactionId}
                            </span>
                          )}
                          {notification.totalAmount > 0 && (
                            <span className="notification-order-compact-item">
                              ₱{notification.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {notification.estimatedDeliveryDate && (
                            <span className="notification-order-compact-item notification-eda">
                              ETA: {notification.estimatedDeliveryDate}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="notification-card-meta">
                        <span className="notification-card-time">
                          {new Date(notification.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="notification-card-actions">
                      {!notification.read && (
                        <button
                          className="notification-action-btn mark-read-btn"
                          onClick={() => handleMarkAsRead(notification.id)}
                          title="Mark as read"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                          </svg>
                        </button>
                      )}
                      {(notification.type === 'order_receipt' || notification.type === 'order_refund') && (
                        <button
                          className="notification-action-btn gmail-btn"
                          onClick={handleOpenGmail}
                          title="Open Gmail"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                          <span>Gmail</span>
                        </button>
                      )}
                      <button
                        className="notification-action-btn dismiss-btn"
                        onClick={() => handleDismiss(notification.id)}
                        title="Dismiss"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {notifications.length > PAGE_SIZE && (
            <div className="notifications-pagination" role="navigation" aria-label="Notification pages">
              <button
                type="button"
                className="notifications-pagination-btn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="notifications-pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="notifications-pagination-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;

