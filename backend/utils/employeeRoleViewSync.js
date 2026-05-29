'use strict';

const fs = require('fs');
const path = require('path');

const viewsRoot = path.join(__dirname, '..', 'views', 'Employee');
const adminDir = path.join(viewsRoot, 'Admin');

/** Paths that must stay on Admin (shared APIs/assets). */
const PRESERVE_ADMIN_PATHS = [
    '/css/Employee/Admin/',
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

/** Never overwrite per-role permission UI */
const SKIP_SYNC_PAGES = new Set(['AdminManager', 'AdminManageUsers']);

const SKIP_SYNC_JS = new Set(['AdminManageUsers.js', 'role-manager.js']);

function discoverAdminPageFiles() {
    const files = [];
    for (const name of fs.readdirSync(adminDir)) {
        if (!name.endsWith('.ejs')) continue;
        const base = name.replace(/\.ejs$/, '');
        if (SKIP_SYNC_PAGES.has(base)) continue;
        files.push(base);
    }
    return files.sort();
}

function adminPageToRoleFilename(adminBase, role) {
    if (adminBase === 'WalkInPaymentSuccess') return 'WalkInPaymentSuccess.ejs';
    if (adminBase.startsWith('Admin')) {
        return `${role.viewPrefix}${adminBase.replace(/^Admin/, '')}.ejs`;
    }
    return `${adminBase}.ejs`;
}

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
        ['/Employee/Admin/ProductInventory', `${base}/ProductInventory`],
        ['/Employee/Admin/Inventory', `${base}/ProductInventory`],
        ['/Employee/Admin/ProductsListing', `${base}/${p}Products`],
        ['/Employee/Admin/Storefront', `${base}/Storefront`],
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
        .replace(/<title>Activity Logs - Design Excellence/g, `<title>Activity Logs - ${role.pageTitlePrefix}`)
        .replace(/<title>Activity Logs</g, `<title>Activity Logs - ${role.pageTitlePrefix}`)
        .replace(/<h2>Activity Logs<\/h2>/g, `<h2>${role.pageTitlePrefix} — Activity Logs</h2>`)
        .replace(/<title>Admin /g, `<title>${role.pageTitlePrefix} `)
        .replace(/<title>Reports - Admin Panel/g, `<title>Reports - ${role.panelTitle}`)
        .replace(/Manage Users - Design Excellence/g, `Manage Users - ${role.pageTitlePrefix}`);
}

function applyJsPathReplacements(content, role) {
    const roleJsBase = `/js/Employee/${role.roleName}`;
    const adminJsBase = '/js/Employee/Admin';
    let s = content.split(adminJsBase).join(roleJsBase);
    const p = role.viewPrefix;
    ['Logs', 'Alerts', 'CMS'].forEach((suffix) => {
        s = s.split(`${roleJsBase}/Admin${suffix}.js`).join(`${roleJsBase}/${p}${suffix}.js`);
    });
    return s;
}

function fixIncludes(content) {
    return content
        .replace(/include\(['"]\.\.\/Admin\/partials\//g, "include('partials/")
        .replace(/include\(['"]\.\.\/\.\.\/Admin\/partials\//g, "include('partials/");
}

/** Manage Users is only for Admin + UserManager */
function stripManageUsersFromSidebar(content, role) {
    if (role.roleName === 'UserManager') return content;
    let s = content.replace(/userPages=\['manage-users'\];\s*/g, "userPages=[]; ");
    s = s.replace(
        /\s*<li class="sidebar-section-label <%= userPages\.includes\(active\) \? 'active' : '' %>">User Management<\/li>\s*<ul class="sidebar-submenu">\s*<li>[\s\S]*?Manage Users[\s\S]*?<\/li>\s*<\/ul>/g,
        ''
    );
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
    s = applyJsPathReplacements(s, role);
    s = fixIncludes(s);
    return s;
}

function syncRolePages(role) {
    const destDir = path.join(viewsRoot, role.roleName);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let count = 0;
    discoverAdminPageFiles().forEach((adminBase) => {
        const srcPath = path.join(adminDir, `${adminBase}.ejs`);
        if (!fs.existsSync(srcPath)) return;

        const destName = adminPageToRoleFilename(adminBase, role);
        const destPath = path.join(destDir, destName);
        const raw = fs.readFileSync(srcPath, 'utf8');
        fs.writeFileSync(destPath, transformContent(raw, role), 'utf8');
        count++;
    });
    return count;
}

function syncRolePartials(role, { includeSidebar = true } = {}) {
    const adminPartials = path.join(adminDir, 'partials');
    const rolePartials = path.join(viewsRoot, role.roleName, 'partials');
    if (!fs.existsSync(rolePartials)) fs.mkdirSync(rolePartials, { recursive: true });

    let count = 0;
    for (const file of fs.readdirSync(adminPartials)) {
        if (!file.endsWith('.ejs')) continue;
        if (!includeSidebar && file === 'sidebar.ejs') continue;

        const raw = fs.readFileSync(path.join(adminPartials, file), 'utf8');
        let out = transformContent(raw, role);
        if (file === 'sidebar.ejs') out = stripManageUsersFromSidebar(out, role);
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

function getRoleViewPath(role, adminViewBase) {
    if (adminViewBase === 'WalkInPaymentSuccess') {
        return `Employee/${role.roleName}/WalkInPaymentSuccess`;
    }
    if (adminViewBase.startsWith('Admin')) {
        return `Employee/${role.roleName}/${role.viewPrefix}${adminViewBase.replace(/^Admin/, '')}`;
    }
    return `Employee/${role.roleName}/${adminViewBase}`;
}

function runFullSync() {
    const summary = [];
    ROLES.forEach((role) => {
        const pages = syncRolePages(role);
        const partials = syncRolePartials(role, { includeSidebar: true });
        const dash = fixRoleDashboard(role);
        summary.push({ role: role.roleName, pages, partials, dashboard: dash });
    });
    return summary;
}

module.exports = {
    ROLES,
    SKIP_SYNC_PAGES,
    discoverAdminPageFiles,
    runFullSync,
    transformContent,
    applyUrlReplacements,
    applyJsPathReplacements,
    fixExistingFile,
    buildUrlReplacements,
    getRoleViewPath,
    adminPageToRoleFilename
};
