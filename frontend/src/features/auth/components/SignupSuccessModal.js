import React from 'react';
import './SignupSuccessModal.css';

const SignupSuccessModal = ({ isOpen, onClose, userData }) => {
    if (!isOpen) return null;

    const handleContinue = () => {
        onClose();
        // The parent component will handle navigation
    };

    return (
        <div className="signup-success-overlay" onClick={onClose}>
            <div className="signup-success-modal" onClick={(e) => e.stopPropagation()}>
                <div className="signup-success-header">
                    <div className="success-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" fill="#10B981"/>
                            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <h2 className="signup-success-title">Welcome to Design Excellence!</h2>
                    <p className="signup-success-subtitle">
                        Your account has been created successfully
                    </p>
                </div>
                
                <div className="signup-success-content">
                    <div className="success-message">
                        <div className="success-icon-large">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" fill="#10B981"/>
                                <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <p className="success-main-text">You're all set! You can now:</p>
                        <ul className="features-list">
                            <li>
                                <div className="feature-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#F0B21B" stroke="#F0B21B" strokeWidth="0.5"/>
                                    </svg>
                                </div>
                                <span>Browse our premium office furniture collection</span>
                            </li>
                            <li>
                                <div className="feature-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="#F0B21B" strokeWidth="2" fill="none"/>
                                        <path d="M8 7L12 11L16 7" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <span>Visualize products in 3D before you buy</span>
                            </li>
                            <li>
                                <div className="feature-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M5 13L9 17L19 7" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                        <path d="M1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12Z" stroke="#F0B21B" strokeWidth="2" fill="none"/>
                                    </svg>
                                </div>
                                <span>Place bulk orders for your business needs</span>
                            </li>
                            <li>
                                <div className="feature-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                    </svg>
                                </div>
                                <span>Get expert design consultation and support</span>
                            </li>
                        </ul>
                    </div>
                </div>
                
                <div className="signup-success-footer">
                    <button className="success-btn success-btn-primary" onClick={handleContinue}>
                        Start Shopping
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignupSuccessModal;
