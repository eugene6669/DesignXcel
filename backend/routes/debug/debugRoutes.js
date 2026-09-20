'use strict';

/**
 * Debug and health-check routes.
 */
module.exports = function registerDebugRoutes(router) {
    router.get('/api/debug/env-check', async (req, res) => {
        try {
            const envCheck = {
                nodeEnv: process.env.NODE_ENV,
                otpEmailUser: process.env.OTP_EMAIL_USER ? 'Set' : 'Not set',
                otpEmailPass: process.env.OTP_EMAIL_PASS ? 'Set' : 'Not set',
                dbServer: process.env.DB_SERVER ? 'Set' : 'Not set',
                sessionSecret: process.env.SESSION_SECRET ? 'Set' : 'Not set',
                corsOrigin: process.env.CORS_ORIGIN ? 'Set' : 'Not set',
                timestamp: new Date().toISOString()
            };

            console.log('🔍 Environment check requested:', envCheck);

            res.json({
                success: true,
                message: 'Environment variables check',
                environment: envCheck
            });
        } catch (error) {
            console.error('❌ Environment check error:', error);
            res.status(500).json({
                success: false,
                message: 'Environment check failed',
                error: error.message
            });
        }
    });

    router.get('/api/health', async (req, res) => {
        try {
            res.json({
                success: true,
                message: 'Server is running',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Health check failed',
                error: error.message
            });
        }
    });
};
