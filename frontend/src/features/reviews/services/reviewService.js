import apiClient from '../../../shared/services/api/apiClient';

// Mock reviews data for when backend is not available
const mockReviews = [
    {
        id: 1,
        productId: 1,
        userId: 1,
        userName: 'John Doe',
        rating: 5,
        comment: 'Excellent quality and craftsmanship. The desk is exactly what I was looking for.',
        createdAt: '2024-01-15T10:30:00Z',
        helpful: 3
    },
    {
        id: 2,
        productId: 1,
        userId: 2,
        userName: 'Sarah Smith',
        rating: 4,
        comment: 'Great desk, very sturdy. The only minor issue is the drawer alignment.',
        createdAt: '2024-01-10T14:20:00Z',
        helpful: 1
    },
    {
        id: 3,
        productId: 2,
        userId: 3,
        userName: 'Mike Johnson',
        rating: 5,
        comment: 'Beautiful modern design. The glass top is perfect for my office.',
        createdAt: '2024-01-12T09:15:00Z',
        helpful: 2
    },
    {
        id: 4,
        productId: 3,
        userId: 4,
        userName: 'Emily Brown',
        rating: 5,
        comment: 'Most comfortable office chair I\'ve ever owned. Worth every penny!',
        createdAt: '2024-01-08T16:45:00Z',
        helpful: 5
    },
    {
        id: 5,
        productId: 3,
        userId: 5,
        userName: 'David Wilson',
        rating: 4,
        comment: 'Great ergonomic design. The lumbar support is excellent for long work sessions.',
        createdAt: '2024-01-05T11:30:00Z',
        helpful: 2
    },
    {
        id: 6,
        productId: 4,
        userId: 6,
        userName: 'Lisa Anderson',
        rating: 5,
        comment: 'Perfect standing desk converter. Easy to adjust and very stable.',
        createdAt: '2024-01-03T13:45:00Z',
        helpful: 4
    },
    {
        id: 7,
        productId: 5,
        userId: 7,
        userName: 'Robert Chen',
        rating: 4,
        comment: 'Solid filing cabinet with good security features. Matches my desk perfectly.',
        createdAt: '2024-01-01T15:20:00Z',
        helpful: 1
    },
    {
        id: 8,
        productId: 6,
        userId: 8,
        userName: 'Jennifer Martinez',
        rating: 5,
        comment: 'Beautiful bookshelf that adds elegance to my office. Adjustable shelves are a plus.',
        createdAt: '2023-12-28T09:10:00Z',
        helpful: 3
    }
];

// Helper function to simulate API delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const reviewsService = {
    // Get reviews for a specific product
    async getProductReviews(productId) {
        try {
            // Try to fetch from backend first
            const response = await apiClient.get(`/api/products/${productId}/reviews`);
            
            if (response.success) {
                // Transform backend data to match frontend expectations
                const transformedReviews = (response.reviews || []).map(review => ({
                    id: review.ReviewID,
                    productId: review.ProductID,
                    userId: review.CustomerID,
                    userName: review.CustomerName,
                    rating: review.Rating,
                    comment: review.Comment,
                    createdAt: review.CreatedAt,
                    helpful: review.HelpfulCount || 0
                }));
                
                return {
                    success: true,
                    reviews: transformedReviews
                };
            }
        } catch (error) {
            // Backend not available, using mock data
        }

        // Fallback to mock data
        await delay(300);
        const productReviews = mockReviews.filter(review => review.productId === parseInt(productId));
        
        return {
            success: true,
            reviews: productReviews
        };
    },

    // Add a new review for a product
    async addProductReview(productId, reviewData) {
        try {
            // Try to send to backend first
            const response = await apiClient.post(`/api/products/${productId}/reviews`, reviewData);
            
            if (response.success) {
                // Transform backend response to match frontend expectations
                const transformedReview = {
                    id: response.review.ReviewID,
                    productId: response.review.ProductID,
                    userId: response.review.CustomerID,
                    userName: response.review.CustomerName,
                    rating: response.review.Rating,
                    comment: response.review.Comment,
                    createdAt: response.review.CreatedAt,
                    helpful: response.review.HelpfulCount || 0
                };
                
                return {
                    success: true,
                    review: transformedReview
                };
            } else {
                // Return error response from backend (e.g., review already exists)
                return {
                    success: false,
                    error: response.error || 'Failed to submit review',
                    code: response.code
                };
            }
        } catch (error) {
            // Handle API errors
            if (error.response && error.response.data) {
                return {
                    success: false,
                    error: error.response.data.error || 'Failed to submit review',
                    code: error.response.data.code
                };
            }
            // Backend not available, using mock data (fallback)
        }

        // Fallback to mock data
        await delay(500);
        
        const newReview = {
            id: Date.now(),
            productId: parseInt(productId),
            userId: reviewData.userId || 1,
            userName: reviewData.userName || 'Anonymous',
            rating: reviewData.rating,
            comment: reviewData.comment,
            createdAt: new Date().toISOString(),
            helpful: 0
        };

        // Add to mock data
        mockReviews.push(newReview);

        return {
            success: true,
            review: newReview
        };
    },

    // Check if user can review a product (has completed purchase AND hasn't already reviewed)
    async canUserReviewProduct(productId, customerId, orderId = null) {
        try {
            const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            // Include orderId in query if provided (allows checking review for specific order)
            const orderIdParam = orderId ? `&orderId=${orderId}` : '';
            const response = await fetch(`${apiBase}/api/products/${productId}/reviews/can-review?customerId=${customerId}${orderIdParam}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'include',
                mode: 'cors',
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    return {
                        success: true,
                        canReview: data.canReview || false,
                        hasReview: data.hasReview || false,
                        reason: data.reason || '',
                        reviewId: data.reviewId || null
                    };
                }
            }
        } catch (error) {
            console.error('Error checking review eligibility:', error);
        }

        // Fallback: If backend is not available, assume user cannot review for security
        await delay(200);
        return {
            success: true,
            canReview: false,
            hasReview: false,
            reason: 'Purchase verification unavailable - please try again later'
        };
    },

    // Get review statistics for a product
    async getProductReviewStats(productId) {
        try {
            const response = await apiClient.get(`/api/products/${productId}/reviews/stats`);
            if (response.success) {
                return {
                    success: true,
                    stats: response.stats
                };
            }
        } catch (error) {
            // Backend not available, using mock data
        }

        // Fallback to mock data
        await delay(200);
        const productReviews = mockReviews.filter(review => review.productId === parseInt(productId));
        
        if (productReviews.length === 0) {
            return {
                success: true,
                stats: {
                    averageRating: 0,
                    totalReviews: 0,
                    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
                }
            };
        }

        const totalRating = productReviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / productReviews.length;
        
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        productReviews.forEach(review => {
            ratingDistribution[review.rating]++;
        });

        return {
            success: true,
            stats: {
                averageRating: Math.round(averageRating * 10) / 10,
                totalReviews: productReviews.length,
                ratingDistribution
            }
        };
    }
};

// Export individual functions for easier imports
export const getProductReviews = reviewsService.getProductReviews;
export const addProductReview = reviewsService.addProductReview;
export const canUserReviewProduct = reviewsService.canUserReviewProduct;
export const getProductReviewStats = reviewsService.getProductReviewStats; 