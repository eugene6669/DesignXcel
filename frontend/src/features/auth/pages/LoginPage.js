import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import Captcha from '../components/Captcha';
import TermsModal from '../components/TermsModal';
import SignupSuccessModal from '../components/SignupSuccessModal';
import { validatePassword } from '../../../shared/utils/validation/passwordValidation';
import { 
    validateEmail, 
    validatePasswordBasic, 
    validateName, 
    validatePhone, 
    validateOTP,
    validatePasswordMatch,
    validateSignInForm,
    validateSignUpForm
} from '../../../shared/utils/validation/formValidation';
import { FaEnvelope, FaLock, FaUser, FaPhone, FaShieldAlt, FaEye, FaEyeSlash, FaExclamationCircle, FaKey, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import './auth.css';
import apiClient from '../../../shared/services/api/apiClient';

const Login = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    // Furniture images for visual section - using 3 high-quality furniture images
    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const furnitureImages = [
        `${apiBase}/img/login-bg.jpg`,
        `${apiBase}/img/pexels-staircase.jpg`,
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&h=800&fit=crop&q=80'
    ];
    
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phone: ''
    });
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordValidation, setPasswordValidation] = useState(null);
    
    // Form validation errors state
    const [fieldErrors, setFieldErrors] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phone: '',
        otp: ''
    });
    
    // Track which fields have been touched
    const [touchedFields, setTouchedFields] = useState({
        email: false,
        password: false,
        confirmPassword: false,
        firstName: false,
        lastName: false,
        phone: false,
        otp: false
    });
    
    // Modal states
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [hasReadTerms, setHasReadTerms] = useState(false);
    const [hasReadPrivacy, setHasReadPrivacy] = useState(false);
    const [showSignupSuccessModal, setShowSignupSuccessModal] = useState(false);
    const [signupUserData, setSignupUserData] = useState(null);
    
    // --- OTP registration states ---
    const [registerStep, setRegisterStep] = useState(1); // 1=email, 2=otp, 3=full
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState('');
    // ---
    
    // --- Captcha states ---
    const [captchaVerified, setCaptchaVerified] = useState(false);
    // ---
    
    const { loginCustomer, registerCustomer, syncSessionTokens } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [googleSignInOffered, setGoogleSignInOffered] = useState(false);

    // Google-like password generator (random characters like "lksdfsd234")
    const generateSecurePassword = () => {
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        
        // Generate random password: mix of lowercase, uppercase, numbers, and special chars
        // Length: 12-16 characters (random, max 16)
        const length = Math.floor(Math.random() * 5) + 12; // 12-16 chars
        let password = '';
        
        // Ensure at least one of each type
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += special[Math.floor(Math.random() * special.length)];
        
        // Fill the rest randomly (up to 16 chars max)
        const allChars = lowercase + uppercase + numbers + special;
        const maxLength = Math.min(length, 16); // Ensure max 16 characters
        for (let i = password.length; i < maxLength; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }
        
        // Shuffle the password to randomize character positions
        password = password.split('').sort(() => Math.random() - 0.5).join('');
        
        return password;
    };

    const handleGeneratePassword = () => {
        const newPassword = generateSecurePassword();
        setFormData({
            ...formData,
            password: newPassword,
            confirmPassword: newPassword
        });
        
        // Validate the generated password
        const validation = validatePassword(newPassword);
        setPasswordValidation(validation);
    };

    // Public terms for signup
    const [publicTerms, setPublicTerms] = useState(null);

    // Get the intended destination from location state
    const from = location.state?.from?.pathname || '/';

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await apiClient.get('/api/auth/social-providers');
                if (mounted && res && res.google) setGoogleSignInOffered(true);
            } catch (_) {
                /* ignore */
            }
        })();
        return () => { mounted = false; };
    }, []);

    const finalizeCustomerLoginRedirect = useCallback((customerUser) => {
        if (!customerUser) return;
        if (customerUser.requiresPasswordSetup) {
            navigate('/account?tab=security&passwordRequired=1', { replace: true });
            return;
        }
        const guestCart = localStorage.getItem('shopping-cart-guest');
        let hasGuestCartItems = false;
        if (guestCart) {
            try {
                const guestCartData = JSON.parse(guestCart);
                hasGuestCartItems = guestCartData.items && guestCartData.items.length > 0;
            } catch (e) {
                console.error('Error checking guest cart:', e);
            }
        }
        const checkoutIntent = localStorage.getItem('checkout-intent') === 'true';
        let redirectTo = from;
        if (from.startsWith('/admin')) {
            if (customerUser.role === 'Admin' || customerUser.role === 'Employee') {
                redirectTo = from;
            } else {
                redirectTo = '/';
            }
        } else if (from === '/' || from === '/login') {
            if (customerUser.role === 'Admin' || customerUser.role === 'Employee') {
                redirectTo = '/admin';
            } else if (checkoutIntent && hasGuestCartItems) {
                redirectTo = '/cart';
                localStorage.removeItem('checkout-intent');
            } else if (hasGuestCartItems) {
                redirectTo = '/cart';
            } else {
                redirectTo = '/';
            }
        } else if (checkoutIntent && hasGuestCartItems) {
            redirectTo = '/cart';
            localStorage.removeItem('checkout-intent');
        }
        navigate(redirectTo, { replace: true });
    }, [from, navigate]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const google = params.get('google');
        if (!google) return;

        if (google === 'error') {
            setError('Google sign-in was cancelled or failed.');
            window.history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
            return;
        }

        if (google !== 'success') return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            const result = await syncSessionTokens();
            if (cancelled) return;
            if (!result.success || !result.user) {
                setError('Could not complete Google sign-in. Please try again.');
                setLoading(false);
                window.history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
                return;
            }
            finalizeCustomerLoginRedirect(result.user);
            setLoading(false);
            window.history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
        })();

        return () => { cancelled = true; };
    }, [location.search, location.pathname, location.hash, syncSessionTokens, finalizeCustomerLoginRedirect]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const terms = await apiClient.get('/api/terms');
                if (mounted) setPublicTerms(terms);
            } catch (e) {
                // silent
            }
        })();
        return () => { mounted = false; };
    }, []);

    // Auto-rotate furniture images
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentImageIndex((prev) => (prev + 1) % furnitureImages.length);
        }, 5000); // Change every 5 seconds

        return () => clearInterval(interval);
    }, [furnitureImages.length]);

    const handleChange = (e) => {
        const { name } = e.target;
        let { value } = e.target;

        // Input restrictions
        if (name === 'firstName' || name === 'lastName') {
            // Allow letters, spaces, hyphens, and apostrophes
            value = value.replace(/[^A-Za-z\s'-]/g, '');
            // Limit to 32 characters
            value = value.slice(0, 32);
        }
        if (name === 'phone') {
            // Digits only and limit to 11 characters
            value = value.replace(/\D/g, '').slice(0, 11);
        }
        if (name === 'otp') {
            // Digits only and limit to 6 characters
            value = value.replace(/\D/g, '').slice(0, 6);
        }
        if (name === 'password') {
            // Limit password to 16 characters
            value = value.slice(0, 16);
        }
        if (name === 'confirmPassword') {
            // Limit confirm password to 16 characters
            value = value.slice(0, 16);
        }
        if (name === 'email') {
            // Limit email to 32 characters
            value = value.slice(0, 32);
        }

        setFormData({
            ...formData,
            [name]: value
        });
        
        // Mark field as touched
        setTouchedFields(prev => ({
            ...prev,
            [name]: true
        }));
        
        // Real-time validation
        validateField(name, value);
        
        // Validate password in real-time when password field changes
        if (name === 'password' && !isLogin) {
            if (value.length > 0) {
                const validation = validatePassword(value);
                setPasswordValidation(validation);
            } else {
                setPasswordValidation(null);
            }
        }
        
        // Validate password match when confirmPassword changes
        if (name === 'confirmPassword' && !isLogin) {
            validateField('confirmPassword', value, formData.password);
        }
        
        // Clear general error when user starts typing
        if (error) {
            setError('');
        }
    };
    
    // Validate individual field
    const validateField = (fieldName, value, additionalValue = null) => {
        let validation = { isValid: true, error: '' };
        
        switch (fieldName) {
            case 'email':
                validation = validateEmail(value);
                break;
            case 'password':
                validation = validatePasswordBasic(value);
                // For sign up, also check passwordValidation state if it exists
                if (!isLogin && passwordValidation && !passwordValidation.isValid && value.length > 0) {
                    // Don't override basic validation, but we'll show passwordValidation errors separately
                }
                break;
            case 'confirmPassword':
                if (!isLogin && additionalValue !== null) {
                    validation = validatePasswordMatch(additionalValue, value);
                }
                break;
            case 'firstName':
                validation = validateName(value, 'First name');
                break;
            case 'lastName':
                validation = validateName(value, 'Last name');
                break;
            case 'phone':
                validation = validatePhone(value);
                break;
            case 'otp':
                validation = validateOTP(value);
                break;
            default:
                break;
        }
        
        setFieldErrors(prev => ({
            ...prev,
            [fieldName]: validation.error || ''
        }));
        
        return validation.isValid;
    };
    
    // Handle blur event for validation
    const handleBlur = (e) => {
        const { name, value } = e.target;
        setTouchedFields(prev => ({
            ...prev,
            [name]: true
        }));
        
        if (name === 'confirmPassword') {
            validateField(name, value, formData.password);
        } else {
            validateField(name, value);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                // Mark all fields as touched for validation display
                setTouchedFields({
                    email: true,
                    password: true,
                    confirmPassword: false,
                    firstName: false,
                    lastName: false,
                    phone: false,
                    otp: false
                });
                
                // Validate sign in form
                const signInValidation = validateSignInForm(formData);
                if (!signInValidation.isValid) {
                    setFieldErrors(prev => ({
                        ...prev,
                        ...signInValidation.errors
                    }));
                    setLoading(false);
                    return;
                }
                
                const result = await loginCustomer(formData.email, formData.password, rememberMe);
                if (result.success) {
                    finalizeCustomerLoginRedirect(result.user);
                } else {
                    // Show specific error message for incorrect password
                    if (result.code === 'OAUTH_ONLY') {
                        setError('This account uses Google sign-in. Use Continue with Google below.');
                    } else if (result.code === 'INCORRECT_PASSWORD' || result.error?.toLowerCase().includes('incorrect password')) {
                        setError('Incorrect password. Please check your password and try again.');
                    } else {
                        setError(result.error);
                    }
                }
            } else {
                // Mark all sign up fields as touched for validation display
                setTouchedFields({
                    email: true,
                    password: true,
                    confirmPassword: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    otp: false
                });
                
                // Validate sign up form
                const signUpValidation = validateSignUpForm(formData, passwordValidation);
                if (!signUpValidation.isValid) {
                    setFieldErrors(prev => ({
                        ...prev,
                        ...signUpValidation.errors
                    }));
                    setLoading(false);
                    return;
                }

                // Validate password before registration
                if (!passwordValidation || !passwordValidation.isValid) {
                    setFieldErrors(prev => ({
                        ...prev,
                        password: 'Please fix password requirements before proceeding'
                    }));
                    setLoading(false);
                    return;
                }

                // Check if passwords match
                if (formData.password !== formData.confirmPassword) {
                    setFieldErrors(prev => ({
                        ...prev,
                        confirmPassword: 'Passwords do not match'
                    }));
                    setLoading(false);
                    return;
                }

                // Check if terms and privacy policy are accepted
                if (!acceptedTerms) {
                    setError('You must accept the terms and conditions to continue');
                    setLoading(false);
                    return;
                }
                
                if (!acceptedPrivacy) {
                    setError('You must accept the privacy policy to continue');
                    setLoading(false);
                    return;
                }

                // Compose fullName and map phone to phoneNumber for backend
                const registrationData = {
                    fullName: (formData.firstName + ' ' + formData.lastName).trim(),
                    email: formData.email,
                    phoneNumber: formData.phone,
                    password: formData.password,
                    confirmPassword: formData.confirmPassword
                };
                const result = await registerCustomer(registrationData);
                if (result.success) {
                    // Store user data and show success modal
                    setSignupUserData(result.user);
                    setShowSignupSuccessModal(true);
                } else {
                    setError(result.error);
                }
            }
        } catch (err) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // --- Captcha handlers ---
    const handleCaptchaVerified = () => {
        setCaptchaVerified(true);
    };

    // --- Signup success modal handlers ---
    const handleSignupSuccessClose = () => {
        setShowSignupSuccessModal(false);
        setSignupUserData(null);
        // Navigate to home page after modal closes
        navigate('/', { replace: true });
    };

    const handleCaptchaReset = () => {
        setCaptchaVerified(false);
    };
    // ---

    // --- OTP handlers ---
    const handleSendOtp = async (e) => {
        e.preventDefault();
        
        // Validate email before sending OTP
        setTouchedFields(prev => ({
            ...prev,
            email: true
        }));
        
        const emailValidation = validateEmail(formData.email);
        if (!emailValidation.isValid) {
            setFieldErrors(prev => ({
                ...prev,
                email: emailValidation.error
            }));
            setOtpError(emailValidation.error);
            return;
        }
        
        // Check if captcha is verified
        if (!captchaVerified) {
            setOtpError('Please complete the security verification first');
            return;
        }
        
        setOtpLoading(true);
        setOtpError('');
        setFieldErrors(prev => ({
            ...prev,
            email: ''
        }));
        try {
            const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const res = await fetch(`${apiBase}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });
            const data = await res.json();
            if (data.success) {
                setOtpSent(true);
                setRegisterStep(2);
                setPasswordValidation(null); // Reset password validation when moving to next step
            } else {
                // Handle specific error cases
                if (data.code === 'EMAIL_ALREADY_EXISTS') {
                    setOtpError('This email is already registered. Please use a different email or try logging in instead.');
                } else {
                    setOtpError(data.message || 'Failed to send OTP');
                }
            }
        } catch (err) {
            setOtpError('Failed to send OTP');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        
        // Validate OTP before sending
        const otpValidation = validateOTP(otp);
        if (!otpValidation.isValid) {
            setFieldErrors(prev => ({
                ...prev,
                otp: otpValidation.error
            }));
            setTouchedFields(prev => ({
                ...prev,
                otp: true
            }));
            return;
        }
        
        setOtpLoading(true);
        setOtpError('');
        setFieldErrors(prev => ({
            ...prev,
            otp: ''
        }));
        try {
            const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const res = await fetch(`${apiBase}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, otp })
            });
            const data = await res.json();
            if (data.success) {
                setOtpVerified(true);
                setRegisterStep(3);
                setPasswordValidation(null); // Reset password validation when moving to next step
            } else {
                setOtpError(data.message || 'Invalid OTP');
            }
        } catch (err) {
            setOtpError('Failed to verify OTP');
        } finally {
            setOtpLoading(false);
        }
    };
    // ---

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
                            <h1>{isLogin ? 'Sign In' : 'Sign Up'}</h1>
                            <p className="auth-subtitle">
                                {isLogin
                                    ? 'Please fill your detail to access your account.'
                                    : 'Fill your information below or register with your social account.'
                                }
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="auth-form-new">
                            {error && (
                                <div className="error-message-new">
                                    <FaExclamationCircle style={{ fontSize: '20px', flexShrink: 0 }} />
                                    <span>{error}</span>
                                </div>
                            )}

                                    {/* Registration multi-step logic */}
                                    {!isLogin && (
                                        <>
                                            {/* Step 1: Email input and send OTP */}
                                            {registerStep === 1 && (
                                                <div className="form-group-modern">
                                                    <label>Email Address</label>
                                                    <div className="input-wrapper input-with-icon">
                                                        <FaEnvelope className="input-icon" />
                                                        <input
                                                            type="email"
                                                            name="email"
                                                            placeholder="Enter your email address"
                                                            value={formData.email}
                                                            onChange={handleChange}
                                                            onBlur={handleBlur}
                                                            required
                                                            disabled={otpSent}
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
                                                    
                                                    {/* Security Verification Message */}
                                                    <div className="security-notice" style={{ 
                                                        background: '#f8f9fa', 
                                                        border: '1px solid #e9ecef', 
                                                        borderRadius: '8px', 
                                                        padding: '10px', 
                                                        margin: '10px 0',
                                                        fontSize: '0.85rem',
                                                        color: '#6c757d',
                                                        textAlign: 'center',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '6px'
                                                    }}>
                                                        <FaShieldAlt style={{ fontSize: '14px', color: '#F0B21B' }} />
                                                        <span>Complete the security verification below to send OTP</span>
                                                    </div>
                                                    
                                                    {/* Captcha Component */}
                                                    <Captcha 
                                                        onCaptchaVerified={handleCaptchaVerified}
                                                        isVerified={captchaVerified}
                                                        onReset={handleCaptchaReset}
                                                    />
                                                    
                                                    <button
                                                        type="button"
                                                        className="auth-submit-btn-modern"
                                                        onClick={handleSendOtp}
                                                        disabled={otpLoading || !formData.email || !captchaVerified}
                                                        style={{ marginTop: 12 }}
                                                    >
                                                        {otpLoading ? 'Sending OTP...' : 
                                                         !captchaVerified ? 'Complete Security Verification' : 'Send OTP'}
                                                    </button>
                                                    {otpError && (
                                                        <div className="error-message-modern">
                                                            <span>{otpError}</span>
                                                            {otpError.includes('already registered') && (
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setIsLogin(true)}
                                                                    className="error-login-link"
                                                                >
                                                                    Click here to login instead
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {/* Step 2: OTP input and verify */}
                                            {registerStep === 2 && (
                                                <div className="form-group-modern">
                                                    <label>Enter OTP sent to your email</label>
                                                    <div className="input-wrapper input-with-icon">
                                                        <FaShieldAlt className="input-icon" />
                                                        <input
                                                            type="text"
                                                            name="otp"
                                                            placeholder="Enter OTP"
                                                            value={otp}
                                                            onChange={e => {
                                                                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                                setOtp(value);
                                                                setTouchedFields(prev => ({ ...prev, otp: true }));
                                                                const validation = validateOTP(value);
                                                                setFieldErrors(prev => ({ ...prev, otp: validation.error || '' }));
                                                            }}
                                                            onBlur={() => {
                                                                setTouchedFields(prev => ({ ...prev, otp: true }));
                                                                validateField('otp', otp);
                                                            }}
                                                            required
                                                            className={touchedFields.otp && fieldErrors.otp ? 'input-error' : ''}
                                                        />
                                                    </div>
                                                    {touchedFields.otp && fieldErrors.otp && (
                                                        <div className="field-error-message">
                                                            <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                                            {fieldErrors.otp}
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="auth-submit-btn-modern"
                                                        onClick={handleVerifyOtp}
                                                        disabled={otpLoading || !otp}
                                                        style={{ marginTop: 12 }}
                                                    >
                                                        {otpLoading ? 'Verifying...' : 'Verify OTP'}
                                                    </button>
                                                    {otpError && <div className="error-message-modern"><span>{otpError}</span></div>}
                                                </div>
                                            )}
                            {/* Registration fields */}
                            {!isLogin && registerStep === 3 && (
                                <>
                                    <div className="form-row-new">
                                        <div className="form-group-new">
                                            <label>First Name *</label>
                                            <div className="input-with-icon">
                                                <FaUser className="input-icon" />
                                                <input
                                                    type="text"
                                                    name="firstName"
                                                    placeholder="Enter First Name"
                                                    value={formData.firstName}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    maxLength={32}
                                                    required
                                                    className={touchedFields.firstName && fieldErrors.firstName ? 'input-error' : ''}
                                                />
                                            </div>
                                            {touchedFields.firstName && fieldErrors.firstName && (
                                                <div className="field-error-message">
                                                    <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                                    {fieldErrors.firstName}
                                                </div>
                                            )}
                                        </div>
                                        <div className="form-group-new">
                                            <label>Last Name *</label>
                                            <div className="input-with-icon">
                                                <FaUser className="input-icon" />
                                                <input
                                                    type="text"
                                                    name="lastName"
                                                    placeholder="Enter Last Name"
                                                    value={formData.lastName}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    maxLength={32}
                                                    required
                                                    className={touchedFields.lastName && fieldErrors.lastName ? 'input-error' : ''}
                                                />
                                            </div>
                                            {touchedFields.lastName && fieldErrors.lastName && (
                                                <div className="field-error-message">
                                                    <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                                    {fieldErrors.lastName}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="form-group-new">
                                        <label>Email *</label>
                                        <div className="input-with-icon">
                                            <FaEnvelope className="input-icon" />
                                            <input
                                                type="email"
                                                name="email"
                                                placeholder="Enter Email Address"
                                                value={formData.email}
                                                onChange={handleChange}
                                                required
                                                disabled
                                                maxLength={32}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group-new">
                                        <label>Phone Number *</label>
                                        <div className="input-with-icon">
                                            <FaPhone className="input-icon" />
                                            <input
                                                type="tel"
                                                name="phone"
                                                placeholder="Enter Phone Number (11 digits)"
                                                value={formData.phone}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                required
                                                className={touchedFields.phone && fieldErrors.phone ? 'input-error' : ''}
                                            />
                                        </div>
                                        {touchedFields.phone && fieldErrors.phone && (
                                            <div className="field-error-message">
                                                <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                                {fieldErrors.phone}
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group-new">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label>Password *</label>
                                            <button 
                                                type="button" 
                                                className="generate-password-btn-inline"
                                                onClick={handleGeneratePassword}
                                                title="Generate secure password"
                                            >
                                                <FaKey style={{ fontSize: '12px', marginRight: '4px' }} />
                                                Generate
                                            </button>
                                        </div>
                                        <div className="password-input-wrapper">
                                            <FaLock className="input-icon" />
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                placeholder="Enter Password (max 16 characters)"
                                                value={formData.password}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                maxLength={16}
                                                required
                                                className={touchedFields.password && fieldErrors.password ? 'input-error' : ''}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? (
                                                    <FaEyeSlash style={{ fontSize: '18px', color: '#666' }} />
                                                ) : (
                                                    <FaEye style={{ fontSize: '18px', color: '#666' }} />
                                                )}
                                            </button>
                                        </div>
                                        
                                        {/* Compact Password Format Indicator */}
                                        {formData.password && (
                                            <div className="password-format-indicator-compact">
                                                <div className="format-requirements-compact">
                                                    <ul className="format-list-compact">
                                                        <li className={formData.password.length >= 8 && formData.password.length <= 16 ? 'valid' : 'invalid'}>
                                                            {formData.password.length >= 8 && formData.password.length <= 16 ? (
                                                                <FaCheckCircle style={{ fontSize: '12px' }} />
                                                            ) : (
                                                                <FaTimesCircle style={{ fontSize: '12px' }} />
                                                            )}
                                                            <span>8-16 characters</span>
                                                        </li>
                                                        <li className={/[A-Z]/.test(formData.password) ? 'valid' : 'invalid'}>
                                                            {/[A-Z]/.test(formData.password) ? (
                                                                <FaCheckCircle style={{ fontSize: '12px' }} />
                                                            ) : (
                                                                <FaTimesCircle style={{ fontSize: '12px' }} />
                                                            )}
                                                            <span>Uppercase</span>
                                                        </li>
                                                        <li className={/[a-z]/.test(formData.password) ? 'valid' : 'invalid'}>
                                                            {/[a-z]/.test(formData.password) ? (
                                                                <FaCheckCircle style={{ fontSize: '12px' }} />
                                                            ) : (
                                                                <FaTimesCircle style={{ fontSize: '12px' }} />
                                                            )}
                                                            <span>Lowercase</span>
                                                        </li>
                                                        <li className={/\d/.test(formData.password) ? 'valid' : 'invalid'}>
                                                            {/\d/.test(formData.password) ? (
                                                                <FaCheckCircle style={{ fontSize: '12px' }} />
                                                            ) : (
                                                                <FaTimesCircle style={{ fontSize: '12px' }} />
                                                            )}
                                                            <span>Number</span>
                                                        </li>
                                                        <li className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'valid' : 'invalid'}>
                                                            {/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? (
                                                                <FaCheckCircle style={{ fontSize: '12px' }} />
                                                            ) : (
                                                                <FaTimesCircle style={{ fontSize: '12px' }} />
                                                            )}
                                                            <span>Special</span>
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}

                                        {/* Compact Password Strength Indicator */}
                                        {passwordValidation && formData.password && (
                                            <PasswordStrengthIndicator 
                                                password={formData.password}
                                                showRequirements={false}
                                            />
                                        )}
                                        
                                        {touchedFields.password && fieldErrors.password && (
                                            <div className="field-error-message">
                                                <FaExclamationCircle style={{ fontSize: '12px', marginRight: '4px' }} />
                                                {fieldErrors.password}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="form-group-new">
                                        <label>Confirm Password *</label>
                                        <div className="password-input-wrapper">
                                            <FaLock className="input-icon" />
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="confirmPassword"
                                                placeholder="Confirm Password (max 16 characters)"
                                                value={formData.confirmPassword}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                maxLength={16}
                                                required
                                                className={touchedFields.confirmPassword && fieldErrors.confirmPassword ? 'input-error' : ''}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? (
                                                    <FaEyeSlash style={{ fontSize: '18px', color: '#666' }} />
                                                ) : (
                                                    <FaEye style={{ fontSize: '18px', color: '#666' }} />
                                                )}
                                            </button>
                                        </div>
                                        {/* Password Match Indicator */}
                                        {formData.confirmPassword && !fieldErrors.confirmPassword && (
                                            <div className={`password-match-indicator ${formData.password === formData.confirmPassword ? 'match' : 'no-match'}`}>
                                                {formData.password === formData.confirmPassword ? (
                                                    <span className="match-text">✓ Passwords match</span>
                                                ) : (
                                                    <span className="no-match-text">✗ Passwords do not match</span>
                                                )}
                                            </div>
                                        )}
                                        {touchedFields.confirmPassword && fieldErrors.confirmPassword && (
                                            <div className="field-error-message">
                                                <FaExclamationCircle style={{ fontSize: '12px', marginRight: '4px' }} />
                                                {fieldErrors.confirmPassword}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Terms and Conditions */}
                                    <div className="terms-checkbox-new">
                                        <input
                                            type="checkbox"
                                            id="acceptTerms"
                                            checked={acceptedTerms}
                                            onChange={(e) => {
                                                if (hasReadTerms) {
                                                    setAcceptedTerms(e.target.checked);
                                                } else {
                                                    setShowTermsModal(true);
                                                }
                                            }}
                                            disabled={!hasReadTerms}
                                            required
                                            className={!hasReadTerms ? 'terms-checkbox-disabled' : ''}
                                        />
                                        <label 
                                            htmlFor="acceptTerms"
                                            className={!hasReadTerms ? 'terms-label-disabled' : ''}
                                            onClick={() => {
                                                if (!hasReadTerms) {
                                                    setShowTermsModal(true);
                                                }
                                            }}
                                        >
                                            {!hasReadTerms ? (
                                                <>Please read the <span 
                                                    className="terms-link" 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowTermsModal(true);
                                                    }}
                                                >Terms & Conditions</span> first</>
                                            ) : (
                                                <>I agree to the <span 
                                                    className="terms-link" 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowTermsModal(true);
                                                    }}
                                                >Terms & Conditions</span></>
                                            )}
                                        </label>
                                    </div>
                                    
                                    {/* Privacy Policy */}
                                    <div className="terms-checkbox-new">
                                        <input
                                            type="checkbox"
                                            id="acceptPrivacy"
                                            checked={acceptedPrivacy}
                                            onChange={(e) => {
                                                if (hasReadPrivacy) {
                                                    setAcceptedPrivacy(e.target.checked);
                                                } else {
                                                    setShowPrivacyModal(true);
                                                }
                                            }}
                                            disabled={!hasReadPrivacy}
                                            required
                                            className={!hasReadPrivacy ? 'terms-checkbox-disabled' : ''}
                                        />
                                        <label 
                                            htmlFor="acceptPrivacy"
                                            className={!hasReadPrivacy ? 'terms-label-disabled' : ''}
                                            onClick={() => {
                                                if (!hasReadPrivacy) {
                                                    setShowPrivacyModal(true);
                                                }
                                            }}
                                        >
                                            {!hasReadPrivacy ? (
                                                <>Please read the <span 
                                                    className="terms-link" 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowPrivacyModal(true);
                                                    }}
                                                >Privacy Policy</span> first</>
                                            ) : (
                                                <>I agree to the <span 
                                                    className="terms-link" 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowPrivacyModal(true);
                                                    }}
                                                >Privacy Policy</span></>
                                            )}
                                        </label>
                                    </div>
                                </>
                            )}
                                        </>
                                    )}

                            {/* Login fields */}
                            {isLogin && (
                                <>
                                    <div className="form-group-new">
                                        <label>Email *</label>
                                        <div className="input-with-icon">
                                            <FaEnvelope className="input-icon" />
                                            <input
                                                type="email"
                                                name="email"
                                                placeholder="Enter Email Address"
                                                value={formData.email}
                                                onChange={handleChange}
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
                                    <div className="form-group-new">
                                        <label>Password *</label>
                                        <div className="password-input-wrapper">
                                            <FaLock className="input-icon" />
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                placeholder="Enter Password"
                                                value={formData.password}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                required
                                                className={touchedFields.password && fieldErrors.password ? 'input-error' : ''}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? (
                                                    <FaEyeSlash style={{ fontSize: '18px', color: '#666' }} />
                                                ) : (
                                                    <FaEye style={{ fontSize: '18px', color: '#666' }} />
                                                )}
                                            </button>
                                        </div>
                                        {touchedFields.password && fieldErrors.password && (
                                            <div className="field-error-message">
                                                <FaExclamationCircle style={{ fontSize: '14px', marginRight: '4px' }} />
                                                {fieldErrors.password}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Remember me and Forgot password */}
                            {isLogin && (
                                <div className="form-options-new">
                                    <label className="remember-me">
                                        <input 
                                            type="checkbox" 
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        Remember me
                                    </label>
                                    <Link to="/forgot-password" className="forgot-password-link">
                                        Forgot Password?
                                    </Link>
                                </div>
                            )}

                            {/* Submit Button */}
                            <button type="submit" className="auth-submit-btn-new" disabled={loading || (!isLogin && registerStep !== 3) || (!isLogin && (!acceptedTerms || !acceptedPrivacy))}>
                                {loading ? (isLogin ? 'Signing In...' : 'Signing Up...') : (isLogin ? 'Sign In' : 'Sign Up')}
                            </button>

                            {isLogin && googleSignInOffered && (
                                <>
                                    <div className="auth-oauth-divider auth-oauth-divider--after-primary" role="separator">
                                        <span>or</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="google-oauth-btn"
                                        disabled={loading}
                                        onClick={() => {
                                            window.location.href = `${apiBase}/api/auth/google`;
                                        }}
                                    >
                                        <span className="google-oauth-btn__logo" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" width="18" height="18">
                                                <path
                                                    fill="#4285F4"
                                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                />
                                                <path
                                                    fill="#34A853"
                                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                />
                                                <path
                                                    fill="#FBBC05"
                                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                                />
                                                <path
                                                    fill="#EA4335"
                                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                />
                                            </svg>
                                        </span>
                                        <span className="google-oauth-btn__label">Continue with Google</span>
                                    </button>
                                </>
                            )}

                        </form>

                        {/* Sign Up Link */}
                        <div className="auth-switch-link">
                            {isLogin ? (
                                <>
                                    Don't have an account?{' '}
                                    <button 
                                        type="button" 
                                        className="switch-link-btn"
                                        onClick={() => {
                                            setIsLogin(false);
                                            setError('');
                                            setPasswordValidation(null);
                                            setFormData({
                                                email: '',
                                                password: '',
                                                confirmPassword: '',
                                                firstName: '',
                                                lastName: '',
                                                phone: ''
                                            });
                                            setAcceptedTerms(false);
                                            setCaptchaVerified(false);
                                            setRegisterStep(1);
                                            setOtpSent(false);
                                            setOtpVerified(false);
                                            setOtp('');
                                            setOtpError('');
                                            setFieldErrors({
                                                email: '',
                                                password: '',
                                                confirmPassword: '',
                                                firstName: '',
                                                lastName: '',
                                                phone: '',
                                                otp: ''
                                            });
                                            setTouchedFields({
                                                email: false,
                                                password: false,
                                                confirmPassword: false,
                                                firstName: false,
                                                lastName: false,
                                                phone: false,
                                                otp: false
                                            });
                                        }}
                                    >
                                        Sign Up
                                    </button>
                                </>
                            ) : (
                                <>
                                    Already have an account?{' '}
                                    <button 
                                        type="button" 
                                        className="switch-link-btn"
                                        onClick={() => {
                                            setIsLogin(true);
                                            setError('');
                                            setPasswordValidation(null);
                                            setFormData({
                                                email: '',
                                                password: '',
                                                confirmPassword: '',
                                                firstName: '',
                                                lastName: '',
                                                phone: ''
                                            });
                                            setAcceptedTerms(false);
                                            setCaptchaVerified(false);
                                            setRegisterStep(1);
                                            setOtpSent(false);
                                            setOtpVerified(false);
                                            setOtp('');
                                            setOtpError('');
                                            setFieldErrors({
                                                email: '',
                                                password: '',
                                                confirmPassword: '',
                                                firstName: '',
                                                lastName: '',
                                                phone: '',
                                                otp: ''
                                            });
                                            setTouchedFields({
                                                email: false,
                                                password: false,
                                                confirmPassword: false,
                                                firstName: false,
                                                lastName: false,
                                                phone: false,
                                                otp: false
                                            });
                                        }}
                                    >
                                        Sign In
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side - Visual */}
                <div 
                    className="auth-visual-section"
                    style={{
                        backgroundImage: `linear-gradient(rgba(77, 81, 87, 0.4), rgba(54, 69, 79, 0.4)), url(${furnitureImages[currentImageIndex]})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        transition: 'background-image 0.8s ease-in-out'
                    }}
                >
                    <div className="auth-visual-wrapper">
                        <div className="visual-content">
                            {/* Image Carousel Indicators */}
                            <div className="furniture-carousel-indicators">
                                {furnitureImages.map((_, index) => (
                                    <button
                                        key={index}
                                        className={`furniture-indicator ${index === currentImageIndex ? 'active' : ''}`}
                                        onClick={() => setCurrentImageIndex(index)}
                                        aria-label={`Go to image ${index + 1}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Terms and Conditions Modal */}
            <TermsModal 
                isOpen={showTermsModal}
                onClose={() => {
                    setShowTermsModal(false);
                    // Only reset if user hasn't accepted yet
                    // If hasReadTerms is already true, keep it true
                }}
                type="terms"
                onReadComplete={(read) => {
                    if (read) {
                        setHasReadTerms(true);
                        setShowTermsModal(false);
                    }
                }}
            />
            
            {/* Privacy Policy Modal */}
            <TermsModal 
                isOpen={showPrivacyModal}
                onClose={() => {
                    setShowPrivacyModal(false);
                    // Only reset if user hasn't accepted yet
                    // If hasReadPrivacy is already true, keep it true
                }}
                type="privacy"
                onReadComplete={(read) => {
                    if (read) {
                        setHasReadPrivacy(true);
                        setShowPrivacyModal(false);
                    }
                }}
            />
            
            {/* Signup Success Modal */}
            <SignupSuccessModal 
                isOpen={showSignupSuccessModal}
                onClose={handleSignupSuccessClose}
                userData={signupUserData}
            />
        </div>
    );
};

export default Login;
export { Login as LoginPage };