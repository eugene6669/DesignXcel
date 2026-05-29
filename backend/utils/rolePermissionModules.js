'use strict';

/**
 * Role Manager matrix + per-user permission modal (Manage Users).
 * Permission keys match RolePermissions / UserPermissions and checkPermission().
 */
const ROLE_MANAGER_MODULES = [
    { key: 'dashboard', label: 'Dashboard', permissions: ['dashboard_access'] },
    { key: 'reports', label: 'Reports', permissions: ['inventory_reports'] },
    { key: 'alerts', label: 'Alerts', permissions: ['inventory_alerts'] },
    {
        key: 'products',
        label: 'Products (Listing, Materials, Variations)',
        permissions: ['inventory_product_listing', 'inventory_materials', 'inventory_variations']
    },
    { key: 'product_inventory', label: 'Product Inventory', permissions: ['inventory_product_inventory'] },
    { key: 'storefront', label: 'Storefront', permissions: ['inventory_storefront'] },
    { key: 'archived', label: 'Archived', permissions: ['inventory_archived'] },
    { key: 'bulk_order', label: 'Bulk Orders', permissions: ['transactions_bulk_orders'] },
    { key: 'walk_in', label: 'Walk In', permissions: ['transactions_walk_in'] },
    { key: 'delivery_rates', label: 'Delivery Rates', permissions: ['transactions_delivery_rates'] },
    {
        key: 'orders',
        label: 'Orders (all stages)',
        permissions: [
            'orders_pending', 'orders_processing', 'orders_shipping', 'orders_delivery',
            'orders_receive', 'orders_cancelled', 'orders_completed'
        ]
    },
    {
        key: 'product_returns',
        label: 'Returned / Refunded Orders',
        permissions: ['orders_returned', 'orders_completed_returned']
    },
    { key: 'manage_users', label: 'Manage Users', permissions: ['users_manage_users'] },
    { key: 'reviews', label: 'Reviews', permissions: ['reviews_reviews'] },
    { key: 'chat_support', label: 'Chat Support', permissions: ['chat_chat_support'] },
    { key: 'messages', label: 'Messages', permissions: ['chat_messages'] },
    { key: 'cms', label: 'CMS', permissions: ['content_cms'] },
    { key: 'logs', label: 'Activity Logs', permissions: ['content_logs'] }
];

const ALL_ROLE_PERMISSION_KEYS = [...new Set(
    ROLE_MANAGER_MODULES.flatMap(m => m.permissions)
)];

/** Granular list for per-user permission modal (matches sidebar pages). */
const USER_PERMISSION_SECTIONS = [
    {
        name: 'General',
        permissions: [
            { key: 'dashboard_access', name: 'Dashboard' },
            { key: 'inventory_reports', name: 'Reports' },
            { key: 'inventory_alerts', name: 'Alerts' }
        ]
    },
    {
        name: 'Products',
        permissions: [
            { key: 'inventory_product_listing', name: 'Products Listing' },
            { key: 'inventory_product_inventory', name: 'Product Inventory' },
            { key: 'inventory_storefront', name: 'Storefront' },
            { key: 'inventory_materials', name: 'Raw Materials' },
            { key: 'inventory_variations', name: 'Variations' },
            { key: 'inventory_archived', name: 'Archived Items' }
        ]
    },
    {
        name: 'Transactions',
        permissions: [
            { key: 'transactions_bulk_orders', name: 'Bulk Orders' },
            { key: 'transactions_delivery_rates', name: 'Delivery Rates' },
            { key: 'transactions_walk_in', name: 'Walk-In Orders' }
        ]
    },
    {
        name: 'Orders',
        permissions: [
            { key: 'orders_pending', name: 'Orders Pending' },
            { key: 'orders_processing', name: 'Orders Processing' },
            { key: 'orders_shipping', name: 'Orders Shipping' },
            { key: 'orders_delivery', name: 'Orders Delivery' },
            { key: 'orders_receive', name: 'Orders Receive' },
            { key: 'orders_cancelled', name: 'Cancelled Orders' },
            { key: 'orders_completed', name: 'Completed Orders' },
            { key: 'orders_returned', name: 'Returned Orders' },
            { key: 'orders_completed_returned', name: 'Completed Refunded / Replacement' }
        ]
    },
    {
        name: 'User Management',
        permissions: [
            { key: 'users_manage_users', name: 'Manage Users' }
        ]
    },
    {
        name: 'Customer Reviews',
        permissions: [
            { key: 'reviews_reviews', name: 'Reviews' }
        ]
    },
    {
        name: 'Support & Communication',
        permissions: [
            { key: 'chat_chat_support', name: 'Chat Support' },
            { key: 'chat_messages', name: 'Messages' }
        ]
    },
    {
        name: 'Content & System',
        permissions: [
            { key: 'content_cms', name: 'Content Management (CMS)' },
            { key: 'content_logs', name: 'Activity Logs' }
        ]
    }
];

/** Legacy UserPermissions names still honored when reading access in the UI. */
const USER_PERMISSION_LEGACY_KEYS = {
    inventory_product_listing: ['inventory_products', 'products_listing'],
    inventory_product_inventory: ['inventory_products', 'product_inventory'],
    inventory_materials: ['materials'],
    inventory_variations: ['variations'],
    inventory_archived: ['archived'],
    inventory_alerts: ['alerts'],
    inventory_reports: ['reports'],
    transactions_delivery_rates: ['delivery_rates'],
    transactions_walk_in: ['walk_in'],
    transactions_bulk_orders: ['bulk_orders'],
    users_manage_users: ['manage_users'],
    reviews_reviews: ['reviews'],
    chat_chat_support: ['chat_support'],
    content_cms: ['cms'],
    content_logs: ['logs']
};

const DEFAULT_ROLE_PERMISSIONS = {
    Admin: ALL_ROLE_PERMISSION_KEYS,
    InventoryManager: [
        'dashboard_access', 'inventory_reports', 'inventory_alerts',
        'inventory_product_listing', 'inventory_product_inventory', 'inventory_storefront',
        'inventory_materials', 'inventory_variations', 'inventory_archived'
    ],
    TransactionManager: [
        'dashboard_access',
        'transactions_bulk_orders', 'transactions_walk_in', 'transactions_delivery_rates',
        'orders_returned', 'orders_completed_returned',
        'orders_pending', 'orders_processing', 'orders_shipping', 'orders_delivery',
        'orders_receive', 'orders_cancelled', 'orders_completed'
    ],
    OrderSupport: [
        'dashboard_access',
        'orders_returned', 'orders_completed_returned',
        'transactions_bulk_orders',
        'orders_pending', 'orders_processing', 'orders_shipping', 'orders_delivery',
        'orders_receive', 'orders_cancelled', 'orders_completed',
        'chat_chat_support', 'chat_messages'
    ],
    UserManager: ['dashboard_access', 'users_manage_users', 'reviews_reviews']
};

function getPermissionSection(permissionName) {
    if (!permissionName) return 'other';
    if (permissionName === 'dashboard_access') return 'general';
    if (permissionName.startsWith('inventory_')) return 'inventory';
    if (permissionName.startsWith('transactions_')) return 'transactions';
    if (permissionName.startsWith('orders_')) return 'orders';
    if (permissionName.startsWith('users_')) return 'users';
    if (permissionName.startsWith('reviews_')) return 'reviews';
    if (permissionName.startsWith('chat_')) return 'chat';
    if (permissionName.startsWith('content_')) return 'content';
    return 'other';
}

function resolveUserPermissionAccess(permissionName, permissionRows) {
    const direct = permissionRows.find(p => p.PermissionName === permissionName);
    if (direct) return !!direct.CanAccess;
    const legacy = USER_PERMISSION_LEGACY_KEYS[permissionName] || [];
    for (const alt of legacy) {
        const row = permissionRows.find(p => p.PermissionName === alt);
        if (row && row.CanAccess) return true;
    }
    return false;
}

function expandModuleAccess(moduleKey, canAccess) {
    const mod = ROLE_MANAGER_MODULES.find(m => m.key === moduleKey);
    if (!mod) return [];
    return mod.permissions.map(permissionName => ({ permissionName, canAccess: !!canAccess }));
}

function permissionsToModuleMatrix(permissionMap) {
    const matrix = {};
    ROLE_MANAGER_MODULES.forEach(mod => {
        matrix[mod.key] = mod.permissions.some(p => permissionMap[p] === true);
    });
    return matrix;
}

function flattenMatrixToPermissions(matrix) {
    const updates = [];
    ROLE_MANAGER_MODULES.forEach(mod => {
        const on = !!matrix[mod.key];
        mod.permissions.forEach(permissionName => {
            updates.push({ permissionName, canAccess: on });
        });
    });
    return updates;
}

module.exports = {
    ROLE_MANAGER_MODULES,
    USER_PERMISSION_SECTIONS,
    USER_PERMISSION_LEGACY_KEYS,
    ALL_ROLE_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    getPermissionSection,
    resolveUserPermissionAccess,
    expandModuleAccess,
    permissionsToModuleMatrix,
    flattenMatrixToPermissions
};
