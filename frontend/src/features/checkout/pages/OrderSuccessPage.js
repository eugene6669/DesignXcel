import React, { useEffect, useRef, useState } from 'react';
import { invalidateAvailableStockCache } from '../../../shared/services/availableStockService';
import { useParams, useLocation, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import stripeService from '../services/stripeService';
import paymongoService from '../services/paymongoService';
import apiClient from '../../../shared/services/api/apiClient';
import { persistOrderReceiptNotificationOnce } from '../../../shared/utils/customerNotificationStorage';
import {
    clearCheckoutPaymentSessionKeys,
    getLastPaymongoSessionId,
    getPendingOrderSuccessCheckout,
    setPendingOrderSuccessCheckout
} from '../utils/checkoutStorageKeys';
import { downloadOrderInvoicePdf } from '../utils/generateOrderInvoicePdf';
import './order-success.css';

const paymongoMethodLabel = (sourceType, fallback = 'PayMongo') => {
    const t = String(sourceType || '').toLowerCase();
    if (['gcash', 'paymaya', 'grab_pay', 'qrph'].includes(t)) return 'E-Wallet';
    if (t === 'card') return 'Card (PayMongo)';
    return fallback;
};

// Cart Icon Component
const CartIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <circle cx="19" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const notifyOrderReceiptOnce = (order, fallbackUser, checkoutSessionId) => {
    const orderNumber = order?.ReferenceNumber || order?.OrderID;
    if (!orderNumber) return;
    const notifyUser = order?.Email
        ? { email: order.Email, id: order.CustomerID }
        : fallbackUser;
    persistOrderReceiptNotificationOnce(orderNumber, notifyUser, checkoutSessionId);
};

/** Collapse duplicated gateway transaction ids (e.g. pay_x,pay_x or doubled string). Prefer pi_ / pay_ over TXN. */
const normalizeDisplayTransactionId = (tid) => {
    if (tid == null || tid === '') return tid;
    const s = String(tid).trim();
    if (s.includes(',')) {
        const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
        const uniq = [...new Set(parts)];
        if (uniq.length === 1) return uniq[0];
        const piPick = uniq.find((p) => /^pi_/i.test(p));
        if (piPick) return piPick;
        const payPick = uniq.find((p) => /^pay_/i.test(p));
        return payPick || uniq[0];
    }
    const half = Math.floor(s.length / 2);
    if (half > 10 && s.slice(0, half) === s.slice(half)) return s.slice(0, half);
    return s;
};

/** Receipt / order-success: show Stripe pi_ or PayMongo pay_, not internal TXN when session has PI. */
const preferredReceiptPaymentRef = (details) => {
    if (!details) return '';
    const pi = details.paymentIntentId != null ? String(details.paymentIntentId).trim() : '';
    if (/^pi_/i.test(pi)) return pi;
    const txn = normalizeDisplayTransactionId(details.transactionId);
    if (/^pi_/i.test(String(txn))) return String(txn);
    if (/^pay_/i.test(String(txn))) return String(txn);
    if (/^TXN/i.test(String(txn)) || /^txn/i.test(String(txn))) {
        if (pi) return pi;
        return '';
    }
    return txn || pi || '';
};

/** Line items for receipt UI from Stripe Checkout metadata (bulk: items JSON; regular: cart JSON). */
const buildLineItemsFromStripeSession = (session) => {
    const md = session?.metadata || {};
    const orderType = String(md.orderType || '').toLowerCase();
    let raw = [];
    try {
        if (orderType === 'bulk' && md.items) {
            raw = JSON.parse(md.items);
        } else if (md.cart) {
            raw = JSON.parse(md.cart);
        }
    } catch {
        raw = [];
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((item, idx) => ({
        OrderItemID: `stripe-md-${idx}`,
        ProductName: item.name || item.productName || item.Name || 'Product',
        Name: item.name || item.productName,
        Quantity: parseInt(item.quantity, 10) || 0,
        PriceAtPurchase: parseFloat(item.unitPrice ?? item.price ?? item.Price ?? 0) || 0,
        SKU: item.sku || item.SKU || '',
        VariationName: item.variationName || item.VariationName || null
    }));
};

const enrichPaymentDetailsFromStripeSession = (session, base = {}) => {
    const md = session?.metadata || {};
    const orderType = String(md.orderType || 'regular').toLowerCase();
    const pickupRaw = String(md.pickupDate || md.pickupDateTime || '').trim();
    const subMeta = parseFloat(md.subtotal);
    const totalMeta = parseFloat(md.total);
    const discountMeta = parseFloat(md.discount);
    const amountFromStripe = session?.amount_total != null ? session.amount_total / 100 : null;

    return {
        ...base,
        orderType,
        isBulkOrder: orderType === 'bulk' || md.isBulkOrder === 'true',
        pickupDate: base.pickupDate || (pickupRaw && pickupRaw !== 'null' ? pickupRaw : null),
        deliveryType: base.deliveryType || md.deliveryType || (orderType === 'bulk' ? 'pickup' : base.deliveryType),
        deliveryTypeName: base.deliveryTypeName || (orderType === 'bulk' ? 'Pick up' : base.deliveryTypeName),
        customerNameFromStripe: md.customerName || null,
        subtotal: Number.isFinite(subMeta) && subMeta > 0 ? subMeta : (base.subtotal ?? 0),
        amount: Number.isFinite(totalMeta) && totalMeta > 0 ? totalMeta : (base.amount ?? amountFromStripe ?? 0),
        discount: Number.isFinite(discountMeta) ? discountMeta : (base.discount ?? 0),
        stripeSessionId: session?.id || base.stripeSessionId,
        paymentIntentId: typeof session?.payment_intent === 'string'
            ? session.payment_intent
            : (session?.payment_intent?.id || base.paymentIntentId)
    };
};

const OrderSuccessPage = () => {
    const { orderId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, isAuthenticated } = useAuth();
    const { order, message, paymentStatus, paymentMethod } = location.state || {};
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [orderItems, setOrderItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [invoiceDownloading, setInvoiceDownloading] = useState(false);
    const paymongoFinalizeStartedRef = useRef(false);
    const stripeFlowStartedRef = useRef(false);
    const paymentReturnHandledRef = useRef(false);
    const backTrapInstalledRef = useRef(false);

    const resolvePaymentMethodLabel = () => {
        const sid = (searchParams.get('session_id') || '').trim();
        if (/^cs_(test_|live_)/i.test(sid)) return 'Bank Card';
        return paymentDetails?.method || paymentMethod || 'E-Wallet';
    };

    const stripPaymentReturnQueryFromUrl = () => {
        if (paymentReturnHandledRef.current) return;
        const hasReturnParams =
            searchParams.has('session_id') ||
            searchParams.has('paymongo_session_id') ||
            searchParams.get('provider') === 'paymongo';
        if (!hasReturnParams) return;
        paymentReturnHandledRef.current = true;
        // replaceState avoids React Router searchParams change re-running the effect with no session id
        window.history.replaceState(window.history.state, '', '/order-success');
    };

    const applyDbOrderToPage = (resolvedOrder, {
        checkoutSessionId,
        stripeSession = null,
        fallbackMethod = 'E-Wallet',
        paymongoSessionSnapshot = null
    }) => {
        setError(null);
        clearCheckoutPaymentSessionKeys();
        notifyOrderReceiptOnce(resolvedOrder, user, checkoutSessionId);
        stripPaymentReturnQueryFromUrl();

        const sessionLineItems = stripeSession ? buildLineItemsFromStripeSession(stripeSession) : [];
        const subtotalFromOrder =
            (parseFloat(resolvedOrder.TotalAmount) || 0) -
            (parseFloat(resolvedOrder.DeliveryCost) || 0) -
            (parseFloat(resolvedOrder.ExtraDeliveryFee) || 0);

        const methodLabel =
            resolvedOrder.PaymentMethodDisplay ||
            (paymongoSessionSnapshot
                ? paymongoMethodLabel(
                      paymongoSessionSnapshot?.attributes?.payments?.[0]?.attributes?.source?.type,
                      resolvedOrder.PaymentMethod || fallbackMethod
                  )
                : resolvedOrder.PaymentMethod || fallbackMethod);

        setPaymentDetails((prev) =>
            enrichPaymentDetailsFromStripeSession(stripeSession || {}, {
                ...prev,
                method: methodLabel,
                orderId: resolvedOrder.ReferenceNumber || resolvedOrder.OrderID,
                referenceNumber: resolvedOrder.ReferenceNumber,
                transactionId: normalizeDisplayTransactionId(resolvedOrder.TransactionID),
                status: resolvedOrder.Status || prev?.status || 'Pending',
                paymentStatus: resolvedOrder.PaymentStatus || prev?.paymentStatus || 'Paid',
                deliveryType: resolvedOrder.DeliveryType || prev?.deliveryType,
                deliveryTypeName: resolvedOrder.DeliveryTypeName || prev?.deliveryTypeName,
                deliveryCost: resolvedOrder.DeliveryCost,
                extraDeliveryFee: parseFloat(resolvedOrder.ExtraDeliveryFee) || 0,
                pickupDate: resolvedOrder.PickupDate || prev?.pickupDate,
                subtotal: subtotalFromOrder > 0 ? subtotalFromOrder : prev?.subtotal,
                amount: parseFloat(resolvedOrder.TotalAmount) || prev?.amount,
                customerEmail: resolvedOrder.Email || prev?.customerEmail || user?.email || '',
                completedAt: new Date().toISOString(),
                customerInfo: {
                    name: resolvedOrder.FullName,
                    email: resolvedOrder.Email
                },
                address: {
                    houseNumber: resolvedOrder.HouseNumber,
                    street: resolvedOrder.Street,
                    barangay: resolvedOrder.Barangay,
                    city: resolvedOrder.City,
                    province: resolvedOrder.Province,
                    postalCode: resolvedOrder.PostalCode,
                    country: resolvedOrder.Country,
                    phoneNumber: resolvedOrder.PhoneNumber
                }
            })
        );

        const dbItems = resolvedOrder.items && Array.isArray(resolvedOrder.items) ? resolvedOrder.items : [];
        setOrderItems(dbItems.length > 0 ? dbItems : sessionLineItems);
    };

    // Browser "back" from order success → homepage (not PayMongo/payment return URL).
    useEffect(() => {
        if (backTrapInstalledRef.current) {
            return undefined;
        }
        backTrapInstalledRef.current = true;

        window.history.pushState({ orderSuccessBackTrap: true }, '', window.location.pathname + window.location.search);

        const onPopState = () => {
            navigate('/', { replace: true });
        };

        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('popstate', onPopState);
            backTrapInstalledRef.current = false;
        };
    }, [navigate]);

    const handleDownloadInvoice = async () => {
        if (!paymentDetails || invoiceDownloading) return;
        setInvoiceDownloading(true);
        try {
            await downloadOrderInvoicePdf({
                paymentDetails,
                orderItems,
                paymentMethodLabel: resolvePaymentMethodLabel(),
                paymentReference: preferredReceiptPaymentRef(paymentDetails)
            });
        } catch (err) {
            console.error('Invoice PDF download failed:', err);
        } finally {
            setInvoiceDownloading(false);
        }
    };

    // Dev-only fallback when Stripe CLI/webhook is not forwarding (disabled by default to avoid duplicate orders)
    const triggerWebhookSimulation = async (session) => {
        const simulateEnabled = process.env.REACT_APP_SIMULATE_STRIPE_WEBHOOK === 'true';
        if (!simulateEnabled) {
            console.log(
                'Order not in database yet; webhook simulation is disabled. Set REACT_APP_SIMULATE_STRIPE_WEBHOOK=true only for local dev without Stripe CLI.'
            );
            return;
        }

        const simKey = `order_webhook_sim_${session?.id || 'unknown'}`;
        if (sessionStorage.getItem(simKey) === '1') {
            console.log('Webhook simulation already attempted for this session, skipping.');
            return;
        }
        sessionStorage.setItem(simKey, '1');

        try {
            console.log('Triggering webhook simulation (REACT_APP_SIMULATE_STRIPE_WEBHOOK=true)...');

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
                    
                    notifyOrderReceiptOnce(order, user, session.id);
                    
                    setPaymentDetails((prev) =>
                        enrichPaymentDetailsFromStripeSession(session, {
                            ...prev,
                            method: order.PaymentMethodDisplay || order.PaymentMethod || prev?.method || 'E-Wallet',
                            orderId: order.ReferenceNumber || order.OrderID,
                            referenceNumber: order.ReferenceNumber,
                            transactionId: normalizeDisplayTransactionId(order.TransactionID) || prev?.transactionId,
                            status: order.Status,
                            paymentStatus: order.PaymentStatus,
                            deliveryType: order.DeliveryType || prev?.deliveryType,
                            deliveryTypeName: order.DeliveryTypeName || prev?.deliveryTypeName,
                            deliveryCost: order.DeliveryCost,
                            extraDeliveryFee: orderExtraDeliveryFee,
                            pickupDate: order.PickupDate || prev?.pickupDate,
                            subtotal:
                                calculatedSubtotal > 0
                                    ? calculatedSubtotal
                                    : parseFloat(session.metadata?.subtotal) || prev?.subtotal,
                            amount: parseFloat(order.TotalAmount) || prev?.amount,
                            customerInfo: {
                                name: order.FullName || prev?.customerInfo?.name || session.metadata?.customerName,
                                email: order.Email || prev?.customerInfo?.email || session.customer_email
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
                        })
                    );

                    const sessionLineItemsEarly = buildLineItemsFromStripeSession(session);
                    const dbItemsEarly = order.items && Array.isArray(order.items) ? order.items : [];
                    setOrderItems(dbItemsEarly.length > 0 ? dbItemsEarly : sessionLineItemsEarly);
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
                            
                            notifyOrderReceiptOnce(order, user, session.id);
                            
                            setPaymentDetails((prev) =>
                                enrichPaymentDetailsFromStripeSession(session, {
                                    ...prev,
                                    method: order.PaymentMethodDisplay || order.PaymentMethod || prev?.method || 'E-Wallet',
                                    orderId: order.ReferenceNumber || order.OrderID,
                                    referenceNumber: order.ReferenceNumber,
                                    transactionId: normalizeDisplayTransactionId(order.TransactionID) || prev?.transactionId,
                                    status: order.Status,
                                    paymentStatus: order.PaymentStatus,
                                    deliveryType: order.DeliveryType || prev?.deliveryType,
                                    deliveryTypeName: order.DeliveryTypeName || prev?.deliveryTypeName,
                                    deliveryCost: order.DeliveryCost,
                                    extraDeliveryFee: orderExtraDeliveryFee,
                                    pickupDate: order.PickupDate || prev?.pickupDate,
                                    subtotal: subtotalFromMetadata || prev?.subtotal,
                                    customerInfo: {
                                        name: order.FullName || prev?.customerInfo?.name || session.metadata?.customerName,
                                        email: order.Email || prev?.customerInfo?.email || session.customer_email
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
                                })
                            );

                            const sessionLineItemsAfter = buildLineItemsFromStripeSession(session);
                            const dbItemsAfter = order.items && Array.isArray(order.items) ? order.items : [];
                            setOrderItems(dbItemsAfter.length > 0 ? dbItemsAfter : sessionLineItemsAfter);
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
        invalidateAvailableStockCache();
        const sessionIdFromUrl = searchParams.get('session_id');
        const provider = searchParams.get('provider');
        const paymongoSessionIdFromUrl = searchParams.get('paymongo_session_id');
        const cachedPaymongoSessionId = getLastPaymongoSessionId();
        const pendingCheckout = getPendingOrderSuccessCheckout();
        const hasPlaceholderSession = (value) => value && String(value).includes('{CHECKOUT_SESSION_ID}');
        const validSessionIdFromUrl = hasPlaceholderSession(sessionIdFromUrl) ? null : sessionIdFromUrl;
        const validPaymongoSessionFromUrl = hasPlaceholderSession(paymongoSessionIdFromUrl) ? null : paymongoSessionIdFromUrl;
        const isStripeCheckoutSession = (id) => /^cs_(test_|live_)/i.test(String(id || '').trim());
        const isPaymongoSessionId = (id) => {
            const s = String(id || '').trim();
            return s.length > 0 && !isStripeCheckoutSession(s);
        };

        let sessionId = null;
        let paymongoSessionId = null;

        // Stripe success_url always uses session_id=cs_* — must win over stale PayMongo cache
        if (validSessionIdFromUrl && isStripeCheckoutSession(validSessionIdFromUrl)) {
            sessionId = validSessionIdFromUrl;
        } else if (provider === 'paymongo' || validPaymongoSessionFromUrl) {
            paymongoSessionId =
                validPaymongoSessionFromUrl ||
                (pendingCheckout.provider === 'paymongo' ? pendingCheckout.sessionId : null) ||
                cachedPaymongoSessionId;
        } else if (
            pendingCheckout.provider === 'stripe' &&
            pendingCheckout.sessionId &&
            isStripeCheckoutSession(pendingCheckout.sessionId)
        ) {
            sessionId = pendingCheckout.sessionId;
        } else if (
            pendingCheckout.provider === 'paymongo' &&
            pendingCheckout.sessionId &&
            isPaymongoSessionId(pendingCheckout.sessionId)
        ) {
            paymongoSessionId = pendingCheckout.sessionId;
        } else if (validSessionIdFromUrl && isPaymongoSessionId(validSessionIdFromUrl)) {
            paymongoSessionId = validSessionIdFromUrl;
        } else if (cachedPaymongoSessionId && isPaymongoSessionId(cachedPaymongoSessionId)) {
            paymongoSessionId = cachedPaymongoSessionId;
        }

        if (sessionId) {
            setPendingOrderSuccessCheckout(sessionId, 'stripe');
        } else if (paymongoSessionId) {
            setPendingOrderSuccessCheckout(paymongoSessionId, 'paymongo');
        }

        const checkoutFlowInProgress =
            paymongoFinalizeStartedRef.current || stripeFlowStartedRef.current;
        
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
            if (stripeFlowStartedRef.current) {
                return;
            }
            stripeFlowStartedRef.current = true;
            setError(null);

            setLoading(true);
            stripeService.getCheckoutSession(sessionId)
                .then(result => {
                    if (result.success) {
                        const session = result.session;
                        console.log('Retrieved Stripe session details:', session);

                        const sessionLineItems = buildLineItemsFromStripeSession(session);

                        const subtotal = parseFloat(session.metadata?.subtotal) || 0;
                        const shippingCost = parseFloat(session.metadata?.shippingCost) || 0;
                        const extraDeliveryFee = parseFloat(session.metadata?.extraDeliveryFee) || 0;

                        setPaymentDetails(
                            enrichPaymentDetailsFromStripeSession(session, {
                                status: session.payment_status || 'completed',
                                method: 'Bank Card',
                                amount: session.amount_total / 100,
                                currency: session.currency || 'PHP',
                                customerEmail: session.customer_email,
                                customerInfo: {
                                    name: session.metadata?.customerName || null,
                                    email: session.customer_email
                                },
                                subtotal,
                                shippingCost,
                                extraDeliveryFee,
                                completedAt: new Date().toISOString()
                            })
                        );
                        setOrderItems(sessionLineItems);

                        restoreSessionIfNeeded();

                        void (async () => {
                            for (let finAttempt = 0; finAttempt < 3; finAttempt += 1) {
                                try {
                                    const finalizeResult = await apiClient.post(
                                        `/api/stripe/finalize-checkout-session/${sessionId}`
                                    );
                                    if (finalizeResult?.order) {
                                        applyDbOrderToPage(finalizeResult.order, {
                                            checkoutSessionId: sessionId,
                                            stripeSession: session,
                                            fallbackMethod: 'Bank Card'
                                        });
                                        return;
                                    }
                                    if (finalizeResult?.success && finalizeResult?.orderId) {
                                        break;
                                    }
                                    if (finalizeResult?.message === 'Payment not completed yet') {
                                        await new Promise((r) => setTimeout(r, 1200));
                                        continue;
                                    }
                                    break;
                                } catch (finErr) {
                                    console.warn('[Stripe] finalize attempt failed:', finErr?.message || finErr);
                                    await new Promise((r) => setTimeout(r, 800));
                                }
                            }

                            const maxAttempts = 12;
                            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                                try {
                                    const orderResult = await apiClient.get(`/api/order/stripe-session/${sessionId}`);
                                    if (orderResult.success && orderResult.order) {
                                        applyDbOrderToPage(orderResult.order, {
                                            checkoutSessionId: sessionId,
                                            stripeSession: session,
                                            fallbackMethod: 'Bank Card'
                                        });
                                        return;
                                    }
                                } catch (err) {
                                    console.log(`Order lookup attempt ${attempt + 1}/${maxAttempts}:`, err?.message || err);
                                }
                                await new Promise((r) => setTimeout(r, 800));
                            }
                            console.log('Order not in database yet; trying finalize/simulation fallback.');
                            triggerWebhookSimulation(session);
                        })();
                    }
                })
                .catch(err => {
                    console.error('Error fetching Stripe session:', err);
                    setError('Failed to load payment details. Please contact support if your payment was successful.');
                })
                .finally(() => {
                    setLoading(false);
                });
        } else if (paymongoSessionId) {
            if (paymongoFinalizeStartedRef.current) {
                return;
            }
            paymongoFinalizeStartedRef.current = true;
            setError(null);

            setLoading(true);
            (async () => {
                try {
                    let paymongoMethod = 'PayMongo';
                    let paymongoSessionSnapshot = null;
                    try {
                        const result = await paymongoService.getCheckoutSession(paymongoSessionId);
                        if (result.success) {
                            paymongoSessionSnapshot = result.session;
                            const session = result.session;
                            const metadata = session?.attributes?.metadata || {};
                            const amountFromMetadata = parseFloat(metadata.total) || 0;
                            const sourceType = session?.attributes?.payments?.[0]?.attributes?.source?.type || '';
                            paymongoMethod = paymongoMethodLabel(sourceType, 'PayMongo');
                            setPaymentDetails({
                                status: session?.attributes?.payment_intent?.attributes?.status || 'paid',
                                method: paymongoMethod,
                                amount: amountFromMetadata,
                                currency: 'PHP',
                                customerEmail: session?.attributes?.billing?.email || user?.email || '',
                                subtotal: parseFloat(metadata.subtotal) || 0,
                                shippingCost: parseFloat(metadata.shippingCost) || 0,
                                extraDeliveryFee: parseFloat(metadata.extraDeliveryFee) || 0,
                                completedAt: new Date().toISOString()
                            });
                        }
                    } catch (e) {
                        // Keep going; we can still resolve full order from DB/finalize endpoint.
                        console.warn('PayMongo session fetch failed, continuing with order lookup flow:', e);
                    }

                    // Ensure order exists for this session (PayMongo has no server webhook in this app).
                    let finalizeResult = null;
                    for (let finAttempt = 0; finAttempt < 3; finAttempt += 1) {
                        try {
                            finalizeResult = await apiClient.post(
                                `/api/paymongo/finalize-checkout-session/${paymongoSessionId}`
                            );
                            if (finalizeResult?.order || (finalizeResult?.success && finalizeResult?.orderId)) {
                                break;
                            }
                            if (finalizeResult?.message === 'Payment not completed yet') {
                                await new Promise((r) => setTimeout(r, 1200));
                                continue;
                            }
                            if (finalizeResult?.success === false) {
                                console.warn('[PayMongo] finalize attempt', finAttempt + 1, finalizeResult.message);
                            }
                            break;
                        } catch (finErr) {
                            console.warn('[PayMongo] finalize request failed:', finErr?.message || finErr);
                            await new Promise((r) => setTimeout(r, 800));
                        }
                    }

                    if (finalizeResult?.order) {
                        applyDbOrderToPage(finalizeResult.order, {
                            checkoutSessionId: paymongoSessionId,
                            fallbackMethod: paymongoMethod,
                            paymongoSessionSnapshot
                        });
                        return;
                    }

                    if (finalizeResult?.success === false && !finalizeResult?.orderId) {
                        const msg = finalizeResult.message || 'Could not create order from PayMongo payment';
                        if (msg.includes('different account')) {
                            throw new Error(
                                `${msg} Sign in with the account you used at checkout, then refresh this page.`
                            );
                        }
                        throw new Error(msg);
                    }

                    let resolvedOrder = null;
                    for (let attempt = 0; attempt < 10; attempt += 1) {
                        try {
                            const orderResult = await apiClient.get(`/api/order/stripe-session/${paymongoSessionId}`);
                            if (orderResult.success && orderResult.order) {
                                resolvedOrder = orderResult.order;
                                break;
                            }
                        } catch (lookupErr) {
                            console.warn('[PayMongo] order lookup:', lookupErr?.message || lookupErr);
                        }
                        await new Promise((resolve) => setTimeout(resolve, 700));
                    }

                    if (resolvedOrder) {
                        applyDbOrderToPage(resolvedOrder, {
                            checkoutSessionId: paymongoSessionId,
                            fallbackMethod: paymongoMethod,
                            paymongoSessionSnapshot
                        });
                        return;
                    }

                    if (paymongoSessionSnapshot) {
                        setError(
                            'Your payment was received. Your order is being processed — check Order History in a few minutes or contact support with your payment reference.'
                        );
                        return;
                    }

                    throw new Error('Order not found for this payment session');
                } catch (err) {
                    console.error('Failed to load finalized checkout order details:', err);
                    const friendly =
                        err?.message && err.message.includes('different account')
                            ? err.message
                            : err?.message || 'Failed to load payment details. Please contact support if your payment was successful.';
                    setError(friendly);
                } finally {
                    setLoading(false);
                }
            })();
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
        } else if (!paymongoSessionId && !sessionId && !checkoutFlowInProgress) {
            setError('No order information found. If you completed a payment, open your account order history or contact support.');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on session/order params; triggerWebhookSimulation is stable for this flow
    }, [order, orderId, paymentStatus, paymentMethod, searchParams, user?.email]);

    if (loading) {
        return (
            <div className="order-success-page order-success-page--loading">
                <div className="order-success-loading-wrap" role="status" aria-live="polite">
                    <div className="order-success-loading-card">
                        <div className="order-success-loading-spinner" aria-hidden="true" />
                        <h2 className="order-success-loading-title">Loading payment details</h2>
                        <p className="order-success-loading-subtitle">
                            Please wait while we confirm your order and receipt.
                        </p>
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
                                {(paymentDetails.orderType === 'bulk' || paymentDetails.isBulkOrder) && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Order type:</span>
                                        <span className="order-detail-value">Bulk order (store pickup)</span>
                                    </div>
                                )}
                                <div className="order-detail-item">
                                    <span className="order-detail-label">Order Status:</span>
                                    <span className="order-detail-value status-success">{paymentDetails.status}</span>
                                </div>
                                <div className="order-detail-item">
                                    <span className="order-detail-label">Payment Method:</span>
                                    <span className="order-detail-value">
                                        {paymentDetails.method || paymentMethod || 'E-Wallet'}
                                    </span>
                                </div>
                                {paymentDetails.paymentStatus && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Payment Status:</span>
                                        <span className="order-detail-value status-success">{paymentDetails.paymentStatus}</span>
                                    </div>
                                )}
                                {(() => {
                                    const payRef = preferredReceiptPaymentRef(paymentDetails);
                                    if (!payRef) return null;
                                    return (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Payment ID Reference:</span>
                                        <span className="order-detail-value" style={{ fontFamily: 'monospace', fontSize: '0.9em', color: '#64748b' }}>
                                            {payRef}
                                        </span>
                                    </div>
                                    );
                                })()}
                                {(paymentDetails.deliveryType || paymentDetails.deliveryTypeName || paymentDetails.isBulkOrder) && (
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
                                {(paymentDetails.isBulkOrder || paymentDetails.deliveryType === 'pickup' || paymentDetails.deliveryTypeName === 'Pick up') && paymentDetails.pickupDate && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Pickup Date & Time:</span>
                                        <span className="order-detail-value" style={{ color: '#27ae60', fontWeight: '600' }}>
                                            {(() => {
                                                const d = new Date(paymentDetails.pickupDate);
                                                if (Number.isNaN(d.getTime())) {
                                                    return String(paymentDetails.pickupDate);
                                                }
                                                return d.toLocaleString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true
                                                });
                                            })()}
                                        </span>
                                    </div>
                                )}
                                {(Number(paymentDetails.deliveryCost) || 0) > 0 && (
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
                                {(Number(paymentDetails.extraDeliveryFee) || 0) > 0 && (
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
                                {(Number(paymentDetails.subtotal) || 0) > 0 && (
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
                                {(Number(paymentDetails.discount) || 0) > 0 && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Discount:</span>
                                        <span className="order-detail-value">
                                            −{new Intl.NumberFormat('en-PH', {
                                                style: 'currency',
                                                currency: 'PHP'
                                            }).format(paymentDetails.discount)}
                                        </span>
                                    </div>
                                )}
                                {(Number(paymentDetails.amount) || 0) > 0 && (
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
                                {(paymentDetails.customerInfo?.name || paymentDetails.customerNameFromStripe) && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Customer name:</span>
                                        <span className="order-detail-value">
                                            {paymentDetails.customerInfo?.name || paymentDetails.customerNameFromStripe}
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
                                {paymentDetails.stripeSessionId && (
                                    <div className="order-detail-item">
                                        <span className="order-detail-label">Checkout session:</span>
                                        <span className="order-detail-value" style={{ wordBreak: 'break-all', fontSize: '0.85em' }}>
                                            {paymentDetails.stripeSessionId}
                                        </span>
                                    </div>
                                )}
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

                        <div className="next-steps-actions">
                            <Link to="/products" className="btn btn-secondary">
                                Continue Shopping
                            </Link>
                            <Link to="/account?tab=orders" className="btn btn-secondary">
                                View Orders
                            </Link>
                            {paymentDetails && (
                                <button
                                    type="button"
                                    className="btn btn-invoice"
                                    onClick={handleDownloadInvoice}
                                    disabled={invoiceDownloading}
                                    aria-busy={invoiceDownloading}
                                >
                                    {invoiceDownloading ? 'Preparing…' : 'Download PDF'}
                                </button>
                            )}
                        </div>

                        <div className="support-info">
                            <p>
                                Need help with your order?
                                <Link to="/contact" className="support-link"> Contact our support team</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderSuccessPage;
