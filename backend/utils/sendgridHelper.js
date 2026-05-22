// SendGrid Email Helper
// This module handles all email sending via SendGrid API (works on Railway)
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');
const { calculateEstimatedDeliveryDate, formatEstimatedDeliveryDateFull } = require('./deliveryEstimate');

// Prefer SENDGRID_FROM_EMAIL because it should be a verified sender identity.
const getConfiguredFromEmail = () => {
    const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL?.trim();
    const otpEmailUser = process.env.OTP_EMAIL_USER?.trim();
    return sendGridFromEmail || otpEmailUser || 'design.xcel01@gmail.com';
};

// Initialize SendGrid with API key
const initializeSendGrid = () => {
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
        console.error('❌ SENDGRID_API_KEY not found in environment variables');
        return false;
    }
    
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid initialized successfully');
    return true;
};

/**
 * Send OTP email via SendGrid
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - The OTP code to send
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOtpEmail = async (toEmail, otp) => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. OTP for development:', otp);
            return {
                success: true,
                message: 'OTP generated (SendGrid not configured)',
                development: true,
                otp: process.env.NODE_ENV === 'development' ? otp : undefined
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();

        // Read HTML template
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', 'auth', 'otp-email.html');
        let htmlTemplate = '';
        
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            console.log('⚠️ Using fallback template');
            htmlTemplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Your OTP Code - Design Excellence</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td align="center" style="padding: 40px 0;">
                                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <!-- Header -->
                                    <tr>
                                        <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                            <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                        </td>
                                    </tr>
                                    
                                    <!-- Content -->
                                    <tr>
                                        <td style="padding: 40px;">
                                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Your Verification Code</h2>
                                            <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Thank you for signing up with Design Excellence! To complete your registration, please use the verification code below:
                                            </p>
                                            
                                            <!-- OTP Box -->
                                            <div style="background: linear-gradient(135deg, #F0B21B 0%, #e0a10b 100%); border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
                                                <div style="font-size: 48px; font-weight: bold; color: #1f2937; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                                    {{OTP_CODE}}
                                                </div>
                                            </div>
                                            
                                            <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                                <strong>⏱️ This code is valid for 5 minutes.</strong>
                                            </p>
                                            
                                            <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                                If you didn't request this code, please ignore this email or contact our support team if you have concerns.
                                            </p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Footer -->
                                    <tr>
                                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                            <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                                © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                            </p>
                                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                                Need help? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `;
        }

        // Replace placeholder with actual OTP
        const htmlContent = htmlTemplate.replace('{{OTP_CODE}}', otp);

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: 'Your Design Excellence OTP Code',
            text: `Your OTP code is: ${otp}. It is valid for 5 minutes. If you didn't request this code, please ignore this email.`,
            html: htmlContent,
        };

        console.log('📧 Sending OTP email via SendGrid...');
        console.log('  - To:', toEmail);
        console.log('  - From:', fromEmail);
        console.log('  - OTP:', otp);

        // Send email via SendGrid
        const response = await sgMail.send(msg);
        
        console.log('✅ Email sent successfully via SendGrid');
        console.log('  - Status Code:', response[0].statusCode);
        console.log('  - Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'OTP sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('❌ Error sending OTP via SendGrid:', error);
        
        // Log more details about the error
        if (error.response) {
            console.error('  - Status Code:', error.response.statusCode);
            console.error('  - Body:', error.response.body);
        }
        
        return {
            success: false,
            message: `Failed to send OTP: ${error.message}`,
            error: error.message
        };
    }
};

/**
 * Send password reset email via SendGrid
 * @param {string} toEmail - Recipient email address
 * @param {string} userName - User's full name
 * @param {string} resetToken - Password reset token
 * @returns {Promise<{success: boolean, message: string, resetLink?: string}>}
 */
const sendPasswordResetEmail = async (toEmail, userName, resetToken) => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Reset token for development:', resetToken);
            return {
                success: true,
                message: 'Password reset token generated (SendGrid not configured)',
                development: true,
                resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();
        
        // Create reset link
        const frontendUrl = process.env.FRONTEND_URL || 'https://designxcellwebsite-production.up.railway.app';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Create HTML email template
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Reset - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Password Reset Request</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${userName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We received a request to reset your password for your Design Excellence account. Click the button below to reset your password:
                                        </p>
                                        
                                        <!-- Reset Button -->
                                        <div style="text-align: center; margin: 30px 0;">
                                            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #F0B21B 0%, #e0a10b 100%); color: #1f2937; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                                Reset My Password
                                            </a>
                                        </div>
                                        
                                        <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            <strong>⏱️ This link will expire in 1 hour.</strong>
                                        </p>
                                        
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                                        </p>
                                        
                                        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                                            If the button doesn't work, copy and paste this link into your browser:<br>
                                            <a href="${resetLink}" style="color: #F0B21B; word-break: break-all;">${resetLink}</a>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            Need help? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: 'Reset Your Design Excellence Password',
            text: `Hello ${userName || 'Valued Customer'}, you requested to reset your password. Click this link to reset: ${resetLink}. This link expires in 1 hour.`,
            html: htmlContent,
        };

        console.log('📧 Sending password reset email via SendGrid...');
        console.log('  - To:', toEmail);
        console.log('  - From:', fromEmail);
        console.log('  - Reset Link:', resetLink);

        // Send email via SendGrid
        const response = await sgMail.send(msg);
        
        console.log('✅ Password reset email sent successfully via SendGrid');
        console.log('  - Status Code:', response[0].statusCode);
        console.log('  - Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Password reset instructions have been sent to your email address',
            resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
        };

    } catch (error) {
        console.error('❌ Error sending password reset email via SendGrid:', error);
        
        // Log more details about the error
        if (error.response) {
            console.error('  - Status Code:', error.response.statusCode);
            console.error('  - Body:', error.response.body);
        }
        
        return {
            success: false,
            message: `Failed to send password reset email: ${error.message}`,
            error: error.message
        };
    }
};

/**
 * Send User (Employee/Admin) Password Reset Email via SendGrid
 * @param {string} toEmail - Recipient email address
 * @param {string} userName - User's full name
 * @param {string} resetToken - The reset token
 * @param {string} roleName - User's role name (optional)
 * @returns {Promise<{success: boolean, message: string, resetLink?: string}>}
 */
const sendUserPasswordResetEmail = async (toEmail, userName, resetToken, roleName = 'Employee') => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Reset token for development:', resetToken);
            return {
                success: true,
                message: 'Password reset token generated (SendGrid not configured)',
                development: true,
                resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();
        
        // Create reset link - for employees, always use backend URL (port 5000) since login is on backend
        // Try BACKEND_URL first, if not set, use SERVER_URL or default to localhost:5000
        // Never use FRONTEND_URL for user password resets
        const baseUrl = process.env.BACKEND_URL || process.env.SERVER_URL || 'http://localhost:5000';
        const resetLink = `${baseUrl}/employee-login?token=${resetToken}`;

        // Create HTML email template
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Reset - Design Excellence Employee Portal</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                        <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 14px;">Employee Portal</p>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Password Reset Request</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${userName || 'Valued Employee'},
                                        </p>
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We received a request to reset your password for your Design Excellence employee account (${roleName || 'Employee'}).
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Click the button below to reset your password:
                                        </p>
                                        
                                        <!-- Reset Button -->
                                        <div style="text-align: center; margin: 30px 0;">
                                            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #F0B21B 0%, #e0a10b 100%); color: #1f2937; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                                Reset My Password
                                            </a>
                                        </div>
                                        
                                        <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            <strong>⏱️ This link will expire in 1 hour.</strong>
                                        </p>
                                        
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            If you didn't request this password reset, please ignore this email and contact your system administrator if you have concerns. Your password will remain unchanged.
                                        </p>
                                        
                                        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                                            If the button doesn't work, copy and paste this link into your browser:<br>
                                            <a href="${resetLink}" style="color: #F0B21B; word-break: break-all;">${resetLink}</a>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            This is an automated message. Please do not reply to this email.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence Employee Portal'
            },
            subject: 'Reset Your Design Excellence Employee Password',
            text: `Hello ${userName || 'Valued Employee'}, you requested to reset your password for your Design Excellence employee account. Click this link to reset: ${resetLink}. This link expires in 1 hour.`,
            html: htmlContent,
        };

        console.log('📧 Sending user password reset email via SendGrid...');
        console.log('  - To:', toEmail);
        console.log('  - From:', fromEmail);
        console.log('  - Reset Link:', resetLink);

        // Send email via SendGrid
        const response = await sgMail.send(msg);
        
        console.log('✅ User password reset email sent successfully via SendGrid');
        console.log('  - Status Code:', response[0].statusCode);
        console.log('  - Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Password reset instructions have been sent to your email address',
            resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
        };

    } catch (error) {
        console.error('❌ Error sending user password reset email via SendGrid:', error);
        
        // Log more details about the error
        if (error.response) {
            console.error('  - Status Code:', error.response.statusCode);
            console.error('  - Body:', error.response.body);
        }
        
        return {
            success: false,
            message: `Failed to send password reset email: ${error.message}`,
            error: error.message
        };
    }
};

/**
 * Send test OTP email via SendGrid
 * @param {string} toEmail - Recipient email address
 * @returns {Promise<{success: boolean, message: string, otp?: string}>}
 */
const sendTestOtpEmail = async (toEmail) => {
    const testOtp = '123456';
    
    try {
        const result = await sendOtpEmail(toEmail, testOtp);
        
        if (result.success) {
            return {
                success: true,
                message: 'Test OTP email sent successfully',
                otp: testOtp
            };
        } else {
            return result;
        }
        
    } catch (error) {
        console.error('❌ Error sending test OTP:', error);
        return {
            success: false,
            message: `Failed to send test OTP: ${error.message}`
        };
    }
};

/**
 * Send order out for delivery notification email
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOrderOutForDeliveryEmail = async (toEmail, customerName, orderDetails) => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Order out for delivery notification skipped.');
            return {
                success: true,
                message: 'Order notification (SendGrid not configured)',
                development: true
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();

        // Format amounts
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(amount || 0);
        };

        const orderAmount = formatCurrency(orderDetails.totalAmount || 0);
        const subtotal = formatCurrency(orderDetails.subtotal || 0);
        const shippingCost = formatCurrency(orderDetails.shippingCost || 0);
        const extraDeliveryFee = formatCurrency(orderDetails.extraDeliveryFee || 0);

        // Build order items HTML
        let orderItemsHTML = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHTML = orderDetails.items.map(item => {
                const itemTotal = formatCurrency((item.price || 0) * (item.quantity || 0));
                return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px 0; color: #1f2937; font-size: 14px;">
                            ${item.name || 'Product'}${item.variationName ? ` - ${item.variationName}` : ''}${item.color ? ` (${item.color})` : ''}
                        </td>
                        <td style="padding: 12px 0; text-align: center; color: #6b7280; font-size: 14px;">${item.quantity || 0}</td>
                        <td style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${itemTotal}</td>
                    </tr>
                `;
            }).join('');
        } else {
            orderItemsHTML = '<tr><td colspan="3" style="padding: 12px 0; color: #6b7280; font-size: 14px; text-align: center;">No items found</td></tr>';
        }

        // Create HTML email template
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Your Order is Out for Delivery - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">🚚 Your Order is Out for Delivery!</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Great news! Your order <strong>#${orderDetails.referenceNumber || orderDetails.orderId}</strong> is now out for delivery and should arrive soon.
                                        </p>
                                        
                                        <!-- Order Details Box -->
                                        <div style="background: #f8f9fa; border-left: 4px solid #F0B21B; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Order Number:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; font-weight: 600;">#${orderDetails.referenceNumber || orderDetails.orderId}</p>
                                            ${orderDetails.transactionId ? `
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Transaction ID:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; font-family: monospace;">${orderDetails.transactionId}</p>
                                            ` : ''}
                                        </div>

                                        <!-- Order Items -->
                                        <div style="margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Items</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <thead>
                                                    <tr style="border-bottom: 2px solid #e5e7eb;">
                                                        <th style="padding: 12px 0; text-align: left; color: #1f2937; font-size: 14px; font-weight: 600;">Item</th>
                                                        <th style="padding: 12px 0; text-align: center; color: #1f2937; font-size: 14px; font-weight: 600;">Qty</th>
                                                        <th style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${orderItemsHTML}
                                                </tbody>
                                            </table>
                                        </div>

                                        <!-- Order Summary -->
                                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Summary</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${subtotal}</td>
                                                </tr>
                                                ${parseFloat(orderDetails.shippingCost || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Shipping:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${shippingCost}</td>
                                                </tr>
                                                ` : ''}
                                                ${parseFloat(orderDetails.extraDeliveryFee || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Extra Delivery Fee:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${extraDeliveryFee}</td>
                                                </tr>
                                                ` : ''}
                                                <tr style="border-top: 2px solid #e5e7eb;">
                                                    <td style="padding: 12px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">Total:</td>
                                                    <td style="padding: 12px 0 0 0; text-align: right; color: #F0B21B; font-size: 18px; font-weight: 700;">${orderAmount}</td>
                                                </tr>
                                            </table>
                                        </div>
                                        
                                        ${orderDetails.estimatedDeliveryDate ? `
                                        <div style="background: linear-gradient(135deg, #F0B21B 0%, #e0a10b 100%); padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
                                            <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Estimated Date of Arrival</p>
                                            <p style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 700;">${formatEstimatedDeliveryDateFull(orderDetails.estimatedDeliveryDate)}</p>
                                        </div>
                                        ` : ''}
                                        
                                        <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Please ensure someone is available to receive your order. Our delivery team will contact you if needed.
                                        </p>
                                        
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Thank you for choosing Design Excellence!
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            Need help? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `🚚 Your Order #${orderDetails.referenceNumber || orderDetails.orderId} is Out for Delivery!`,
            text: `Hello ${customerName || 'Valued Customer'}, your order #${orderDetails.referenceNumber || orderDetails.orderId} is now out for delivery and should arrive soon. Order Total: ${orderAmount}. Please ensure someone is available to receive your order.`,
            html: htmlContent,
        };

        console.log('📧 [SENDGRID] Sending order out for delivery email...');
        console.log('📧 [SENDGRID] To:', toEmail);
        console.log('📧 [SENDGRID] From:', fromEmail);
        console.log('📧 [SENDGRID] Order:', orderDetails.referenceNumber || orderDetails.orderId);
        console.log('📧 [SENDGRID] Subject:', msg.subject);
        console.log('📧 [SENDGRID] SendGrid API Key configured:', !!process.env.SENDGRID_API_KEY);
        console.log('📧 [SENDGRID] SendGrid API Key length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);
        console.log('📧 [SENDGRID] Full message object:', JSON.stringify({
            to: msg.to,
            from: msg.from,
            subject: msg.subject,
            htmlLength: msg.html ? msg.html.length : 0
        }, null, 2));

        // Send email via SendGrid
        console.log('📧 [SENDGRID] Calling sgMail.send()...');
        const response = await sgMail.send(msg);
        console.log('📧 [SENDGRID] sgMail.send() completed');
        
        console.log('✅ [SENDGRID] Order out for delivery email sent successfully');
        console.log('✅ [SENDGRID] Status Code:', response[0].statusCode);
        console.log('✅ [SENDGRID] Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Order out for delivery notification sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('❌ [SENDGRID] Error sending order out for delivery email:', error);
        console.error('❌ [SENDGRID] Error name:', error.name);
        console.error('❌ [SENDGRID] Error message:', error.message);
        
        // Log more details about the error
        if (error.response) {
            console.error('❌ [SENDGRID] Response Status Code:', error.response.statusCode);
            console.error('❌ [SENDGRID] Response Body:', JSON.stringify(error.response.body, null, 2));
            console.error('❌ [SENDGRID] Response Headers:', error.response.headers);
        }
        
        if (error.code) {
            console.error('❌ [SENDGRID] Error Code:', error.code);
        }
        
        if (error.stack) {
            console.error('❌ [SENDGRID] Error Stack:', error.stack);
        }
        
        return {
            success: false,
            message: `Failed to send order notification: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send order shipping notification email
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, items, subtotal, tax, shipping, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOrderShippingEmail = async (toEmail, customerName, orderDetails) => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Order shipping notification skipped.');
            return {
                success: true,
                message: 'Order notification (SendGrid not configured)',
                development: true
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();

        // Format amounts
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(amount || 0);
        };

        const orderAmount = formatCurrency(orderDetails.totalAmount || 0);
        const subtotal = formatCurrency(orderDetails.subtotal || 0);
        const shippingCost = formatCurrency(orderDetails.shippingCost || 0);
        const extraDeliveryFee = formatCurrency(orderDetails.extraDeliveryFee || 0);

        // Build order items HTML
        let orderItemsHTML = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHTML = orderDetails.items.map(item => {
                const itemTotal = formatCurrency((item.price || 0) * (item.quantity || 0));
                return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px 0; color: #1f2937; font-size: 14px;">
                            ${item.name || 'Product'}${item.variationName ? ` - ${item.variationName}` : ''}${item.color ? ` (${item.color})` : ''}
                        </td>
                        <td style="padding: 12px 0; text-align: center; color: #6b7280; font-size: 14px;">${item.quantity || 0}</td>
                        <td style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${itemTotal}</td>
                    </tr>
                `;
            }).join('');
        } else {
            orderItemsHTML = '<tr><td colspan="3" style="padding: 12px 0; color: #6b7280; font-size: 14px; text-align: center;">No items found</td></tr>';
        }

        // Create HTML email template
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Your Order is Shipping - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">📦 Your Order is Shipping!</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Great news! Your order <strong>#${orderDetails.referenceNumber || orderDetails.orderId}</strong> has been processed and is now shipping to you.
                                        </p>
                                        
                                        <!-- Order Details Box -->
                                        <div style="background: #f8f9fa; border-left: 4px solid #F0B21B; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Order Number:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; font-weight: 600;">#${orderDetails.referenceNumber || orderDetails.orderId}</p>
                                            ${orderDetails.transactionId ? `
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Transaction ID:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; font-family: monospace;">${orderDetails.transactionId}</p>
                                            ` : ''}
                                        </div>

                                        <!-- Order Items -->
                                        <div style="margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Items</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <thead>
                                                    <tr style="border-bottom: 2px solid #e5e7eb;">
                                                        <th style="padding: 12px 0; text-align: left; color: #1f2937; font-size: 14px; font-weight: 600;">Item</th>
                                                        <th style="padding: 12px 0; text-align: center; color: #1f2937; font-size: 14px; font-weight: 600;">Qty</th>
                                                        <th style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${orderItemsHTML}
                                                </tbody>
                                            </table>
                                        </div>

                                        <!-- Order Summary -->
                                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Summary</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${subtotal}</td>
                                                </tr>
                                                ${parseFloat(orderDetails.shippingCost || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Shipping:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${shippingCost}</td>
                                                </tr>
                                                ` : ''}
                                                ${parseFloat(orderDetails.extraDeliveryFee || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Extra Delivery Fee:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${extraDeliveryFee}</td>
                                                </tr>
                                                ` : ''}
                                                <tr style="border-top: 2px solid #e5e7eb;">
                                                    <td style="padding: 12px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">Total:</td>
                                                    <td style="padding: 12px 0 0 0; text-align: right; color: #F0B21B; font-size: 18px; font-weight: 700;">${orderAmount}</td>
                                                </tr>
                                            </table>
                                        </div>
                                        
                                        ${orderDetails.estimatedDeliveryDate ? `
                                        <div style="background: linear-gradient(135deg, #F0B21B 0%, #e0a10b 100%); padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
                                            <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Estimated Date of Arrival</p>
                                            <p style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 700;">${formatEstimatedDeliveryDateFull(orderDetails.estimatedDeliveryDate)}</p>
                                        </div>
                                        ` : ''}
                                        
                                        <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Your order is on its way! You'll receive another notification when it's out for delivery.
                                        </p>
                                        
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Thank you for choosing Design Excellence!
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            Need help? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `📦 Your Order #${orderDetails.referenceNumber || orderDetails.orderId} is Shipping!`,
            text: `Hello ${customerName || 'Valued Customer'}, your order #${orderDetails.referenceNumber || orderDetails.orderId} has been processed and is now shipping to you. Order Total: ${orderAmount}.`,
            html: htmlContent,
        };

        console.log('[SENDGRID SHIPPING] Sending order shipping email...');
        console.log('[SENDGRID SHIPPING] To:', toEmail);
        console.log('[SENDGRID SHIPPING] From:', fromEmail);
        console.log('[SENDGRID SHIPPING] Order:', orderDetails.referenceNumber || orderDetails.orderId);

        // Send email via SendGrid
        const response = await sgMail.send(msg);
        
        console.log('✅ [SENDGRID SHIPPING] Order shipping email sent successfully');
        console.log('✅ [SENDGRID SHIPPING] Status Code:', response[0].statusCode);
        console.log('✅ [SENDGRID SHIPPING] Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Order shipping notification sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('❌ [SENDGRID SHIPPING] Error sending order shipping email:', error);
        console.error('❌ [SENDGRID SHIPPING] Error name:', error.name);
        console.error('❌ [SENDGRID SHIPPING] Error message:', error.message);
        
        if (error.response) {
            console.error('❌ [SENDGRID SHIPPING] Response Status Code:', error.response.statusCode);
            console.error('❌ [SENDGRID SHIPPING] Response Body:', JSON.stringify(error.response.body, null, 2));
        }
        
        return {
            success: false,
            message: `Failed to send order notification: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send order received notification email
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOrderReceivedEmail = async (toEmail, customerName, orderDetails) => {
    try {
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Order received notification skipped.');
            return {
                success: true,
                message: 'Order notification (SendGrid not configured)',
                development: true
            };
        }

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();

        // Format amounts
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(amount || 0);
        };

        const orderAmount = formatCurrency(orderDetails.totalAmount || 0);
        const subtotal = formatCurrency(orderDetails.subtotal || 0);
        const shippingCost = formatCurrency(orderDetails.shippingCost || 0);
        const extraDeliveryFee = formatCurrency(orderDetails.extraDeliveryFee || 0);

        // Build order items HTML
        let orderItemsHTML = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHTML = orderDetails.items.map(item => {
                const itemTotal = formatCurrency((item.price || 0) * (item.quantity || 0));
                return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px 0; color: #1f2937; font-size: 14px;">
                            ${item.name || 'Product'}${item.variationName ? ` - ${item.variationName}` : ''}${item.color ? ` (${item.color})` : ''}
                        </td>
                        <td style="padding: 12px 0; text-align: center; color: #6b7280; font-size: 14px;">${item.quantity || 0}</td>
                        <td style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${itemTotal}</td>
                    </tr>
                `;
            }).join('');
        } else {
            orderItemsHTML = '<tr><td colspan="3" style="padding: 12px 0; color: #6b7280; font-size: 14px; text-align: center;">No items found</td></tr>';
        }

        // Create HTML email template
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Your Order Has Been Received - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">✅ Your Order Has Been Received!</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We're excited to confirm that your order <strong>#${orderDetails.referenceNumber || orderDetails.orderId}</strong> has been successfully received!
                                        </p>
                                        
                                        <!-- Order Details Box -->
                                        <div style="background: #f8f9fa; border-left: 4px solid #F0B21B; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Order Number:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; font-weight: 600;">#${orderDetails.referenceNumber || orderDetails.orderId}</p>
                                            ${orderDetails.transactionId ? `
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Transaction ID:</p>
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; font-family: monospace;">${orderDetails.transactionId}</p>
                                            ` : ''}
                                        </div>

                                        <!-- Order Items -->
                                        <div style="margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Items</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <thead>
                                                    <tr style="border-bottom: 2px solid #e5e7eb;">
                                                        <th style="padding: 12px 0; text-align: left; color: #1f2937; font-size: 14px; font-weight: 600;">Item</th>
                                                        <th style="padding: 12px 0; text-align: center; color: #1f2937; font-size: 14px; font-weight: 600;">Qty</th>
                                                        <th style="padding: 12px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${orderItemsHTML}
                                                </tbody>
                                            </table>
                                        </div>

                                        <!-- Order Summary -->
                                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Summary</h3>
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${subtotal}</td>
                                                </tr>
                                                ${parseFloat(orderDetails.shippingCost || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Shipping:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${shippingCost}</td>
                                                </tr>
                                                ` : ''}
                                                ${parseFloat(orderDetails.extraDeliveryFee || 0) > 0 ? `
                                                <tr>
                                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Extra Delivery Fee:</td>
                                                    <td style="padding: 8px 0; text-align: right; color: #1f2937; font-size: 14px; font-weight: 600;">${extraDeliveryFee}</td>
                                                </tr>
                                                ` : ''}
                                                <tr style="border-top: 2px solid #e5e7eb;">
                                                    <td style="padding: 12px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">Total:</td>
                                                    <td style="padding: 12px 0 0 0; text-align: right; color: #F0B21B; font-size: 18px; font-weight: 700;">${orderAmount}</td>
                                                </tr>
                                            </table>
                                        </div>
                                        
                                        <p style="margin: 30px 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We hope you're satisfied with your purchase! If you have any questions or need assistance, please don't hesitate to contact us.
                                        </p>
                                        
                                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Thank you for choosing Design Excellence!
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            Need help? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `✅ Your Order #${orderDetails.referenceNumber || orderDetails.orderId} Has Been Received!`,
            text: `Hello ${customerName || 'Valued Customer'}, your order #${orderDetails.referenceNumber || orderDetails.orderId} has been successfully received! Order Total: ${orderAmount}. Thank you for choosing Design Excellence!`,
            html: htmlContent,
        };

        console.log('📧 [SENDGRID] Sending order received email...');
        console.log('📧 [SENDGRID] To:', toEmail);
        console.log('📧 [SENDGRID] From:', fromEmail);
        console.log('📧 [SENDGRID] Order:', orderDetails.referenceNumber || orderDetails.orderId);
        console.log('📧 [SENDGRID] Subject:', msg.subject);
        console.log('📧 [SENDGRID] SendGrid API Key configured:', !!process.env.SENDGRID_API_KEY);
        console.log('📧 [SENDGRID] SendGrid API Key length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);
        console.log('📧 [SENDGRID] Full message object:', JSON.stringify({
            to: msg.to,
            from: msg.from,
            subject: msg.subject,
            htmlLength: msg.html ? msg.html.length : 0
        }, null, 2));

        // Send email via SendGrid
        console.log('📧 [SENDGRID] Calling sgMail.send()...');
        const response = await sgMail.send(msg);
        console.log('📧 [SENDGRID] sgMail.send() completed');
        
        console.log('✅ [SENDGRID] Order received email sent successfully');
        console.log('✅ [SENDGRID] Status Code:', response[0].statusCode);
        console.log('✅ [SENDGRID] Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Order received notification sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('❌ [SENDGRID] Error sending order received email:', error);
        console.error('❌ [SENDGRID] Error name:', error.name);
        console.error('❌ [SENDGRID] Error message:', error.message);
        
        // Log more details about the error
        if (error.response) {
            console.error('❌ [SENDGRID] Response Status Code:', error.response.statusCode);
            console.error('❌ [SENDGRID] Response Body:', JSON.stringify(error.response.body, null, 2));
            console.error('❌ [SENDGRID] Response Headers:', error.response.headers);
        }
        
        if (error.code) {
            console.error('❌ [SENDGRID] Error Code:', error.code);
        }
        
        if (error.stack) {
            console.error('❌ [SENDGRID] Error Stack:', error.stack);
        }
        
        return {
            success: false,
            message: `Failed to send order notification: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send bulk order confirmation email to customer
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer name
 * @param {Object} orderDetails - Bulk order details
 * @returns {Promise<{success: boolean, message: string}>}
 */
const sendBulkOrderConfirmationEmail = async (toEmail, customerName, orderDetails) => {
    try {
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Bulk order confirmation email skipped.');
            return { success: true, message: 'Bulk order confirmation (SendGrid not configured)', development: true };
        }

        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        const fromEmail = getConfiguredFromEmail();
        const orderId = orderDetails.bulkOrderId || orderDetails.orderId || 'N/A';
        const totalAmount = new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP'
        }).format(orderDetails.grandTotal || orderDetails.total || 0);

        // Build items HTML
        const itemsHtml = (orderDetails.items || []).map(item => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">${item.name || 'Product'}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e9ecef; text-align: center;">${item.quantity || 0}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e9ecef; text-align: right;">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(item.unitPrice || 0)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e9ecef; text-align: right;">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((item.unitPrice || 0) * (item.quantity || 0))}</td>
            </tr>
        `).join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bulk Order Confirmation - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Bulk Order Confirmation</h2>
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Thank you for your bulk order! We have received your order and our team will contact you shortly to confirm the details and proceed with processing.
                                        </p>
                                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order ID: #${orderId}</p>
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Total Quantity: ${orderDetails.totalQuantity || 0} items</p>
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Grand Total: ${totalAmount}</p>
                                            ${orderDetails.discount > 0 ? `<p style="margin: 0; color: #059669; font-weight: 600;">You saved: ${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(orderDetails.discount || 0)}</p>` : ''}
                                        </div>
                                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                            <thead>
                                                <tr style="background: #f9fafb;">
                                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e9ecef;">Product</th>
                                                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e9ecef;">Quantity</th>
                                                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e9ecef;">Unit Price</th>
                                                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e9ecef;">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${itemsHtml}
                                            </tbody>
                                        </table>
                                        <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Our sales team will contact you within 24 hours to confirm your order and discuss delivery options.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                            Questions? Contact us at <a href="mailto:support@designexcellence.com" style="color: #F0B21B; text-decoration: none;">support@designexcellence.com</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const msg = {
            to: toEmail,
            from: { email: fromEmail, name: 'Design Excellence' },
            subject: `Bulk Order Confirmation #${orderId} - Design Excellence`,
            text: `Hello ${customerName || 'Valued Customer'}, your bulk order #${orderId} has been received. Total: ${totalAmount}. Our team will contact you shortly.`,
            html: htmlContent,
        };

        const response = await sgMail.send(msg);
        console.log('✅ Bulk order confirmation email sent successfully');
        return { success: true, message: 'Bulk order confirmation email sent', messageId: response[0].headers['x-message-id'] };
    } catch (error) {
        console.error('❌ Error sending bulk order confirmation email:', error);
        return { success: false, message: `Failed to send email: ${error.message}` };
    }
};

/**
 * Send order receipt/proof of payment email to customer
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, items, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOrderReceiptEmail = async (toEmail, customerName, orderDetails) => {
    try {
        console.log('[SENDGRID RECEIPT] ===== Starting order receipt email =====');
        console.log('[SENDGRID RECEIPT] To Email:', toEmail);
        console.log('[SENDGRID RECEIPT] Customer Name:', customerName);
        console.log('[SENDGRID RECEIPT] Order Details:', JSON.stringify({
            orderId: orderDetails.orderId,
            referenceNumber: orderDetails.referenceNumber,
            transactionId: orderDetails.transactionId,
            totalAmount: orderDetails.totalAmount,
            itemsCount: orderDetails.items ? orderDetails.items.length : 0
        }, null, 2));
        
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.error('❌ [SENDGRID RECEIPT] SENDGRID_API_KEY not found in environment variables');
            console.log('📧 SendGrid not configured. Order receipt email skipped.');
            return {
                success: false,
                message: 'SendGrid API key not configured',
                development: true
            };
        }
        
        console.log('[SENDGRID RECEIPT] ✅ SendGrid API key found');

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();
        console.log('[SENDGRID RECEIPT] From Email:', fromEmail);
        
        // Validate recipient email
        if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
            console.error('❌ [SENDGRID RECEIPT] Invalid recipient email:', toEmail);
            return {
                success: false,
                message: 'Invalid recipient email address',
                error: 'Invalid email format'
            };
        }
        
        console.log('[SENDGRID RECEIPT] ✅ Recipient email validated:', toEmail);

        // Format dates
        const orderDate = orderDetails.orderDate 
            ? new Date(orderDetails.orderDate).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            : new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
            });

        // Format currency
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2
            }).format(amount || 0).replace('PHP', '₱');
        };

        // Build order items HTML
        let orderItemsHtml = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHtml = orderDetails.items.map(item => {
                const itemName = item.name || item.ProductName || 'Product';
                const quantity = item.quantity || item.Quantity || 0;
                const price = item.price || item.PriceAtPurchase || 0;
                const variationName = item.variationName || item.VariationName || '';
                const color = item.color || item.Color || '';
                
                let specs = '';
                if (variationName) specs += variationName;
                if (color) specs += (specs ? ' • ' : '') + color;
                
                return `
                    <div class="item">
                        <div class="item-info">
                            <div class="item-name">${itemName}</div>
                            ${specs ? `<div class="item-specs">${specs}</div>` : ''}
                            <div class="item-quantity">Quantity: ${quantity}</div>
                        </div>
                        <div class="item-price">${formatCurrency(price * quantity)}</div>
                    </div>
                `;
            }).join('');
        } else {
            orderItemsHtml = '<div class="item"><div class="item-info"><div class="item-name">No items found</div></div></div>';
        }

        // Read HTML template
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', 'orders', 'order-receipt.html');
        let htmlTemplate = '';
        
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            console.log('⚠️ Using fallback template for order receipt');
            htmlTemplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Order Receipt - Design Excellence</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td align="center" style="padding: 40px 0;">
                                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <tr>
                                        <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); border-radius: 8px 8px 0 0;">
                                            <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                            <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Proof of Payment / Receipt</h2>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 40px;">
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Hello ${customerName || 'Valued Customer'},
                                            </p>
                                            <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Thank you for your purchase! This is your official receipt.
                                            </p>
                                            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Date: ${orderDate}</p>
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Payment Method: ${orderDetails.paymentMethod || 'N/A'}</p>
                                                <p style="margin: 0; color: #F0B21B; font-size: 18px; font-weight: 700;">Total: ${formatCurrency(orderDetails.totalAmount || 0)}</p>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                            <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                                © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `;
        }

        // Replace placeholders
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        let htmlContent = htmlTemplate
            .replace(/\{\{ORDER_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{CUSTOMER_NAME\}\}/g, customerName || 'Valued Customer')
            .replace(/\{\{ORDER_DATE\}\}/g, orderDate)
            .replace(/\{\{PAYMENT_METHOD\}\}/g, orderDetails.paymentMethod || 'Not specified')
            .replace(/\{\{REFERENCE_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{ORDER_ITEMS\}\}/g, orderItemsHtml)
            .replace(/\{\{SUBTOTAL\}\}/g, formatCurrency(orderDetails.subtotal || 0).replace('₱', ''))
            .replace(/\{\{SHIPPING_COST\}\}/g, orderDetails.shippingCost > 0 ? formatCurrency(orderDetails.shippingCost).replace('₱', '') : '')
            .replace(/\{\{EXTRA_DELIVERY_FEE\}\}/g, orderDetails.extraDeliveryFee > 0 ? formatCurrency(orderDetails.extraDeliveryFee).replace('₱', '') : '')
            .replace(/\{\{TAX_AMOUNT\}\}/g, '')
            .replace(/\{\{TOTAL_AMOUNT\}\}/g, formatCurrency(orderDetails.totalAmount || 0).replace('₱', ''))
            .replace(/\{\{CURRENT_YEAR\}\}/g, new Date().getFullYear().toString())
            .replace(/\{\{ORDER_HISTORY_LINK\}\}/g, `${frontendUrl}/account?tab=orders`)
            .replace(/\{\{SUPPORT_LINK\}\}/g, `${frontendUrl}/contact`);

        // Handle Transaction ID (conditional replacement)
        if (orderDetails.transactionId) {
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{\/TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{TRANSACTION_ID\}\}/g, orderDetails.transactionId);
        } else {
            // Remove conditional blocks if no transaction ID
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}[\s\S]*?\{\{\/TRANSACTION_ID\}\}/g, '');
        }

        // Handle conditional blocks for optional fields
        if (orderDetails.shippingCost > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}/g, '')
                .replace(/\{\{\/SHIPPING_COST\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}[\s\S]*?\{\{\/SHIPPING_COST\}\}/g, '');
        }

        if (orderDetails.extraDeliveryFee > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}/g, '')
                .replace(/\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}[\s\S]*?\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        }

        // Remove tax amount conditional blocks
        htmlContent = htmlContent
            .replace(/\{\{#TAX_AMOUNT\}\}[\s\S]*?\{\{\/TAX_AMOUNT\}\}/g, '');

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `Receipt for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} - Design Excellence`,
            text: `Hello ${customerName || 'Valued Customer'}, thank you for your purchase! This is your official receipt for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}. Total Amount: ${formatCurrency(orderDetails.totalAmount || 0)}. Please keep this email for your records.`,
            html: htmlContent,
        };

        console.log('[SENDGRID RECEIPT] ===== Sending email via SendGrid =====');
        console.log('[SENDGRID RECEIPT] To:', toEmail);
        console.log('[SENDGRID RECEIPT] From:', fromEmail);
        console.log('[SENDGRID RECEIPT] Subject:', msg.subject);
        console.log('[SENDGRID RECEIPT] Order:', orderDetails.referenceNumber || orderDetails.orderId);
        console.log('[SENDGRID RECEIPT] HTML Content Length:', htmlContent.length);
        console.log('[SENDGRID RECEIPT] Message Object:', JSON.stringify({
            to: msg.to,
            from: msg.from,
            subject: msg.subject,
            htmlLength: msg.html ? msg.html.length : 0
        }, null, 2));

        // Send email via SendGrid
        console.log('[SENDGRID RECEIPT] Attempting to send email...');
        const response = await sgMail.send(msg);
        
        console.log('[SENDGRID RECEIPT] ✅ Email sent successfully!');
        console.log('[SENDGRID RECEIPT] ✅ Status Code:', response[0].statusCode);
        console.log('[SENDGRID RECEIPT] ✅ Message ID:', response[0].headers['x-message-id']);
        console.log('[SENDGRID RECEIPT] ✅ Response Headers:', JSON.stringify(response[0].headers, null, 2));

        return {
            success: true,
            message: 'Order receipt email sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('[SENDGRID RECEIPT] ❌ ===== ERROR SENDING EMAIL =====');
        console.error('[SENDGRID RECEIPT] ❌ Error name:', error.name);
        console.error('[SENDGRID RECEIPT] ❌ Error message:', error.message);
        console.error('[SENDGRID RECEIPT] ❌ Error stack:', error.stack);
        
        if (error.response) {
            console.error('[SENDGRID RECEIPT] ❌ Response Status Code:', error.response.statusCode);
            console.error('[SENDGRID RECEIPT] ❌ Response Body:', JSON.stringify(error.response.body, null, 2));
            console.error('[SENDGRID RECEIPT] ❌ Response Headers:', JSON.stringify(error.response.headers, null, 2));
        }
        
        if (error.code) {
            console.error('[SENDGRID RECEIPT] ❌ Error Code:', error.code);
        }
        
        console.error('[SENDGRID RECEIPT] ❌ Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('[SENDGRID RECEIPT] ❌ ====================================');
        
        return {
            success: false,
            message: `Failed to send order receipt: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send refund receipt email to customer for cancelled order
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, items, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendRefundReceiptEmail = async (toEmail, customerName, orderDetails) => {
    try {
        console.log('[SENDGRID REFUND] ===== Starting refund receipt email =====');
        console.log('[SENDGRID REFUND] To Email:', toEmail);
        console.log('[SENDGRID REFUND] Customer Name:', customerName);
        console.log('[SENDGRID REFUND] Order Details:', JSON.stringify({
            orderId: orderDetails.orderId,
            referenceNumber: orderDetails.referenceNumber,
            transactionId: orderDetails.transactionId,
            totalAmount: orderDetails.totalAmount,
            itemsCount: orderDetails.items ? orderDetails.items.length : 0
        }, null, 2));
        
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.error('❌ [SENDGRID REFUND] SENDGRID_API_KEY not found in environment variables');
            console.log('📧 SendGrid not configured. Refund receipt email skipped.');
            return {
                success: false,
                message: 'SendGrid API key not configured',
                development: true
            };
        }
        
        console.log('[SENDGRID REFUND] ✅ SendGrid API key found');

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();
        console.log('[SENDGRID REFUND] From Email:', fromEmail);
        
        // Validate recipient email
        if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
            console.error('❌ [SENDGRID REFUND] Invalid recipient email:', toEmail);
            return {
                success: false,
                message: 'Invalid recipient email address',
                error: 'Invalid email format'
            };
        }
        
        console.log('[SENDGRID REFUND] ✅ Recipient email validated:', toEmail);

        // Format dates
        const orderDate = orderDetails.orderDate 
            ? new Date(orderDetails.orderDate).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            : new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
            });

        const cancellationDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format currency
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2
            }).format(amount || 0).replace('PHP', '₱');
        };

        // Build order items HTML
        let orderItemsHtml = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHtml = orderDetails.items.map(item => {
                const itemName = item.name || item.ProductName || 'Product';
                const quantity = item.quantity || item.Quantity || 0;
                const price = item.price || item.PriceAtPurchase || 0;
                const variationName = item.variationName || item.VariationName || '';
                const color = item.color || item.Color || '';
                
                let specs = '';
                if (variationName) specs += variationName;
                if (color) specs += (specs ? ' • ' : '') + color;
                
                return `
                    <div class="item">
                        <div class="item-info">
                            <div class="item-name">${itemName}</div>
                            ${specs ? `<div class="item-specs">${specs}</div>` : ''}
                            <div class="item-quantity">Quantity: ${quantity}</div>
                        </div>
                        <div class="item-price">${formatCurrency(price * quantity)}</div>
                    </div>
                `;
            }).join('');
        } else {
            orderItemsHtml = '<div class="item"><div class="item-info"><div class="item-name">No items found</div></div></div>';
        }

        // Read HTML template
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', 'orders', 'refund-receipt.html');
        let htmlTemplate = '';
        
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            console.log('⚠️ Using fallback template for refund receipt');
            htmlTemplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Refund Receipt - Design Excellence</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td align="center" style="padding: 40px 0;">
                                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <tr>
                                        <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius: 8px 8px 0 0;">
                                            <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                            <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Refund Receipt</h2>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 40px;">
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Hello ${customerName || 'Valued Customer'},
                                            </p>
                                            <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Your order has been cancelled and refunded. This is your official refund receipt.
                                            </p>
                                            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Cancellation Date: ${cancellationDate}</p>
                                                <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: 700;">Refund Amount: ${formatCurrency(orderDetails.totalAmount || 0)}</p>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                            <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                                © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `;
        }

        // Replace placeholders
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        let htmlContent = htmlTemplate
            .replace(/\{\{ORDER_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{CUSTOMER_NAME\}\}/g, customerName || 'Valued Customer')
            .replace(/\{\{ORDER_DATE\}\}/g, orderDate)
            .replace(/\{\{CANCELLATION_DATE\}\}/g, cancellationDate)
            .replace(/\{\{PAYMENT_METHOD\}\}/g, orderDetails.paymentMethod || 'E-Wallet')
            .replace(/\{\{REFERENCE_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{ORDER_ITEMS\}\}/g, orderItemsHtml)
            .replace(/\{\{SUBTOTAL\}\}/g, formatCurrency(orderDetails.subtotal || 0).replace('₱', ''))
            .replace(/\{\{SHIPPING_COST\}\}/g, orderDetails.shippingCost > 0 ? formatCurrency(orderDetails.shippingCost).replace('₱', '') : '')
            .replace(/\{\{EXTRA_DELIVERY_FEE\}\}/g, orderDetails.extraDeliveryFee > 0 ? formatCurrency(orderDetails.extraDeliveryFee).replace('₱', '') : '')
            .replace(/\{\{TAX_AMOUNT\}\}/g, '')
            .replace(/\{\{TOTAL_AMOUNT\}\}/g, formatCurrency(orderDetails.totalAmount || 0).replace('₱', ''))
            .replace(/\{\{REFUND_AMOUNT\}\}/g, formatCurrency(orderDetails.totalAmount || 0).replace('₱', ''))
            .replace(/\{\{CURRENT_YEAR\}\}/g, new Date().getFullYear().toString())
            .replace(/\{\{ORDER_HISTORY_LINK\}\}/g, `${frontendUrl}/account?tab=orders`)
            .replace(/\{\{SUPPORT_LINK\}\}/g, `${frontendUrl}/contact`);

        // Handle Transaction ID (conditional replacement)
        if (orderDetails.transactionId) {
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{\/TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{TRANSACTION_ID\}\}/g, orderDetails.transactionId);
        } else {
            // Remove conditional blocks if no transaction ID
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}[\s\S]*?\{\{\/TRANSACTION_ID\}\}/g, '');
        }

        // Handle conditional blocks for optional fields
        if (orderDetails.shippingCost > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}/g, '')
                .replace(/\{\{\/SHIPPING_COST\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}[\s\S]*?\{\{\/SHIPPING_COST\}\}/g, '');
        }

        if (orderDetails.extraDeliveryFee > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}/g, '')
                .replace(/\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}[\s\S]*?\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        }

        // Remove tax amount conditional blocks
        htmlContent = htmlContent
            .replace(/\{\{#TAX_AMOUNT\}\}[\s\S]*?\{\{\/TAX_AMOUNT\}\}/g, '');

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `Refund Receipt for Cancelled Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} - Design Excellence`,
            text: `Hello ${customerName || 'Valued Customer'}, your order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been cancelled and refunded. Refund Amount: ${formatCurrency(orderDetails.totalAmount || 0)}. The refund will be processed back to your original payment method within 5-10 business days. Please keep this email for your records.`,
            html: htmlContent,
        };

        console.log('[SENDGRID REFUND] ===== Sending email via SendGrid =====');
        console.log('[SENDGRID REFUND] To:', toEmail);
        console.log('[SENDGRID REFUND] From:', fromEmail);
        console.log('[SENDGRID REFUND] Subject:', msg.subject);
        console.log('[SENDGRID REFUND] Order:', orderDetails.referenceNumber || orderDetails.orderId);
        console.log('[SENDGRID REFUND] HTML Content Length:', htmlContent.length);

        // Send email via SendGrid
        console.log('[SENDGRID REFUND] Attempting to send email...');
        const response = await sgMail.send(msg);
        
        console.log('[SENDGRID REFUND] ✅ Email sent successfully!');
        console.log('[SENDGRID REFUND] ✅ Status Code:', response[0].statusCode);
        console.log('[SENDGRID REFUND] ✅ Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Refund receipt email sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('[SENDGRID REFUND] ❌ ===== ERROR SENDING EMAIL =====');
        console.error('[SENDGRID REFUND] ❌ Error name:', error.name);
        console.error('[SENDGRID REFUND] ❌ Error message:', error.message);
        console.error('[SENDGRID REFUND] ❌ Error stack:', error.stack);
        
        if (error.response) {
            console.error('[SENDGRID REFUND] ❌ Response Status Code:', error.response.statusCode);
            console.error('[SENDGRID REFUND] ❌ Response Body:', JSON.stringify(error.response.body, null, 2));
        }
        
        return {
            success: false,
            message: `Failed to send refund receipt: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send return refund receipt email to customer for returned order
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details (orderId, referenceNumber, totalAmount, items, returnType, returnReason, etc.)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendReturnRefundReceiptEmail = async (toEmail, customerName, orderDetails) => {
    try {
        console.log('[SENDGRID RETURN REFUND] ===== Starting return refund receipt email =====');
        console.log('[SENDGRID RETURN REFUND] To Email:', toEmail);
        console.log('[SENDGRID RETURN REFUND] Customer Name:', customerName);
        console.log('[SENDGRID RETURN REFUND] Order Details:', JSON.stringify({
            orderId: orderDetails.orderId,
            referenceNumber: orderDetails.referenceNumber,
            transactionId: orderDetails.transactionId,
            totalAmount: orderDetails.totalAmount,
            returnType: orderDetails.returnType,
            returnReason: orderDetails.returnReason,
            itemsCount: orderDetails.items ? orderDetails.items.length : 0
        }, null, 2));
        
        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.error('❌ [SENDGRID RETURN REFUND] SENDGRID_API_KEY not found in environment variables');
            console.log('📧 SendGrid not configured. Return refund receipt email skipped.');
            return {
                success: false,
                message: 'SendGrid API key not configured',
                development: true
            };
        }
        
        console.log('[SENDGRID RETURN REFUND] ✅ SendGrid API key found');

        // Initialize SendGrid
        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        // Get sender email
        const fromEmail = getConfiguredFromEmail();
        console.log('[SENDGRID RETURN REFUND] From Email:', fromEmail);
        
        // Validate recipient email
        if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
            console.error('❌ [SENDGRID RETURN REFUND] Invalid recipient email:', toEmail);
            return {
                success: false,
                message: 'Invalid recipient email address',
                error: 'Invalid email format'
            };
        }
        
        console.log('[SENDGRID RETURN REFUND] ✅ Recipient email validated:', toEmail);

        // Format dates
        const orderDate = orderDetails.orderDate 
            ? new Date(orderDetails.orderDate).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            : new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
            });

        const returnDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format currency
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2
            }).format(amount || 0).replace('PHP', '₱');
        };

        // Format return type
        const formatReturnType = (type) => {
            if (!type) return 'Other';
            return type.charAt(0).toUpperCase() + type.slice(1);
        };

        // Build order items HTML
        let orderItemsHtml = '';
        if (orderDetails.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
            orderItemsHtml = orderDetails.items.map(item => {
                const itemName = item.name || item.ProductName || 'Product';
                const quantity = item.quantity || item.Quantity || 0;
                const price = item.price || item.PriceAtPurchase || 0;
                const variationName = item.variationName || item.VariationName || '';
                const color = item.color || item.Color || '';
                
                let specs = '';
                if (variationName) specs += variationName;
                if (color) specs += (specs ? ' • ' : '') + color;
                
                return `
                    <div class="item">
                        <div class="item-info">
                            <div class="item-name">${itemName}</div>
                            ${specs ? `<div class="item-specs">${specs}</div>` : ''}
                            <div class="item-quantity">Quantity: ${quantity}</div>
                        </div>
                        <div class="item-price">${formatCurrency(price * quantity)}</div>
                    </div>
                `;
            }).join('');
        } else {
            orderItemsHtml = '<div class="item"><div class="item-info"><div class="item-name">No items found</div></div></div>';
        }

        // Read HTML template
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', 'orders', 'return-refund-receipt.html');
        let htmlTemplate = '';
        
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            console.log('⚠️ Using fallback template for return refund receipt');
            htmlTemplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Return Refund Receipt - Design Excellence</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td align="center" style="padding: 40px 0;">
                                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <tr>
                                        <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
                                            <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                            <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Return Refund Receipt</h2>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 40px;">
                                            <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Hello ${customerName || 'Valued Customer'},
                                            </p>
                                            <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                                Your return request has been processed. This is your official return refund receipt.
                                            </p>
                                            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Return Date: ${returnDate}</p>
                                                <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Return Type: ${formatReturnType(orderDetails.returnType)}</p>
                                                <p style="margin: 0; color: #f59e0b; font-size: 18px; font-weight: 700;">Refund Amount: ${formatCurrency(orderDetails.totalAmount || 0)}</p>
                                            </div>
                                            <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                                Your refund has been processed and will be credited to your original payment method within 5-10 business days. Please allow time for your bank or payment provider to process the refund.
                                            </p>
                                            <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                                If you have any questions about this refund, please contact our customer support team.
                                            </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                            <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                                © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `;
        }

        // Replace placeholders
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        let htmlContent = htmlTemplate
            .replace(/\{\{ORDER_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{CUSTOMER_NAME\}\}/g, customerName || 'Valued Customer')
            .replace(/\{\{ORDER_DATE\}\}/g, orderDate)
            .replace(/\{\{RETURN_DATE\}\}/g, returnDate)
            .replace(/\{\{RETURN_TYPE\}\}/g, formatReturnType(orderDetails.returnType))
            .replace(/\{\{RETURN_REASON\}\}/g, orderDetails.returnReason || 'Not specified')
            .replace(/\{\{PAYMENT_METHOD\}\}/g, orderDetails.paymentMethod || 'E-Wallet')
            .replace(/\{\{REFERENCE_NUMBER\}\}/g, orderDetails.referenceNumber || orderDetails.orderId || 'N/A')
            .replace(/\{\{ORDER_ITEMS\}\}/g, orderItemsHtml)
            .replace(/\{\{SUBTOTAL\}\}/g, formatCurrency(orderDetails.subtotal || 0).replace('₱', ''))
            .replace(/\{\{SHIPPING_COST\}\}/g, orderDetails.shippingCost > 0 ? formatCurrency(orderDetails.shippingCost).replace('₱', '') : '')
            .replace(/\{\{EXTRA_DELIVERY_FEE\}\}/g, orderDetails.extraDeliveryFee > 0 ? formatCurrency(orderDetails.extraDeliveryFee).replace('₱', '') : '')
            .replace(/\{\{TAX_AMOUNT\}\}/g, '')
            .replace(/\{\{TOTAL_AMOUNT\}\}/g, formatCurrency(orderDetails.totalAmount || 0).replace('₱', ''))
            .replace(/\{\{REFUND_AMOUNT\}\}/g, formatCurrency(orderDetails.totalAmount || 0).replace('₱', ''))
            .replace(/\{\{CURRENT_YEAR\}\}/g, new Date().getFullYear().toString())
            .replace(/\{\{ORDER_HISTORY_LINK\}\}/g, `${frontendUrl}/account?tab=orders`)
            .replace(/\{\{SUPPORT_LINK\}\}/g, `${frontendUrl}/contact`);

        // Handle Transaction ID (conditional replacement)
        if (orderDetails.transactionId) {
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{\/TRANSACTION_ID\}\}/g, '')
                .replace(/\{\{TRANSACTION_ID\}\}/g, orderDetails.transactionId);
        } else {
            // Remove conditional blocks if no transaction ID
            htmlContent = htmlContent
                .replace(/\{\{#TRANSACTION_ID\}\}[\s\S]*?\{\{\/TRANSACTION_ID\}\}/g, '');
        }

        // Handle conditional blocks for optional fields
        if (orderDetails.shippingCost > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}/g, '')
                .replace(/\{\{\/SHIPPING_COST\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#SHIPPING_COST\}\}[\s\S]*?\{\{\/SHIPPING_COST\}\}/g, '');
        }

        if (orderDetails.extraDeliveryFee > 0) {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}/g, '')
                .replace(/\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        } else {
            htmlContent = htmlContent
                .replace(/\{\{#EXTRA_DELIVERY_FEE\}\}[\s\S]*?\{\{\/EXTRA_DELIVERY_FEE\}\}/g, '');
        }

        // Remove tax amount conditional blocks
        htmlContent = htmlContent
            .replace(/\{\{#TAX_AMOUNT\}\}[\s\S]*?\{\{\/TAX_AMOUNT\}\}/g, '');

        // Prepare email message
        const msg = {
            to: toEmail,
            from: {
                email: fromEmail,
                name: 'Design Excellence'
            },
            subject: `Return Refund Receipt for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} - Design Excellence`,
            text: `Hello ${customerName || 'Valued Customer'}, your return request for order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been processed. Refund Amount: ${formatCurrency(orderDetails.totalAmount || 0)}. The refund will be processed back to your original payment method within 5-10 business days. Please keep this email for your records.`,
            html: htmlContent,
        };

        console.log('[SENDGRID RETURN REFUND] ===== Sending email via SendGrid =====');
        console.log('[SENDGRID RETURN REFUND] To:', toEmail);
        console.log('[SENDGRID RETURN REFUND] From:', fromEmail);
        console.log('[SENDGRID RETURN REFUND] Subject:', msg.subject);
        console.log('[SENDGRID RETURN REFUND] Order:', orderDetails.referenceNumber || orderDetails.orderId);
        console.log('[SENDGRID RETURN REFUND] HTML Content Length:', htmlContent.length);

        // Send email via SendGrid
        console.log('[SENDGRID RETURN REFUND] Attempting to send email...');
        const response = await sgMail.send(msg);
        
        console.log('[SENDGRID RETURN REFUND] ✅ Email sent successfully!');
        console.log('[SENDGRID RETURN REFUND] ✅ Status Code:', response[0].statusCode);
        console.log('[SENDGRID RETURN REFUND] ✅ Message ID:', response[0].headers['x-message-id']);

        return {
            success: true,
            message: 'Return refund receipt email sent successfully',
            messageId: response[0].headers['x-message-id']
        };

    } catch (error) {
        console.error('[SENDGRID RETURN REFUND] ❌ ===== ERROR SENDING EMAIL =====');
        console.error('[SENDGRID RETURN REFUND] ❌ Error name:', error.name);
        console.error('[SENDGRID RETURN REFUND] ❌ Error message:', error.message);
        console.error('[SENDGRID RETURN REFUND] ❌ Error stack:', error.stack);
        
        if (error.response) {
            console.error('[SENDGRID RETURN REFUND] ❌ Response Status Code:', error.response.statusCode);
            console.error('[SENDGRID RETURN REFUND] ❌ Response Body:', JSON.stringify(error.response.body, null, 2));
        }
        
        return {
            success: false,
            message: `Failed to send return refund receipt: ${error.message}`,
            error: error.message,
            errorDetails: error.response ? {
                statusCode: error.response.statusCode,
                body: error.response.body
            } : null
        };
    }
};

/**
 * Send return request email to customer when return is submitted
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendReturnRequestEmail = async (toEmail, customerName, orderDetails) => {
    try {
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Return request email skipped.');
            return { success: false, message: 'SendGrid API key not configured', development: true };
        }

        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        const fromEmail = getConfiguredFromEmail();
        
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2
            }).format(amount || 0).replace('PHP', '₱');
        };

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Return Request Submitted - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                        <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Return Request Submitted</h2>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px;">
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We have received your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}. Our team will review your request and notify you of the decision within 2-3 business days.
                                        </p>
                                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Requested Action: ${orderDetails.actionType === 'refund' ? '💰 Refund' : '🔄 Replacement'}</p>
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Return Reason: ${orderDetails.returnType === 'damage' ? 'Damaged Item' : orderDetails.returnType === 'wrong_item' ? 'Wrong Item' : 'Other Reason'}</p>
                                            <p style="margin: 0; color: #6b7280; font-size: 14px;">${orderDetails.returnReason || 'No additional details provided'}</p>
                                        </div>
                                        <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            You will receive an email notification once your return request has been reviewed and processed.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const msg = {
            to: toEmail,
            from: { email: fromEmail, name: 'Design Excellence' },
            subject: `Return Request Submitted - Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}`,
            text: `Hello ${customerName || 'Valued Customer'}, we have received your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}. Our team will review your request and notify you within 2-3 business days.`,
            html: htmlContent,
        };

        const response = await sgMail.send(msg);
        return { success: true, message: 'Return request email sent successfully', messageId: response[0].headers['x-message-id'] };
    } catch (error) {
        console.error('Error sending return request email:', error);
        return { success: false, message: `Failed to send return request email: ${error.message}` };
    }
};

/**
 * Send return approval email to customer
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details including fees
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendReturnApprovalEmail = async (toEmail, customerName, orderDetails) => {
    try {
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Return approval email skipped.');
            return { success: false, message: 'SendGrid API key not configured', development: true };
        }

        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        const fromEmail = getConfiguredFromEmail();
        
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2
            }).format(amount || 0).replace('PHP', '₱');
        };

        const returnShippingFee = orderDetails.returnShippingFee || 0;
        const refundAmount = orderDetails.refundAmount || 0;

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Return Request Approved - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                        <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Return Request Approved ✓</h2>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px;">
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Great news! Your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been approved.
                                        </p>
                                        <div style="background: #f0fdf4; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Action: ${orderDetails.actionType === 'refund' ? '💰 Refund' : '🔄 Replacement'}</p>
                                            ${orderDetails.actionType === 'refund' ? `
                                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #d1d5db;">
                                                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Subtotal: ${formatCurrency(orderDetails.subtotal || 0)}</p>
                                                ${returnShippingFee > 0 ? `<p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Return Shipping Fee: -${formatCurrency(returnShippingFee)}</p>` : ''}
                                                <p style="margin: 15px 0 0 0; color: #10b981; font-size: 18px; font-weight: 700; border-top: 1px solid #d1d5db; padding-top: 10px;">Refund Amount: ${formatCurrency(refundAmount)}</p>
                                            </div>
                                            ` : '<p style="margin: 15px 0 0 0; color: #10b981; font-size: 16px; font-weight: 600;">A replacement order will be processed shortly.</p>'}
                                        </div>
                                        <div style="background: #fff7ed; border: 2px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 700; font-size: 16px;">📦 Pickup Instructions</p>
                                            <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                                                Please prepare the item for return. Our delivery team will contact you within 2-3 business days to arrange pickup of the damaged/returned product.
                                            </p>
                                            <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; font-weight: 600;">
                                                ⏳ Please wait for further instructions on how to proceed with the pickup. We will notify you via email or phone call with the pickup schedule and location details.
                                            </p>
                                        </div>
                                        ${orderDetails.actionType === 'replacement' ? `
                                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Once we receive the returned item, your replacement will be shipped to you.
                                        </p>
                                        ` : `
                                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            Once we receive and verify the returned item, your refund will be processed to your original payment method within 5-10 business days.
                                        </p>
                                        `}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const msg = {
            to: toEmail,
            from: { email: fromEmail, name: 'Design Excellence' },
            subject: `Return Request Approved - Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}`,
            text: `Hello ${customerName || 'Valued Customer'}, your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been approved. ${orderDetails.actionType === 'refund' ? `Refund Amount: ${formatCurrency(refundAmount)}.` : 'A replacement order will be processed shortly.'}`,
            html: htmlContent,
        };

        const response = await sgMail.send(msg);
        return { success: true, message: 'Return approval email sent successfully', messageId: response[0].headers['x-message-id'] };
    } catch (error) {
        console.error('Error sending return approval email:', error);
        return { success: false, message: `Failed to send return approval email: ${error.message}` };
    }
};

/**
 * Send return decline email to customer
 * @param {string} toEmail - Customer email address
 * @param {string} customerName - Customer full name
 * @param {Object} orderDetails - Order details including decline reason
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendReturnDeclineEmail = async (toEmail, customerName, orderDetails) => {
    try {
        if (!process.env.SENDGRID_API_KEY) {
            console.log('📧 SendGrid not configured. Return decline email skipped.');
            return { success: false, message: 'SendGrid API key not configured', development: true };
        }

        if (!initializeSendGrid()) {
            throw new Error('SendGrid initialization failed');
        }

        const fromEmail = getConfiguredFromEmail();
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Return Request Declined - Design Excellence</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <tr>
                                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 8px 8px 0 0;">
                                        <h1 style="margin: 0; color: #F0B21B; font-size: 32px; font-weight: bold;">Design Excellence</h1>
                                        <h2 style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">Return Request Declined</h2>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px;">
                                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            Hello ${customerName || 'Valued Customer'},
                                        </p>
                                        <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                                            We regret to inform you that your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been declined after review.
                                        </p>
                                        <div style="background: #fef2f2; border: 2px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                            <p style="margin: 0 0 10px 0; color: #1f2937; font-weight: 600;">Order Number: #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}</p>
                                            <p style="margin: 15px 0 10px 0; color: #dc2626; font-weight: 600; font-size: 16px;">Reason for Decline:</p>
                                            <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">${orderDetails.declineReason || 'The return request does not meet our return policy requirements.'}</p>
                                        </div>
                                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                            If you have any questions or concerns about this decision, please contact our customer support team. We're here to help!
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                            © ${new Date().getFullYear()} Design Excellence. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const msg = {
            to: toEmail,
            from: { email: fromEmail, name: 'Design Excellence' },
            subject: `Return Request Declined - Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'}`,
            text: `Hello ${customerName || 'Valued Customer'}, your return request for Order #${orderDetails.referenceNumber || orderDetails.orderId || 'N/A'} has been declined. Reason: ${orderDetails.declineReason || 'The return request does not meet our return policy requirements.'}`,
            html: htmlContent,
        };

        const response = await sgMail.send(msg);
        return { success: true, message: 'Return decline email sent successfully', messageId: response[0].headers['x-message-id'] };
    } catch (error) {
        console.error('Error sending return decline email:', error);
        return { success: false, message: `Failed to send return decline email: ${error.message}` };
    }
};

module.exports = {
    sendOtpEmail,
    sendPasswordResetEmail,
    sendUserPasswordResetEmail,
    sendTestOtpEmail,
    sendOrderShippingEmail,
    sendOrderOutForDeliveryEmail,
    sendOrderReceivedEmail,
    sendBulkOrderConfirmationEmail,
    sendOrderReceiptEmail,
    sendRefundReceiptEmail,
    sendReturnRefundReceiptEmail,
    sendReturnRequestEmail,
    sendReturnApprovalEmail,
    sendReturnDeclineEmail
};

