import React, { useState, useEffect, useRef } from 'react';
import './TermsModal.css';
const TermsModal = ({ isOpen, onClose, type = 'terms', onReadComplete, canAccept = false }) => {
    const [termsData, setTermsData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const [isAccepted, setIsAccepted] = useState(false);
    const [, setIsContentScrollable] = useState(true);
    const contentRef = useRef(null);
    const scrollContainerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchTermsData();
            setHasScrolledToBottom(false);
            setIsAccepted(false);
        }
    }, [isOpen, type]);

    // Check if content is scrollable after loading
    useEffect(() => {
        if (!loading && scrollContainerRef.current && contentRef.current && isOpen) {
            // Use setTimeout to ensure DOM is fully rendered
            const checkScrollability = () => {
                const container = scrollContainerRef.current;
                if (container) {
                    const scrollHeight = container.scrollHeight;
                    const clientHeight = container.clientHeight;
                    const needsScrolling = scrollHeight > clientHeight + 10;
                    setIsContentScrollable(needsScrolling);
                    
                    // If content doesn't require scrolling, automatically enable
                    if (!needsScrolling) {
                        setHasScrolledToBottom(true);
                    } else {
                        // Reset if content becomes scrollable
                        setHasScrolledToBottom(false);
                    }
                }
            };
            
            setTimeout(checkScrollability, 100);
            
            // Also check on window resize
            window.addEventListener('resize', checkScrollability);
            return () => window.removeEventListener('resize', checkScrollability);
        }
    }, [loading, termsData, isOpen]);


    const fetchTermsData = async () => {
        setLoading(true);
        try {
            // Fetch terms from backend API
            const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiBase}/api/terms`);
            const data = await response.json();
            if (data.success) {
                setTermsData(data.terms);
            }
        } catch (error) {
            console.error('Error fetching terms:', error);
            // Fallback content if API fails
            setTermsData({
                signupTermsTitle: "Terms and Conditions",
                signupTermsContent: "By using our service, you agree to our terms and conditions...",
                privacyPolicyTitle: "Privacy Policy", 
                privacyPolicyContent: "We respect your privacy and are committed to protecting your personal information..."
            });
        } finally {
            setLoading(false);
        }
    };

    const handleScroll = () => {
        if (!scrollContainerRef.current || !contentRef.current) return;
        
        const container = scrollContainerRef.current;
        
        // Check if scrolled to bottom (with 50px threshold for better UX)
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
        
        if (isAtBottom && !hasScrolledToBottom) {
            setHasScrolledToBottom(true);
        }
    };

    const handleAccept = () => {
        if (hasScrolledToBottom) {
            setIsAccepted(true);
        }
    };

    const handleAcceptAndContinue = () => {
        if (isAccepted && onReadComplete) {
            onReadComplete(true);
            // Modal will be closed by onReadComplete callback
        }
    };

    const getContent = () => {
        if (!termsData) return null;
        
        if (type === 'terms') {
            return {
                title: termsData.signupTermsTitle || "Terms and Conditions",
                content: termsData.signupTermsContent || "By using our service, you agree to our terms and conditions..."
            };
        } else {
            return {
                title: termsData.privacyPolicyTitle || "Privacy Policy",
                content: termsData.privacyPolicyContent || "We respect your privacy and are committed to protecting your personal information..."
            };
        }
    };

    const content = getContent();

    if (!isOpen) return null;

    return (
        <div className="terms-modal-overlay" onClick={onClose}>
            <div className="terms-modal" onClick={(e) => e.stopPropagation()}>
                <div className="terms-modal-header">
                    <h2 className="terms-modal-title">
                        {loading ? 'Loading...' : content?.title}
                    </h2>
                    <button className="terms-modal-close" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
                
                <div 
                    className="terms-modal-content" 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                >
                    {loading ? (
                        <div className="terms-modal-loading">
                            <p>Loading content...</p>
                        </div>
                    ) : (
                        <div className="terms-modal-text" ref={contentRef}>
                            {content?.content ? (
                                <div dangerouslySetInnerHTML={{ __html: content.content.replace(/\n/g, '<br/>') }} />
                            ) : (
                                <p>Content not available at the moment.</p>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="terms-modal-footer">
                    <div className="terms-checkbox-container">
                        <input
                            type="checkbox"
                            id={`terms-checkbox-${type}`}
                            checked={isAccepted}
                            onChange={handleAccept}
                            disabled={!hasScrolledToBottom}
                            className={!hasScrolledToBottom ? 'terms-checkbox-disabled' : ''}
                        />
                        <label 
                            htmlFor={`terms-checkbox-${type}`}
                            className={!hasScrolledToBottom ? 'terms-label-disabled' : ''}
                        >
                            I have read and agree to the {type === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
                        </label>
                    </div>
                    <div className="terms-modal-actions">
                        <button className="terms-modal-btn terms-modal-btn-secondary" onClick={onClose}>
                            Close
                        </button>
                        <button 
                            className="terms-modal-btn terms-modal-btn-primary" 
                            onClick={handleAcceptAndContinue}
                            disabled={!isAccepted}
                        >
                            Accept & Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsModal;
