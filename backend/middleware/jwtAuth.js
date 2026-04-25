const jwtUtils = require('../utils/jwtUtils');

function extractToken(req) {
    const header = req.headers && req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        return header.substring(7);
    }
    // Also allow token via cookie named "token" if present
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }
    return null;
}

function jwtAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: missing token' });
    }
    try {
        const decoded = jwtUtils.verifyToken(token);
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized: invalid token' });
    }
}

function optionalJwtAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return next();
    }
    try {
        const decoded = jwtUtils.verifyToken(token);
        req.user = decoded;
    } catch (_) {
        // Ignore decode errors for optional auth
    }
    return next();
}

function requireRole(roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
        const role = req.user?.role || req.session?.user?.role;
        if (!role) {
            return res.status(403).json({ message: 'Forbidden: no role' });
        }
        if (!allowed.includes(role)) {
            return res.status(403).json({ message: 'Forbidden: insufficient role' });
        }
        next();
    };
}

function requireUserType(types) {
    const allowed = Array.isArray(types) ? types : [types];
    return (req, res, next) => {
        const type = req.user?.type || req.session?.user?.type;
        if (!type) {
            return res.status(403).json({ message: 'Forbidden: no user type' });
        }
        if (!allowed.includes(type)) {
            return res.status(403).json({ message: 'Forbidden: insufficient user type' });
        }
        next();
    };
}

module.exports = {
    jwtAuth,
    optionalJwtAuth,
    requireRole,
    requireUserType,
};


