'use strict';

/**
 * Short-lived in-memory cache for admin EJS reference data (safe per Node process).
 * Reduces repeated DB hits on every ProductInventory / Materials page load.
 */

const DEFAULT_TTL_MS = 60 * 1000;

const store = new Map();

function cacheGet(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidateAdminPageCache(prefix) {
    if (!prefix) {
        store.clear();
        return;
    }
    for (const key of store.keys()) {
        if (String(key).startsWith(prefix)) store.delete(key);
    }
}

async function getOrLoad(key, loader, ttlMs = DEFAULT_TTL_MS) {
    const hit = cacheGet(key);
    if (hit != null) return hit;
    const value = await loader();
    cacheSet(key, value, ttlMs);
    return value;
}

module.exports = {
    getOrLoad,
    cacheGet,
    cacheSet,
    invalidateAdminPageCache
};
