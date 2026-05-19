import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import stripeService from '../services/stripeService';
import paymongoService from '../services/paymongoService';
import apiClient from '../../../shared/services/api/apiClient';
import checkoutSessionManager from '../utils/checkoutSessionManager';
import './payment.css';

// Cart Icon Component
const CartIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <circle cx="19" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const Payment = () => {
    const location = useLocation();
    const { user } = useAuth();
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('paymongo');
    const [stripeAvailable, setStripeAvailable] = useState(true);
    const [paymongoAvailable, setPaymongoAvailable] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Check for cancellation parameter and validate session
    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        if (urlParams.get('cancelled') === 'true') {
            setError('Payment was cancelled. You can try again or choose a different payment method.');
        }
        
        // Check if providers are available
        const checkPaymentAvailability = async () => {
            const [isStripeAvailable, isPayMongoAvailable] = await Promise.all([
                stripeService.isStripeAvailable(),
                paymongoService.isPayMongoAvailable()
            ]);
            setStripeAvailable(isStripeAvailable);
            setPaymongoAvailable(isPayMongoAvailable);

            if (!isStripeAvailable && !isPayMongoAvailable) {
                setError('Payment system is currently unavailable. Please contact support for alternative payment methods.');
                return;
            }

            if (isPayMongoAvailable) {
                setSelectedPaymentMethod('paymongo');
            } else if (isStripeAvailable) {
                setSelectedPaymentMethod('stripe');
            }
        };
        
        checkPaymentAvailability();
        
        // Validate session for persistent accounts
        const validateSession = async () => {
            if (user?.email) {
                const persistentAccounts = ['augmentdoe@gmail.com', 'andreijumaw@gmail.com'];
                if (persistentAccounts.includes(user.email)) {
                    try {
                        const response = await apiClient.get('/api/auth/validate-session');
                        if (response.success && response.persistentLogin) {
                            console.log('🔒 Session validated for persistent account');
                        }
                    } catch (error) {
                        console.error('Session validation failed:', error);
                    }
                }
            }
        };
        
        validateSession();
    }, [location.search, user]);

    // Get checked items and shipping info from location.state (from CheckoutPage.js), fallback to all cart items
    const checkedItems = (location.state && Array.isArray(location.state.items) && location.state.items.length > 0)
        ? location.state.items
        : JSON.parse(localStorage.getItem('cart') || '[]');
    
    // Get shipping information from checkout
    const shippingCost = location.state?.shippingCost || 0;
    const extraDeliveryFee = location.state?.extraDeliveryFee || 0;
    const subtotal = location.state?.subtotal || 0;
    const deliveryType = location.state?.deliveryType || 'pickup';
    const pickupDateTime = location.state?.pickupDateTime || null;
    
    // Calculate total: subtotal + shipping + extra delivery fee
    const total = subtotal + shippingCost + extraDeliveryFee;

    // Format price in PHP
    const formatPrice = (price) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP'
        }).format(price);
    };


    const handleEWalletPayment = async () => {
        setLoading(true);
        setError('');
        
        try {
            // Validate session before processing payment
            const sessionValid = await checkoutSessionManager.ensureValidSession(user || null, { redirectOnInvalid: false });
            if (!sessionValid) {
                setError('Your session looks expired. Please sign in again before confirming payment.');
                setLoading(false);
                return;
            }

            // Get customer email from user context or localStorage
            const customerEmail = user?.email || JSON.parse(localStorage.getItem('user') || '{}').email;
            
            if (!customerEmail) {
                setError('Missing account email for checkout. Please refresh the page or sign in again.');
                return;
            }

            // Validate items
            if (!checkedItems || checkedItems.length === 0) {
                setError('No items found in your cart. Please add items before proceeding to payment.');
                return;
            }

            // Prepare items for checkout with enhanced product information
            const checkoutItems = checkedItems.map(item => {
                const variationId = item.product?.selectedVariation?.id || null;
                const variationName = item.product?.selectedVariation?.name || null;
                const useOriginalProduct = item.product?.useOriginalProduct || false;
                
                console.log('PaymentPage: Processing cart item:', {
                    itemName: item.product?.name || item.name,
                    productId: item.product?.id || item.product?.ProductID || item.id,
                    variationId: variationId,
                    variationName: variationName,
                    useOriginalProduct: useOriginalProduct,
                    selectedVariation: item.product?.selectedVariation,
                    hasVariation: !!variationId
                });
                
                const productIdentifier =
                    item.product?.id ||
                    item.product?.ProductID ||
                    item.id ||
                    item.productId;

                return {
                    name: item.product?.name || item.name || 'Product',
                    quantity: item.quantity,
                    price: item.price,
                    id: productIdentifier,
                    productId: productIdentifier,
                    variationId: variationId,
                    variationName: variationName,
                    useOriginalProduct: useOriginalProduct
                };
            });
            
            // No shipping cost added
            
            console.log('Creating checkout session:', {
                provider: selectedPaymentMethod,
                items: checkoutItems,
                email: customerEmail,
                deliveryType: deliveryType,
                shippingCost: shippingCost
            });
            
            // Debug: Log each item's variation data
            checkoutItems.forEach((item, index) => {
                console.log(`PaymentPage: Item ${index + 1} variation data:`, {
                    name: item.name,
                    id: item.id,
                    variationId: item.variationId,
                    variationName: item.variationName,
                    useOriginalProduct: item.useOriginalProduct,
                    hasVariation: !!item.variationId
                });
            });
            
            // Clear the cart before redirecting to Stripe (cart will be cleared by webhook after successful payment)
            localStorage.removeItem(`shopping-cart-${user?.id || 'guest'}`);
            
            const checkoutOptions = {
                deliveryType: deliveryType,
                pickupDate: pickupDateTime || null,
                shippingCost: shippingCost,
                extraDeliveryFee: extraDeliveryFee,
                subtotal: subtotal,
                total: total,
                shippingAddressId: location.state?.shippingAddressId || null
            };

            if (selectedPaymentMethod === 'paymongo') {
                if (!paymongoAvailable) {
                    throw new Error('PayMongo is currently unavailable.');
                }
                await paymongoService.createCheckoutSession(checkoutItems, customerEmail, 'E-Wallet / Bank Transfer', checkoutOptions);
            } else {
                if (!stripeAvailable) {
                    throw new Error('Stripe is currently unavailable.');
                }
                localStorage.setItem('lastPaymentProvider', 'stripe');
                await stripeService.createCheckoutSession(checkoutItems, customerEmail, 'Bank Transfer', checkoutOptions);
            }
            
            // Note: Cart will be cleared by webhook after successful payment
            // Don't clear it here in case payment fails
            
        } catch (error) {
            console.error('E-Wallet payment error:', error);

            // Handle checkout-specific errors first
            const handled = checkoutSessionManager.handleCheckoutError(error, `${selectedPaymentMethod}-checkout`);
            if (!handled) {
                // Provide more specific error messages based on error type
                let errorMessage = 'Payment setup failed: ';
                if (error.message.includes('checkout session')) {
                    errorMessage += 'Unable to create payment session. Please try again.';
                } else if (error.message.includes('PayMongo')) {
                    errorMessage += 'PayMongo is temporarily unavailable. Please try Stripe or try again later.';
                } else if (error.message.includes('not configured') || error.message.includes('not properly configured')) {
                    errorMessage += 'Payment system is not configured. Please contact support for alternative payment methods.';
                } else if (error.message.includes('Stripe')) {
                    errorMessage += 'Payment service temporarily unavailable. Please try again later.';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMessage += 'Network error. Please check your connection and try again.';
                } else {
                    errorMessage += error.message;
                }

                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="payment-page">
            <div className="payment-container">
                {/* Error Display */}
                {error && (
                    <div className="payment-error-message">
                        {error}
                    </div>
                )}

                {/* Payment Methods Section */}
                <div className="payment-methods-section">
                    <h2 className="section-title">Select Payment Method</h2>
                    
                    <div className="payment-methods-list">
                        <div
                            className={`payment-method-option ${selectedPaymentMethod === 'paymongo' ? 'selected' : ''} ${!paymongoAvailable ? 'disabled' : ''}`}
                            onClick={() => paymongoAvailable && setSelectedPaymentMethod('paymongo')}
                        >
                            <div className="payment-method-radio">
                                <div className={`radio-button ${selectedPaymentMethod === 'paymongo' ? 'checked' : ''}`}>
                                    {selectedPaymentMethod === 'paymongo' && <div className="radio-dot"></div>}
                                </div>
                            </div>
                            <div className="payment-method-icon">
                                <svg width="64" height="24" viewBox="0 0 64 24" fill="none">
                                    <rect x="0" y="0" width="64" height="24" rx="4" fill="#6D28D9"/>
                                    <text x="32" y="16" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif">PAYMONGO</text>
                                </svg>
                            </div>
                            <span className="payment-method-name">PayMongo</span>
                            <span className="payment-method-details">
                                {paymongoAvailable ? 'GCash, Maya, Card, GrabPay' : 'Currently unavailable'}
                            </span>
                        </div>

                        {/* Stripe */}
                        <div 
                            className={`payment-method-option ${selectedPaymentMethod === 'stripe' ? 'selected' : ''} ${!stripeAvailable ? 'disabled' : ''}`}
                            onClick={() => stripeAvailable && setSelectedPaymentMethod('stripe')}
                        >
                            <div className="payment-method-radio">
                                <div className={`radio-button ${selectedPaymentMethod === 'stripe' ? 'checked' : ''}`}>
                                    {selectedPaymentMethod === 'stripe' && <div className="radio-dot"></div>}
                                </div>
                            </div>
                            <div className="payment-method-icon">
                                <img 
                                    src="https://stripe.com/img/v3/home/logo.png" 
                                    alt="Stripe" 
                                    style={{ width: '64px', height: 'auto', maxHeight: '24px', objectFit: 'contain' }}
                                    onError={(e) => {
                                        // Fallback to SVG if image fails to load
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                                <svg width="64" height="24" viewBox="0 0 64 24" fill="none" style={{ display: 'none' }}>
                                    <rect x="0" y="0" width="64" height="24" rx="4" fill="#635BFF"/>
                                    <text x="32" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial, sans-serif">STRIPE</text>
                                </svg>
                            </div>
                            <span className="payment-method-name">Stripe</span>
                            <span className="payment-method-details">
                                {stripeAvailable ? 'Secure card processing' : 'Currently unavailable'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Order Summary Section */}
                <div className="order-summary-section">
                    <div className="order-summary-header">
                        <div className="summary-icon">
                            <CartIcon />
                        </div>
                        <h2 className="section-title">Order Summary</h2>
                    </div>
                    
                    <div className="order-summary-content">
                        {/* Products List */}
                        <div className="order-products-list">
                            {checkedItems.map((item, index) => {
                                const productName = item.product?.name || item.name || 'Product';
                                const variationName = item.product?.selectedVariation?.name || item.variationName || null;
                                const displayName = variationName ? `${productName} (${variationName})` : productName;
                                
                                return (
                                    <div key={index} className="order-product-item">
                                        <div className="product-item-info">
                                            <span className="product-item-name">{displayName}</span>
                                            <span className="product-item-quantity">Qty: {item.quantity}</span>
                                        </div>
                                        <span className="product-item-price">{formatPrice((item.price || 0) * (item.quantity || 1))}</span>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="summary-divider"></div>
                        
                        <div className="summary-item">
                            <span className="summary-label">Sub Total</span>
                            <span className="summary-value">{formatPrice(subtotal)}</span>
                        </div>
                        
                        <div className="summary-item">
                            <span className="summary-label">Shipping</span>
                            <span className="summary-value">{formatPrice(shippingCost)}</span>
                        </div>
                        {extraDeliveryFee > 0 && (
                            <div className="summary-item">
                                <span className="summary-label">Extra Delivery Fee (Qty &gt; 4)</span>
                                <span className="summary-value">{formatPrice(extraDeliveryFee)}</span>
                            </div>
                        )}
                        <div className="summary-item total">
                            <span className="summary-label">Total</span>
                            <span className="summary-value">{formatPrice(total)}</span>
                        </div>
                    </div>

                    <button 
                        className="confirm-payment-btn"
                        onClick={handleEWalletPayment}
                        disabled={loading || checkedItems.length === 0}
                    >
                        {loading ? 'Processing...' : 'Confirm Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Payment;
