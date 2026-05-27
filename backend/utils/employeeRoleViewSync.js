'use strict';

const fs = require('fs');
const path = require('path');

const viewsRoot = path.join(__dirname, '..', 'views', 'Employee');
const adminDir = path.join(viewsRoot, 'Admin');

/** API paths shared across roles — do not rewrite to role URLs */
const PRESERVE_ADMIN_PATHS = [
    '/Employee/Admin/Reports/',
    '/Employee/Admin/ManageUsers/Permissions/',
    '/Employee/Admin/ManageUsers/Roles',
    '/api/admin/'
];

const ROLES = [
    {
        roleName: 'InventoryManager',
        urlSegment: 'InventoryManager',
        viewPrefix: 'Inventory',
        panelTitle: 'Inventory Manager Panel',
        pageTitlePrefix: 'Inventory Manager'
    },
    {
        roleName: 'TransactionManager',
        urlSegment: 'TransactionManager',
        viewPrefix: 'Transaction',
        panelTitle: 'Transaction Manager Panel',
        pageTitlePrefix: 'Transaction Manager'
    },
    {
        roleName: 'UserManager',
        urlSegment: 'UserManager',
        viewPrefix: 'User',
        panelTitle: 'User Manager Panel',
        pageTitlePrefix: 'User Manager'
    },
    {
        roleName: 'OrderSupport',
        urlSegment: 'OrderSupport',
        viewPrefix: 'Order',
        panelTitle: 'Order Support Panel',
        pageTitlePrefix: 'Order Support'
    }
];

const ADMIN_PAGES = [
    'AdminReports', 'AdminProducts', 'AdminProductInventory', 'AdminMaterials',
    'AdminBulkOrders', 'AdminRates', 'AdminWalkIn', 'AdminReturnedOrders',
    'AdminManageUsers', 'AdminReviews', 'AdminChatSupport', 'AdminMessages',
    'AdminCMS', 'AdminLogs', 'AdminArchived', 'AdminAlerts',
    'AdminOrdersPending', 'AdminOrdersProcessing', 'AdminOrdersShipping',
    'AdminOrdersDelivery', 'AdminOrdersReceive', 'AdminCancelledOrders',
    'AdminCompletedOrders', 'AdminCompletedReplacement', 'AdminCompletedRefunded',
    'AdminProductReturns'
];

const SKIP_SYNC = new Set(['AdminManager', 'WalkInPaymentSuccess']);

function buildUrlReplacements(role) {
    const base = `/Employee/${role.urlSegment}`;
    const p = role.viewPrefix;
    const pairs = [
        ['/Employee/Admin/Orders?tab=pending', `${base}/${p}OrdersPending`],
        ['/Employee/Admin/Orders?tab=processing', `${base}/${p}OrdersProcessing`],
        ['/Employee/Admin/Orders?tab=shipping', `${base}/${p}OrdersShipping`],
        ['/Employee/Admin/Orders?tab=delivery', `${base}/${p}OrdersDelivery`],
        ['/Employee/Admin/Orders?tab=receive', `${base}/${p}OrdersReceive`],
        ['/Employee/Admin/Orders?tab=cancelled', `${base}/${p}CancelledOrders`],
        ['/Employee/Admin/Orders?tab=completed', `${base}/${p}CompletedOrders`],
        ['/Employee/Admin/OrdersPending', `${base}/${p}OrdersPending`],
        ['/Employee/Admin/OrdersProcessing', `${base}/${p}OrdersProcessing`],
        ['/Employee/Admin/OrdersShipping', `${base}/${p}OrdersShipping`],
        ['/Employee/Admin/OrdersDelivery', `${base}/${p}OrdersDelivery`],
        ['/Employee/Admin/OrdersReceive', `${base}/${p}OrdersReceive`],
        ['/Employee/Admin/CancelledOrders', `${base}/${p}CancelledOrders`],
        ['/Employee/Admin/CompletedOrders', `${base}/${p}CompletedOrders`],
        ['/Employee/Admin/CompletedReplacement', `${base}/${p}CompletedReturned`],
        ['/Employee/Admin/CompletedRefunded', `${base}/${p}CompletedReturned`],
        ['/Employee/Admin/CompletedReturned', `${base}/${p}CompletedReturned`],
        ['/Employee/Admin/ReturnedOrders', `${base}/${p}ReturnedOrders`],
        ['/Employee/Admin/Orders', `${base}/${p}OrdersPending`],
        ['/Employee/Admin/Inventory', `${base}/ProductInventory`],
        ['/Employee/Admin/ProductsListing', `${base}/${p}Products`],
        ['/Employee/Admin/DeliveryRates', `${base}/${p}Rates`],
        ['/Employee/Admin/ManageUsers', `${base}/${p}ManageUsers`],
        ['/Employee/Admin/ProductReturns', `${base}/ProductInventory`],
        ['/Employee/Admin/Alerts/Data', `${base}/Alerts/Data`],
        ['/Employee/Admin/Logs/Data', `${base}/Logs/Data`],
        ['/Employee/Admin/Messages', `${base}/Messages`],
        ['/Employee/Admin/Products', `${base}/${p}Products`],
        ['/Employee/Admin/Materials', `${base}/${p}Materials`],
        ['/Employee/Admin/Variations', `${base}/${p}Variations`],
        ['/Employee/Admin/Archived', `${base}/${p}Archived`],
        ['/Employee/Admin/Alerts', `${base}/${p}Alerts`],
        ['/Employee/Admin/Logs', `${base}/${p}Logs`],
        ['/Employee/Admin/CMS', `${base}/${p}CMS`],
        ['/Employee/Admin/Reviews', `${base}/${p}Reviews`],
        ['/Employee/Admin/ChatSupport', `${base}/${p}ChatSupport`],
        ['/Employee/Admin/BulkOrders', `${base}/${p}BulkOrders`],
        ['/Employee/Admin/WalkIn', `${base}/${p}WalkIn`],
        ['/Employee/Admin/Rates', `${base}/${p}Rates`],
        ['/Employee/Admin/Reports', `${base}/${p}Reports`],
        ['/Employee/Admin/Users/Edit', `${base}/${p}ManageUsers/Users/Edit`],
        ['/Employee/Admin/Customers/Edit', `${base}/${p}ManageUsers/Customers/Edit`],
        ['/Employee/Admin/Customers/Archive', `${base}/${p}ManageUsers/Customers/Archive`],
        ['/Employee/Admin/Customers/Dearchive', `${base}/${p}ManageUsers/Customers/Dearchive`],
        ['/Employee/Admin/Customers/Delete/', `${base}/${p}ManageUsers/Customers/Delete/`],
        ['/Employee/Admin/ManageUsers/Customers', `${base}/${p}ManageUsers/Customers`],
        ['/Employee/Admin/ManageUsers/ToggleActive/', `${base}/${p}ManageUsers/ToggleActive/`],
        ['/Employee/AdminManager', base],
        ['/Employee/Admin/', `${base}/`]
    ];
    return pairs;
}

function protectPreservedPaths(content) {
    const tokens = [];
    let safe = content;
    PRESERVE_ADMIN_PATHS.forEach((p, i) => {
        const token = `__PRESERVE_ADMIN_${i}__`;
        if (safe.includes(p)) {
            safe = safe.split(p).join(token);
            tokens.push({ token, value: p });
        }
    });
    return { safe, tokens };
}

function restorePreservedPaths(content, tokens) {
    let out = content;
    tokens.forEach(({ token, value }) => {
        out = out.split(token).join(value);
    });
    return out;
}

function applyUrlReplacements(content, role) {
    const { safe, tokens } = protectPreservedPaths(content);
    let s = safe;
    for (const [from, to] of buildUrlReplacements(role)) {
        s = s.split(from).join(to);
    }
    return restorePreservedPaths(s, tokens);
}

function applyTitleReplacements(content, role) {
    return content
        .replace(/Admin Dashboard/g, `${role.pageTitlePrefix} Dashboard`)
        .replace(/Admin Panel/g, role.panelTitle)
        .replace(/<title>Admin /g, `<title>${role.pageTitlePrefix} `)
        .replace(/<title>Reports - Admin Panel/g, `<title>Reports - ${role.panelTitle}`)
        .replace(/Manage Users - Design Excellence/g, `Manage Users - ${role.pageTitlePrefix}`);
}

function fixIncludes(content) {
    let s = content;
    s = s.replace(/include\(['"]\.\.\/Admin\/partials\/admin-orders-tabs['"]/g, "include('partials/admin-orders-tabs'");
    s = s.replace(/include\(['"]partials\/admin-orders-tabs['"]/g, "include('partials/admin-orders-tabs'");
    s = s.replace(/include\(['"]partials\/(?!sidebar|admin-orders-tabs)/g, "include('../Admin/partials/");
    return s;
}

/** Order proceed/cancel POST handlers exist on Admin routes only */
function fixOrderPostRoutes(content, role) {
    const p = role.viewPrefix;
    const base = `/Employee/${role.urlSegment}`;
    const mappings = [
        ['OrdersPending', 'OrdersPending'],
        ['OrdersProcessing', 'OrdersProcessing'],
        ['OrdersShipping', 'OrdersShipping'],
        ['OrdersDelivery', 'OrdersDelivery'],
        ['OrdersReceive', 'OrdersReceive'],
        ['CancelledOrders', 'CancelledOrders'],
        ['CompletedOrders', 'CompletedOrders']
    ];
    let s = content;
    mappings.forEach(([roleRoute, adminRoute]) => {
        s = s.split(`${base}/${p}${roleRoute}/Proceed/`).join(`/Employee/Admin/${adminRoute}/Proceed/`);
        s = s.split(`${base}/${p}${roleRoute}/Cancel/`).join(`/Employee/Admin/${adminRoute}/Cancel/`);
    });
    return s;
}

function transformContent(raw, role) {
    let s = raw;
    s = applyUrlReplacements(s, role);
    s = fixOrderPostRoutes(s, role);
    s = applyTitleReplacements(s, role);
    s = fixIncludes(s);
    return s;
}

function syncRolePages(role) {
    const destDir = path.join(viewsRoot, role.roleName);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let count = 0;
    ADMIN_PAGES.forEach((adminFile) => {
        if (SKIP_SYNC.has(adminFile)) return;
        const srcPath = path.join(adminDir, `${adminFile}.ejs`);
        if (!fs.existsSync(srcPath)) return;

        const base = adminFile.replace(/^Admin/, '');
        const destName = `${role.viewPrefix}${base}.ejs`;
        const destPath = path.join(destDir, destName);
        const raw = fs.readFileSync(srcPath, 'utf8');
        fs.writeFileSync(destPath, transformContent(raw, role), 'utf8');
        count++;
    });
    return count;
}

function syncRolePartials(role) {
    const adminPartials = path.join(adminDir, 'partials');
    const rolePartials = path.join(viewsRoot, role.roleName, 'partials');
    if (!fs.existsSync(rolePartials)) fs.mkdirSync(rolePartials, { recursive: true });

    const skip = new Set(['sidebar.ejs']);
    let count = 0;

    for (const file of fs.readdirSync(adminPartials)) {
        if (!file.endsWith('.ejs') || skip.has(file)) continue;
        const raw = fs.readFileSync(path.join(adminPartials, file), 'utf8');
        const out = applyUrlReplacements(raw, role);
        fs.writeFileSync(path.join(rolePartials, file), out, 'utf8');
        count++;
    }

    return count;
}

function fixExistingFile(filePath, role) {
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    const next = transformContent(raw, role);
    if (next !== raw) {
        fs.writeFileSync(filePath, next, 'utf8');
        return true;
    }
    return false;
}

function fixRoleDashboard(role) {
    const dashName = `${role.viewPrefix}Manager.ejs`;
    const dashPath = path.join(viewsRoot, role.roleName, dashName);
    return fixExistingFile(dashPath, role);
}

function runFullSync() {
    const summary = [];
    ROLES.forEach((role) => {
        const pages = syncRolePages(role);
        const partials = syncRolePartials(role);
        const dash = fixRoleDashboard(role);
        summary.push({ role: role.roleName, pages, partials, dashboard: dash });
    });
    return summary;
}

module.exports = {
    ROLES,
    ADMIN_PAGES,
    runFullSync,
    transformContent,
    applyUrlReplacements,
    fixExistingFile,
    buildUrlReplacements
};
