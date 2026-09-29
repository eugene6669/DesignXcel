'use strict';

const path = require('path');

/** @type {Map<string, { render: function }>} */
const viewCache = new Map();

/** @type {Record<string, string> | null} */
let registry = null;

function loadRegistry() {
    if (!registry) {
        // eslint-disable-next-line global-require
        registry = require('./registry');
    }
    return registry;
}

function resolveViewKey(parentViewKey, includePath) {
    const parentDir = path.posix.dirname(parentViewKey);
    const normalized = path.posix.normalize(path.posix.join(parentDir, includePath.replace(/\\/g, '/')));
    return normalized;
}

function getViewModule(viewKey) {
    if (viewCache.has(viewKey)) {
        return viewCache.get(viewKey);
    }
    const reg = loadRegistry();
    const mod = reg[viewKey];
    if (!mod || typeof mod.render !== 'function') {
        throw new Error(`View not found in registry: ${viewKey}`);
    }
    viewCache.set(viewKey, mod);
    return mod;
}

function createInclude(parentViewKey, locals) {
    return function include(includePath, includeData) {
        const resolvedKey = resolveViewKey(parentViewKey, includePath);
        const childLocals = includeData
            ? Object.assign({}, locals, includeData)
            : locals;
        return getViewModule(resolvedKey).render(childLocals);
    };
}

module.exports = {
    createInclude,
    getViewModule,
    resolveViewKey,
    clearViewCache() {
        viewCache.clear();
        registry = null;
    }
};
