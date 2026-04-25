import React from 'react';
import { createPortal } from 'react-dom';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'default' }) => {
  if (!isOpen) return null;

  if (typeof document === 'undefined') {
    return null;
  }

  // Determine button styling based on type
  const getConfirmButtonClass = () => {
    switch (type) {
      case 'warning':
        return 'confirmation-btn confirmation-btn-warning';
      case 'danger':
        return 'confirmation-btn confirmation-btn-danger';
      case 'success':
        return 'confirmation-btn confirmation-btn-success';
      default:
        return 'confirmation-btn confirmation-btn-info';
    }
  };

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'warning':
      case 'danger':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'success':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
    }
  };

  const renderMessage = () => {
    const defaultMessage = 'Are you sure you want to proceed?';
    const content = message !== undefined && message !== null && message !== '' ? message : defaultMessage;

    if (React.isValidElement(content)) {
      return (
        <div className="confirmation-modal-message rich-content">
          {content}
        </div>
      );
    }

    if (Array.isArray(content)) {
      return (
        <div className="confirmation-modal-message rich-content">
          {content}
        </div>
      );
    }

    return (
      <div className="confirmation-modal-message">
        {content}
      </div>
    );
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && typeof onClose === 'function') {
      onClose();
    }
  };

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
  };

  return (
    createPortal(
      <div className="confirmation-modal-overlay" onClick={handleOverlayClick}>
        <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
          <button className="confirmation-modal-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          
          <div className="confirmation-modal-content">
            <div className="confirmation-modal-icon">
              {getIcon()}
            </div>
            <h3 className="confirmation-modal-title">{title || 'Confirm Action'}</h3>
            {renderMessage()}
          </div>
          
          <div className="confirmation-modal-actions">
            {cancelText !== '' && (
              <button 
                onClick={handleClose}
                className="confirmation-btn confirmation-btn-cancel"
              >
                {cancelText}
              </button>
            )}
            <button 
              onClick={handleConfirm}
              className={getConfirmButtonClass()}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  );
};

export default ConfirmationModal;
