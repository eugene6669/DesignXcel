import { loadStripe } from '@stripe/stripe-js';
import apiClient from '../../../shared/services/api/apiClient';
import { setPendingOrderSuccessCheckout, setLastPaymentProvider } from '../utils/checkoutStorageKeys';

// Initialize Stripe with your publishable key
const stripePromise = (() => {
    const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey || publishableKey === 'pk_test_your_stripe_publishable_key_here') {
        console.warn('⚠️ Stripe publishable key not configured. Payment functionality will be limited.');
        return Promise.resolve(null);
    }
    
    try {
        return loadStripe(publishableKey);
    } catch (error) {
        console.error('❌ Failed to initialize Stripe:', error);
        return Promise.resolve(null);
    }
})();

export const stripeService = {
    // Check if Stripe is properly configured
    async isStripeAvailable() {
        const stripe = await stripePromise;
        return stripe !== null;
    },
    // Create a checkout session and redirect to Stripe Checkout
    // Added delivery information so backend can save delivery vs pickup and pickup date
    async createCheckoutSession(items, email, paymentMethod = 'E-Wallet', options = {}) {
        try {
            console.log('Creating Stripe checkout session with items:', items);
            
            // Check if Stripe is configured before proceeding
            const stripe = await stripePromise;
            if (!stripe) {
                throw new Error('Payment system is not configured. Please contact support or try a different payment method.');
            }
            
            // Validate items before sending
            if (!items || !Array.isArray(items) || items.length === 0) {
                throw new Error('No items provided for checkout');
            }
            
            // Validate each item
            for (const item of items) {
                if (!item.name || !item.quantity || !item.price) {
                    throw new Error('Invalid item structure. Each item must have name, quantity, and price.');
                }
                if (item.quantity <= 0 || item.price <= 0) {
                    throw new Error('Item quantity and price must be greater than 0.');
                }
            }
            
            // Determine if this is a bulk order based on options
            const isBulkOrder = options.orderType === 'bulk' || options.isBulkOrder === true;
            const endpoint = isBulkOrder ? '/api/create-bulk-order-checkout-session' : '/api/create-checkout-session';
            
            const requestBody = isBulkOrder ? {
                items: items,
                email: email,
                paymentMethod: paymentMethod,
                pickupDate: options.pickupDate || null,
                subtotal: typeof options.subtotal === 'number' ? options.subtotal : 0,
                discount: typeof options.discount === 'number' ? options.discount : 0,
                total: typeof options.total === 'number' ? options.total : 0
            } : {
                items: items,
                email: email,
                paymentMethod: paymentMethod,
                deliveryType: options.deliveryType || 'pickup',
                pickupDate: options.pickupDate || null,
                shippingCost: typeof options.shippingCost === 'number' ? options.shippingCost : 0,
                extraDeliveryFee: typeof options.extraDeliveryFee === 'number' ? options.extraDeliveryFee : 0,
                subtotal: typeof options.subtotal === 'number' ? options.subtotal : 0,
                total: typeof options.total === 'number' ? options.total : 0,
                shippingAddressId: options.shippingAddressId || null
            };
            
            console.log('[STRIPE SERVICE] Request body for checkout session:', {
                ...requestBody,
                items: `[${items.length} items]`
            });
            console.log('[STRIPE SERVICE] Extra delivery fee being sent:', requestBody.extraDeliveryFee || 0);
            
            const result = await apiClient.post(endpoint, requestBody);

            if (!result.sessionId) {
                throw new Error('Failed to create checkout session: ' + (result.error || 'Unknown error'));
            }

            if (result.sessionId) {
                console.log('Stripe checkout session created successfully! SessionID:', result.sessionId);
                setPendingOrderSuccessCheckout(result.sessionId, 'stripe');
                setLastPaymentProvider('stripe');

                // Redirect to Stripe Checkout
                const { error } = await stripe.redirectToCheckout({
                    sessionId: result.sessionId,
                });
                
                if (error) {
                    console.error('Stripe redirect error:', error);
                    throw new Error(error.message);
                }
            } else {
                throw new Error(result.error || 'Failed to create checkout session');
            }
        } catch (error) {
            console.error('Stripe checkout error:', error);
            throw error;
        }
    },

    // Retrieve checkout session details
    async getCheckoutSession(sessionId) {
        try {
            return await apiClient.get(`/api/checkout-session/${sessionId}`);
        } catch (error) {
            console.error('Error retrieving checkout session:', error);
            throw error;
        }
    }
};

export default stripeService;
