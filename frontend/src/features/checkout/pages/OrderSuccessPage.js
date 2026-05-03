import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import paymentService from '../services/paymentService';
import stripeService from '../services/stripeService';
import apiClient from '../../../shared/services/api/apiClient';
import './order-success.css';

// Cart Icon Component
const CartIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <circle cx="19" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

/** Persist each order receipt separately so older receipts are not overwritten by newer checkouts. */
const persistOrderReceiptNotification = (orderNumber) => {
    if (!orderNumber) return;
    const receiptId = `order-receipt-${String(orderNumber)}`;
    const notificationData = {
        id: receiptId,
        orderNumber: String(orderNumber),
        timestamp: new Date().toISOString(),
        dismissed: false
    };
    try {
        const existing = JSON.parse(localStorage.getItem('orderReceiptNotifications') || '[]');
        const withoutCurrent = existing.filter((item) => item.id !== receiptId);
        const next = [notificationData, ...withoutCurrent];
        localStorage.setItem('orderReceiptNotifications', JSON.stringify(next));
    } catch {
        localStorage.setItem('orderReceiptNotifications', JSON.stringify([notificationData]));
    }

    // Backward compatibility for components still checking the legacy single-item key.
    localStorage.setItem('orderReceiptNotification', JSON.stringify(notificationData));

    try {
        const read = JSON.parse(localStorage.getItem('readReceiptNotifications') || '[]');
        const next = read.filter((id) => id !== receiptId);
        localStorage.setItem('readReceiptNotifications', JSON.stringify(next));
    } catch {
        localStorage.setItem('readReceiptNotifications', '[]');
    }
    window.dispatchEvent(new CustomEvent('notificationUpdated'));
    window.dispatchEvent(new Event('storage'));
};

const OrderSuccessPage = () => {
    const { orderId } = useParams();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user, isAuthenticated } = useAuth();
    const { order, message, paymentStatus, paymentMethod } = location.state || {};
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [orderItems, setOrderItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Function to trigger webhook simulation for development
    const triggerWebhookSimulation = async (session) => {
        try {
            console.log('🔄 Triggering webhook simulation for development...');
            
            // First, check if order already exists to prevent duplicates
            try {
                const existingOrderResult = await apiClient.get(`/api/order/stripe-session/${session.id}`);
                if (existingOrderResult.success && existingOrderResult.order) {
                    console.log('✅ Order already exists, skipping webhook simulation');
                    const order = existingOrderResult.order;
                    // Calculate subtotal from order
                    const orderTotal = parseFloat(order.TotalAmount) || 0;
                    const orderShipping = parseFloat(order.DeliveryCost) || 0;
                    const orderExtraDeliveryFee = parseFloat(order.ExtraDeliveryFee) || 0;
                    const calculatedSubtotal = orderTotal - orderShipping - orderExtraDeliveryFee;
                    
                    if (order.ReferenceNumber || order.OrderID) {
                        persistOrderReceiptNotification(order.ReferenceNumber || order.OrderID);
                    }
                    
                    setPaymentDetails(prev => ({
                        ...prev,
                        orderId: order.ReferenceNumber || order.OrderID,
                        referenceNumber: order.ReferenceNumber,
                        transactionId: order.TransactionID,
                        status: order.Status,
                        paymentStatus: order.PaymentStatus,
                        deliveryType: order.DeliveryType,
                        deliveryTypeName: order.DeliveryTypeName,
                        deliveryCost: order.DeliveryCost,
                        extraDeliveryFee: orderExtraDeliveryFee,
                        pickupDate: order.PickupDate,
                        subtotal: calculatedSubtotal,
                        customerInfo: {
                            name: order.FullName,
                            email: order.Email
                        },
                        address: {
                            houseNumber: order.HouseNumber,
                            street: order.Street,
                            barangay: order.Barangay,
                            city: order.City,
                            province: order.Province,
                            postalCode: order.PostalCode,
                            country: order.Country,
                            phoneNumber: order.PhoneNumber
                        }
                    }));
                    
                    // Set order items if available
                    if (order.items && Array.isArray(order.items)) {
                        setOrderItems(order.items);
                    }
                    return;
                }
            } catch (err) {
                console.log('Order not found, proceeding with webhook simulation...');
            }
            
            // Check order type first
            const orderType = session.metadata?.orderType || 'regular';
            console.log('[OrderSuccessPage] Order type:', orderType);
            
            // Parse cart/items based on order type
            let cart = [];
            let bulkItems = [];
            
            if (orderType === 'bulk') {
                // Parse bulk order items
                if (session.metadata && session.metadata.items) {
                    try {
                        bulkItems = JSON.parse(session.metadata.items);
                        console.log('[OrderSuccessPage] Parsed bulk order items:', bulkItems.length);
                    } catch (e) {
                        console.error('Failed to parse bulk order items from metadata:', e);
                    }
                }
            } else {
                // Parse regular order cart
                if (session.metadata && session.metadata.cart) {
                    try {
                        cart = JSON.parse(session.metadata.cart);
                        console.log('[OrderSuccessPage] Parsed cart items:', cart.length);
                    } catch (e) {
                        console.error('Failed to parse cart from metadata:', e);
                    }
                }
            }
            
            // Log session metadata for debugging
            console.log('[OrderSuccessPage] Session metadata:', JSON.stringify(session.metadata, null, 2));
            console.log('[OrderSuccessPage] session.metadata.pickupDate:', session.metadata?.pickupDate);
            console.log('[OrderSuccessPage] session.metadata.pickupDateTime:', session.metadata?.pickupDateTime);
            
            // Call the test webhook endpoint
            const webhookPayload = {
                sessionId: session.id,
                email: session.customer_email,
                orderType: orderType, // IMPORTANT: Include orderType
                items: orderType === 'bulk' ? bulkItems : cart, // Use bulkItems for bulk orders, cart for regular
                cart: orderType === 'bulk' ? [] : cart, // Keep cart for backward compatibility
                total: session.amount_total,
                paymentMethod: session.metadata?.paymentMethod || 'E-Wallet',
                deliveryType: session.metadata?.deliveryType || 'pickup',
                pickupDate: session.metadata?.pickupDate || session.metadata?.pickupDateTime || '', // IMPORTANT: Include pickupDate
                shippingCost: session.metadata?.shippingCost || '',
                extraDeliveryFee: session.metadata?.extraDeliveryFee || '',
                subtotal: session.metadata?.subtotal || '',
                discount: session.metadata?.discount || '',
                shippingAddressId: session.metadata?.shippingAddressId || ''
            };
            
            console.log('[OrderSuccessPage] Webhook payload pickupDate:', webhookPayload.pickupDate);
            console.log('[OrderSuccessPage] Full webhook payload:', JSON.stringify(webhookPayload, null, 2));
            
            const webhookResponse = await apiClient.post('/api/test-webhook', webhookPayload);
            
            if (webhookResponse.success) {
                console.log('✅ Webhook simulation successful, order created');
                
                // Wait a moment for the order to be created, then fetch it
                setTimeout(async () => {
                    try {
                        const orderResult = await apiClient.get(`/api/order/stripe-session/${session.id}`);
                        if (orderResult.success && orderResult.order) {
                            const order = orderResult.order;
                            console.log('✅ Found newly created order:', order);
                            // Extract extra delivery fee from session metadata if available
                            const subtotalFromMetadata = parseFloat(session.metadata?.subtotal) || 0;
                            const extraDeliveryFeeFromMetadata = parseFloat(session.metadata?.extraDeliveryFee) || 0;
                            const orderExtraDeliveryFee = parseFloat(order.ExtraDeliveryFee) || extraDeliveryFeeFromMetadata || 0;
                            
                            if (order.ReferenceNumber || order.OrderID) {
                                persistOrderReceiptNotification(order.ReferenceNumber || order.OrderID);
                            }
                            
                            setPaymentDetails(prev => ({
                                ...prev,
                                orderId: order.ReferenceNumber || order.OrderID,
                                referenceNumber: order.ReferenceNumber,
                                transactionId: order.TransactionID,
                                status: order.Status,
                                paymentStatus: order.PaymentStatus,
                                deliveryType: order.DeliveryType,
                                deliveryTypeName: order.DeliveryTypeName,
                                deliveryCost: order.DeliveryCost,
                                extraDeliveryFee: orderExtraDeliveryFee,
                                pickupDate: order.PickupDate,
                                subtotal: subtotalFromMetadata,
                                customerInfo: {
                                    name: order.FullName,
                                    email: order.Email
                                },
                                address: {
                                    houseNumber: order.HouseNumber,
                                    street: order.Street,
                                    barangay: order.Barangay,
                                    city: order.City,
                                    province: order.Province,
                                    postalCode: order.PostalCode,
                                    country: order.Country,
                                    phoneNumber: order.PhoneNumber
                                }
                            }));
                            
                            // Set order items if available
                            if (order.items && Array.isArray(order.items)) {
                                setOrderItems(order.items);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to fetch newly created order:', err);
                    }
                }, 1000);
            } else {
                console.error('❌ Webhook simulation failed:', webhookResponse.message);
            }
        } catch (error) {
            console.error('❌ Error triggering webhook simulation:', error);
        }
    };

    useEffect(() => {
        const sessionId = searchParams.get('session_id');
        
        // Check if we need to restore session after Stripe redirect
        const restoreSessionIfNeeded = async () => {
            if (!isAuthenticated) {
                // Check if this is a persistent account that needs session restoration
                const persistentAccounts = ['augmentdoe@gmail.com', 'andreijumaw@gmail.com'];
                const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
                
                if (savedUser.email && persistentAccounts.includes(savedUser.email)) {
                    console.log('🔒 Attempting to restore session for persistent account:', savedUser.email);
                    try {
                        const response = await apiClient.post('/api/auth/restore-session', {
                            email: savedUser.email
                        });
                        
                        if (response.success) {
                            console.log('✅ Session restored successfully');
                            // Dispatch event to update auth context instead of reloading
                            window.dispatchEvent(new CustomEvent('sessionRestored', { 
                                detail: { user: response.user } 
                            }));
                        }
                    } catch (error) {
                        console.error('❌ Failed to restore session:', error);
                    }
                }
            }
        };
        
        // If we have a Stripe session ID, fetch the session details
        if (sessionId) {
            setLoading(true);
            stripeService.getCheckoutSession(sessionId)
                .then(result => {
                    if (result.success) {
                        const session = result.session;
                        console.log('Retrieved Stripe session details:', session);

                        // Extract subtotal, extra delivery fee, and total from metadata
                        const subtotal = parseFloat(session.metadata?.subtotal) || 0;
                        const shippingCost = parseFloat(session.metadata?.shippingCost) || 0;
                        const extraDeliveryFee = parseFloat(session.metadata?.extraDeliveryFee) || 0;
                        
                        setPaymentDetails({
                            status: session.payment_status || 'completed',
                            method: 'stripe',
                            amount: session.amount_total / 100, // Convert from cents
                            currency: session.currency || 'PHP',
                            customerEmail: session.customer_email,
                            subtotal: subtotal,
                            shippingCost: shippingCost,
                            extraDeliveryFee: extraDeliveryFee,
                            completedAt: new Date().toISOString()
                        });

                        // Try to restore session after successful payment
                        restoreSessionIfNeeded();

                        // Also try to fetch the actual order from the database using Stripe session ID
                        apiClient.get(`/api/order/stripe-session/${sessionId}`)
                            .then(orderResult => {
                                if (orderResult.success && orderResult.order) {
                                    const order = orderResult.order;
                                    console.log('Found order in database by session ID:', order);
                                    
                                    if (order.ReferenceNumber || order.OrderID) {
                                        persistOrderReceiptNotification(order.ReferenceNumber || order.OrderID);
                                    }
                                    
                                    // Update payment details with actual order information
                                    // Extract extra delivery fee from session metadata if available
                                    const subtotalFromMetadata = parseFloat(session.metadata?.subtotal) || 0;
                                    const extraDeliveryFeeFromMetadata = parseFloat(session.metadata?.extraDeliveryFee) || 0;
                                    const orderExtraDeliveryFee = parseFloat(order.ExtraDeliveryFee) || extraDeliveryFeeFromMetadata || 0;
                                    
                                    setPaymentDetails(prev => ({
                                        ...prev,
                                        orderId: order.ReferenceNumber || order.OrderID,
                                        referenceNumber: order.ReferenceNumber,
                                        transactionId: order.TransactionID,
                                        status: order.Status,
                                        paymentStatus: order.PaymentStatus,
                                        deliveryType: order.DeliveryType,
                                        deliveryTypeName: order.DeliveryTypeName,
                                        deliveryCost: order.DeliveryCost,
                                        extraDeliveryFee: orderExtraDeliveryFee,
                                        pickupDate: order.PickupDate,
                                        subtotal: subtotalFromMetadata,
                                        customerInfo: {
                                            name: order.FullName,
                                            email: order.Email
                                        },
                                        address: {
                                            houseNumber: order.HouseNumber,
                                            street: order.Street,
                                            barangay: order.Barangay,
                                            city: order.City,
                                            province: order.Province,
                                            postalCode: order.PostalCode,
                                            country: order.Country,
                                            phoneNumber: order.PhoneNumber
                                        }
                                    }));
                                    
                                    // Set order items if available
                                    if (order.items && Array.isArray(order.items)) {
                                        setOrderItems(order.items);
                                    }
                                } else {
                                    // Order not found in database - trigger webhook simulation for development
                                    console.log('Order not found in database, triggering webhook simulation...');
                                    triggerWebhookSimulation(session);
                                }
                            })
                            .catch(err => {
                                console.log('Could not fetch order by session ID, trying webhook simulation:', err);
                                // Trigger webhook simulation for development
                                triggerWebhookSimulation(session);
                            });
                    }
                })
                .catch(err => {
                    console.error('Error fetching Stripe session:', err);
                    setError('Failed to load payment details. Please contact support if your payment was successful.');
                })
                .finally(() => {
                    setLoading(false);
                });
        } else if (order) {
            // Track successful order completion for non-Stripe payments
            console.log('Order completed successfully:', {
                orderId: order.id || orderId,
                amount: order.total_amount,
                paymentStatus,
                paymentMethod
            });

            // Set payment details for display
            if (paymentStatus && paymentMethod) {
                setPaymentDetails({
                    orderId: order?.ReferenceNumber || order?.id,
                    referenceNumber: order?.ReferenceNumber,
                    status: paymentStatus,
                    method: paymentMethod,
                    amount: order?.total,
                    currency: 'PHP',
                    deliveryType: order?.deliveryType,
                    deliveryCost: order?.shippingCost,
                    completedAt: new Date().toISOString(),
                    // Add customer info if available
                    customerEmail: user?.email,
                    // Add address info if available
                    address: order?.shippingAddress
                });
            }
        } else {
            // Set default payment details even if order is not available
            setPaymentDetails({
                status: 'completed',
                method: paymentMethod || 'card',
                completedAt: new Date().toISOString()
            });
        }
    }, [order, orderId, paymentStatus, paymentMethod, searchParams]);

    if (loading) {
        return (
            <div className="order-success-page">
                <div className="success-container">
                    <div className="loading-state">
                        <p>Loading payment details...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="order-success-page">
                <div className="success-container">
                    <div className="error-state">
                        <h2>Payment Confirmed</h2>
                        <p>Your payment was successful, but we encountered an issue loading the details.</p>
                        <p className="error-message">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="order-success-page">
            <div className="success-container">
                {/* Success Header */}
                <div className="success-header">
                    <div className="success-icon">
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="32" cy="32" r="30" fill="#10b981" stroke="#059669" strokeWidth="2"/>
                            <path d="M20 32L28 40L44 24" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <h1 className="success-title">Order Confirmed!</h1>
                    <p className="success-subtitle">
                        {message || 'Thank you for your order. We will process your order shortly.'}
                    </p>
                </div>

                {/* Payment method notices removed - only E-Wallet is supported */}
                {false && (
                    <div className="cod-notice-section">
                        <div className="cod-notice-header">
                            <div className="cod-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M2 17L12 22L22 17" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M2 12L12 17L22 12" stroke="#F0B21B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h2>Cash on Delivery Order</h2>
                        </div>
                        <div className="cod-notice-content">
                            <p><strong>Payment Status:</strong> Pending - You will pay when your order is delivered</p>
                            <p><strong>Next Steps:</strong> Our team will contact you to confirm your order and arrange delivery</p>
                        </div>
                    </div>
                )}

                {/* Order Summary */}
                <div className="order-summary-section">
                    <div className="order-summary-header">
                        <div className="summary-icon">
                            <CartIcon />
                        </div>
                        <h2>Order Summary</h2>
                    </div>
                    <div className="order-summary-content">
                        {paymentDetails && (
                            <>
                                {/* Order Items */}
                                {orderItems.length > 0 && (
                                    <div className="order-items-section">
                                        <h3 className="order-items-title">Products Ordered</h3>
                                        <div className="order-items-list">
                                            {orderItems.map((item, index) => (
                                                <div key={item.OrderItemID || index} className="order-item">
                                                    <div className="order-item-info">
                                                        <span className="order-item-name">{item.ProductName || item.Name || 'Product'}</span>
                                                        {item.VariationName && (
                                                            <span className="order-item-variant">Variant: {item.VariationName}</span>
                                                        )}
                                                        {item.SKU && (
                                                            <span className="order-item-sku">SKU: {item.SKU}</span>
                                                        )}
                                                    </div>
                                                    <div className="order-item-details">
                                                        <span className="order-item-quantity">Qty: {item.Quantity}</span>
                                                        <span className="order-item-price">
                                                            ₱{parseFloat(item.PriceAtPurchase || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                <div className="order-details-grid">
                                {paymentDetails.orderId && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Order Number:</span>
                                        <span className="order-detail-value">#{paymentDetails.referenceNumber || paymentDetails.orderId}</span>
                                    </div>
                                )}
                                <div className="order-detail-item">
                                    <span className="order-detail-label">Order Status:</span>
                                    <span className="order-detail-value status-success">{paymentDetails.status}</span>
                                </div>
                                <div className="order-detail-item">
                                    <span className="order-detail-label">Payment Method:</span>
                                    <span className="order-detail-value">E-Wallet</span>
                                </div>
                                {paymentDetails.paymentStatus && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Payment Status:</span>
                                        <span className="order-detail-value status-success">{paymentDetails.paymentStatus}</span>
                                    </div>
                                )}
                                {paymentDetails.transactionId && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Transaction ID:</span>
                                        <span className="order-detail-value" style={{ fontFamily: 'monospace', fontSize: '0.9em', color: '#64748b' }}>{paymentDetails.transactionId}</span>
                                    </div>
                                )}
                                {paymentDetails.deliveryType && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Service Type:</span>
                                        <span className="order-detail-value">
                                            {(() => {
                                                // Always prefer deliveryTypeName from API (it has correct service type from DB)
                                                const serviceType = paymentDetails.deliveryTypeName || 
                                                    (paymentDetails.deliveryType === 'pickup' ? 'Pick up' : 
                                                     paymentDetails.deliveryType);
                                                if (serviceType === 'Pick up') return serviceType;
                                                // If serviceType already includes "Delivery", use as-is
                                                if (serviceType && serviceType.includes('Delivery')) {
                                                    return serviceType;
                                                }
                                                // If serviceType doesn't include "Delivery" and it's not pickup, append it
                                                if (serviceType && serviceType !== 'Pick up') {
                                                    return serviceType + ' Delivery';
                                                }
                                                return serviceType || 'Standard Delivery';
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {(paymentDetails.deliveryType === 'pickup' || paymentDetails.deliveryTypeName === 'Pick up') && paymentDetails.pickupDate && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Pickup Date & Time:</span>
                                        <span className="order-detail-value" style={{ color: '#27ae60', fontWeight: '600' }}>
                                            {new Date(paymentDetails.pickupDate).toLocaleString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </span>
                                    </div>
                                )}
                                {paymentDetails.deliveryCost && paymentDetails.deliveryCost > 0 && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Shipping Cost:</span>
                                        <span className="order-detail-value shipping-cost">
                                            {new Intl.NumberFormat('en-PH', {
                                                style: 'currency',
                                                currency: 'PHP'
                                            }).format(paymentDetails.deliveryCost)}
                                        </span>
                                    </div>
                                )}
                                {paymentDetails.extraDeliveryFee && paymentDetails.extraDeliveryFee > 0 && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Extra Delivery Fee (Qty &gt; 4):</span>
                                        <span className="order-detail-value extra-delivery-fee">
                                            {new Intl.NumberFormat('en-PH', {
                                                style: 'currency',
                                                currency: 'PHP'
                                            }).format(paymentDetails.extraDeliveryFee)}
                                        </span>
                                    </div>
                                )}
                                {paymentDetails.subtotal && paymentDetails.subtotal > 0 && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Subtotal:</span>
                                        <span className="order-detail-value">
                                            {new Intl.NumberFormat('en-PH', {
                                                style: 'currency',
                                                currency: 'PHP'
                                            }).format(paymentDetails.subtotal)}
                                        </span>
                                    </div>
                                )}
                                {paymentDetails.amount && paymentDetails.amount > 0 && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Total Amount:</span>
                                        <span className="order-detail-value total-amount">
                                            {new Intl.NumberFormat('en-PH', {
                                                style: 'currency',
                                                currency: paymentDetails.currency || 'PHP'
                                            }).format(paymentDetails.amount)}
                                        </span>
                                    </div>
                                )}
                                {paymentDetails.customerEmail && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Email:</span>
                                        <span className="order-detail-value">{paymentDetails.customerEmail}</span>
                                    </div>
                                )}
                                <div className="order-detail-item">
                                    <span className="order-detail-label">Order Date:</span>
                                    <span className="order-detail-value">
                                        {new Date(paymentDetails.completedAt).toLocaleString()}
                                    </span>
                                </div>
                            {paymentDetails.address && (
                                <>
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Shipping Address:</span>
                                        <span className="order-detail-value">
                                            {[paymentDetails.address.houseNumber, paymentDetails.address.street, paymentDetails.address.barangay, paymentDetails.address.city, paymentDetails.address.province, paymentDetails.address.postalCode, paymentDetails.address.country || 'Philippines']
                                                .filter(Boolean).join(', ')}
                                        </span>
                                    </div>
                                    {paymentDetails.address.phoneNumber && (
                                        <div className="order-detail-item">
                                            <span className="order-detail-label">Contact:</span>
                                            <span className="order-detail-value">{paymentDetails.address.phoneNumber}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Next Steps */}
                <div className="next-steps-section">
                    <div className="next-steps-header">
                        <h2>What's Next?</h2>
                    </div>
                    <div className="next-steps-content">
                        <div className="steps-grid">
                            <div className="step-item">
                                <div className="step-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <polyline points="22,6 12,13 2,6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="step-content">
                                    <h4>Order Confirmation</h4>
                                    <p>You'll receive an email confirmation with your order details shortly.</p>
                                </div>
                            </div>
                            <div className="step-item">
                                <div className="step-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21 16V8C20.9996 7.64927 20.9071 7.30481 20.7315 7.00116C20.556 6.69751 20.3037 6.44536 20 6.27L13 2.27C12.696 2.09446 12.3511 2.00205 12 2.00205C11.6489 2.00205 11.304 2.09446 11 2.27L4 6.27C3.69626 6.44536 3.44398 6.69751 3.26846 7.00116C3.09294 7.30481 3.00036 7.64927 3 8V16C3.00036 16.3507 3.09294 16.6952 3.26846 16.9988C3.44398 17.3025 3.69626 17.5546 4 17.73L11 21.73C11.304 21.9055 11.6489 21.9979 12 21.9979C12.3511 21.9979 12.696 21.9055 13 21.73L20 17.73C20.3037 17.5546 20.556 17.3025 20.7315 16.9988C20.9071 16.6952 20.9996 16.3507 21 16Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <polyline points="3.27,6.96 12,12.01 20.73,6.96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <line x1="12" y1="22.08" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="step-content">
                                    <h4>Processing</h4>
                                    <p>We'll start processing your order and prepare it for shipment.</p>
                                </div>
                            </div>
                            <div className="step-item">
                                <div className="step-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="1" y="3" width="15" height="13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M16 8H20L23 11V16H16V8Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <circle cx="5.5" cy="18.5" r="2.5" strokeWidth="2"/>
                                        <circle cx="18.5" cy="18.5" r="2.5" strokeWidth="2"/>
                                    </svg>
                                </div>
                                <div className="step-content">
                                    <h4>Shipping</h4>
                                    <p>You'll receive tracking information once your order ships.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="success-actions-section">
                    <div className="success-actions">
                        <Link to="/products" className="btn btn-primary">
                            Continue Shopping
                        </Link>
                        <Link to="/account?tab=orders" className="btn btn-secondary">
                            View Orders
                        </Link>
                    </div>
                    
                    {/* Support Information */}
                    <div className="support-info">
                        <p>
                            Need help with your order? 
                            <Link to="/contact" className="support-link"> Contact our support team</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderSuccessPage;
