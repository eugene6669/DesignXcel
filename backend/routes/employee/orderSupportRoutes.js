'use strict';

/** Extracted Order Support routes — see routes/employee/registerOrderSupportRoutes.js */
module.exports = function registerOrderSupportRoutes(router, ctx) {
    const {
        pool,
        sql,
        isAuthenticated,
        checkPermission,
        EMPLOYEE_SYNC_ROLES,
        makeRenderRoleActivityLogsPage,
        sendActivityLogsData,
        buildInventoryAlertsPayload,
        USER_PERMISSION_LEGACY_KEYS
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);


    const employeeReturnedOrderStatuses = [
        'Return', 'Returned', 'Processing (Pickup)', 'Awaiting Inspection', 'Inspection Complete',
        'Pickup Received', 'Declined', 'Completed Returned', 'Refunded'
    ];

    // =============================================================================
    // ORDER SUPPORT ROUTES
    // =============================================================================

    // Order Support Dashboard
    router.get('/Employee/OrderSupport', isAuthenticated, (req, res) => {
        console.log('=== ORDER SUPPORT ROUTE ACCESSED ===');
        console.log('Session ID:', req.sessionID);
        console.log('User in session:', req.session?.user);
        console.log('User role:', req.session?.user?.role);
        console.log('================================');
        res.render('Employee/OrderSupport/OrderManager', { user: req.session.user });
    });

    // Order Support - Materials
    router.get('/Employee/OrderSupport/OrderMaterials', isAuthenticated, checkPermission('inventory_materials'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM RawMaterials 
                WHERE IsActive = 1 
                ORDER BY Name ASC
            `);
            res.render('Employee/OrderSupport/OrderMaterials', {
                user: req.session.user,
                materials: result.recordset
            });
        } catch (err) {
            console.error('Error fetching raw materials:', err);
            res.render('Employee/OrderSupport/OrderMaterials', {
                user: req.session.user,
                materials: [],
                error: 'Failed to load raw materials.'
            });
        }
    });

    // Order Support - Variations
    router.get('/Employee/OrderSupport/OrderVariations', isAuthenticated, checkPermission('inventory_variations'), (req, res) => {
        res.render('Employee/OrderSupport/OrderVariations', { user: req.session.user });
    });
    // Order Support - Archived
    router.get('/Employee/OrderSupport/OrderArchived', isAuthenticated, checkPermission('inventory_archived'), async (req, res) => {
        try {
            await pool.connect();

            // Fetch archived products
            const productsResult = await pool.request().query(`
                SELECT 
                    ProductID,
                    Name,
                    Description,
                    Price,
                    StockQuantity,
                    Category,
                    DateAdded,
                    IsActive
                FROM Products
                WHERE IsActive = 0
                ORDER BY DateAdded DESC
            `);

            // Fetch archived raw materials
            const materialsResult = await pool.request().query(`
                SELECT 
                    MaterialID,
                    Name,
                    QuantityAvailable,
                    Unit,
                    LastUpdated,
                    IsActive
                FROM RawMaterials
                WHERE IsActive = 0
                ORDER BY LastUpdated DESC
            `);

            // Categories are stored as a column in Products table, not a separate table
            const categoriesResult = { recordset: [] };

            res.render('Employee/OrderSupport/OrderArchived', {
                user: req.session.user,
                archivedProducts: productsResult.recordset,
                archivedMaterials: materialsResult.recordset,
                archivedCategories: categoriesResult.recordset
            });
        } catch (err) {
            console.error('Error fetching archived items:', err);
            res.render('Employee/OrderSupport/OrderArchived', {
                user: req.session.user,
                archivedProducts: [],
                archivedMaterials: [],
                archivedCategories: [],
                error: 'Failed to load archived items.'
            });
        }
    });

    // Order Support - Alerts
    router.get('/Employee/OrderSupport/OrderAlerts', isAuthenticated, checkPermission('inventory_alerts'), (req, res) => {
        res.render('Employee/OrderSupport/OrderAlerts', { user: req.session.user });
    });

    // Order Support - Logs
    router.get('/Employee/OrderSupport/OrderLogs', isAuthenticated, checkPermission('content_logs'), (req, res) => {
        renderRoleActivityLogsPage(req, res, EMPLOYEE_SYNC_ROLES.find((r) => r.roleName === 'OrderSupport'));
    });

    // Order Support - CMS
    router.get('/Employee/OrderSupport/OrderCMS', isAuthenticated, checkPermission('content_cms'), (req, res) => {
        res.render('Employee/OrderSupport/OrderCMS', { user: req.session.user });
    });

    // Order Support - Reviews
    router.get('/Employee/OrderSupport/OrderReviews', isAuthenticated, checkPermission('reviews_reviews'), (req, res) => {
        res.render('Employee/OrderSupport/OrderReviews', { user: req.session.user });
    });

    // Order Support - Delivery Rates
    router.get('/Employee/OrderSupport/OrderRates', isAuthenticated, checkPermission('transactions_delivery_rates'), (req, res) => {
        res.render('Employee/OrderSupport/OrderRates', { user: req.session.user });
    });

    // Order Support - Walk In
    router.get('/Employee/OrderSupport/OrderWalkIn', isAuthenticated, checkPermission('transactions_walk_in'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM WalkInOrders 
                ORDER BY CreatedAt DESC
            `);
            res.render('Employee/OrderSupport/OrderWalkIn', {
                user: req.session.user,
                bulkOrders: result.recordset
            });
        } catch (err) {
            console.error('Error fetching walk-in orders:', err);
            res.render('Employee/OrderSupport/OrderWalkIn', {
                user: req.session.user,
                bulkOrders: [],
                error: 'Failed to load walk-in orders.'
            });
        }
    });

    // Order Support - Manage Users
    router.get('/Employee/OrderSupport/OrderManageUsers', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT u.*, r.RoleName 
                FROM Users u 
                LEFT JOIN Roles r ON u.RoleID = r.RoleID 
                ORDER BY u.CreatedAt DESC
            `);

            // Decrypt user data before sending to frontend using transparent encryption service
            const decryptedUsers = result.recordset;

            res.render('Employee/OrderSupport/OrderManageUsers', {
                user: req.session.user,
                users: decryptedUsers,
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            res.render('Employee/OrderSupport/OrderManageUsers', {
                user: req.session.user,
                users: [],
                error: 'Failed to load users.',
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        }
    });


    // Order Support - Orders
    const orderSupportOrderRoutes = [
        { route: 'OrderOrdersPending', status: 'Pending' },
        { route: 'OrderOrdersProcessing', status: 'Processing' },
        { route: 'OrderOrdersShipping', status: 'Shipping' },
        { route: 'OrderOrdersDelivery', status: 'Delivery' },
        { route: 'OrderOrdersReceive', status: 'Received' },
        { route: 'OrderCancelledOrders', status: 'Cancelled' },
        { route: 'OrderCompletedOrders', status: 'Completed' }
    ];

    orderSupportOrderRoutes.forEach(({ route, status }) => {
        const permission = 'orders_pending';

        router.get(`/Employee/OrderSupport/${route}`, isAuthenticated, checkPermission(permission), async (req, res) => {
            try {
                await pool.connect();
                const result = await pool.request()
                    .input('status', sql.NVarChar, status)
                    .query(`
                        SELECT o.*, c.FullName as CustomerName, c.Email as CustomerEmail
                        FROM Orders o
                        LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
                        WHERE o.Status = @status
                        ORDER BY o.OrderDate DESC
                    `);
                res.render(`Employee/OrderSupport/${route}`, {
                    user: req.session.user,
                    orders: result.recordset
                });
            } catch (err) {
                console.error(`Error fetching ${status.toLowerCase()} orders:`, err);
                res.render(`Employee/OrderSupport/${route}`, {
                    user: req.session.user,
                    orders: [],
                    error: `Failed to load ${status.toLowerCase()} orders.`
                });
            }
        });
    });

    router.get('/Employee/OrderSupport/OrderReturnedOrders', isAuthenticated, checkPermission('orders_returned'), async (req, res) => {
        try {
            await pool.connect();
            const returnedStatuses = employeeReturnedOrderStatuses;
            const statusParams = returnedStatuses.map((s, idx) => `@status${idx}`).join(', ');
            const request = pool.request();
            returnedStatuses.forEach((s, idx) => request.input(`status${idx}`, sql.NVarChar, s));
            const result = await request.query(`
                SELECT o.*, c.FullName as CustomerName, c.Email as CustomerEmail
                FROM Orders o
                LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
                WHERE o.Status IN (${statusParams})
                ORDER BY o.OrderDate DESC
            `);
            res.render('Employee/OrderSupport/OrderReturnedOrders', {
                user: req.session.user,
                orders: result.recordset,
                activePage: 'orders-returned'
            });
        } catch (err) {
            console.error('Error fetching returned orders:', err);
            res.render('Employee/OrderSupport/OrderReturnedOrders', {
                user: req.session.user,
                orders: [],
                activePage: 'orders-returned',
                error: 'Failed to load returned orders.'
            });
        }
    });

    // Order Support - Alerts Data API
    router.get('/Employee/OrderSupport/Alerts/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const maxQty = Math.max(parseInt(req.query.maxQty, 10) || 20, 1);
            res.json(await buildInventoryAlertsPayload(pool, maxQty));
        } catch (err) {
            console.error('Error fetching alerts data:', err);
            res.json({ success: false, products: [], rawMaterials: [], error: err.message });
        }
    });
    // Order Support - Logs Data API endpoint with filtering support
    router.get('/Employee/OrderSupport/Logs/Data', isAuthenticated, sendActivityLogsData);

};
