#!/usr/bin/env node
/**
 * Copy Admin EJS pages to role folders with role-prefixed URLs.
 * Run: node backend/scripts/sync-role-views-from-admin.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const viewsRoot = path.join(__dirname, '..', 'views', 'Employee');
const adminDir = path.join(viewsRoot, 'Admin');

const ROLES = [
    { roleName: 'InventoryManager', urlSegment: 'InventoryManager', viewPrefix: 'Inventory' },
    { roleName: 'TransactionManager', urlSegment: 'TransactionManager', viewPrefix: 'Transaction' },
    { roleName: 'UserManager', urlSegment: 'UserManager', viewPrefix: 'User' },
    { roleName: 'OrderSupport', urlSegment: 'OrderSupport', viewPrefix: 'Order' }
];

const ADMIN_PAGES = [
    'AdminReports', 'AdminProducts', 'AdminProductInventory', 'AdminMaterials',
    'AdminBulkOrders', 'AdminRates', 'AdminWalkIn', 'AdminReturnedOrders',
    'AdminManageUsers', 'AdminReviews', 'AdminChatSupport', 'AdminMessages',
    'AdminCMS', 'AdminLogs', 'AdminArchived', 'AdminAlerts',
    // Do not sync AdminManager — each role has its own dashboard template
    'AdminOrdersPending', 'AdminOrdersProcessing', 'AdminOrdersShipping',
    'AdminOrdersDelivery', 'AdminOrdersReceive', 'AdminCancelledOrders', 'AdminCompletedOrders'
];

function transformContent(content, role) {
    let s = content;
    // Page/API URLs only — keep shared Admin CSS and JS paths
    s = s.replace(/\/Employee\/Admin\//g, `/Employee/${role.urlSegment}/`);
    s = s.replace(/\/Employee\/AdminManager/g, `/Employee/${role.urlSegment}`);
    s = s.replace(/Employee\/Admin\//g, `Employee/${role.roleName}/`);
    return s;
}

function syncRole(role) {
    const destDir = path.join(viewsRoot, role.roleName);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    ADMIN_PAGES.forEach((adminFile) => {
        const base = adminFile.replace(/^Admin/, '');
        const destName = `${role.viewPrefix}${base}.ejs`;
        const srcPath = path.join(adminDir, `${adminFile}.ejs`);
        const destPath = path.join(destDir, destName);
        if (!fs.existsSync(srcPath)) {
            console.warn('Skip missing:', adminFile);
            return;
        }
        const raw = fs.readFileSync(srcPath, 'utf8');
        fs.writeFileSync(destPath, transformContent(raw, role), 'utf8');
        console.log('Synced', destName, '→', role.roleName);
    });
}

ROLES.forEach(syncRole);
console.log('Done. Register routes for new pages if needed.');
