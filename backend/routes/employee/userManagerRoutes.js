'use strict';

/**
 * Extracted from routes.js lines 2843-3179.
 */
module.exports = function registerUserManagerRoutes(router, ctx) {
    const {
        pool,
        sql,
        path,
        fs,
        isAuthenticated,
        checkPermission,
        EMPLOYEE_SYNC_ROLES,
        registerEmployeeRoleProductRoutes,
        productUpload,
        variationUpload,
        logActivity,
        captureChanges,
        sendActivityLogsData,
        buildInventoryAlertsPayload,
        getRoleViewPath,
        formatInventoryDate,
        loadProductInventoryPageData,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn,
        ensureVariationMediaColumns,
        ensureBomBundleSchema,
        ensureInventoryStockMovementSchema,
        makeRenderRoleActivityLogsPage,
        syncInventoryVariationToProductsVariation,
        syncInventoryProductCatalogToProducts,
        cascadeArchiveCmsFromInventoryProductArchived,
        publicUrlFromMulterProductFile,
        publicUrlFromMulterVariationFile,
        deleteProductAssetFile,
        assignVariationSku,
        upsertProductVariationWithId,
        buildVariationDimensionsJson,
        parseSingleVariationMediaFiles,
        resolveVariationMediaUrls,
        mapVariationMediaFiles,
        invalidateAdminPageCache,
        insertStockMovement,
        logInventoryStockMovementFromVariationUpdate,
        logRestockVariationMovement,
        logRestockProductMovement,
        logRestockRawMaterialMovement,
        logAdjustRawMaterialMovement,
        logAddRawMaterialMovement,
        archiveStockMovement,
        archiveStockMovementsForProduct,
        parseMoneyInput,
        generateProductIdentifiers,
        generateReferenceNumber,
        normalizeProductAssetUrl,
        normalizeThumbnailList,
        deleteOldImageFile,
        generateGuid,
        decreaseMaterialsForProduct,
        restoreMaterialsForProduct
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);

    // USER MANAGER ROUTES
    // =============================================================================

    // User Manager Dashboard
    router.get('/Employee/UserManager', isAuthenticated, (req, res) => {
        console.log('=== USER MANAGER ROUTE ACCESSED ===');
        console.log('Session ID:', req.sessionID);
        console.log('User in session:', req.session?.user);
        console.log('User role:', req.session?.user?.role);
        console.log('================================');
        res.render('Employee/UserManager/UserManager', { user: req.session.user });
    });

    // User Manager - Materials
    router.get('/Employee/UserManager/UserMaterials', isAuthenticated, checkPermission('inventory_materials'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM RawMaterials 
                WHERE IsActive = 1 
                ORDER BY Name ASC
            `);
            res.render('Employee/UserManager/UserMaterials', {
                user: req.session.user,
                materials: result.recordset
            });
        } catch (err) {
            console.error('Error fetching raw materials:', err);
            res.render('Employee/UserManager/UserMaterials', {
                user: req.session.user,
                materials: [],
                error: 'Failed to load raw materials.'
            });
        }
    });

    // User Manager - Variations
    router.get('/Employee/UserManager/UserVariations', isAuthenticated, checkPermission('inventory_variations'), (req, res) => {
        res.render('Employee/UserManager/UserVariations', { user: req.session.user });
    });

    // User Manager - Archived
    router.get('/Employee/UserManager/UserArchived', isAuthenticated, checkPermission('inventory_archived'), async (req, res) => {
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

            res.render('Employee/UserManager/UserArchived', {
                user: req.session.user,
                archivedProducts: productsResult.recordset,
                archivedMaterials: materialsResult.recordset,
                archivedCategories: categoriesResult.recordset
            });
        } catch (err) {
            console.error('Error fetching archived items:', err);
            res.render('Employee/UserManager/UserArchived', {
                user: req.session.user,
                archivedProducts: [],
                archivedMaterials: [],
                archivedCategories: [],
                error: 'Failed to load archived items.'
            });
        }
    });

    // User Manager - Alerts
    router.get('/Employee/UserManager/UserAlerts', isAuthenticated, checkPermission('inventory_alerts'), (req, res) => {
        res.render('Employee/UserManager/UserAlerts', { user: req.session.user });
    });

    // User Manager - Logs
    router.get('/Employee/UserManager/UserLogs', isAuthenticated, checkPermission('content_logs'), (req, res) => {
        renderRoleActivityLogsPage(req, res, EMPLOYEE_SYNC_ROLES.find((r) => r.roleName === 'UserManager'));
    });

    // User Manager - CMS
    router.get('/Employee/UserManager/UserCMS', isAuthenticated, checkPermission('content_cms'), (req, res) => {
        res.render('Employee/UserManager/UserCMS', { user: req.session.user });
    });

    // User Manager - Reviews
    router.get('/Employee/UserManager/UserReviews', isAuthenticated, checkPermission('reviews_reviews'), (req, res) => {
        res.render('Employee/UserManager/UserReviews', { user: req.session.user });
    });

    // User Manager - Delivery Rates
    router.get('/Employee/UserManager/UserRates', isAuthenticated, checkPermission('transactions_delivery_rates'), (req, res) => {
        res.render('Employee/UserManager/UserRates', { user: req.session.user });
    });

    // User Manager - Walk In
    router.get('/Employee/UserManager/UserWalkIn', isAuthenticated, checkPermission('transactions_walk_in'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM WalkInOrders 
                ORDER BY CreatedAt DESC
            `);
            res.render('Employee/UserManager/UserWalkIn', {
                user: req.session.user,
                bulkOrders: result.recordset
            });
        } catch (err) {
            console.error('Error fetching walk-in orders:', err);
            res.render('Employee/UserManager/UserWalkIn', {
                user: req.session.user,
                bulkOrders: [],
                error: 'Failed to load walk-in orders.'
            });
        }
    });

    // User Manager - Manage Users
    router.get('/Employee/UserManager/UserManageUsers', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
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

            res.render('Employee/UserManager/UserManageUsers', {
                user: req.session.user,
                users: decryptedUsers,
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            res.render('Employee/UserManager/UserManageUsers', {
                user: req.session.user,
                users: [],
                error: 'Failed to load users.',
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        }
    });

    // User Manager - Chat Support
    router.get('/Employee/UserManager/UserChatSupport', isAuthenticated, checkPermission('chat_chat_support'), async (req, res) => {
        let threads = [];
        let selectedThread = null;
        let messages = [];

        try {
            await pool.connect();

            // Fetch all chat threads
            const threadsResult = await pool.request().query(`
                SELECT DISTINCT ct.CustomerID, c.FullName, c.Email, c.PhoneNumber,
                       MAX(ct.CreatedAt) as LastMessageAt,
                       COUNT(ct.MessageID) as MessageCount
                FROM ChatThreads ct
                LEFT JOIN Customers c ON ct.CustomerID = c.CustomerID
                GROUP BY ct.CustomerID, c.FullName, c.Email, c.PhoneNumber
                ORDER BY LastMessageAt DESC
            `);
            threads = threadsResult.recordset;

            // If a specific thread is selected, fetch its messages
            if (req.query.threadId) {
                const threadId = req.query.threadId;

                // Get thread info
                const threadResult = await pool.request()
                    .input('customerId', sql.Int, threadId)
                    .query(`
                        SELECT DISTINCT ct.CustomerID, c.FullName, c.Email, c.PhoneNumber
                        FROM ChatThreads ct
                        LEFT JOIN Customers c ON ct.CustomerID = c.CustomerID
                        WHERE ct.CustomerID = @customerId
                    `);

                if (threadResult.recordset.length > 0) {
                    selectedThread = threadResult.recordset[0];
                }

                // Get messages for this thread
                const messagesResult = await pool.request()
                    .input('customerId', sql.Int, threadId)
                    .query(`
                        SELECT ct.*, c.FullName as CustomerName
                        FROM ChatThreads ct
                        LEFT JOIN Customers c ON ct.CustomerID = c.CustomerID
                        WHERE ct.CustomerID = @customerId
                        ORDER BY ct.CreatedAt ASC
                    `);
                messages = messagesResult.recordset;

                console.log(`Found ${messages.length} messages for thread ${threadId}`);
            }

            console.log('Rendering template with:');
            console.log('- selectedThread:', selectedThread);
            console.log('- selectedThread type:', typeof selectedThread);
            console.log('- selectedThread.CustomerID:', selectedThread ? selectedThread.CustomerID : 'null');
            console.log('- messages count:', messages.length);

        } catch (err) {
            console.error('Error fetching user manager chat threads:', err);
            threads = threads || [];
            selectedThread = selectedThread || null;
            messages = messages || [];
        } finally {
            console.log('=== Rendering UserManager Template ===');
            console.log('- threads type:', typeof threads);
            console.log('- threads length:', threads ? threads.length : 'undefined');
            console.log('- selectedThread:', selectedThread);
            console.log('- messages length:', messages ? messages.length : 'undefined');

            res.render('Employee/UserManager/UserChatSupport', {
                user: req.session.user,
                threads,
                selectedThread,
                messages,
                error: threads.length === 0 ? 'No chat threads found.' : null
            });
        }
    });

    // User Manager - Messages
    router.get('/Employee/UserManager/Messages', isAuthenticated, checkPermission('chat_messages'), async (req, res) => {
        console.log('=== UserManager Messages Route Called ===');

        try {
            res.render('Employee/UserManager/UserManagerMessages', {
                user: req.session.user
            });
        } catch (err) {
            console.error('Error loading UserManager Messages page:', err);
            res.render('Employee/UserManager/UserManagerMessages', {
                user: req.session.user,
                error: 'Failed to load messages interface.'
            });
        }
    });


    // User Manager - Orders
    const userManagerOrderRoutes = [
        { route: 'UserOrdersPending', status: 'Pending' },
        { route: 'UserOrdersProcessing', status: 'Processing' },
        { route: 'UserOrdersShipping', status: 'Shipping' },
        { route: 'UserOrdersDelivery', status: 'Delivery' },
        { route: 'UserOrdersReceive', status: 'Received' },
        { route: 'UserCancelledOrders', status: 'Cancelled' },
        { route: 'UserCompletedOrders', status: 'Completed' }
    ];

    userManagerOrderRoutes.forEach(({ route, status }) => {
        // Map route to permission
        let permission = 'orders_orders_pending'; // default
        if (route.includes('Processing')) permission = 'orders_orders_processing';
        else if (route.includes('Shipping')) permission = 'orders_orders_shipping';
        else if (route.includes('Delivery')) permission = 'orders_orders_delivery';
        else if (route.includes('Receive')) permission = 'orders_orders_receive';
        else if (route.includes('Cancelled')) permission = 'orders_orders_cancelled';
        else if (route.includes('Completed')) permission = 'orders_orders_completed';

        router.get(`/Employee/UserManager/${route}`, isAuthenticated, checkPermission(permission), async (req, res) => {
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
                res.render(`Employee/UserManager/${route}`, {
                    user: req.session.user,
                    orders: result.recordset
                });
            } catch (err) {
                console.error(`Error fetching ${status.toLowerCase()} orders:`, err);
                res.render(`Employee/UserManager/${route}`, {
                    user: req.session.user,
                    orders: [],
                    error: `Failed to load ${status.toLowerCase()} orders.`
                });
            }
        });
    });

    // User Manager - Alerts Data API
    router.get('/Employee/UserManager/Alerts/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const maxQty = Math.max(parseInt(req.query.maxQty, 10) || 20, 1);
            res.json(await buildInventoryAlertsPayload(pool, maxQty));
        } catch (err) {
            console.error('Error fetching alerts data:', err);
            res.json({ success: false, products: [], rawMaterials: [], error: err.message });
        }
    });
    // User Manager - Logs Data API endpoint with filtering support
    router.get('/Employee/UserManager/Logs/Data', isAuthenticated, sendActivityLogsData);
};
