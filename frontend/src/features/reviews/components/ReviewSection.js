import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import ReviewForm from './ReviewForm';
import ReviewList from './ReviewList';
import ReviewStats from './ReviewStats';
import { canUserReviewProduct } from '../services/reviewService';
import './review-section.css';

const ReviewSection = ({ productId, productName, orderId }) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewEligibility, setReviewEligibility] = useState({
    loading: true,
    canReview: false,
    hasReview: false,
    reason: ''
  });
  const [userReview, setUserReview] = useState(null);

  const reviewsPerPage = 4;

  // Load reviews, stats, and check eligibility
  useEffect(() => {
    if (productId) {
      loadReviews(currentPage, false);
      loadReviewStats();
      checkReviewEligibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, sortBy, currentPage, refreshKey, user]);

  // Check if user can review and if they already have a review
  const checkReviewEligibility = async () => {
    if (!user || !user.id) {
      setReviewEligibility({
        loading: false,
        canReview: false,
        hasReview: false,
        reason: 'Please login to leave a review'
      });
      return;
    }

    try {
      setReviewEligibility(prev => ({ ...prev, loading: true }));
      // Pass orderId when checking eligibility (allows checking review for specific order)
      const result = await canUserReviewProduct(productId, user.id, orderId);
      
      setReviewEligibility({
        loading: false,
        canReview: result.canReview || false,
        hasReview: result.hasReview || false,
        reason: result.reason || ''
      });

      // Also check in current reviews list as fallback (but only if no orderId - with orderId, backend handles it)
      if (!orderId && !result.hasReview && reviews.length > 0) {
        const existingReview = reviews.find(r => 
          (r.CustomerID && parseInt(r.CustomerID) === parseInt(user.id)) || 
          (r.customerId && parseInt(r.customerId) === parseInt(user.id))
        );
        if (existingReview) {
          setUserReview(existingReview);
          setReviewEligibility(prev => ({ ...prev, hasReview: true }));
        }
      }
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      setReviewEligibility({
        loading: false,
        canReview: false,
        hasReview: false,
        reason: 'Error checking review status'
      });
    }
  };

  const loadReviews = async (page = currentPage, forceRefresh = false) => {
    if (!productId) {
      console.warn('[Frontend] Cannot load reviews: productId is missing');
      return false;
    }

    try {
      setLoading(true);
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const cacheBuster = forceRefresh ? `&_t=${new Date().getTime()}` : `&_r=${Date.now()}`;
      const url = `${apiBase}/api/products/${productId}/reviews?sort=${sortBy}&page=${page}&limit=${reviewsPerPage}${cacheBuster}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        cache: 'no-store',
        credentials: 'include',
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const reviewsList = data.reviews || [];
        setReviews(reviewsList);

        // Check if current user has a review
        if (user && user.id) {
          const existingReview = reviewsList.find(r => 
            (r.CustomerID && parseInt(r.CustomerID) === parseInt(user.id)) || 
            (r.customerId && parseInt(r.customerId) === parseInt(user.id))
          );
          if (existingReview) {
            setUserReview(existingReview);
            setReviewEligibility(prev => ({ ...prev, hasReview: true }));
          } else {
            setUserReview(null);
            // Don't set hasReview to false here - let the can-review API determine it
          }
        }

        return true;
      } else {
        setReviews([]);
        return false;
      }
    } catch (error) {
      console.error('[Frontend] Error loading reviews:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loadReviewStats = async () => {
    try {
      const timestamp = new Date().getTime();
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBase}/api/products/${productId}/reviews/stats?_t=${timestamp}`, {
        credentials: 'include',
        mode: 'cors',
      });
      const data = await response.json();
      
      if (data.success) {
        setReviewStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading review stats:', error);
    }
  };

  const handleReviewSubmit = async (reviewData) => {
    try {
      let requestBody;
      let headers = {};
      
      if (reviewData instanceof FormData) {
        const customerId = user?.id || user?.customerId;
        reviewData.append('customerId', customerId);
        // Include orderId if available (from URL query parameter)
        if (orderId) {
          reviewData.append('orderId', orderId);
        }
        requestBody = reviewData;
      } else {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify({
          ...reviewData,
          customerId: user?.id || user?.customerId,
          // Include orderId if available (from URL query parameter)
          ...(orderId && { orderId: orderId })
        });
      }

      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBase}/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: headers,
        body: requestBody,
        credentials: 'include',
      });

      const data = await response.json();
      
      if (data.success) {
        setShowReviewForm(false);
        setCurrentPage(1);
        setRefreshKey(prev => prev + 1);
        
        // Wait for database transaction to commit
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Reload reviews and stats
        await loadReviews(1, true);
        await loadReviewStats();
        await checkReviewEligibility();
        
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to submit review' };
    }
  };

  const totalPages = Math.ceil(reviewStats.totalReviews / reviewsPerPage);

  return (
    <div className="review-section">
      {/* Review Stats */}
      {reviewStats.totalReviews > 0 && (
        <ReviewStats 
          stats={reviewStats}
          productName={productName}
        />
      )}

      {/* Review List */}
      <ReviewList 
        reviews={reviews}
        loading={loading}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* Add Review Section - Simplified */}
      {user ? (
        <div className="review-action-section">
          {reviewEligibility.loading ? (
            <div className="review-action-card">
              <p>Checking review eligibility...</p>
            </div>
          ) : reviewEligibility.hasReview ? (
            <div className="review-action-card already-reviewed">
              <div className="already-reviewed-content">
                <h4>Review Already Submitted</h4>
                <p>{orderId 
                  ? 'You have already reviewed this product for this order. You can review the same product from different orders.'
                  : 'You have already reviewed this product.'}</p>
                {!orderId && (
                  <button 
                    className="btn-update-review"
                    onClick={() => setShowReviewForm(!showReviewForm)}
                  >
                    {showReviewForm ? 'Cancel' : 'View Your Review'}
                  </button>
                )}
              </div>
            </div>
          ) : reviewEligibility.canReview ? (
            <div className="review-action-card">
              <div className="action-content">
                <div>
                  <h4>Share Your Experience</h4>
                  <p>Help other customers by sharing your honest review</p>
                </div>
                <button 
                  className="btn-write-review"
                  onClick={() => setShowReviewForm(!showReviewForm)}
                >
                  {showReviewForm ? 'Cancel' : 'Write a Review'}
                </button>
              </div>
            </div>
          ) : (
            <div className="review-action-card cannot-review">
              <div className="cannot-review-content">
                <h4>Purchase Required</h4>
                <p>{reviewEligibility.reason || 'You can only review products you have purchased and received.'}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="review-action-card login-prompt">
          <div className="login-prompt-content">
            <h4>Want to share your experience?</h4>
            <p>Join our community and help others make informed decisions</p>
            <a href="/login" className="btn-login">
              Sign in to write a review
            </a>
          </div>
        </div>
      )}

      {/* Review Form */}
      {showReviewForm && reviewEligibility.canReview && (
        <ReviewForm 
          productId={productId}
          productName={productName}
          onSubmit={handleReviewSubmit}
          onCancel={() => setShowReviewForm(false)}
          existingReview={userReview}
        />
      )}
    </div>
  );
};

export default ReviewSection;
