import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import { FaBell } from 'react-icons/fa';
import './NotificationIcon.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const NotificationIcon = ({ iconColor = '#F0B21B' }) => {
  const [hasNotification, setHasNotification] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there are any unread notifications
    const checkForNotification = async () => {
      let hasUnread = false;

      // Check order receipt notification
      const notificationData = localStorage.getItem('orderReceiptNotification');
      if (notificationData) {
        try {
          const data = JSON.parse(notificationData);
          // Only show if not dismissed AND not read
          if (!data.dismissed) {
            const readReceipts = JSON.parse(localStorage.getItem('readReceiptNotifications') || '[]');
            if (!readReceipts.includes('order-receipt')) {
              hasUnread = true;
            }
          }
        } catch (error) {
          console.error('Error parsing notification data:', error);
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
              const dismissedNotifications = JSON.parse(
                localStorage.getItem('dismissedOrderNotifications') || '[]'
              );
              const readNotifications = JSON.parse(
                localStorage.getItem('readOrderNotifications') || '[]'
              );

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
          e.key === 'readReceiptNotifications' || 
          e.key === 'readOrderNotifications' ||
          e.key === 'dismissedOrderNotifications') {
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
  }, [isAuthenticated]);

  const handleClick = () => {
    navigate('/notifications');
  };

  return (
    <button 
      className="header-icon-btn notification-icon-btn" 
      title={hasNotification ? "You have unread notifications" : "Notifications"}
      onClick={handleClick}
      style={{ position: 'relative' }}
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
  );
};

export default NotificationIcon;

