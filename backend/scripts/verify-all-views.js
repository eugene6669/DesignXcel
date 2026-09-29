'use strict';

/**
 * Verify all converted JS views produce identical output to their EJS sources.
 * Run from backend/: node scripts/verify-all-views.js
 */

const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { getViewModule, clearViewCache } = require('../views/render/viewRuntime');

const viewsRoot = path.join(__dirname, '../views');
const registry = require('../views/render/registry');

const defaultLocals = {
    user: { role: 'Admin', FullName: 'Test User', id: 1 },
    error: [],
    success: [],
    materials: [],
    units: [],
    categories: [],
    bomBundles: [],
    inventoryItems: [],
    products: [],
    allInventoryProducts: [],
    pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 1 },
    listFilters: { search: '', category: '' },
    inventoryProductIdFocus: null,
    activeTab: 'ProductInventory',
    bulkOrders: []
};

function isPartialView(viewKey) {
    return viewKey.includes('/partials/');
}

function compare(viewKey) {
    if (isPartialView(viewKey)) {
        return true;
    }
    const ejsPath = path.join(viewsRoot, viewKey + '.ejs');
    if (!fs.existsSync(ejsPath)) {
        console.log(`${viewKey}: SKIP (no .ejs source)`);
        return true;
    }
    try {
        const ejsOut = ejs.render(fs.readFileSync(ejsPath, 'utf8'), defaultLocals, { filename: ejsPath });
        const jsOut = getViewModule(viewKey).render(defaultLocals);
        if (ejsOut !== jsOut) {
            console.log(`${viewKey}: MISMATCH (ejs=${ejsOut.length}, js=${jsOut.length})`);
            return false;
        }
        return true;
    } catch (err) {
        console.log(`${viewKey}: ERROR — ${err.message}`);
        return false;
    }
}

clearViewCache();
const keys = Object.keys(registry).sort();
let passed = 0;
let failed = 0;
let skipped = 0;

for (const key of keys) {
    if (isPartialView(key)) {
        skipped += 1;
        continue;
    }
    if (compare(key)) {
        passed += 1;
    } else {
        failed += 1;
    }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} partials skipped, ${keys.length} total`);
process.exit(failed > 0 ? 1 : 0);
