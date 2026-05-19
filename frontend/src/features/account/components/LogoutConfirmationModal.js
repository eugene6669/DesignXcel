import React from 'react';
import { LogoutIcon } from '../../../shared/components/ui/SvgIcons';
import './LogoutConfirmationModal.css';

const LogoutConfirmationModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="logout-modal-overlay" onClick={onClose}>
            <div className="logout-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="logout-modal-header">
                    <div className="logout-modal-icon">
                        <LogoutIcon size={32} />
                    </div>
                    <h2 className="logout-modal-title">Confirm Logout</h2>
                </div>
                
                <div className="logout-modal-body">
                    <p className="logout-modal-message">
                        Are you sure you want to sign out of your account?
                    </p>
                </div>

                <div className="logout-modal-actions">
                    <button 
                        className="logout-modal-cancel-btn"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button 
                        className="logout-modal-confirm-btn"
                        onClick={onConfirm}
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogoutConfirmationModal;

