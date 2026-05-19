import apiClient from '../../../shared/services/api/apiClient';

export const paymongoService = {
    async isPayMongoAvailable() {
        return process.env.REACT_APP_ENABLE_PAYMONGO !== 'false';
    },

    async createCheckoutSession(items, email, paymentMethod = 'E-Wallet', options = {}) {
        const requestBody = {
            items,
            email,
            paymentMethod,
            deliveryType: options.deliveryType || 'pickup',
            pickupDate: options.pickupDate || null,
            shippingCost: typeof options.shippingCost === 'number' ? options.shippingCost : 0,
            extraDeliveryFee: typeof options.extraDeliveryFee === 'number' ? options.extraDeliveryFee : 0,
            subtotal: typeof options.subtotal === 'number' ? options.subtotal : 0,
            total: typeof options.total === 'number' ? options.total : 0,
            shippingAddressId: options.shippingAddressId || null
        };

        const result = await apiClient.post('/api/create-paymongo-checkout-session', requestBody);
        if (!result?.checkoutUrl) {
            throw new Error(result?.error || 'Failed to create PayMongo checkout session');
        }

        if (result?.sessionId) {
            localStorage.setItem('lastPaymongoSessionId', String(result.sessionId));
        }
        localStorage.setItem('lastPaymentProvider', 'paymongo');
        window.location.href = result.checkoutUrl;
    },

    async getCheckoutSession(sessionId) {
        return apiClient.get(`/api/paymongo-checkout-session/${sessionId}`);
    }
};

export default paymongoService;
