import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import { StarIcon } from '../../../shared/components/ui/SvgIcons';
import './review-form.css';

const ReviewForm = ({ productId, productName, onSubmit, onCancel, existingReview }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || user?.fullName || '',
    email: user?.email || '',
    rating: existingReview?.rating || 5,
    title: existingReview?.title || '',
    comment: existingReview?.comment || ''
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Pre-populate form if existing review
  useEffect(() => {
    if (existingReview) {
      setFormData({
        name: user?.name || user?.fullName || existingReview.customerName || '',
        email: user?.email || '',
        rating: existingReview.rating || 5,
        title: existingReview.title || '',
        comment: existingReview.comment || ''
      });
    } else if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || user.fullName || prev.name,
        email: user.email || prev.email
      }));
    }
  }, [existingReview, user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleRatingChange = (rating) => {
    setFormData(prev => ({
      ...prev,
      rating: rating
    }));
    
    if (errors.rating) {
      setErrors(prev => ({
        ...prev,
        rating: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Review title is required';
    }

    if (!formData.comment.trim()) {
      newErrors.comment = 'Review content is required';
    }

    if (!formData.rating || formData.rating < 1 || formData.rating > 5) {
      newErrors.rating = 'Please select a rating between 1 and 5 stars';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    
    try {
      const ratingValue = Number(formData.rating);
      if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        setErrors({ submit: 'Please select a valid rating between 1 and 5 stars' });
        setSubmitting(false);
        return;
      }

      const submitData = {
        name: formData.name,
        email: formData.email,
        rating: ratingValue,
        title: formData.title,
        comment: formData.comment,
        customerId: user?.id || user?.customerId || null
      };

      const result = await onSubmit(submitData);
      
      if (result.success) {
        setFormData({
          name: user?.name || user?.fullName || '',
          email: user?.email || '',
          rating: 5,
          title: '',
          comment: ''
        });
        setErrors({});
      } else {
        setErrors({ submit: result.error });
      }
    } catch (error) {
      setErrors({ submit: 'Failed to submit review' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <button
          key={i}
          type="button"
          className={`star-btn ${i <= rating ? 'active' : ''}`}
          onClick={() => handleRatingChange(i)}
        >
          <StarIcon size={24} />
        </button>
      );
    }
    return stars;
  };

  return (
    <div className="review-form-container">
      <div className="review-form">
        <div className="form-header">
          <h3>Write a Review</h3>
          <p className="form-subtitle">{productName}</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          {/* Rating Section */}
          <div className="form-section rating-section">
            <label className="form-label">Rating *</label>
            <div className="rating-input">
              {renderStars(formData.rating)}
              <span className="rating-text">
                {formData.rating === 1 && "Poor"}
                {formData.rating === 2 && "Fair"}
                {formData.rating === 3 && "Good"}
                {formData.rating === 4 && "Very Good"}
                {formData.rating === 5 && "Excellent"}
              </span>
            </div>
            {errors.rating && <span className="error-message">{errors.rating}</span>}
          </div>

          {/* Title */}
          <div className="form-section">
            <label htmlFor="title" className="form-label">Review Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Summarize your experience"
              className={`form-input ${errors.title ? 'error' : ''}`}
            />
            {errors.title && <span className="error-message">{errors.title}</span>}
          </div>

          {/* Comment */}
          <div className="form-section">
            <label htmlFor="comment" className="form-label">Your Review *</label>
            <textarea
              id="comment"
              name="comment"
              value={formData.comment}
              onChange={handleInputChange}
              placeholder="Share your detailed experience with this product"
              rows="6"
              className={`form-textarea ${errors.comment ? 'error' : ''}`}
            />
            <div className="character-count">{formData.comment.length}/500</div>
            {errors.comment && <span className="error-message">{errors.comment}</span>}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="error-message submit-error">
              {errors.submit}
            </div>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <button 
              type="button" 
              className="btn-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReviewForm;
