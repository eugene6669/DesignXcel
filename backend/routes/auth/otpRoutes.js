'use strict';

/**
 * OTP authentication API routes.
 */
module.exports = function registerOtpRoutes(router, deps) {
    const { pool, sql, sendgridHelper } = deps;

    router.post('/api/auth/send-otp', async (req, res) => {
        try {
            const { email } = req.body;

            console.log('📧 OTP Request received for email:', email);

            if (!email) {
                return res.json({ success: false, message: 'Email is required' });
            }

            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            await pool.connect();
            const existingUser = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT CustomerID FROM Customers WHERE Email = @email');

            if (existingUser.recordset.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'An account with this email already exists. Please use a different email or try logging in instead.',
                    code: 'EMAIL_ALREADY_EXISTS'
                });
            }

            await pool.request()
                .input('email', sql.NVarChar, email)
                .input('otp', sql.NVarChar, otp)
                .query(`
                    MERGE OTPVerification AS target
                    USING (SELECT @email as email) AS source
                    ON target.Email = source.email
                    WHEN MATCHED THEN
                        UPDATE SET 
                            OTP = @otp,
                            ExpiresAt = DATEADD(MINUTE, 5, GETDATE()),
                            CreatedAt = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (Email, OTP, ExpiresAt, CreatedAt)
                        VALUES (@email, @otp, DATEADD(MINUTE, 5, GETDATE()), GETDATE());
                `);

            const { sendOtpEmail } = require('../../utils/sendgridHelper');

            console.log('📧 Email config check:');
            console.log('  - SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Set' : 'Not set');
            console.log('  - OTP_EMAIL_USER:', process.env.OTP_EMAIL_USER ? 'Set' : 'Not set');
            console.log('  - NODE_ENV:', process.env.NODE_ENV);

            const emailResult = await sendOtpEmail(email, otp);

            if (!emailResult.success) {
                return res.json({
                    success: false,
                    message: emailResult.message || 'Failed to send OTP email'
                });
            }

            console.log(`✅ OTP sent to ${email}`);

            res.json({
                success: true,
                message: 'OTP sent successfully',
                otp: process.env.NODE_ENV === 'development' ? otp : undefined
            });
        } catch (err) {
            console.error('Error sending OTP:', err);
            console.error('Error details:', err.message);
            console.error('Error code:', err.code);
            res.json({ success: false, message: 'Failed to send OTP: ' + err.message });
        }
    });

    router.post('/api/auth/test-otp', async (req, res) => {
        try {
            const { email } = req.body;

            if (!email) {
                return res.json({ success: false, message: 'Email is required' });
            }

            console.log('🧪 Testing OTP email for:', email);

            const { sendTestOtpEmail } = require('../../utils/sendgridHelper');
            const result = await sendTestOtpEmail(email);

            if (result.success) {
                console.log('✅ Test OTP email sent successfully to:', email);
            } else {
                console.error('❌ Error sending test OTP:', result.message);
            }

            res.json(result);
        } catch (err) {
            console.error('❌ Error sending test OTP:', err);
            res.json({ success: false, message: 'Failed to send test OTP: ' + err.message });
        }
    });

    router.post('/api/test/order-notification', async (req, res) => {
        try {
            const { email, notificationType } = req.body;

            if (!email) {
                return res.json({ success: false, message: 'Email is required' });
            }

            const type = notificationType || 'delivery';

            console.log('🧪 [TEST] Testing order notification email...');
            console.log('🧪 [TEST] Email:', email);
            console.log('🧪 [TEST] Type:', type);
            console.log('🧪 [TEST] SendGrid API Key:', process.env.SENDGRID_API_KEY ? `Set (length: ${process.env.SENDGRID_API_KEY.length})` : 'Not set');
            console.log('🧪 [TEST] OTP Email User:', process.env.OTP_EMAIL_USER || 'Not set (using default: design.xcel01@gmail.com)');
            console.log('🧪 [TEST] NODE_ENV:', process.env.NODE_ENV);

            const testOrderDetails = {
                orderId: 999,
                referenceNumber: 'TEST-ORDER-001',
                totalAmount: 1500.00
            };

            let result;
            if (type === 'delivery') {
                result = await sendgridHelper.sendOrderOutForDeliveryEmail(
                    email,
                    'Test Customer',
                    testOrderDetails
                );
            } else {
                result = await sendgridHelper.sendOrderReceivedEmail(
                    email,
                    'Test Customer',
                    testOrderDetails
                );
            }

            if (result.success) {
                console.log('✅ [TEST] Test order notification email sent successfully to:', email);
            } else {
                console.error('❌ [TEST] Error sending test order notification:', result.message);
                if (result.errorDetails) {
                    console.error('❌ [TEST] Error Details:', JSON.stringify(result.errorDetails, null, 2));
                }
            }

            res.json({
                ...result,
                testDetails: {
                    email,
                    type,
                    sendGridConfigured: !!process.env.SENDGRID_API_KEY,
                    sendGridApiKeyLength: process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0,
                    fromEmail: process.env.OTP_EMAIL_USER || 'design.xcel01@gmail.com',
                    nodeEnv: process.env.NODE_ENV
                }
            });
        } catch (err) {
            console.error('❌ [TEST] Error sending test order notification:', err);
            console.error('❌ [TEST] Error stack:', err.stack);
            res.json({
                success: false,
                message: 'Failed to send test order notification: ' + err.message,
                error: err.stack,
                testDetails: {
                    sendGridConfigured: !!process.env.SENDGRID_API_KEY,
                    fromEmail: process.env.OTP_EMAIL_USER || 'design.xcel01@gmail.com'
                }
            });
        }
    });

    router.get('/api/test/sendgrid-config', async (req, res) => {
        try {
            const config = {
                sendGridApiKey: process.env.SENDGRID_API_KEY ? `Set (length: ${process.env.SENDGRID_API_KEY.length}, first 10 chars: ${process.env.SENDGRID_API_KEY.substring(0, 10)}...)` : 'Not set',
                otpEmailUser: process.env.OTP_EMAIL_USER || 'Not set (will use default: design.xcel01@gmail.com)',
                nodeEnv: process.env.NODE_ENV || 'Not set',
                fromEmail: process.env.OTP_EMAIL_USER || 'design.xcel01@gmail.com'
            };

            console.log('🔍 [DIAGNOSTIC] SendGrid Configuration Check:');
            console.log('  - SendGrid API Key:', config.sendGridApiKey);
            console.log('  - OTP Email User:', config.otpEmailUser);
            console.log('  - Node Environment:', config.nodeEnv);
            console.log('  - From Email:', config.fromEmail);

            res.json({
                success: true,
                config,
                message: 'SendGrid configuration check completed'
            });
        } catch (err) {
            console.error('❌ [DIAGNOSTIC] Error checking SendGrid config:', err);
            res.json({
                success: false,
                message: 'Failed to check SendGrid configuration: ' + err.message
            });
        }
    });

    router.post('/api/auth/verify-otp', async (req, res) => {
        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                return res.json({ success: false, message: 'Email and OTP are required' });
            }

            await pool.connect();
            const result = await pool.request()
                .input('email', sql.NVarChar, email)
                .input('otp', sql.NVarChar, otp)
                .query(`
                    SELECT OTP, ExpiresAt 
                    FROM OTPVerification 
                    WHERE Email = @email AND OTP = @otp AND ExpiresAt > GETDATE()
                `);

            if (result.recordset.length > 0) {
                await pool.request()
                    .input('email', sql.NVarChar, email)
                    .query('DELETE FROM OTPVerification WHERE Email = @email');

                res.json({ success: true, message: 'OTP verified successfully' });
            } else {
                res.json({ success: false, message: 'Invalid or expired OTP' });
            }
        } catch (err) {
            console.error('Error verifying OTP:', err);
            res.json({ success: false, message: 'Failed to verify OTP' });
        }
    });
};
