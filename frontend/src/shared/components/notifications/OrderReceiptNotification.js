import React, { useState, useEffect, useRef } from 'react';
import { FaEnvelope, FaTimes } from 'react-icons/fa';
import './OrderReceiptNotification.css';

const OrderReceiptNotification = ({ isOpen, onClose, onOpenGmail }) => {
  const [orderNumber, setOrderNumber] = useState(null);
  const [currentReceiptId, setCurrentReceiptId] = useState(null);
  const [hasNotification, setHasNotification] = useState(false);
  const notificationRef = useRef(null);

  useEffect(() => {
    // Check if there's a pending notification in localStorage
    const checkForNotification = () => {
      try {
        const receipts = JSON.parse(localStorage.getItem('orderReceiptNotifications') || '[]');
        const validReceipts = Array.isArray(receipts) ? receipts : [];
        const activeReceipts = validReceipts;

        if (activeReceipts.length > 0) {
          const latest = activeReceipts.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )[0];
          setHasNotification(true);
          setOrderNumber(latest.orderNumber || null);
          setCurrentReceiptId(latest.id || `order-receipt-${latest.orderNumber || ''}`);
          localStorage.setItem('orderReceiptNotification', JSON.stringify(latest));
          return;
        }

        // Fallback for legacy single receipt key
        const notificationData = localStorage.getItem('orderReceiptNotification');
        if (notificationData) {
          const data = JSON.parse(notificationData);
          setHasNotification(true);
          setOrderNumber(data.orderNumber || null);
          setCurrentReceiptId(data.id || `order-receipt-${data.orderNumber || ''}`);
          return;
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
      if (e.key === 'orderReceiptNotification' || e.key === 'orderReceiptNotifications') {
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
    // Mark as dismissed in localStorage
    try {
      const receipts = JSON.parse(localStorage.getItem('orderReceiptNotifications') || '[]');
      const validReceipts = Array.isArray(receipts) ? receipts : [];
      const updatedReceipts = validReceipts;
      localStorage.setItem('orderReceiptNotifications', JSON.stringify(updatedReceipts));

      const latestActive = updatedReceipts[0];
      if (latestActive) {
        localStorage.setItem('orderReceiptNotification', JSON.stringify(latestActive));
      } else {
        localStorage.removeItem('orderReceiptNotification');
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

