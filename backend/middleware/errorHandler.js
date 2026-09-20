'use strict';

/**
 * Central error-handling middleware.
 * Preserves existing JSON/HTML error response patterns used across routes.
 */
function notFoundHandler(req, res) {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'Not found'
        });
    }
    return res.status(404).send('Not found');
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    console.error('[ERROR]', req.method, req.path, err);

    if (req.path.startsWith('/api/') || req.xhr) {
        return res.status(err.status || err.statusCode || 500).json({
            success: false,
            message: err.message || 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    req.flash('error', err.message || 'An unexpected error occurred.');
    return res.redirect('back');
}

module.exports = {
    notFoundHandler,
    errorHandler
};
