'use strict';

const { getViewModule } = require('./viewRuntime');

/**
 * Drop-in replacement for Express res.render(viewPath, data).
 * Preserves default text/html response and optional statusCode.
 *
 * @param {import('express').Response} res
 * @param {string} viewPath - Same path used with EJS (no extension), e.g. 'Employee/Admin/AdminManager'
 * @param {object} [data]
 * @param {number} [statusCode]
 */
function renderView(res, viewPath, data, statusCode) {
    const normalized = viewPath.replace(/\\/g, '/').replace(/\.ejs$/, '');
    const mergedLocals = Object.assign(
        {},
        res.app.locals,
        res.locals,
        data || {}
    );
    const mod = getViewModule(normalized);
    const html = mod.render(mergedLocals);

    if (statusCode) {
        res.status(statusCode);
    }
    res.type('html');
    res.send(html);
}

/**
 * Patch Express response prototype so existing res.render() calls work unchanged.
 * @param {import('express').Express} app
 */
function installRenderMiddleware(app) {
    const express = require('express');
    const resProto = express.response;

    if (resProto.__designxcelJsRenderPatched) {
        return;
    }

    const originalRender = resProto.render;

    resProto.render = function patchedRender(view, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = options || {};

        const mergedLocals = Object.assign(
            {},
            this.app.locals,
            this.locals,
            options
        );

        try {
            const html = getViewModule(
                view.replace(/\\/g, '/').replace(/\.ejs$/, '')
            ).render(mergedLocals);

            if (callback) {
                return callback(null, html);
            }

            this.type('html');
            return this.send(html);
        } catch (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }
    };

    resProto.__designxcelJsRenderPatched = true;
    resProto.__designxcelOriginalRender = originalRender;

    if (app) {
        app.set('view engine', 'js');
    }
}

module.exports = {
    renderView,
    installRenderMiddleware
};
