import apiClient from '../../../shared/services/api/apiClient';

export const customerService = {
    // Get customer's bulk orders
    async getBulkOrders() {
        try {
            const response = await apiClient.get('/api/customer/bulk-orders');
            return response.data;
        } catch (error) {
            console.error('Error fetching bulk orders:', error);
            throw error;
        }
    },

    // Get bulk order details
    async getBulkOrderDetails(orderId) {
        try {
            const response = await apiClient.get(`/api/customer/bulk-orders/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bulk order details:', error);
            throw error;
        }
    },

};

export default customerService;

