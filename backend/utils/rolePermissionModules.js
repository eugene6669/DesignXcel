'use strict';

/**
 * Role Manager matrix: UI modules → permission keys stored in RolePermissions / UserPermissions.
 * "orders" expands to all order_* keys when saving role access.
 */
const ROLE_MANAGER_MODULES = [
    { key: 'dashboard', label: 'Dashboard', permissions: ['dashboard_access'] },
    { key: 'reports', label: 'Reports', permissions: ['inventory_reports'] },
    { key: 'products', label: 'Products', permissions: ['inventory_products', 'inventory_materials', 'inventory_variations'] },
    { key: 'product_inventory', label: 'Product Inventory', permissions: ['inventory_product_inventory'] },
    { key: 'product_listing', label: 'Product Listing', permissions: ['inventory_product_listing'] },
    { key: 'product_returns', label: 'Product Returns', permissions: ['orders_returned', 'orders_completed_returned'] },
    { key: 'bulk_order', label: 'Bulk Order', permissions: ['transactions_bulk_orders'] },
    { key: 'walk_in', label: 'Walk in', permissions: ['transactions_walk_in'] },
    { key: 'delivery_rates', label: 'Delivery Rates', permissions: ['transactions_delivery_rates'] },
    { key: 'orders', label: 'Orders', permissions: [
        'orders_pending', 'orders_processing', 'orders_shipping', 'orders_delivery',
        'orders_receive', 'orders_cancelled', 'orders_completed'
    ] },
    { key: 'manage_users', label: 'Manage Users', permissions: ['users_manage_users'] },
    { key: 'reviews', label: 'Reviews', permissions: ['reviews_reviews'] },
    { key: 'chat_support', label: 'Chat Support', permissions: ['chat_chat_support'] },
    { key: 'messages', label: 'Messages', permissions: ['chat_messages'] },
    { key: 'cms', label: 'CMS', permissions: ['content_cms'] },
    { key: 'logs', label: 'Logs', permissions: ['content_logs'] },
    { key: 'archived', label: 'Archived', permissions: ['inventory_archived'] },
    { key: 'alerts', label: 'Alerts', permissions: ['inventory_alerts'] }
];

const ALL_ROLE_PERMISSION_KEYS = [...new Set(
    ROLE_MANAGER_MODULES.flatMap(m => m.permissions)
)];

/** Default role templates (matches typical employee roles). */
const DEFAULT_ROLE_PERMISSIONS = {
    Admin: ALL_ROLE_PERMISSION_KEYS,
    InventoryManager: [
        'dashboard_access', 'inventory_reports', 'inventory_products', 'inventory_materials',
        'inventory_variations', 'inventory_product_inventory', 'inventory_product_listing',
        'inventory_archived', 'inventory_alerts'
    ],
    TransactionManager: [
        'dashboard_access', 'transactions_bulk_orders', 'transactions_walk_in',
        'transactions_delivery_rates', 'orders_returned', 'orders_completed_returned',
        'orders_pending', 'orders_processing', 'orders_shipping', 'orders_delivery',
        'orders_receive', 'orders_cancelled', 'orders_completed'
    ],
    OrderSupport: [
        'dashboard_access', 'orders_returned', 'orders_completed_returned',
        'transactions_bulk_orders', 'orders_pending', 'orders_processing', 'orders_shipping',
        'orders_delivery', 'orders_receive', 'orders_cancelled', 'orders_completed',
        'chat_chat_support', 'chat_messages'
    ],
    UserManager: ['dashboard_access', 'users_manage_users', 'reviews_reviews']
};

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
    ALL_ROLE_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    expandModuleAccess,
    permissionsToModuleMatrix,
    flattenMatrixToPermissions
};
