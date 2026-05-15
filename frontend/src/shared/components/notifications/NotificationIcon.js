import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import { FaBell } from 'react-icons/fa';
import { formatManilaDateTimeShort } from '../../utils/manilaTime';
import {
  getNotificationUserStorageKey as getUserStorageKey,
  clearAllCustomerNotifications
} from '../../utils/customerNotificationStorage';
import './NotificationIcon.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const NotificationIcon = ({ iconColor = '#F0B21B' }) => {
  const [hasNotification, setHasNotification] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdownNotifications, setDropdownNotifications] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [clearingDropdown, setClearingDropdown] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const clickTimerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // Check if there are any unread notifications
    const checkForNotification = async () => {
      let hasUnread = false;

      // Check order receipt notifications (multi-entry storage + legacy fallback)
      try {
        const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);
        const receiptKey = getUserStorageKey('orderReceiptNotifications', user);
        const legacyReceiptKey = getUserStorageKey('orderReceiptNotification', user);
        const readReceipts = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
        const savedReceipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
        const receipts = Array.isArray(savedReceipts) ? [...savedReceipts] : [];

        const legacyReceipt = localStorage.getItem(legacyReceiptKey);
        if (legacyReceipt) {
          const parsedLegacy = JSON.parse(legacyReceipt);
          if (parsedLegacy && parsedLegacy.orderNumber) {
            const legacyId = parsedLegacy.id || `order-receipt-${parsedLegacy.orderNumber}`;
            if (!receipts.some((item) => item.id === legacyId)) {
              receipts.push({ ...parsedLegacy, id: legacyId });
            }
          }
        }

        const hasUnreadReceipts = receipts.some((receipt) => {
          const receiptId = receipt.id || `order-receipt-${receipt.orderNumber || ''}`;
          return receiptId && !readReceipts.includes(receiptId);
        });

        if (hasUnreadReceipts) {
          hasUnread = true;
        }
      } catch (error) {
        console.error('Error parsing receipt notifications:', error);
      }

      if (!hasUnread) {
        try {
          const refundNotificationKey = getUserStorageKey('orderRefundNotification', user);
          const readRefundKey = getUserStorageKey('readRefundNotifications', user);
          const refundNotificationData = localStorage.getItem(refundNotificationKey);
          if (refundNotificationData) {
            const data = JSON.parse(refundNotificationData);
            if (!data.dismissed) {
              const readRefunds = JSON.parse(localStorage.getItem(readRefundKey) || '[]');
              if (!readRefunds.includes('order-refund')) {
                hasUnread = true;
              }
            }
          }
        } catch (error) {
          console.error('Error parsing refund notifications:', error);
        }
      }

      // Check order status notifications from API
      if (!hasUnread && isAuthenticated) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/customer/order-notifications`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.notifications) {
              // Load dismissed and read notifications from localStorage
              const dismissedOrderKey = getUserStorageKey('dismissedOrderNotifications', user);
              const readOrderKey = getUserStorageKey('readOrderNotifications', user);
              const dismissedNotifications = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
              const readNotifications = JSON.parse(localStorage.getItem(readOrderKey) || '[]');

              // Check if there are any unread, non-dismissed notifications
              const hasUnreadStatus = data.notifications.some(notif => 
                !dismissedNotifications.includes(notif.id) && 
                !readNotifications.includes(notif.id)
              );

              if (hasUnreadStatus) {
                hasUnread = true;
              }
            }
          }
        } catch (error) {
          console.error('Error fetching order notifications:', error);
        }
      }

      setHasNotification(hasUnread);
    };

    checkForNotification();

    // Listen for storage changes (when notifications are read/dismissed in other tabs)
    const handleStorageChange = (e) => {
      if (e.key === 'orderReceiptNotification' || 
          e.key === 'orderReceiptNotifications' || 
          e.key === 'readReceiptNotifications' || 
          e.key === 'readOrderNotifications' ||
          e.key === 'dismissedOrderNotifications' ||
          e.key?.startsWith('orderReceiptNotification:') ||
          e.key?.startsWith('orderReceiptNotifications:') ||
          e.key?.startsWith('readReceiptNotifications:') ||
          e.key?.startsWith('readOrderNotifications:') ||
          e.key?.startsWith('dismissedOrderNotifications:') ||
          e.key?.startsWith('orderRefundNotification:') ||
          e.key?.startsWith('readRefundNotifications:')) {
        checkForNotification();
      }
    };

    // Listen for custom events (when notifications are read/dismissed in same tab)
    const handleNotificationUpdate = () => {
      checkForNotification();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('notificationUpdated', handleNotificationUpdate);
    
    // Also check periodically for new notifications (every 30 seconds)
    const interval = setInterval(checkForNotification, 30000);

    // Check when page becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkForNotification();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('notificationUpdated', handleNotificationUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [isAuthenticated, user]);

  const markAllReceiptsRead = () => {
    try {
      const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);
      const receiptKey = getUserStorageKey('orderReceiptNotifications', user);
      const legacyReceiptKey = getUserStorageKey('orderReceiptNotification', user);
      const readReceipts = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
      const savedReceipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
      const receipts = Array.isArray(savedReceipts) ? [...savedReceipts] : [];

      const legacyReceipt = localStorage.getItem(legacyReceiptKey);
      if (legacyReceipt) {
        const parsedLegacy = JSON.parse(legacyReceipt);
        if (parsedLegacy && parsedLegacy.orderNumber) {
          const legacyId = parsedLegacy.id || `order-receipt-${parsedLegacy.orderNumber}`;
          if (!receipts.some((item) => item.id === legacyId)) {
            receipts.push({ ...parsedLegacy, id: legacyId });
          }
        }
      }

      const nextRead = Array.isArray(readReceipts) ? [...readReceipts] : [];
      receipts.forEach((r) => {
        const id = r?.id || (r?.orderNumber ? `order-receipt-${r.orderNumber}` : null);
        if (id && !nextRead.includes(id)) nextRead.push(id);
      });
      localStorage.setItem(readReceiptKey, JSON.stringify(nextRead));
      window.dispatchEvent(new CustomEvent('notificationUpdated'));
    } catch {
      // ignore
    }
  };

  const loadDropdownNotifications = async () => {
    setDropdownLoading(true);
    try {
      const loaded = [];

      // Receipts (localStorage)
      try {
        const receiptKey = getUserStorageKey('orderReceiptNotifications', user);
        const legacyReceiptKey = getUserStorageKey('orderReceiptNotification', user);
        const readReceiptKey = getUserStorageKey('readReceiptNotifications', user);
        const savedReceipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
        const receipts = Array.isArray(savedReceipts) ? [...savedReceipts] : [];
        const readReceipts = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
        const normalizedRead = Array.isArray(readReceipts) ? readReceipts : [];

        const legacyReceipt = localStorage.getItem(legacyReceiptKey);
        if (legacyReceipt) {
          const parsedLegacy = JSON.parse(legacyReceipt);
          if (parsedLegacy && parsedLegacy.orderNumber) {
            const legacyId = parsedLegacy.id || `order-receipt-${parsedLegacy.orderNumber}`;
            if (!receipts.some((item) => item.id === legacyId)) {
              receipts.push({ ...parsedLegacy, id: legacyId });
            }
          }
        }

        receipts.forEach((r) => {
          const id = r?.id || (r?.orderNumber ? `order-receipt-${r.orderNumber}` : null);
          if (!id) return;
          loaded.push({
            id,
            type: 'order_receipt',
            title: 'Order Receipt Sent!',
            message: r.orderNumber ? `Receipt for Order #${r.orderNumber} sent to your email.` : 'Your order receipt has been sent to your email.',
            timestamp: r.timestamp || new Date().toISOString(),
            read: normalizedRead.includes(id)
          });
        });
      } catch {
        // ignore
      }

      try {
        const refundNotificationKey = getUserStorageKey('orderRefundNotification', user);
        const readRefundKey = getUserStorageKey('readRefundNotifications', user);
        const refundNotificationData = localStorage.getItem(refundNotificationKey);
        if (refundNotificationData) {
          const data = JSON.parse(refundNotificationData);
          if (!data.dismissed) {
            const readRefunds = JSON.parse(localStorage.getItem(readRefundKey) || '[]');
            const isRead = readRefunds.includes('order-refund');
            loaded.push({
              id: 'order-refund',
              type: 'order_refund',
              title: 'Refund Receipt Sent!',
              message: data.orderNumber
                ? `Refund receipt for cancelled Order #${data.orderNumber} sent to your email. Refund amount: ₱${(data.refundAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                : 'Your refund receipt has been sent to your email.',
              orderNumber: data.orderNumber,
              refundAmount: data.refundAmount,
              timestamp: data.timestamp || new Date().toISOString(),
              read: isRead
            });
          }
        }
      } catch {
        // ignore
      }

      // Order status notifications (API)
      if (isAuthenticated) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/customer/order-notifications`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.notifications)) {
              const dismissedOrderKey = getUserStorageKey('dismissedOrderNotifications', user);
              const readOrderKey = getUserStorageKey('readOrderNotifications', user);
              const dismissed = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
              const read = JSON.parse(localStorage.getItem(readOrderKey) || '[]');
              const dismissedArr = Array.isArray(dismissed) ? dismissed : [];
              const readArr = Array.isArray(read) ? read : [];

              data.notifications
                .filter((n) => !dismissedArr.includes(n.id))
                .forEach((n) => loaded.push({ ...n, read: readArr.includes(n.id) }));
            }
          }
        } catch {
          // ignore
        }
      }

      loaded.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setDropdownNotifications(loaded.slice(0, 6));
    } finally {
      setDropdownLoading(false);
    }
  };

  const dismissOrderStatusNotifications = (ids = []) => {
    if (!ids.length) return;
    try {
      const dismissedOrderKey = getUserStorageKey('dismissedOrderNotifications', user);
      const dismissed = JSON.parse(localStorage.getItem(dismissedOrderKey) || '[]');
      const dismissedArr = Array.isArray(dismissed) ? dismissed : [];
      let changed = false;
      ids.forEach((id) => {
        if (id && !dismissedArr.includes(id)) {
          dismissedArr.push(id);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(dismissedOrderKey, JSON.stringify(dismissedArr));
      }
    } catch {
      // ignore
    }
    setDropdownNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
  };

  const getDropdownIcon = (n) => {
    if (n.type === 'order_receipt') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
      );
    }
    if (n.type === 'order_refund') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      );
    }
    if (n.type === 'order_status') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    );
  };

  const handleSingleClick = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        // Opening dropdown counts as "seen" to avoid showing as new again on login.
        markAllReceiptsRead();
        loadDropdownNotifications();
      }
      return next;
    });
  };

  const handleClick = () => {
    // Delay single-click behavior so double-click can navigate.
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      handleSingleClick();
      clickTimerRef.current = null;
    }, 220);
  };

  const handleDoubleClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setOpen(false);
    navigate('/notifications');
  };

  useEffect(() => {
    const handleDocClick = (e) => {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button 
        className="header-icon-btn notification-icon-btn" 
        title={hasNotification ? "You have unread notifications" : "Notifications"}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{ position: 'relative' }}
        type="button"
      >
        <div className="icon-circle" style={{
          backgroundColor: '#f0f0f0', 
          width: '32px', 
          height: '32px', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative'
        }}>
          <FaBell style={{color: iconColor, fontSize: '1rem'}} />
          {hasNotification && (
            <span className="notification-badge" style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              backgroundColor: '#F0B21B',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '20px',
              boxShadow: '0 2px 4px rgba(240, 178, 27, 0.3)'
            }}>
              !
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <div className="notif-dropdown-header-row">
              <div>
                <div className="notif-dropdown-title">Notifications</div>
                <div className="notif-dropdown-subtitle">Single click toggles • Double click opens page</div>
              </div>
              <button
                type="button"
                className="notif-dropdown-clear"
                disabled={clearingDropdown || dropdownNotifications.length === 0}
                onClick={async () => {
                  if (clearingDropdown || dropdownNotifications.length === 0) return;
                  setClearingDropdown(true);
                  try {
                    await clearAllCustomerNotifications(user, { apiBaseUrl: API_BASE_URL });
                    setDropdownNotifications([]);
                  } finally {
                    setClearingDropdown(false);
                  }
                }}
                title="Clear all notifications"
              >
                {clearingDropdown ? 'Clear…' : 'Clear'}
              </button>
            </div>
          </div>

          <div className="notif-dropdown-body">
            {dropdownLoading ? (
              <div className="notif-dropdown-empty">Loading…</div>
            ) : dropdownNotifications.length === 0 ? (
              <div className="notif-dropdown-empty">No notifications</div>
            ) : (
              dropdownNotifications.map((n) => (
                <div key={n.id} className={`notif-dropdown-item ${n.read ? 'read' : 'unread'}`}>
                  <div className="notif-dropdown-item-icon" aria-hidden="true">
                    {getDropdownIcon(n)}
                  </div>
                  <div className="notif-dropdown-item-main">
                    <div className="notif-dropdown-item-title">
                      {n.title}
                      {!n.read && <span className="notif-dropdown-new">New</span>}
                    </div>
                    <div className="notif-dropdown-item-msg">{n.message}</div>
                    {n.type === 'order_status' && (n.orderNumber || n.transactionId || n.totalAmount || n.estimatedDeliveryDate) && (
                      <div className="notif-dropdown-order-details">
                        {n.orderNumber && (
                          <div className="notif-dropdown-order-row">
                            <span className="notif-dropdown-order-label">Order</span>
                            <span className="notif-dropdown-order-value">#{n.orderNumber}</span>
                          </div>
                        )}
                        {n.transactionId && (
                          <div className="notif-dropdown-order-row">
                            <span className="notif-dropdown-order-label">Txn</span>
                            <span className="notif-dropdown-order-value notif-mono">{n.transactionId}</span>
                          </div>
                        )}
                        {Number(n.totalAmount || 0) > 0 && (
                          <div className="notif-dropdown-order-row">
                            <span className="notif-dropdown-order-label">Amount</span>
                            <span className="notif-dropdown-order-value">
                              ₱{Number(n.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {n.estimatedDeliveryDate && (
                          <div className="notif-dropdown-order-row">
                            <span className="notif-dropdown-order-label">ETA</span>
                            <span className="notif-dropdown-order-value">{n.estimatedDeliveryDate}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="notif-dropdown-item-time">
                      {formatManilaDateTimeShort(n.timestamp)}
                    </div>
                  </div>
                  {n.type === 'order_status' && (
                    <button
                      type="button"
                      className="notif-dropdown-remove"
                      onClick={() => dismissOrderStatusNotifications([n.id])}
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            className="notif-dropdown-viewall"
            onClick={() => { setOpen(false); navigate('/notifications'); }}
          >
            View all notifications →
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationIcon;

