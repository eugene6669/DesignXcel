import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bars } from 'react-loader-spinner';
import { validateEmail } from '../../../shared/utils/validation/formValidation';
import { FaEnvelope, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import './auth.css';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({ email: '' });
    const [touchedFields, setTouchedFields] = useState({ email: false });
    const [currentVisualIndex, setCurrentVisualIndex] = useState(0);
    const [testimonials, setTestimonials] = useState([]);
    const [testimonialsLoading, setTestimonialsLoading] = useState(true);
    
    const navigate = useNavigate();
    
    // Visual section data - fallback data in case API fails
    const fallbackVisualData = [
        {
            backgroundImage: '/img/login-bg.jpg',
            testimonial: "Design Excellence transformed our office space into a modern, functional environment that boosts productivity and employee satisfaction.",
            author: "Cameron Williamson",
            role: "Interior Designer"
        },
        {
            backgroundImage: '/img/pexels-staircase.jpg',
            testimonial: "The attention to detail and quality craftsmanship in every piece we've purchased has exceeded our expectations.",
            author: "Annette Black",
            role: "Architecture"
        }
    ];

    // Fetch real testimonials from backend
    useEffect(() => {
        const fetchTestimonials = async () => {
            try {
                setTestimonialsLoading(true);
                const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
                const response = await fetch(`${apiBase}/api/testimonials`);
                if (response && response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        // Transform backend data to match our visual data format
                        const transformedTestimonials = data.map((testimonial, index) => ({
                            backgroundImage: index % 2 === 0 ? '/img/login-bg.jpg' : '/img/pexels-staircase.jpg',
                            testimonial: testimonial.text,
                            author: testimonial.name,
                            role: testimonial.profession,
                            rating: testimonial.rating,
                            imageUrl: testimonial.imageUrl
                        }));
                        setTestimonials(transformedTestimonials);
                    } else {
                        // Use fallback data if no testimonials found
                        setTestimonials(fallbackVisualData);
                    }
                } else {
                    // Use fallback data on error
                    setTestimonials(fallbackVisualData);
                }
            } catch (error) {
                console.error('Error fetching testimonials:', error);
                // Use fallback data on error
                setTestimonials(fallbackVisualData);
            } finally {
                setTestimonialsLoading(false);
            }
        };

        fetchTestimonials();
    }, []);

    // Auto-rotate visual content
    useEffect(() => {
        if (testimonials.length === 0) return;
        
        const interval = setInterval(() => {
            setCurrentVisualIndex((prev) => (prev + 1) % testimonials.length);
        }, 5000); // Change every 5 seconds

        return () => clearInterval(interval);
    }, [testimonials.length]);

    const handleEmailChange = (e) => {
        let value = e.target.value;
        // Limit email to 32 characters
        value = value.slice(0, 32);
        setEmail(value);
        setTouchedFields({ email: true });
        
        // Real-time validation
        const emailValidation = validateEmail(value);
        setFieldErrors({ email: emailValidation.error || '' });
        
        // Clear general error when user starts typing
        if (error) {
            setError('');
        }
    };

    const handleBlur = () => {
        setTouchedFields({ email: true });
        const emailValidation = validateEmail(email);
        setFieldErrors({ email: emailValidation.error || '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(false);
        setTouchedFields({ email: true });

        // Validate email before submitting
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
            setFieldErrors({ email: emailValidation.error });
            setLoading(false);
            return;
        }

        try {
            const apiBase2 = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiBase2}/api/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(true);
            } else {
                setError(data.message || 'Failed to send reset email. Please try again.');
            }
        } catch (err) {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        navigate('/login');
    };

    return (
        <div className="auth-page-new">
            <div className="auth-container-new">
                {/* Left Side - Form */}
                <div className="auth-form-section">
                    <div className="auth-form-wrapper">
                        {/* Logo */}
                        <div className="auth-logo">
                            <img 
                                src="/design-excellence-logo.png" 
                                alt="Design Excellence" 
                                className="logo-image"
                            />
                        </div>

                        {/* Form Header */}
                        <div className="auth-form-header">
                            <h1>Forgot Password</h1>
                            <p className="auth-subtitle">
                                {success 
                                    ? 'Check your email for reset instructions.'
                                    : 'Enter your email address and we\'ll send you a link to reset your password.'
                                }
                            </p>
                        </div>

                        {/* Form */}
                        {!success ? (
                            <form onSubmit={handleSubmit} className="auth-form-new">
                                {error && (
                                    <div className="error-message-new">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="12" r="10" stroke="#e74c3c" strokeWidth="2"/>
                                            <path d="M15 9l-6 6M9 9l6 6" stroke="#e74c3c" strokeWidth="2"/>
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="form-group-new">
                                    <label>Email Address *</label>
                                    <div className="input-wrapper input-with-icon">
                                        <FaEnvelope className="input-icon" />
                                        <input
                                            type="email"
                                            name="email"
                                            placeholder="Enter your email address"
                                            value={email}
                                            onChange={handleEmailChange}
                                            onBlur={handleBlur}
                                            required
                                            maxLength={32}
                                            className={touchedFields.email && fieldErrors.email ? 'input-error' : ''}
                                        />
                                    </div>
                                    {touchedFields.email && fieldErrors.email && (
                                        <div className="field-error-message">
                                            <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                            {fieldErrors.email}
                                        </div>
                                    )}
                                </div>

                                {/* Submit Button */}
                                <button 
                                    type="submit" 
                                    className="auth-submit-btn-new" 
                                    disabled={loading || !email}
                                >
                                    {loading ? (
                                        <Bars color="#ffffff" height={20} width={20} />
                                    ) : (
                                        'Send Reset Link'
                                    )}
                                </button>
                            </form>
                        ) : (
                            <div className="success-container-new">
                                <div className="success-icon-wrapper">
                                    <div className="success-icon-circle">
                                        <FaCheckCircle className="success-icon" />
                                    </div>
                                </div>
                                
                                <div className="success-content">
                                    <h2 className="success-title">Password reset email sent successfully!</h2>
                                    
                                    <div className="success-message-box">
                                        <p className="success-text">
                                            We've sent a password reset link to <span className="success-email">{email}</span>
                                        </p>
                                        <p className="success-text">
                                            Please check your email and follow the instructions to reset your password.
                                        </p>
                                        <p className="success-text success-hint">
                                            If you don't see the email, check your spam folder.
                                        </p>
                                    </div>

                                    <button 
                                        type="button" 
                                        className="auth-submit-btn-new"
                                        onClick={handleBackToLogin}
                                    >
                                        Back to Login
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Back to Login Link */}
                        {!success && (
                            <div className="auth-switch-link">
                                Remember your password?{' '}
                                <Link to="/login" className="switch-link-btn">
                                    Sign In
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side - Visual */}
                <div 
                    className="auth-visual-section"
                    style={{
                        backgroundImage: testimonials.length > 0 ? `url(${testimonials[currentVisualIndex]?.backgroundImage})` : 'linear-gradient(135deg, #4D5157 0%, #36454f 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    }}
                >
                    <div className="auth-visual-wrapper">
                        <div className="visual-content">
                            {testimonialsLoading ? (
                                <div className="testimonial-overlay">
                                    <div className="loading-spinner">
                                        <Bars color="#F0B21B" height={80} width={80} />
                                        <p>Loading testimonials...</p>
                                    </div>
                                </div>
                            ) : testimonials.length > 0 ? (
                                <>
                                    <div className="testimonial-overlay">
                                        <p className="testimonial-quote">
                                            "{testimonials[currentVisualIndex]?.testimonial}"
                                        </p>
                                        <div className="testimonial-author">
                                            <h4>{testimonials[currentVisualIndex]?.author}</h4>
                                            <p>{testimonials[currentVisualIndex]?.role}</p>
                                            {testimonials[currentVisualIndex]?.rating && (
                                                <div className="testimonial-rating">
                                                    {[...Array(5)].map((_, i) => (
                                                        <span 
                                                            key={i} 
                                                            className={`star ${i < testimonials[currentVisualIndex].rating ? 'filled' : ''}`}
                                                        >
                                                            ★
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="carousel-indicators">
                                        {testimonials.map((_, index) => (
                                            <div 
                                                key={index}
                                                className={`indicator ${index === currentVisualIndex ? 'active' : ''}`}
                                                onClick={() => setCurrentVisualIndex(index)}
                                            ></div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="testimonial-overlay">
                                    <p className="testimonial-quote">
                                        "Welcome to Design Excellence - Your trusted partner in creating beautiful spaces."
                                    </p>
                                    <div className="testimonial-author">
                                        <h4>Design Excellence Team</h4>
                                        <p>Interior Design Specialists</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
export { ForgotPasswordPage };
