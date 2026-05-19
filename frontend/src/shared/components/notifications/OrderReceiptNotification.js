import React, { useState, useEffect, useRef } from 'react';
import { FaEnvelope, FaTimes } from 'react-icons/fa';
import './OrderReceiptNotification.css';

const getCurrentUserStorageKey = (baseKey) => {
  try {
    const raw = localStorage.getItem('userData');
    const parsed = raw ? JSON.parse(raw) : null;
    const userId = parsed?.id || parsed?.CustomerID || parsed?.email || 'guest';
    return `${baseKey}:${String(userId).toLowerCase()}`;
  } catch (e) {
    return `${baseKey}:guest`;
  }
};

const OrderReceiptNotification = ({ isOpen, onClose, onOpenGmail }) => {
  const [orderNumber, setOrderNumber] = useState(null);
  const [currentReceiptId, setCurrentReceiptId] = useState(null);
  const [, setHasNotification] = useState(false);
  const notificationRef = useRef(null);

  useEffect(() => {
    // Check if there's a pending notification in localStorage
    const checkForNotification = () => {
      try {
        const receiptKey = getCurrentUserStorageKey('orderReceiptNotifications');
        const legacyReceiptKey = getCurrentUserStorageKey('orderReceiptNotification');
        const readReceiptKey = getCurrentUserStorageKey('readReceiptNotifications');
        const receipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
        const validReceipts = Array.isArray(receipts) ? receipts : [];
        const readReceipts = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
        const normalizedRead = Array.isArray(readReceipts) ? readReceipts : [];

        // Only show the popup for receipts that are still unread.
        const activeReceipts = validReceipts.filter((r) => {
          const id = r?.id || (r?.orderNumber ? `order-receipt-${r.orderNumber}` : null);
          return id && !normalizedRead.includes(id);
        });

        if (activeReceipts.length > 0) {
          const latest = activeReceipts.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )[0];
          setHasNotification(true);
          setOrderNumber(latest.orderNumber || null);
          setCurrentReceiptId(latest.id || `order-receipt-${latest.orderNumber || ''}`);
          localStorage.setItem(legacyReceiptKey, JSON.stringify(latest));
          return;
        }

        // Fallback for legacy single receipt key
        const notificationData = localStorage.getItem(legacyReceiptKey);
        if (notificationData) {
          const data = JSON.parse(notificationData);
          const legacyId = data.id || (data.orderNumber ? `order-receipt-${data.orderNumber}` : null);
          if (legacyId && !normalizedRead.includes(legacyId)) {
            setHasNotification(true);
            setOrderNumber(data.orderNumber || null);
            setCurrentReceiptId(legacyId);
            return;
          }
        }

        setHasNotification(false);
        setOrderNumber(null);
        setCurrentReceiptId(null);
      } catch (error) {
        console.error('Error parsing notification data:', error);
        setHasNotification(false);
        setOrderNumber(null);
        setCurrentReceiptId(null);
      }
    };

    checkForNotification();

    // Listen for new order notifications (from order success page)
    const handleStorageChange = (e) => {
      if (e.key === 'orderReceiptNotification' || e.key === 'orderReceiptNotifications' ||
        e.key?.startsWith('orderReceiptNotification:') || e.key?.startsWith('orderReceiptNotifications:')) {
        checkForNotification();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically for new notifications
    const interval = setInterval(checkForNotification, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Removed click outside handler - notification should persist until explicitly dismissed

  const handleDismiss = () => {
    // Dismiss = remove receipt from storage completely.
    try {
      const receiptKey = getCurrentUserStorageKey('orderReceiptNotifications');
      const legacyReceiptKey = getCurrentUserStorageKey('orderReceiptNotification');
      const readReceiptKey = getCurrentUserStorageKey('readReceiptNotifications');
      const receipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
      const validReceipts = Array.isArray(receipts) ? receipts : [];
      const nextReceipts = currentReceiptId
        ? validReceipts.filter((r) => (r?.id || (r?.orderNumber ? `order-receipt-${r.orderNumber}` : null)) !== currentReceiptId)
        : validReceipts;
      localStorage.setItem(receiptKey, JSON.stringify(nextReceipts));

      const latestActive = nextReceipts[0];
      if (latestActive) {
        localStorage.setItem(legacyReceiptKey, JSON.stringify(latestActive));
      } else {
        localStorage.removeItem(legacyReceiptKey);
      }

      if (currentReceiptId) {
        const read = JSON.parse(localStorage.getItem(readReceiptKey) || '[]');
        const normalized = Array.isArray(read) ? read : [];
        if (!normalized.includes(currentReceiptId)) {
          normalized.push(currentReceiptId);
          localStorage.setItem(readReceiptKey, JSON.stringify(normalized));
        }
      }
      setHasNotification(false);
    } catch (error) {
      console.error('Error updating notification data:', error);
    }
    if (onClose) {
      onClose();
    }
  };

  const handleOpenGmail = () => {
    // Open Gmail in a new tab
    window.open('https://mail.google.com', '_blank');
    // Don't auto-dismiss - let user dismiss manually
    if (onOpenGmail) {
      onOpenGmail();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="order-receipt-notification" ref={notificationRef}>
      <div className="notification-content">
        <div className="notification-icon">
          <FaEnvelope />
        </div>
        <div className="notification-text">
          <div className="notification-title">Order Receipt Sent!</div>
          <div className="notification-message">
            {orderNumber 
              ? `Your receipt for Order #${orderNumber} has been sent to your email.`
              : 'Your order receipt has been sent to your email.'
            }
          </div>
        </div>
        <div className="notification-actions">
          <button 
            className="notification-button gmail-button"
            onClick={handleOpenGmail}
            title="Open Gmail"
          >
            Open Gmail
          </button>
          <button 
            className="notification-button dismiss-button"
            onClick={handleDismiss}
            title="Dismiss"
          >
            <FaTimes />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderReceiptNotification;

