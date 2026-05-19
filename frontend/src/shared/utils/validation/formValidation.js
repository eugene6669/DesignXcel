// Form validation utilities

/**
 * Validates email address
 * @param {string} email - Email to validate
 * @returns {object} - Validation result with isValid and error message
 */
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return {
      isValid: false,
      error: 'Email is required'
    };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address'
    };
  }

  // Check for valid domain
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].split('.').length < 2) {
    return {
      isValid: false,
      error: 'Please enter a valid email address'
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates password (basic check, detailed validation in passwordValidation.js)
 * @param {string} password - Password to validate
 * @returns {object} - Validation result with isValid and error message
 */
export const validatePasswordBasic = (password) => {
  if (!password || password.trim() === '') {
    return {
      isValid: false,
      error: 'Password is required'
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters long'
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates first name or last name
 * @param {string} name - Name to validate
 * @param {string} fieldName - Field name for error message (e.g., 'First name', 'Last name')
 * @returns {object} - Validation result with isValid and error message
 */
export const validateName = (name, fieldName = 'Name') => {
  if (!name || name.trim() === '') {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (name.trim().length < 2) {
    return {
      isValid: false,
      error: `${fieldName} must be at least 2 characters long`
    };
  }

  // Allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[A-Za-z\s'-]+$/;
  if (!nameRegex.test(name)) {
    return {
      isValid: false,
      error: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes`
    };
  }

  if (name.trim().length > 50) {
    return {
      isValid: false,
      error: `${fieldName} must not exceed 50 characters`
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates phone number (Philippine format - 11 digits)
 * @param {string} phone - Phone number to validate
 * @returns {object} - Validation result with isValid and error message
 */
export const validatePhone = (phone) => {
  if (!phone || phone.trim() === '') {
    return {
      isValid: false,
      error: 'Phone number is required'
    };
  }

  // Remove any non-digit characters for validation
  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length !== 11) {
    return {
      isValid: false,
      error: 'Phone number must be exactly 11 digits'
    };
  }

  // Check if it starts with 09 (common Philippine mobile format)
  if (!digitsOnly.startsWith('09')) {
    return {
      isValid: false,
      error: 'Phone number must start with 09'
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates OTP code
 * @param {string} otp - OTP to validate
 * @returns {object} - Validation result with isValid and error message
 */
export const validateOTP = (otp) => {
  if (!otp || otp.trim() === '') {
    return {
      isValid: false,
      error: 'OTP is required'
    };
  }

  // OTP should be numeric and typically 4-6 digits
  const otpRegex = /^\d{4,6}$/;
  if (!otpRegex.test(otp.trim())) {
    return {
      isValid: false,
      error: 'OTP must be 4-6 digits'
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates password confirmation
 * @param {string} password - Original password
 * @param {string} confirmPassword - Confirmation password
 * @returns {object} - Validation result with isValid and error message
 */
export const validatePasswordMatch = (password, confirmPassword) => {
  if (!confirmPassword || confirmPassword.trim() === '') {
    return {
      isValid: false,
      error: 'Please confirm your password'
    };
  }

  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match'
    };
  }

  return {
    isValid: true,
    error: ''
  };
};

/**
 * Validates entire sign in form
 * @param {object} formData - Form data object
 * @returns {object} - Validation result with isValid and errors object
 */
export const validateSignInForm = (formData) => {
  const errors = {};
  let isValid = true;

  const emailValidation = validateEmail(formData.email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
    isValid = false;
  }

  const passwordValidation = validatePasswordBasic(formData.password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error;
    isValid = false;
  }

  return {
    isValid,
    errors
  };
};

/**
 * Validates entire sign up form
 * @param {object} formData - Form data object
 * @param {object} passwordValidation - Password validation result from passwordValidation.js
 * @returns {object} - Validation result with isValid and errors object
 */
export const validateSignUpForm = (formData, passwordValidation = null) => {
  const errors = {};
  let isValid = true;

  // Validate email
  const emailValidation = validateEmail(formData.email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
    isValid = false;
  }

  // Validate first name
  const firstNameValidation = validateName(formData.firstName, 'First name');
  if (!firstNameValidation.isValid) {
    errors.firstName = firstNameValidation.error;
    isValid = false;
  }

  // Validate last name
  const lastNameValidation = validateName(formData.lastName, 'Last name');
  if (!lastNameValidation.isValid) {
    errors.lastName = lastNameValidation.error;
    isValid = false;
  }

  // Validate phone
  const phoneValidation = validatePhone(formData.phone);
  if (!phoneValidation.isValid) {
    errors.phone = phoneValidation.error;
    isValid = false;
  }

  // Validate password
  if (!passwordValidation || !passwordValidation.isValid) {
    errors.password = 'Password does not meet requirements';
    isValid = false;
  } else {
    const passwordBasicValidation = validatePasswordBasic(formData.password);
    if (!passwordBasicValidation.isValid) {
      errors.password = passwordBasicValidation.error;
      isValid = false;
    }
  }

  // Validate password match
  const passwordMatchValidation = validatePasswordMatch(formData.password, formData.confirmPassword);
  if (!passwordMatchValidation.isValid) {
    errors.confirmPassword = passwordMatchValidation.error;
    isValid = false;
  }

  return {
    isValid,
    errors
  };
};

