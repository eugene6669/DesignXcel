'use strict';

/**
 * Centralized environment configuration.
 * Prefer reading process.env through this module for consistency.
 */
const configManager = require('./configManager');

const env = {
    get nodeEnv() {
        return process.env.NODE_ENV || 'development';
    },
    get isDevelopment() {
        return env.nodeEnv === 'development';
    },
    get isProduction() {
        return env.nodeEnv === 'production';
    },
    get port() {
        return parseInt(process.env.PORT, 10) || 5000;
    },
    get host() {
        return process.env.HOST || '0.0.0.0';
    },
    get frontendUrl() {
        return process.env.FRONTEND_URL || 'http://localhost:3000';
    },
    get dbConnectionString() {
        return process.env.DB_CONNECTION_STRING;
    },
    get stripeSecretKey() {
        return process.env.STRIPE_SECRET_KEY;
    },
    get stripeWebhookSecret() {
        return process.env.STRIPE_WEBHOOK_SECRET;
    },
    get sessionSecret() {
        return process.env.SESSION_SECRET;
    },
    get googleClientId() {
        return process.env.GOOGLE_CLIENT_ID;
    },
    get googleClientSecret() {
        return process.env.GOOGLE_CLIENT_SECRET;
    },
    get googleCallbackUrl() {
        return process.env.GOOGLE_CALLBACK_URL;
    },
    get publicApiUrl() {
        return process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL;
    },
    get allowedOrigins() {
        return process.env.ALLOWED_ORIGINS;
    },
    get azureBlobPublicBaseUrl() {
        return process.env.AZURE_BLOB_PUBLIC_BASE_URL;
    },
    get debugAuth() {
        return process.env.DEBUG_AUTH === 'true';
    },
    get enableSlowRequestLogs() {
        return process.env.ENABLE_SLOW_REQUEST_LOGS === 'true';
    },
    get sendgridApiKey() {
        return process.env.SENDGRID_API_KEY;
    },
    /** Full typed config from ConfigManager (database, server, security, etc.) */
    get config() {
        return configManager.config;
    }
};

module.exports = env;
