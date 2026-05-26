// Basic permission middleware stubs.
// Adjust logic here if/when a real permission system is added.

const sql = require('mssql');
const configManager = require('../config/configManager'); // already an instance
const rawDbConfig = configManager.getDatabaseConfig();

// Transform configManager format to mssql format
// configManager uses 'username' but mssql expects 'user'
const dbConfig = {
    server: rawDbConfig.server || process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
    user: rawDbConfig.username || process.env.DB_USERNAME || 'DesignXcel',
    password: rawDbConfig.password || process.env.DB_PASSWORD || 'Azwrathfrozen22@',
    database: rawDbConfig.database || process.env.DB_DATABASE || 'DesignXcellDB',
    options: {
        encrypt: rawDbConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'), // Azure requires encrypt: true in production
        trustServerCertificate: rawDbConfig.options?.trustServerCertificate ?? true,
        enableArithAbort: true,
        requestTimeout: 30000,
        connectionTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Permission alias map to support legacy keys from ManageUsers UI
const PERMISSION_ALIASES = {
    inventory_products: ['products'],
    inventory_variations: ['variations'],
    inventory_materials: ['materials'],
    inventory_alerts: ['alerts'],
    inventory_archived: ['archived'],
    inventory_reports: ['reports'],
    transactions_delivery_rates: ['delivery_rates'],
    transactions_walk_in: ['walk_in'],
    transactions_bulk_orders: ['bulk_orders'],
    orders_pending: ['orders_pending', 'orders_orders_pending'],
    orders_processing: ['orders_processing', 'orders_orders_processing'],
    orders_shipping: ['orders_shipping', 'orders_orders_shipping'],
    orders_delivery: ['orders_delivery', 'orders_orders_delivery'],
    orders_receive: ['orders_receive', 'orders_orders_receive'],
    orders_cancelled: ['orders_cancelled', 'orders_orders_cancelled'],
    orders_completed: ['orders_completed', 'orders_orders_completed'],
    orders_returned: ['orders_returned', 'orders_orders_returned'],
    orders_completed_returned: ['orders_completed_returned', 'orders_orders_completed_returned'],
    users_manage_users: ['manage_users'],
    dashboard_access: ['dashboard'],
    inventory_product_inventory: ['product_inventory', 'inventory_products'],
    inventory_product_listing: ['product_listing', 'products_listing', 'inventory_products'],
    reviews_reviews: ['reviews'],
    chat_chat_support: ['chat_support'],
    content_cms: ['cms'],
    content_logs: ['logs'],
};

// Map permissions to their corresponding InventoryManager routes
const INVENTORY_MANAGER_ROUTE_MAP = {
    inventory_products: '/Employee/InventoryManager/InventoryProducts',
    inventory_variations: '/Employee/InventoryManager/InventoryVariations',
    inventory_materials: '/Employee/InventoryManager/InventoryMaterials',
    inventory_alerts: '/Employee/InventoryManager/InventoryAlerts',
    inventory_archived: '/Employee/InventoryManager/InventoryArchived',
    inventory_reports: '/Employee/InventoryManager/InventoryReports',
    transactions_delivery_rates: '/Employee/InventoryManager/InventoryRates',
    transactions_walk_in: '/Employee/InventoryManager/InventoryWalkIn',
    transactions_bulk_orders: '/Employee/InventoryManager/InventoryBulkOrders',
    users_manage_users: '/Employee/InventoryManager/InventoryManageUsers',
    reviews_reviews: '/Employee/InventoryManager/InventoryReviews',
    chat_chat_support: '/Employee/InventoryManager/InventoryChatSupport',
    content_logs: '/Employee/InventoryManager/InventoryLogs',
    content_cms: '/Employee/InventoryManager/InventoryCMS',
    orders_pending: '/Employee/InventoryManager/InventoryOrdersPending',
    orders_processing: '/Employee/InventoryManager/InventoryOrdersProcessing',
    orders_shipping: '/Employee/InventoryManager/InventoryOrdersShipping',
    orders_delivery: '/Employee/InventoryManager/InventoryOrdersDelivery',
    orders_receive: '/Employee/InventoryManager/InventoryOrdersReceive',
    orders_cancelled: '/Employee/InventoryManager/InventoryCancelledOrders',
    orders_completed: '/Employee/InventoryManager/InventoryCompletedOrders',
    orders_returned: '/Employee/InventoryManager/InventoryReturnedOrders',
    orders_completed_returned: '/Employee/InventoryManager/InventoryCompletedReturned',
};

// Helper function to get the InventoryManager route for a permission
function getInventoryManagerRoute(permission) {
    // Check direct mapping
    if (INVENTORY_MANAGER_ROUTE_MAP[permission]) {
        return INVENTORY_MANAGER_ROUTE_MAP[permission];
    }
    
    // Check aliases
    const aliases = PERMISSION_ALIASES[permission] || [];
    for (const alias of aliases) {
        // Try to find a route by matching the alias to a permission key
        for (const [permKey, route] of Object.entries(INVENTORY_MANAGER_ROUTE_MAP)) {
            const permAliases = PERMISSION_ALIASES[permKey] || [];
            if (permAliases.includes(alias)) {
                return route;
            }
        }
    }
    
    // Default to dashboard if no mapping found
    return '/Employee/InventoryManager';
}
let poolPromise;

async function getPool() {
    if (!poolPromise) {
        try {
            poolPromise = new sql.ConnectionPool(dbConfig).connect();
        } catch (err) {
            console.error('[Permissions] Failed to create DB pool:', err);
            poolPromise = null;
            throw err;
        }
    }
    return poolPromise;
}

// Fetch permissions for the current user and cache them on the session
async function getUserPermissions(userId, session) {
    // Force fresh fetch every time (disabled session caching)
    if (!userId) return {};

    // Removed session cache check to ensure real-time updates

    let perms = {};
    try {
        const pool = await getPool();
        try {
            const roleResult = await pool.request()
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT rp.PermissionName, rp.CanAccess
                    FROM RolePermissions rp
                    INNER JOIN Users u ON u.RoleID = rp.RoleID
                    WHERE u.UserID = @userId
                `);
            roleResult.recordset.forEach(p => {
                perms[p.PermissionName] = !!p.CanAccess;
            });
        } catch (rolePermErr) {
            if (!String(rolePermErr.message || '').includes('RolePermissions')) {
                console.warn('[Permissions] RolePermissions load skipped:', rolePermErr.message);
            }
        }

        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT PermissionName, CanAccess
                FROM UserPermissions
                WHERE UserID = @userId
            `);

        console.log('[Permissions] Database query result - UserID:', userId, 'Records found:', result.recordset.length);
        
        result.recordset.forEach(p => {
            perms[p.PermissionName] = !!p.CanAccess;
            // Debug: log each permission as it's processed
            if (p.PermissionName === 'inventory_reports') {
                console.log('[Permissions] Found inventory_reports in DB:', {
                    PermissionName: p.PermissionName,
                    CanAccess: p.CanAccess,
                    CanAccessType: typeof p.CanAccess,
                    Converted: !!p.CanAccess
                });
            }
        });
        
        // Debug logging for inventory permissions
        const inventoryPerms = Object.keys(perms).filter(k => k.includes('inventory'));
        if (inventoryPerms.length > 0) {
            console.log('[Permissions] Retrieved inventory permissions for user', userId, ':');
            inventoryPerms.forEach(key => {
                const rawValue = result.recordset.find(r => r.PermissionName === key);
                console.log(`  - ${key}: ${perms[key]} (raw DB value: ${rawValue?.CanAccess}, type: ${typeof rawValue?.CanAccess})`);
            });
        } else {
            console.log('[Permissions] ⚠️ No inventory permissions found for user', userId);
            console.log('[Permissions] All permissions for user:', Object.keys(perms));
            if (Object.keys(perms).length === 0) {
                console.log('[Permissions] ⚠️ User has NO permissions in database!');
            }
        }
    } catch (err) {
        console.error('[Permissions] DB error while loading permissions, failing open:', err);
        // Fail open to avoid blocking users when DB auth is unavailable
        return {};
    }

    // Removed session cache assignment

    return perms;
}

function hasPermission(perms, requiredPermission) {
    if (!requiredPermission) return true;
    
    // First check direct match
    if (perms[requiredPermission] === true) {
        console.log('[Permissions] Direct match found for:', requiredPermission);
        return true;
    }

    // Then check aliases (for backward compatibility)
    const aliases = PERMISSION_ALIASES[requiredPermission] || [];
    for (const alias of aliases) {
        if (perms[alias] === true) {
            console.log('[Permissions] Alias match found for:', requiredPermission, 'via alias:', alias);
            return true;
        }
    }
    
    // Check if permission might be stored with double prefix (e.g., orders_orders_pending)
    // This handles legacy permission naming
    if (requiredPermission.startsWith('orders_') && !requiredPermission.startsWith('orders_orders_')) {
        const legacyName = 'orders_' + requiredPermission;
        if (perms[legacyName] === true) {
            console.log('[Permissions] Legacy permission match found for:', requiredPermission, 'via:', legacyName);
            return true;
        }
    }
    
    // Debug: log what permissions are available
    if (requiredPermission === 'inventory_reports') {
        console.log('[Permissions] Permission check failed for inventory_reports');
        console.log('[Permissions] Available permissions:', Object.keys(perms));
        console.log('[Permissions] inventory_reports value:', perms['inventory_reports']);
        console.log('[Permissions] reports alias value:', perms['reports']);
    }
    
    // Debug for order permissions
    if (requiredPermission && requiredPermission.startsWith('orders_')) {
        console.log('[Permissions] Permission check failed for:', requiredPermission);
        console.log('[Permissions] Available permissions:', Object.keys(perms));
        console.log('[Permissions] Direct value:', perms[requiredPermission]);
        console.log('[Permissions] All order-related permissions:', Object.keys(perms).filter(k => k.includes('order')));
    }
    
    return false;
}

function checkPermission(requiredPermission) {
    return async (req, res, next) => {
        try {
            const user = req.user || req.session?.user;
            if (!user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            // Admins bypass permission checks
            if (user.role === 'Admin') {
                return next();
            }

            const userId = user.id || user.UserID;
            if (!userId) {
                console.error('[Permissions] No user ID found:', user);
                console.error('[Permissions] User object keys:', Object.keys(user || {}));
                if (req.accepts('html')) {
                    // Redirect InventoryManager users to appropriate page based on permission
                    if (user.role === 'InventoryManager' && requiredPermission) {
                        const redirectRoute = getInventoryManagerRoute(requiredPermission);
                        return res.redirect(redirectRoute);
                    } else if (user.role === 'InventoryManager') {
                        return res.redirect('/Employee/InventoryManager');
                    }
                    return res.redirect('/Employee/Forbidden');
                }
                return res.status(403).json({ message: 'Forbidden: no user ID' });
            }

            // Debug logging for inventory_reports permission
            if (requiredPermission === 'inventory_reports') {
                console.log('[Permissions] ===== Checking inventory_reports =====');
                console.log('[Permissions] User ID from session:', userId);
                console.log('[Permissions] User object:', JSON.stringify(user, null, 2));
                console.log('[Permissions] User role:', user.role);
            }

            const perms = await getUserPermissions(userId, req.session);
            
            // Debug logging for all permissions check
            if (requiredPermission && (requiredPermission.startsWith('orders_') || requiredPermission.includes('orders'))) {
                console.log('[Permissions] ===== Checking order permission =====');
                console.log('[Permissions] Required permission:', requiredPermission);
                console.log('[Permissions] User ID:', userId);
                console.log('[Permissions] Retrieved permissions count:', Object.keys(perms).length);
                console.log('[Permissions] All permission keys:', Object.keys(perms));
                console.log('[Permissions] Order permissions:', Object.keys(perms).filter(k => k.includes('order')));
                console.log('[Permissions] Permission value for', requiredPermission, ':', perms[requiredPermission]);
                const aliases = PERMISSION_ALIASES[requiredPermission] || [];
                console.log('[Permissions] Aliases for', requiredPermission, ':', aliases);
                aliases.forEach(alias => {
                    console.log('[Permissions] Alias', alias, 'value:', perms[alias]);
                });
                console.log('[Permissions] ===== End order permission check =====');
            }
            
            // Debug logging for inventory_reports permission
            if (requiredPermission === 'inventory_reports') {
                console.log('[Permissions] Retrieved permissions count:', Object.keys(perms).length);
                console.log('[Permissions] All permission keys:', Object.keys(perms));
                console.log('[Permissions] inventory_reports permission value:', perms['inventory_reports']);
                console.log('[Permissions] All inventory permissions:', Object.keys(perms).filter(k => k.startsWith('inventory')));
                console.log('[Permissions] ===== End check =====');
            }
            
            if (hasPermission(perms, requiredPermission)) {
                return next();
            }

            // Fallback responses for forbidden access
            if (req.accepts('html')) {
                // Redirect InventoryManager users to appropriate page based on permission
                if (user.role === 'InventoryManager' && requiredPermission) {
                    const redirectRoute = getInventoryManagerRoute(requiredPermission);
                    return res.redirect(redirectRoute);
                } else if (user.role === 'InventoryManager') {
                    return res.redirect('/Employee/InventoryManager');
                }
                return res.redirect('/Employee/Forbidden');
            }
            return res.status(403).json({ message: 'Forbidden: insufficient permission' });
        } catch (err) {
            console.error('[Permissions] Error checking permission, failing open:', err);
            // Fail open on permission subsystem errors to avoid blocking app usage
            return next();
        }
    };
}

function checkAnyPermission(requiredPermissions) {
    return async (req, res, next) => {
        try {
            const user = req.user || req.session?.user;
            if (!user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            if (user.role === 'Admin') {
                return next();
            }

            const perms = await getUserPermissions(user.id, req.session);
            const allowed = (requiredPermissions || []).some(p => hasPermission(perms, p));

            if (allowed) {
                return next();
            }

            if (req.accepts('html')) {
                // Redirect InventoryManager users to appropriate page based on first permission
                if (user.role === 'InventoryManager' && requiredPermissions && requiredPermissions.length > 0) {
                    const redirectRoute = getInventoryManagerRoute(requiredPermissions[0]);
                    return res.redirect(redirectRoute);
                } else if (user.role === 'InventoryManager') {
                    return res.redirect('/Employee/InventoryManager');
                }
                return res.redirect('/Employee/Forbidden');
            }
            return res.status(403).json({ message: 'Forbidden: insufficient permission' });
        } catch (err) {
            console.error('[Permissions] Error checking any permission, failing open:', err);
            return next();
        }
    };
}

module.exports = {
    checkPermission,
    checkAnyPermission,
};


