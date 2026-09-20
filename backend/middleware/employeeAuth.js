'use strict';

const jwtUtils = require('../utils/jwtUtils');
const env = require('../config/env');

function isAjaxLikeRequest(req) {
    return req.xhr ||
        (req.headers.accept && req.headers.accept.indexOf('json') > -1) ||
        (req.headers['content-type'] && req.headers['content-type'].indexOf('json') > -1) ||
        req.path.startsWith('/api/');
}

function redirectToLogin(req, res, message) {
    if (isAjaxLikeRequest(req)) {
        return res.status(401).json({
            success: false,
            message: message,
            requiresLogin: true,
            code: 'AUTHENTICATION_REQUIRED'
        });
    }

    req.flash('error', message);
    res.redirect('/login');
}

function handleAccessDenied(req, res, userRole) {
    if (isAjaxLikeRequest(req)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Employee access required.',
            code: 'EMPLOYEE_ACCESS_REQUIRED'
        });
    }

    req.flash('error', 'Employee access required. Please log in with an employee account.');
    res.redirect('/login');
}

/**
 * Enhanced middleware to check if user is logged in (supports both session and JWT)
 */
function isAuthenticated(req, res, next) {
    if (env.isDevelopment || env.debugAuth) {
        console.log('=== AUTHENTICATION CHECK ===', req.method, req.url);
    }

    if (req.session && req.session.user) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const decoded = jwtUtils.verifyToken(token);
            req.session = req.session || {};
            req.session.user = {
                id: decoded.id,
                email: decoded.email,
                role: decoded.role,
                type: decoded.type,
                fullName: decoded.fullName
            };
            return next();
        } catch (error) {
            if (env.isDevelopment) {
                console.log('JWT Authentication failed:', error.message);
            }
        }
    }

    if (isAjaxLikeRequest(req)) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please log in.',
            requiresLogin: true,
            code: 'AUTHENTICATION_REQUIRED'
        });
    }

    req.flash('error', 'Please log in to access this page.');
    res.redirect('/login');
}

/**
 * EMPLOYEE ACCESS SYSTEM: All employee roles have access
 */
function hasEmployeeAccess(req, res, next) {
    if (!req.session || !req.session.user) {
        return redirectToLogin(req, res, 'Authentication required.');
    }

    const userRole = req.session.user.role;
    const allowedRoles = [
        'Admin',
        'TransactionManager',
        'InventoryManager',
        'UserManager',
        'OrderSupport',
        'Employee'
    ];

    if (allowedRoles.includes(userRole)) {
        return next();
    }

    return handleAccessDenied(req, res, userRole);
}

async function handleEmployeeRoute(req, res, section, template) {
    try {
        console.log(`${section} access attempt - UserID: ${req.session.user.id}, Role: ${req.session.user.role}`);
        res.render(template, { user: req.session.user });
    } catch (error) {
        console.error(`Error in ${section} route:`, error);
        res.status(500).render('error', {
            message: `Failed to load ${section} page.`,
            error: error.message
        });
    }
}

module.exports = {
    isAuthenticated,
    hasEmployeeAccess,
    handleAccessDenied,
    redirectToLogin,
    handleEmployeeRoute
};
