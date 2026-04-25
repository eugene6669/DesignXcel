import React, { useState, useEffect, useRef } from 'react';
import { FaEnvelope, FaTimes } from 'react-icons/fa';
import './OrderReceiptNotification.css';

const OrderReceiptNotification = ({ isOpen, onClose, onOpenGmail }) => {
  const [orderNumber, setOrderNumber] = useState(null);
  const [hasNotification, setHasNotification] = useState(false);
  const notificationRef = useRef(null);

  useEffect(() => {
    // Check if there's a pending notification in localStorage
    const checkForNotification = () => {
      const notificationData = localStorage.getItem('orderReceiptNotification');
      if (notificationData) {
        try {
          const data = JSON.parse(notificationData);
          // Check if notification is not dismissed and is recent (within last 24 hours)
          const notificationTime = new Date(data.timestamp);
          const now = new Date();
          const hoursSinceNotification = (now - notificationTime) / (1000 * 60 * 60);
          
          if (!data.dismissed && hoursSinceNotification < 24) {
            setHasNotification(true);
            setOrderNumber(data.orderNumber);
          } else {
            // Clean up old notifications
            localStorage.removeItem('orderReceiptNotification');
            setHasNotification(false);
          }
        } catch (error) {
          console.error('Error parsing notification data:', error);
          localStorage.removeItem('orderReceiptNotification');
          setHasNotification(false);
        }
      } else {
        setHasNotification(false);
      }
    };

    checkForNotification();

    // Listen for new order notifications (from order success page)
    const handleStorageChange = (e) => {
      if (e.key === 'orderReceiptNotification') {
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
    const notificationData = localStorage.getItem('orderReceiptNotification');
    if (notificationData) {
      try {
        const data = JSON.parse(notificationData);
        data.dismissed = true;
        localStorage.setItem('orderReceiptNotification', JSON.stringify(data));
        setHasNotification(false);
      } catch (error) {
        console.error('Error updating notification data:', error);
      }
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

