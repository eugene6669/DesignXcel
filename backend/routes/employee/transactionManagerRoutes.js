'use strict';

/**
 * Extracted from routes.js lines 2825-3927.
 */
module.exports = function registerTransactionManagerRoutes(router, ctx) {
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

    // TRANSACTION MANAGER ROUTES
    // =============================================================================

    // Transaction Manager Dashboard
    router.get('/Employee/TransactionManager', isAuthenticated, (req, res) => {
        console.log('=== TRANSACTION MANAGER ROUTE ACCESSED ===');
        console.log('Session ID:', req.sessionID);
        console.log('User in session:', req.session?.user);
        console.log('User role:', req.session?.user?.role);
        console.log('================================');
        res.render('Employee/TransactionManager/TransactionManager', { user: req.session.user });
    });
    // Transaction Manager - Materials
    router.get('/Employee/TransactionManager/TransactionMaterials', isAuthenticated, checkPermission('inventory_materials'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM RawMaterials 
                WHERE IsActive = 1 
                ORDER BY Name ASC
            `);
            res.render('Employee/TransactionManager/TransactionMaterials', {
                user: req.session.user,
                materials: result.recordset
            });
        } catch (err) {
            console.error('Error fetching raw materials:', err);
            res.render('Employee/TransactionManager/TransactionMaterials', {
                user: req.session.user,
                materials: [],
                error: 'Failed to load raw materials.'
            });
        }
    });

    // Transaction Manager - Variations
    router.get('/Employee/TransactionManager/TransactionVariations', isAuthenticated, checkPermission('inventory_variations'), (req, res) => {
        res.render('Employee/TransactionManager/TransactionVariations', { user: req.session.user });
    });
    // Transaction Manager - Archived
    router.get('/Employee/TransactionManager/TransactionArchived', isAuthenticated, checkPermission('inventory_archived'), async (req, res) => {
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

            res.render('Employee/TransactionManager/TransactionArchived', {
                user: req.session.user,
                archivedProducts: productsResult.recordset,
                archivedMaterials: materialsResult.recordset,
                archivedCategories: categoriesResult.recordset
            });
        } catch (err) {
            console.error('Error fetching archived items:', err);
            res.render('Employee/TransactionManager/TransactionArchived', {
                user: req.session.user,
                archivedProducts: [],
                archivedMaterials: [],
                archivedCategories: [],
                error: 'Failed to load archived items.'
            });
        }
    });

    // Transaction Manager - Alerts
    router.get('/Employee/TransactionManager/TransactionAlerts', isAuthenticated, checkPermission('inventory_alerts'), (req, res) => {
        res.render('Employee/TransactionManager/TransactionAlerts', { user: req.session.user });
    });

    // Transaction Manager - Logs
    router.get('/Employee/TransactionManager/TransactionLogs', isAuthenticated, checkPermission('content_logs'), (req, res) => {
        renderRoleActivityLogsPage(req, res, EMPLOYEE_SYNC_ROLES.find((r) => r.roleName === 'TransactionManager'));
    });

    // Transaction Manager - CMS
    router.get('/Employee/TransactionManager/TransactionCMS', isAuthenticated, checkPermission('content_cms'), (req, res) => {
        res.render('Employee/TransactionManager/TransactionCMS', { user: req.session.user });
    });

    // Transaction Manager - Reviews
    router.get('/Employee/TransactionManager/TransactionReviews', isAuthenticated, checkPermission('reviews_reviews'), (req, res) => {
        res.render('Employee/TransactionManager/TransactionReviews', { user: req.session.user });
    });

    // Transaction Manager - Delivery Rates
    router.get('/Employee/TransactionManager/TransactionRates', isAuthenticated, checkPermission('transactions_delivery_rates'), (req, res) => {
        res.render('Employee/TransactionManager/TransactionRates', { user: req.session.user });
    });

    // Transaction Manager - Walk In
    router.get('/Employee/TransactionManager/TransactionWalkIn', isAuthenticated, checkPermission('transactions_walk_in'), async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT * FROM WalkInOrders 
                ORDER BY CreatedAt DESC
            `);
            res.render('Employee/TransactionManager/TransactionWalkIn', {
                user: req.session.user,
                bulkOrders: result.recordset
            });
        } catch (err) {
            console.error('Error fetching walk-in orders:', err);
            res.render('Employee/TransactionManager/TransactionWalkIn', {
                user: req.session.user,
                bulkOrders: [],
                error: 'Failed to load walk-in orders.'
            });
        }
    });

    // Transaction Manager - Manage Users
    router.get('/Employee/TransactionManager/TransactionManageUsers', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
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

            res.render('Employee/TransactionManager/TransactionManageUsers', {
                user: req.session.user,
                users: decryptedUsers,
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            res.render('Employee/TransactionManager/TransactionManageUsers', {
                user: req.session.user,
                users: [],
                error: 'Failed to load users.',
                permissionSections: USER_PERMISSION_SECTIONS,
                permissionLegacyKeys: USER_PERMISSION_LEGACY_KEYS
            });
        }
    });

    // Transaction Manager - Chat Support
    router.get('/Employee/TransactionManager/TransactionChatSupport', isAuthenticated, checkPermission('chat_chat_support'), async (req, res) => {
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
            // Accept both ?thread= and ?threadId= for compatibility with the view
            const selectedThreadParam = req.query.thread || req.query.threadId;
            if (selectedThreadParam) {
                const threadId = selectedThreadParam;

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
            console.error('Error fetching transaction manager chat threads:', err);
            threads = threads || [];
            selectedThread = selectedThread || null;
            messages = messages || [];
        } finally {
            console.log('=== Rendering TransactionManager Template ===');
            console.log('- threads type:', typeof threads);
            console.log('- threads length:', threads ? threads.length : 'undefined');
            console.log('- selectedThread:', selectedThread);
            console.log('- messages length:', messages ? messages.length : 'undefined');

            res.render('Employee/TransactionManager/TransactionChatSupport', {
                user: req.session.user,
                threads,
                selectedThread,
                messages,
                error: threads.length === 0 ? 'No chat threads found.' : null
            });
        }
    });

    // Transaction Manager - Messages
    router.get('/Employee/TransactionManager/Messages', isAuthenticated, checkPermission('chat_messages'), async (req, res) => {
        console.log('=== TransactionManager Messages Route Called ===');

        try {
            res.render('Employee/TransactionManager/TransactionMessages', {
                user: req.session.user
            });
        } catch (err) {
            console.error('Error loading TransactionManager Messages page:', err);
            res.render('Employee/TransactionManager/TransactionMessages', {
                user: req.session.user,
                error: 'Failed to load messages interface.'
            });
        }
    });


    // Transaction Manager - Orders
    const transManagerOrderRoutes = [
        { route: 'TransactionOrdersPending', status: 'Pending' },
        { route: 'TransactionOrdersProcessing', status: 'Processing' },
        { route: 'TransactionOrdersShipping', status: 'Shipping' },
        { route: 'TransactionOrdersDelivery', status: 'Delivery' },
        { route: 'TransactionOrdersReceive', status: 'Received' },
        { route: 'TransactionCancelledOrders', status: 'Cancelled' },
        { route: 'TransactionCompletedOrders', status: 'Completed' }
    ];

    transManagerOrderRoutes.forEach(({ route, status }) => {
        const permission = 'orders_pending';

        router.get(`/Employee/TransactionManager/${route}`, isAuthenticated, checkPermission(permission), async (req, res) => {
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
                res.render(`Employee/TransactionManager/${route}`, {
                    user: req.session.user,
                    orders: result.recordset
                });
            } catch (err) {
                console.error(`Error fetching ${status.toLowerCase()} orders:`, err);
                res.render(`Employee/TransactionManager/${route}`, {
                    user: req.session.user,
                    orders: [],
                    error: `Failed to load ${status.toLowerCase()} orders.`
                });
            }
        });
    });

    const employeeReturnedOrderStatuses = [
        'Return', 'Returned', 'Processing (Pickup)', 'Awaiting Inspection', 'Inspection Complete',
        'Pickup Received', 'Declined', 'Completed Returned', 'Refunded'
    ];

    router.get('/Employee/TransactionManager/TransactionReturnedOrders', isAuthenticated, checkPermission('orders_returned'), async (req, res) => {
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
            res.render('Employee/TransactionManager/TransactionReturnedOrders', {
                user: req.session.user,
                orders: result.recordset,
                activePage: 'orders-returned'
            });
        } catch (err) {
            console.error('Error fetching returned orders:', err);
            res.render('Employee/TransactionManager/TransactionReturnedOrders', {
                user: req.session.user,
                orders: [],
                activePage: 'orders-returned',
                error: 'Failed to load returned orders.'
            });
        }
    });

    // Transaction Manager - Alerts Data API
    router.get('/Employee/TransactionManager/Alerts/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const maxQty = Math.max(parseInt(req.query.maxQty, 10) || 20, 1);
            res.json(await buildInventoryAlertsPayload(pool, maxQty));
        } catch (err) {
            console.error('Error fetching alerts data:', err);
            res.json({ success: false, products: [], rawMaterials: [], error: err.message });
        }
    });

    // Transaction Manager - Logs Data API endpoint with filtering support
    router.get('/Employee/TransactionManager/Logs/Data', isAuthenticated, sendActivityLogsData);

    // =============================================================================
    // TRANSACTION MANAGER CRUD ROUTES
    // =============================================================================

    // Transaction Manager - Products CRUD
    router.post('/Employee/TransactionManager/TransactionProducts/Add', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { name, description, price, stockquantity, category, requiredMaterials } = req.body;

            // Start transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Generate temporary SKU and Slug to satisfy UNIQUE constraints
                // Use SQL Server's NEWID() for PublicId directly in the query
                const tempSku = `TEMP-SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const tempSlug = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

                // Insert product
                const productResult = await transaction.request()
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description)
                    .input('price', sql.Decimal(10, 2), parseFloat(price))
                    .input('stockquantity', sql.Int, parseInt(stockquantity))
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, dimensionsJson)
                    .input('image', sql.NVarChar, req.files?.image ? publicUrlFromMulterProductFile(req.files.image[0]) : null)
                    .input('thumbnails', sql.NVarChar, req.files ? JSON.stringify([
                        req.files.thumbnail1?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail1[0]) : null,
                        req.files.thumbnail2?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail2[0]) : null,
                        req.files.thumbnail3?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail3[0]) : null,
                        req.files.thumbnail4?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail4[0]) : null
                    ].filter(Boolean)) : null)
                    .input('model3d', sql.NVarChar, req.files?.model3d ? publicUrlFromMulterProductFile(req.files.model3d[0]) : null)
                    .input('tempSku', sql.NVarChar, tempSku)
                    .input('tempSlug', sql.NVarChar, tempSlug)
                    .query(`
                        INSERT INTO Products (Name, Description, Price, StockQuantity, Category, ImageURL, ThumbnailURLs, Model3DURL, CreatedAt, IsArchived, SKU, PublicId, Slug)
                        OUTPUT INSERTED.ProductID
                        VALUES (@name, @description, @price, @stockquantity, @category, @image, @thumbnails, @model3d, GETDATE(), 0, @tempSku, NEWID(), @tempSlug)
                    `);

                const productId = productResult.recordset[0].ProductID;

                // Generate final SKU and Slug based on actual ProductID
                // Generate a new GUID for the final PublicId
                const { sku, slug } = generateProductIdentifiers(productId, name);
                const finalPublicId = generateGuid(); // Generate final GUID (uppercase format)

                // Update with final identifiers
                // Use CAST to convert GUID string to uniqueidentifier
                try {
                    await transaction.request()
                        .input('productId', sql.Int, productId)
                        .input('sku', sql.NVarChar, sku)
                        .input('publicId', sql.NVarChar, finalPublicId)
                        .input('slug', sql.NVarChar, slug)
                        .query('UPDATE Products SET SKU = @sku, PublicId = CAST(@publicId AS UNIQUEIDENTIFIER), Slug = @slug WHERE ProductID = @productId');
                } catch (updateErr) {
                    console.error('Error updating product identifiers:', updateErr);
                    console.error('ProductID:', productId, 'SKU:', sku, 'PublicId:', finalPublicId, 'Slug:', slug);
                    throw updateErr;
                }

                // Handle required materials if provided
                if (requiredMaterials && requiredMaterials.length > 0) {
                    for (const materialId of requiredMaterials) {
                        await transaction.request()
                            .input('productId', sql.Int, productId)
                            .input('materialId', sql.Int, parseInt(materialId))
                            .query(`
                                INSERT INTO ProductMaterials (ProductID, MaterialID, CreatedAt)
                                VALUES (@productId, @materialId, GETDATE())
                            `);
                    }
                }

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'INSERT',
                    'Products',
                    productId,
                    `Created new product: "${name}" (ID: ${productId})`
                );

                res.json({ success: true, message: 'Product added successfully', productId });
            } catch (error) {
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    // Transaction may already be aborted, ignore rollback error
                    console.error('Error during transaction rollback (may be already aborted):', rollbackErr.message);
                }
                throw error;
            }
        } catch (err) {
            console.error('Error adding product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add product',
                error: err.message
            });
        }
    });

    router.post('/Employee/TransactionManager/TransactionProducts/Edit', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { productId, name, description, price, stockquantity, category, requiredMaterials } = req.body;

            // Start transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Get current product data for logging
                const currentProduct = await transaction.request()
                    .input('productId', sql.Int, productId)
                    .query('SELECT * FROM Products WHERE ProductID = @productId');

                if (currentProduct.recordset.length === 0) {
                    throw new Error('Product not found');
                }

                const oldProduct = currentProduct.recordset[0];

                // Prepare update data
                const updateData = {
                    name: name || oldProduct.Name,
                    description: description || oldProduct.Description,
                    price: price ? parseFloat(price) : oldProduct.Price,
                    stockquantity: stockquantity ? parseInt(stockquantity) : oldProduct.StockQuantity,
                    category: category || oldProduct.Category,
                    image: req.files?.image ? publicUrlFromMulterProductFile(req.files.image[0]) : oldProduct.ImageURL,
                    thumbnails: req.files ? JSON.stringify([
                        req.files.thumbnail1?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail1[0]) : null,
                        req.files.thumbnail2?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail2[0]) : null,
                        req.files.thumbnail3?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail3[0]) : null,
                        req.files.thumbnail4?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail4[0]) : null
                    ].filter(Boolean)) : oldProduct.ThumbnailURLs,
                    model3d: req.files?.model3d ? publicUrlFromMulterProductFile(req.files.model3d[0]) : oldProduct.Model3DURL
                };

                // Update product
                await transaction.request()
                    .input('productId', sql.Int, productId)
                    .input('name', sql.NVarChar, updateData.name)
                    .input('description', sql.NVarChar, updateData.description)
                    .input('price', sql.Decimal(10, 2), updateData.price)
                    .input('stockquantity', sql.Int, updateData.stockquantity)
                    .input('category', sql.NVarChar, updateData.category)
                    .input('image', sql.NVarChar, updateData.image)
                    .input('thumbnails', sql.NVarChar, updateData.thumbnails)
                    .input('model3d', sql.NVarChar, updateData.model3d)
                    .query(`
                        UPDATE Products 
                        SET Name = @name, Description = @description, Price = @price, 
                            StockQuantity = @stockquantity, Category = @category, 
                            ImageURL = @image, ThumbnailURLs = @thumbnails, Model3DURL = @model3d,
                            UpdatedAt = GETDATE()
                        WHERE ProductID = @productId
                    `);

                // Update required materials if provided
                if (requiredMaterials !== undefined) {
                    // Remove existing materials
                    await transaction.request()
                        .input('productId', sql.Int, productId)
                        .query('DELETE FROM ProductMaterials WHERE ProductID = @productId');

                    // Add new materials
                    if (requiredMaterials && requiredMaterials.length > 0) {
                        for (const materialId of requiredMaterials) {
                            await transaction.request()
                                .input('productId', sql.Int, productId)
                                .input('materialId', sql.Int, parseInt(materialId))
                                .query(`
                                    INSERT INTO ProductMaterials (ProductID, MaterialID, CreatedAt)
                                    VALUES (@productId, @materialId, GETDATE())
                                `);
                        }
                    }
                }

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'UPDATE',
                    'Products',
                    productId,
                    `Updated product: "${name}" (ID: ${productId})`
                );

                res.json({ success: true, message: 'Product updated successfully' });
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (err) {
            console.error('Error updating product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update product',
                error: err.message
            });
        }
    });

    router.post('/Employee/TransactionManager/TransactionProducts/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const productId = req.params.id;

            // Get product info for logging
            const productResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT Name FROM Products WHERE ProductID = @productId');

            if (productResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            const productName = productResult.recordset[0].Name;

            // Archive the product instead of deleting
            await pool.request()
                .input('productId', sql.Int, productId)
                .query('UPDATE Products SET IsActive = 0, UpdatedAt = GETDATE() WHERE ProductID = @productId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'DELETE',
                'Products',
                productId,
                `Deleted product: "${productName}" (ID: ${productId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            res.json({ success: true, message: 'Product archived successfully' });
        } catch (err) {
            console.error('Error archiving product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to archive product',
                error: err.message
            });
        }
    });

    // Transaction Manager - Materials CRUD
    router.post('/Employee/TransactionManager/TransactionMaterials/Add', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { name, quantity, unit } = req.body;

            const result = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('quantity', sql.Int, quantity)
                .input('unit', sql.NVarChar, unit)
                .query(`
                    INSERT INTO RawMaterials (Name, QuantityAvailable, Unit, LastUpdated, IsActive)
                    OUTPUT INSERTED.MaterialID
                    VALUES (@name, @quantity, @unit, GETDATE(), 1)
                `);

            const materialId = result.recordset[0].MaterialID;

            // Log the activity
            await logActivity(
                req.session.user.id,
                'INSERT',
                'RawMaterials',
                materialId,
                `Created new material: "${name}" (ID: ${materialId})`
            );

            res.json({ success: true, message: 'Material added successfully', materialId });
        } catch (err) {
            console.error('Error adding material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add material',
                error: err.message
            });
        }
    });

    router.post('/Employee/TransactionManager/TransactionMaterials/Edit', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { materialId, name, quantity, unit } = req.body;

            await pool.request()
                .input('materialId', sql.Int, materialId)
                .input('name', sql.NVarChar, name)
                .input('quantity', sql.Int, quantity)
                .input('unit', sql.NVarChar, unit)
                .query(`
                    UPDATE RawMaterials 
                    SET Name = @name, QuantityAvailable = @quantity, Unit = @unit, LastUpdated = GETDATE()
                    WHERE MaterialID = @materialId
                `);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'RawMaterials',
                materialId,
                `Updated material: "${name}" (ID: ${materialId})`
            );

            res.json({ success: true, message: 'Material updated successfully' });
        } catch (err) {
            console.error('Error updating material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update material',
                error: err.message
            });
        }
    });
    router.post('/Employee/TransactionManager/TransactionMaterials/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const materialId = req.params.id;

            // Get material info for logging
            const materialResult = await pool.request()
                .input('materialId', sql.Int, materialId)
                .query('SELECT Name FROM RawMaterials WHERE MaterialID = @materialId');

            if (materialResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Material not found' });
            }

            const materialName = materialResult.recordset[0].Name;

            // Deactivate the material instead of deleting
            await pool.request()
                .input('materialId', sql.Int, materialId)
                .query('UPDATE RawMaterials SET IsActive = 0, LastUpdated = GETDATE() WHERE MaterialID = @materialId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'DELETE',
                'RawMaterials',
                materialId,
                `Deleted material: "${materialName}" (ID: ${materialId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            res.json({ success: true, message: 'Material deactivated successfully' });
        } catch (err) {
            console.error('Error deactivating material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to deactivate material',
                error: err.message
            });
        }
    });

    // Transaction Manager - Variations CRUD
    router.post('/Employee/TransactionManager/TransactionVariations/Add', isAuthenticated, variationUpload.single('variationImage'), async (req, res) => {
        try {
            await pool.connect();
            const { variationName, color, quantity, productID, isActive } = req.body;

            const parsedProductID = parseInt(productID);

            // Get product stock quantity
            const productResult = await pool.request()
                .input('productID', sql.Int, parsedProductID)
                .query('SELECT StockQuantity FROM Products WHERE ProductID = @productID');

            if (productResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found.'
                });
            }

            const productStock = productResult.recordset[0].StockQuantity;

            const variationQuantity = parseInt(quantity) || 0;

            if (variationQuantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Variation quantity must be greater than 0.'
                });
            }

            // Sum up quantities of all existing active variations for this product
            const existingVariationsResult = await pool.request()
                .input('productID', sql.Int, parsedProductID)
                .query('SELECT ISNULL(SUM(Quantity), 0) as TotalVariationQuantity FROM ProductVariations WHERE ProductID = @productID AND IsActive = 1');

            const existingVariationQuantity = existingVariationsResult.recordset[0].TotalVariationQuantity;

            // Validation removed: total variation quantities can exceed available stock
            // (User requested removal of this validation)

            // Handle image upload
            let imageUrl = null;
            if (req.file) {
                imageUrl = publicUrlFromMulterVariationFile(req.file);
            }

            // Start transaction to ensure both variation insert and stock update succeed or fail together
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                const result = await transaction.request()
                    .input('productID', sql.Int, parsedProductID)
                    .input('variationName', sql.NVarChar, variationName)
                    .input('color', sql.NVarChar, color || null)
                    .input('quantity', sql.Int, variationQuantity)
                    .input('imageUrl', sql.NVarChar, imageUrl)
                    .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                    .query(`
                        INSERT INTO ProductVariations (ProductID, VariationName, Color, Quantity, VariationImageURL, IsActive)
                        OUTPUT INSERTED.VariationID
                        VALUES (@productID, @variationName, @color, @quantity, @imageUrl, @isActive)
                    `);

                const variationID = result.recordset[0].VariationID;

                // Decrease product stock by variation quantity
                await transaction.request()
                    .input('productID', sql.Int, parsedProductID)
                    .input('quantity', sql.Int, variationQuantity)
                    .query('UPDATE Products SET StockQuantity = StockQuantity - @quantity, UpdatedAt = GETDATE() WHERE ProductID = @productID');

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'INSERT',
                    'ProductVariations',
                    variationID,
                    `Variation "${variationName}" created. Product stock decreased by ${variationQuantity}.`
                );

                res.json({ success: true, message: `Variation added successfully. Product stock decreased by ${variationQuantity}.`, variationID });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error adding variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add variation',
                error: err.message
            });
        }
    });
    router.post('/Employee/TransactionManager/TransactionVariations/Edit', isAuthenticated, variationUpload.single('variationImage'), async (req, res) => {
        try {
            await pool.connect();
            const { variationID, variationName, color, quantity, productID, isActive } = req.body;

            // Handle image upload
            let imageUrl = null;
            if (req.file) {
                // Get current variation image URL before updating
                const currentVariation = await pool.request()
                    .input('variationID', sql.Int, variationID)
                    .query('SELECT VariationImageURL FROM ProductVariations WHERE VariationID = @variationID');

                const currentImageUrl = currentVariation.recordset[0]?.VariationImageURL;

                // Delete old variation image
                await deleteOldImageFile(currentImageUrl);

                imageUrl = publicUrlFromMulterVariationFile(req.file);
            } else {
                // If no new image uploaded, keep existing image
                const existingResult = await pool.request()
                    .input('variationID', sql.Int, variationID)
                    .query('SELECT VariationImageURL FROM ProductVariations WHERE VariationID = @variationID');

                if (existingResult.recordset.length > 0) {
                    imageUrl = existingResult.recordset[0].VariationImageURL;
                }
            }

            await pool.request()
                .input('variationID', sql.Int, variationID)
                .input('variationName', sql.NVarChar, variationName)
                .input('color', sql.NVarChar, color || null)
                .input('quantity', sql.Int, parseInt(quantity))
                .input('imageUrl', sql.NVarChar, imageUrl)
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE ProductVariations 
                    SET VariationName = @variationName, Color = @color, Quantity = @quantity, 
                        VariationImageURL = @imageUrl, IsActive = @isActive
                    WHERE VariationID = @variationID
                `);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'ProductVariations',
                variationID,
                `Variation "${variationName}" updated`
            );

            res.json({ success: true, message: 'Variation updated successfully' });
        } catch (err) {
            console.error('Error updating variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update variation',
                error: err.message
            });
        }
    });

    router.post('/Employee/TransactionManager/TransactionVariations/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const variationID = req.params.id;

            // Get variation info including ProductID, VariationName, Quantity, and IsActive status
            const variationResult = await pool.request()
                .input('variationID', sql.Int, variationID)
                .query('SELECT ProductID, VariationName, Quantity, IsActive FROM ProductVariations WHERE VariationID = @variationID');

            if (variationResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Variation not found' });
            }

            const variation = variationResult.recordset[0];
            const productID = variation.ProductID;
            const variationName = variation.VariationName;
            const variationQuantity = variation.Quantity || 0;
            const wasActive = variation.IsActive === 1;

            // Start transaction to ensure both variation delete and stock update succeed or fail together
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Deactivate the variation instead of deleting
                await transaction.request()
                    .input('variationID', sql.Int, variationID)
                    .query('UPDATE ProductVariations SET IsActive = 0 WHERE VariationID = @variationID');

                // If variation was active, restore product stock by variation quantity
                if (wasActive && variationQuantity > 0) {
                    await transaction.request()
                        .input('productID', sql.Int, productID)
                        .input('quantity', sql.Int, variationQuantity)
                        .query('UPDATE Products SET StockQuantity = StockQuantity + @quantity, UpdatedAt = GETDATE() WHERE ProductID = @productID');
                }

                await transaction.commit();

                // Log the activity
                const logMessage = wasActive && variationQuantity > 0
                    ? `Variation "${variationName}" deactivated. Product stock restored by ${variationQuantity}.`
                    : `Variation "${variationName}" deactivated`;

                await logActivity(
                    req.session.user.id,
                    'DELETE',
                    'ProductVariations',
                    variationID,
                    logMessage,
                    JSON.stringify({ IsActive: { old: wasActive ? 1 : 0, new: 0 } })
                );

                res.json({
                    success: true,
                    message: wasActive && variationQuantity > 0 ? `Variation deactivated successfully. Product stock restored by ${variationQuantity}.` : 'Variation deactivated successfully'
                });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error deactivating variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to deactivate variation',
                error: err.message
            });
        }
    });

    // Transaction Manager - Delivery Rates CRUD
    router.post('/Employee/TransactionManager/TransactionRates/Add', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { serviceType, basePrice, isActive } = req.body;

            const result = await pool.request()
                .input('serviceType', sql.NVarChar, serviceType)
                .input('basePrice', sql.Decimal(10, 2), parseFloat(basePrice))
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .input('createdByUserID', sql.Int, req.session.user?.id || null)
                .input('createdByUsername', sql.NVarChar, req.session.user?.username || 'System')
                .query(`
                    INSERT INTO DeliveryRates (ServiceType, Price, IsActive, CreatedAt, CreatedByUserID, CreatedByUsername)
                    OUTPUT INSERTED.RateID
                    VALUES (@serviceType, @basePrice, @isActive, GETDATE(), @createdByUserID, @createdByUsername)
                `);

            const rateId = result.recordset[0].RateID;

            res.json({ success: true, message: 'Delivery rate added successfully', rateId });
        } catch (err) {
            console.error('Error adding delivery rate:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add delivery rate',
                error: err.message
            });
        }
    });

    router.post('/Employee/TransactionManager/TransactionRates/Update/:rateId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { rateId } = req.params;
            const { serviceType, basePrice, isActive } = req.body;

            await pool.request()
                .input('rateId', sql.Int, rateId)
                .input('serviceType', sql.NVarChar, serviceType)
                .input('basePrice', sql.Decimal(10, 2), parseFloat(basePrice))
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE DeliveryRates 
                    SET ServiceType = @serviceType, Price = @basePrice, IsActive = @isActive
                    WHERE RateID = @rateId
                `);

            res.json({ success: true, message: 'Delivery rate updated successfully' });
        } catch (err) {
            console.error('Error updating delivery rate:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update delivery rate',
                error: err.message
            });
        }
    });

    // Transaction Manager - Stock Update
    router.post('/Employee/TransactionManager/TransactionProducts/UpdateStock', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { productId, newStock } = req.body;

            // Get current stock quantity before updating
            const currentStockResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT StockQuantity FROM Products WHERE ProductID = @productId');

            if (currentStockResult.recordset.length === 0) {
                return res.json({
                    success: false,
                    message: 'Product not found.'
                });
            }

            const oldStock = currentStockResult.recordset[0].StockQuantity;

            await pool.request()
                .input('productId', sql.Int, productId)
                .input('newStock', sql.Int, newStock)
                .query(`
                    UPDATE Products 
                    SET StockQuantity = @newStock, UpdatedAt = GETDATE()
                    WHERE ProductID = @productId
                `);

            // Log the activity with actual changes
            const changes = JSON.stringify({
                StockQuantity: {
                    old: oldStock,
                    new: newStock
                }
            });

            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Products',
                productId,
                `TransactionManager updated stock quantity from ${oldStock} to ${newStock} for product ID: ${productId}`,
                changes
            );

            res.json({ success: true, message: 'Stock updated successfully' });
        } catch (err) {
            console.error('Error updating stock:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update stock',
                error: err.message
            });
        }
    });

};
