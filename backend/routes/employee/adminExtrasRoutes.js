/**
 * Admin Extras Routes
 * - Archived items management
 * - Bulk orders management and APIs
 * - Reactivation endpoints for archived entities
 */

const sql = require('mssql');

module.exports = function(router, context) {
    const {
        pool,
        isAuthenticated,
        logActivity,
        ensureBomBundleSchema,
        ensureInventoryStockMovementSchema,
        loadArchivedBomBundles,
        fetchArchivedStockMovements,
        reactivateStockMovement,
        invalidateAdminPageCache
    } = context;

    // =============================================================================
    // HELPER FUNCTIONS
    // =============================================================================

    /**
     * Helper function to sync all bulk orders with their converted orders
     */
    async function syncAllBulkOrderStatuses() {
        try {
            await pool.connect();

            // Find all bulk orders that need syncing
            // Check if OrderID column exists first
            const columnCheck = await pool.request()
                .query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
                    AND name = 'OrderID'
                `);

            const hasOrderIDColumn = columnCheck.recordset[0].columnExists > 0;

            let bulkOrdersQuery = `
                SELECT BulkOrderID, CustomerID, GrandTotal, CreatedAt, Status
            `;

            if (hasOrderIDColumn) {
                bulkOrdersQuery += `, OrderID`;
            }

            bulkOrdersQuery += `
                FROM BulkOrders
                WHERE Status IN ('Pending', 'Processing', 'Shipping', 'Delivery', 'Received', 'Completed')
                ORDER BY CreatedAt DESC
            `;

            const bulkOrdersResult = await pool.request().query(bulkOrdersQuery);

            const totalCountResult = await pool.request().query('SELECT COUNT(*) as total FROM BulkOrders');
            const totalBulkOrders = totalCountResult.recordset[0].total;
            console.log(`[BULK ORDER SYNC] Found ${bulkOrdersResult.recordset.length} bulk orders to sync (out of ${totalBulkOrders} total bulk orders)`);

            if (totalBulkOrders === 0) {
                console.log('[BULK ORDER SYNC] WARNING: No bulk orders found in database. This might indicate bulk orders are not being saved.');
            }

            let syncedCount = 0;

            for (const bulkOrder of bulkOrdersResult.recordset) {
                let orderResult;

                if (hasOrderIDColumn && bulkOrder.OrderID) {
                    // Direct link via OrderID column
                    orderResult = await pool.request()
                        .input('orderId', sql.Int, bulkOrder.OrderID)
                        .query(`
                            SELECT OrderID, Status, OrderDate, TotalAmount
                            FROM Orders
                            WHERE OrderID = @orderId
                        `);
                } else {
                    // Fall back to matching by customer, amount, and date
                    orderResult = await pool.request()
                        .input('customerId', sql.Int, bulkOrder.CustomerID)
                        .input('totalAmount', sql.Decimal(10, 2), bulkOrder.GrandTotal)
                        .input('bulkOrderDate', sql.DateTime, bulkOrder.CreatedAt)
                        .query(`
                            SELECT TOP 1 OrderID, Status, OrderDate, TotalAmount
                            FROM Orders
                            WHERE CustomerID = @customerId
                              AND ABS(TotalAmount - @totalAmount) < 0.01
                              AND OrderDate >= @bulkOrderDate
                              AND OrderDate <= DATEADD(DAY, 1, @bulkOrderDate)
                              AND DeliveryType = 'pickup'
                            ORDER BY OrderDate ASC
                        `);
                }

                if (orderResult.recordset.length > 0) {
                    const order = orderResult.recordset[0];

                    // Map order status to bulk order status
                    let bulkOrderStatus = order.Status; // Default: use order status directly

                    // Map order statuses to bulk order statuses
                    if (order.Status === 'Pending') {
                        bulkOrderStatus = 'Pending';
                    } else if (order.Status === 'Processing') {
                        bulkOrderStatus = 'Processing';
                    } else if (order.Status === 'Shipping') {
                        bulkOrderStatus = 'Shipping';
                    } else if (order.Status === 'Delivery') {
                        bulkOrderStatus = 'Delivery';
                    } else if (order.Status === 'Received') {
                        bulkOrderStatus = 'Received';
                    } else if (order.Status === 'Completed') {
                        bulkOrderStatus = 'Completed';
                    } else if (order.Status === 'Cancelled') {
                        bulkOrderStatus = 'Cancelled';
                    } else {
                        // For any other status, default to Processing
                        bulkOrderStatus = 'Processing';
                    }

                    // Only update if status changed
                    if (bulkOrderStatus !== bulkOrder.Status) {
                        await pool.request()
                            .input('bulkOrderId', sql.Int, bulkOrder.BulkOrderID)
                            .input('status', sql.NVarChar, bulkOrderStatus)
                            .query('UPDATE BulkOrders SET Status = @status, UpdatedAt = GETDATE() WHERE BulkOrderID = @bulkOrderId');

                        console.log(`[BULK ORDER SYNC] Synced bulk order ${bulkOrder.BulkOrderID} from ${bulkOrder.Status} to ${bulkOrderStatus} based on order ${order.OrderID} status ${order.Status}`);
                        syncedCount++;
                    } else {
                        console.log(`[BULK ORDER SYNC] Bulk order ${bulkOrder.BulkOrderID} already has correct status ${bulkOrder.Status} (order ${order.OrderID} is ${order.Status})`);
                    }
                } else {
                    console.log(`[BULK ORDER SYNC] No matching order found for bulk order ${bulkOrder.BulkOrderID} (Customer: ${bulkOrder.CustomerID}, Amount: ${bulkOrder.GrandTotal})`);
                }
            }

            console.log(`[BULK ORDER SYNC] Synced ${syncedCount} bulk orders`);
            return syncedCount;
        } catch (err) {
            console.error('Error syncing bulk order statuses:', err);
            return 0;
        }
    }

    // =============================================================================
    // ARCHIVED ITEMS PAGE
    // =============================================================================

    router.get('/Employee/Admin/Archived', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            await ensureBomBundleSchema(pool);
            await ensureInventoryStockMovementSchema(pool);

            const [productsResult, materialsResult, inventoryProductsResult, variationsResult, bomBundlesResult, archivedStockMovements] = await Promise.all([
                pool.request().query(`
                    SELECT ProductID, Name, Description, Price, StockQuantity, Category, DateAdded, IsActive
                    FROM Products WHERE IsActive = 0 ORDER BY DateAdded DESC
                `),
                pool.request().query(`
                    SELECT MaterialID, Name, QuantityAvailable, Unit, LastUpdated, IsActive
                    FROM RawMaterials WHERE IsActive = 0 ORDER BY LastUpdated DESC
                `),
                pool.request().query(`
                    SELECT
                        ip.InventoryProductID, ip.Name, ip.Category, ip.Price, ip.SKU,
                        COALESCE(vimg.VariationImageURL, NULLIF(ip.ImageURL, '')) as ImageURL,
                        ip.DateAdded,
                        (COALESCE(ip.AvailableQuantity, 0) + COALESCE(ip.DamagedQuantity, 0)) as TotalQuantity,
                        COALESCE(ip.AvailableQuantity, 0) as AvailableQuantity,
                        CASE
                            WHEN COALESCE(ip.AvailableQuantity, 0) > 0 THEN 'available'
                            WHEN COALESCE(ip.RepairedQuantity, 0) > 0 THEN 'repaired'
                            WHEN COALESCE(ip.DamagedQuantity, 0) > 0 THEN 'damaged'
                            WHEN COALESCE(ip.ReturnedQuantity, 0) > 0 THEN 'returned'
                            WHEN COALESCE(ip.DisposedQuantity, 0) > 0 THEN 'disposed'
                            ELSE COALESCE(ip.InventoryStatus, 'no_stock')
                        END as InventoryStatus,
                        ip.IsActive
                    FROM InventoryProducts ip
                    OUTER APPLY (
                        SELECT TOP 1 ipv.VariationImageURL
                        FROM InventoryProductVariations ipv
                        WHERE ipv.InventoryProductID = ip.InventoryProductID
                        ORDER BY ipv.VariationID
                    ) vimg
                    WHERE ip.IsActive = 0
                    ORDER BY ip.DateAdded DESC
                `),
                pool.request().query(`
                    SELECT
                        v.VariationID, v.InventoryProductID, v.VariationName, v.SKU, v.Color, v.Quantity,
                        COALESCE(v.AvailableQuantity, v.Quantity, 0) as AvailableQuantity,
                        COALESCE(v.DamagedQuantity, 0) as DamagedQuantity,
                        COALESCE(v.ReturnedQuantity, 0) as ReturnedQuantity,
                        COALESCE(v.RepairedQuantity, 0) as RepairedQuantity,
                        COALESCE(v.DisposedQuantity, 0) as DisposedQuantity,
                        v.Price, v.VariationImageURL, v.CreatedAt, v.UpdatedAt,
                        ip.Name as ProductName
                    FROM InventoryProductVariations v
                    LEFT JOIN InventoryProducts ip ON v.InventoryProductID = ip.InventoryProductID
                    WHERE v.IsActive = 0
                    ORDER BY v.UpdatedAt DESC, v.CreatedAt DESC
                `),
                loadArchivedBomBundles(pool),
                fetchArchivedStockMovements(pool, 300)
            ]);

            res.render('Employee/Admin/AdminArchived', {
                user: req.session.user,
                archivedProducts: productsResult.recordset,
                archivedMaterials: materialsResult.recordset,
                archivedCategories: [],
                archivedInventoryProducts: inventoryProductsResult.recordset,
                archivedVariations: variationsResult.recordset,
                archivedBomBundles: bomBundlesResult || [],
                archivedStockMovements: archivedStockMovements || []
            });
        } catch (err) {
            console.error('Error fetching archived items:', err);
            console.error('Error details:', err.message);
            console.error('Error stack:', err.stack);
            req.flash('error', 'Could not fetch archived items: ' + err.message);
            res.render('Employee/Admin/AdminArchived', {
                user: req.session.user,
                archivedProducts: [],
                archivedMaterials: [],
                archivedCategories: [],
                archivedInventoryProducts: [],
                archivedVariations: [],
                archivedBomBundles: [],
                archivedStockMovements: [],
                error: err.message
            });
        }
    });

    // =============================================================================
    // BULK ORDERS PAGE
    // =============================================================================

    router.get('/Employee/Admin/BulkOrders', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            // Sync bulk order statuses with their converted orders
            await syncAllBulkOrderStatuses();

            // Log total bulk orders count for debugging
            const countResult = await pool.request().query('SELECT COUNT(*) as total FROM BulkOrders');
            const totalBulkOrders = countResult.recordset[0].total;
            console.log(`[BULK ORDERS PAGE] Total bulk orders in database: ${totalBulkOrders}`);

            // Fetch all bulk orders (no status filtering) with item counts
            const result = await pool.request().query(`
                SELECT 
                    bo.BulkOrderID,
                    bo.CustomerID,
                    bo.CustomerEmail,
                    bo.TotalQuantity,
                    bo.Subtotal,
                    bo.DiscountAmount,
                    bo.GrandTotal,
                    bo.Status,
                    bo.Notes,
                    bo.PickupDate,
                    bo.CreatedAt,
                    bo.UpdatedAt,
                    c.FullName as CustomerFullName,
                    COUNT(boi.BulkOrderItemID) as ItemsCount
                FROM BulkOrders bo
                LEFT JOIN Customers c ON bo.CustomerID = c.CustomerID
                LEFT JOIN BulkOrderItems boi ON bo.BulkOrderID = boi.BulkOrderID
                GROUP BY bo.BulkOrderID, bo.CustomerID, bo.CustomerEmail, bo.TotalQuantity, 
                         bo.Subtotal, bo.DiscountAmount, bo.GrandTotal, bo.Status, 
                         bo.Notes, bo.PickupDate, bo.CreatedAt, bo.UpdatedAt, c.FullName
                ORDER BY bo.CreatedAt DESC
            `);

            const bulkOrders = result.recordset;
            console.log(`[BULK ORDERS PAGE] Fetched ${bulkOrders.length} bulk orders from database`);
            console.log(`[BULK ORDERS PAGE] Bulk order IDs:`, bulkOrders.map(bo => bo.BulkOrderID));

            // Log each bulk order for debugging
            bulkOrders.forEach((bo, index) => {
                console.log(`[BULK ORDERS PAGE] Bulk Order ${index + 1}:`, {
                    BulkOrderID: bo.BulkOrderID,
                    CustomerID: bo.CustomerID,
                    CustomerEmail: bo.CustomerEmail,
                    Status: bo.Status,
                    ItemsCount: bo.ItemsCount,
                    CreatedAt: bo.CreatedAt
                });
            });

            res.render('Employee/Admin/AdminBulkOrders', { user: req.session.user, bulkOrders });
        } catch (err) {
            console.error('[BULK ORDERS PAGE] Error fetching bulk orders:', err);
            console.error('[BULK ORDERS PAGE] Error stack:', err.stack);
            req.flash('error', 'Could not fetch bulk orders.');
            res.render('Employee/Admin/AdminBulkOrders', { user: req.session.user, bulkOrders: [] });
        }
    });

    // =============================================================================
    // BULK ORDERS API ENDPOINTS
    // =============================================================================

    // API endpoint to get all bulk orders (for debugging)
    router.get('/api/admin/bulk-orders/debug', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            // Get total count
            const countResult = await pool.request().query('SELECT COUNT(*) as total FROM BulkOrders');
            const totalBulkOrders = countResult.recordset[0].total;

            // Get all bulk orders with details
            const result = await pool.request().query(`
                SELECT 
                    bo.BulkOrderID,
                    bo.CustomerID,
                    bo.CustomerEmail,
                    bo.TotalQuantity,
                    bo.Subtotal,
                    bo.DiscountAmount,
                    bo.GrandTotal,
                    bo.Status,
                    bo.Notes,
                    bo.PickupDate,
                    bo.CreatedAt,
                    bo.UpdatedAt,
                    c.FullName as CustomerFullName,
                    COUNT(boi.BulkOrderItemID) as ItemsCount
                FROM BulkOrders bo
                LEFT JOIN Customers c ON bo.CustomerID = c.CustomerID
                LEFT JOIN BulkOrderItems boi ON bo.BulkOrderID = boi.BulkOrderID
                GROUP BY bo.BulkOrderID, bo.CustomerID, bo.CustomerEmail, bo.TotalQuantity, 
                         bo.Subtotal, bo.DiscountAmount, bo.GrandTotal, bo.Status, 
                         bo.Notes, bo.PickupDate, bo.CreatedAt, bo.UpdatedAt, c.FullName
                ORDER BY bo.CreatedAt DESC
            `);

            res.json({
                success: true,
                total: totalBulkOrders,
                bulkOrders: result.recordset,
                message: `Found ${totalBulkOrders} bulk orders in database`
            });
        } catch (err) {
            console.error('Error fetching bulk orders for debug:', err);
            res.status(500).json({
                success: false,
                error: err.message,
                message: 'Failed to fetch bulk orders'
            });
        }
    });

    // API endpoint to sync a specific bulk order status
    router.post('/api/admin/bulk-orders/:orderId/sync-status', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const bulkOrderId = parseInt(req.params.orderId);

            // Get bulk order
            const bulkOrderResult = await pool.request()
                .input('bulkOrderId', sql.Int, bulkOrderId)
                .query(`
                    SELECT BulkOrderID, CustomerID, GrandTotal, CreatedAt, Status
                    FROM BulkOrders
                    WHERE BulkOrderID = @bulkOrderId
                `);

            if (bulkOrderResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Bulk order not found' });
            }

            const bulkOrder = bulkOrderResult.recordset[0];

            // Find matching order
            const orderResult = await pool.request()
                .input('customerId', sql.Int, bulkOrder.CustomerID)
                .input('totalAmount', sql.Decimal(10, 2), bulkOrder.GrandTotal)
                .input('bulkOrderDate', sql.DateTime, bulkOrder.CreatedAt)
                .query(`
                    SELECT TOP 1 OrderID, Status, OrderDate, TotalAmount
                    FROM Orders
                    WHERE CustomerID = @customerId
                      AND ABS(TotalAmount - @totalAmount) < 0.01
                      AND OrderDate >= @bulkOrderDate
                      AND OrderDate <= DATEADD(DAY, 1, @bulkOrderDate)
                      AND DeliveryType = 'pickup'
                    ORDER BY OrderDate ASC
                `);

            if (orderResult.recordset.length === 0) {
                return res.json({
                    success: false,
                    message: 'No matching order found for this bulk order',
                    bulkOrderId: bulkOrderId,
                    bulkOrderStatus: bulkOrder.Status
                });
            }

            const order = orderResult.recordset[0];

            // Map order status to bulk order status
            let bulkOrderStatus = 'Processing';
            if (order.Status === 'Completed') {
                bulkOrderStatus = 'Completed';
            } else if (order.Status === 'Received') {
                bulkOrderStatus = 'Received';
            } else if (order.Status === 'Cancelled') {
                bulkOrderStatus = 'Cancelled';
            } else if (order.Status === 'Processing' || order.Status === 'Shipping' || order.Status === 'Delivery') {
                bulkOrderStatus = 'Processing';
            }

            // Update bulk order status
            if (bulkOrderStatus !== bulkOrder.Status) {
                await pool.request()
                    .input('bulkOrderId', sql.Int, bulkOrderId)
                    .input('status', sql.NVarChar, bulkOrderStatus)
                    .query('UPDATE BulkOrders SET Status = @status, UpdatedAt = GETDATE() WHERE BulkOrderID = @bulkOrderId');

                console.log(`[BULK ORDER SYNC] Manually synced bulk order ${bulkOrderId} from ${bulkOrder.Status} to ${bulkOrderStatus} based on order ${order.OrderID} status ${order.Status}`);

                return res.json({
                    success: true,
                    message: `Bulk order status updated from ${bulkOrder.Status} to ${bulkOrderStatus}`,
                    bulkOrderId: bulkOrderId,
                    oldStatus: bulkOrder.Status,
                    newStatus: bulkOrderStatus,
                    orderId: order.OrderID,
                    orderStatus: order.Status
                });
            } else {
                return res.json({
                    success: true,
                    message: 'Bulk order status is already correct',
                    bulkOrderId: bulkOrderId,
                    status: bulkOrder.Status,
                    orderId: order.OrderID,
                    orderStatus: order.Status
                });
            }
        } catch (err) {
            console.error('Error syncing bulk order status:', err);
            res.status(500).json({ success: false, message: 'Failed to sync bulk order status', error: err.message });
        }
    });

    // API endpoint to get bulk order details
    router.get('/api/admin/bulk-orders/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Check if BulkOrders has OrderID column first
            const columnCheckResult = await pool.request()
                .query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
                    AND name = 'OrderID'
                `);

            const hasOrderIDColumn = columnCheckResult.recordset[0].columnExists > 0;

            // Build query based on whether OrderID column exists
            let orderQuery = `
                SELECT 
                    bo.BulkOrderID,
                    bo.CustomerID,
                    bo.CustomerEmail,
                    bo.TotalQuantity,
                    bo.Subtotal,
                    bo.DiscountAmount,
                    bo.GrandTotal,
                    bo.Status,
                    bo.Notes,
                    bo.PickupDate,
                    bo.CreatedAt,
                    bo.UpdatedAt,
                    c.FullName as CustomerFullName
            `;

            if (hasOrderIDColumn) {
                orderQuery += `, bo.OrderID`;
            }

            orderQuery += `
                FROM BulkOrders bo
                LEFT JOIN Customers c ON bo.CustomerID = c.CustomerID
                WHERE bo.BulkOrderID = @orderId
            `;

            // Get order details with customer information
            const orderResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(orderQuery);

            if (orderResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            let itemsResult;
            if (hasOrderIDColumn && orderResult.recordset[0].OrderID) {
                // Fetch items from OrderItems table via OrderID
                console.log('[BULK ORDER DETAILS] Fetching items from OrderItems for OrderID:', orderResult.recordset[0].OrderID);
                itemsResult = await pool.request()
                    .input('orderId', sql.Int, orderResult.recordset[0].OrderID)
                    .query(`
                        SELECT 
                            oi.OrderItemID,
                            oi.ProductID,
                            oi.Name as ProductName,
                            oi.Quantity,
                            oi.PriceAtPurchase as UnitPrice,
                            ISNULL(p.SKU, 'N/A') as SKU,
                            p.Name as ProductNameFromProducts
                        FROM OrderItems oi
                        LEFT JOIN Products p ON oi.ProductID = p.ProductID
                        WHERE oi.OrderID = @orderId
                        ORDER BY oi.OrderItemID
                    `);
                console.log('[BULK ORDER DETAILS] Found', itemsResult.recordset.length, 'items in OrderItems');
            } else {
                // Fallback: Try to get items from BulkOrderItems table if it exists
                console.log('[BULK ORDER DETAILS] OrderID column not found or OrderID is null, trying BulkOrderItems table');
                try {
                    itemsResult = await pool.request()
                        .input('bulkOrderId', sql.Int, orderId)
                        .query(`
                            SELECT 
                                boi.BulkOrderItemID as OrderItemID,
                                boi.ProductID,
                                ISNULL(boi.ProductName, p.Name) as ProductName,
                                boi.Quantity,
                                boi.UnitPrice,
                                ISNULL(p.SKU, 'N/A') as SKU
                            FROM BulkOrderItems boi
                            LEFT JOIN Products p ON boi.ProductID = p.ProductID
                            WHERE boi.BulkOrderID = @bulkOrderId
                            ORDER BY boi.BulkOrderItemID
                        `);
                    console.log('[BULK ORDER DETAILS] Found', itemsResult.recordset.length, 'items in BulkOrderItems');
                } catch (err) {
                    // If BulkOrderItems table doesn't exist, return empty array
                    console.log('[BULK ORDER DETAILS] BulkOrderItems table not found, using empty items array. Error:', err.message);
                    itemsResult = { recordset: [] };
                }
            }

            // Map items to ensure consistent field names
            const items = itemsResult.recordset.map(item => {
                const productName = item.ProductName || item.ProductNameFromProducts || 'N/A';
                const sku = item.SKU || 'N/A';
                console.log('[BULK ORDER DETAILS] Mapped item:', { ProductID: item.ProductID, ProductName: productName, SKU: sku, Quantity: item.Quantity });
                return {
                    OrderItemID: item.OrderItemID,
                    ProductID: item.ProductID,
                    ProductName: productName,
                    SKU: sku,
                    Quantity: item.Quantity || 0,
                    UnitPrice: item.UnitPrice || 0
                };
            });

            res.json({
                success: true,
                order: orderResult.recordset[0],
                items: items
            });
        } catch (err) {
            console.error('Error fetching bulk order details:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch order details' });
        }
    });

    // =============================================================================
    // REACTIVATION ROUTES
    // =============================================================================

    // Reactivate archived product
    router.post('/Employee/Admin/Archived/ReactivateProduct/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const productId = req.params.id;

            // First check if product exists and is archived
            const checkResult = await pool.request()
                .input('id', sql.Int, productId)
                .query('SELECT ProductID, Name, IsActive FROM Products WHERE ProductID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Product not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const product = checkResult.recordset[0];
            if (product.IsActive === 1) {
                req.flash('error', 'Product is already active.');
                return res.redirect('/Employee/Admin/Archived');
            }

            // Reactivate the product (set IsActive = 1)
            await pool.request()
                .input('id', sql.Int, productId)
                .query('UPDATE Products SET IsActive = 1 WHERE ProductID = @id');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Products',
                productId.toString(),
                `Admin reactivated product: "${product.Name}" (ID: ${productId})`,
                JSON.stringify({ IsActive: { old: 0, new: 1 } })
            );

            req.flash('success', `Product "${product.Name}" has been reactivated and is now available on the Products page.`);
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating product:', err);
            req.flash('error', 'Failed to reactivate product. Please try again.');
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived product variation
    router.post('/Employee/Admin/Archived/ReactivateVariation/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const variationID = parseInt(req.params.id);

            // Check if variation exists
            const variationResult = await pool.request()
                .input('variationID', sql.Int, variationID)
                .query(`
                    SELECT VariationID, VariationName
                    FROM InventoryProductVariations
                    WHERE VariationID = @variationID
                `);

            if (variationResult.recordset.length === 0) {
                req.flash('error', 'Variation not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            // Reactivate variation (set IsActive = 1)
            await pool.request()
                .input('variationID', sql.Int, variationID)
                .query(`
                    UPDATE InventoryProductVariations
                    SET IsActive = 1, UpdatedAt = GETDATE()
                    WHERE VariationID = @variationID
                `);

            req.flash('success', 'Variation reactivated successfully.');
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating variation:', err);
            req.flash('error', 'Failed to reactivate variation: ' + err.message);
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived raw material
    router.post('/Employee/Admin/Archived/ReactivateMaterial/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const materialId = req.params.id;

            // First check if material exists and is archived
            const checkResult = await pool.request()
                .input('id', sql.Int, materialId)
                .query('SELECT MaterialID, Name, IsActive FROM RawMaterials WHERE MaterialID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Raw material not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const material = checkResult.recordset[0];
            if (material.IsActive === 1) {
                req.flash('error', 'Raw material is already active.');
                return res.redirect('/Employee/Admin/Archived');
            }

            // Reactivate the raw material (set IsActive = 1)
            await pool.request()
                .input('id', sql.Int, materialId)
                .query('UPDATE RawMaterials SET IsActive = 1 WHERE MaterialID = @id');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'RawMaterials',
                materialId.toString(),
                `Admin reactivated raw material: "${material.Name}" (ID: ${materialId})`,
                JSON.stringify({ IsActive: { old: 0, new: 1 } })
            );

            req.flash('success', `Raw material "${material.Name}" has been reactivated and is now available on the Raw Materials page.`);
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating raw material:', err);
            req.flash('error', 'Failed to reactivate raw material. Please try again.');
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived BOM bundle
    router.post('/Employee/Admin/Archived/ReactivateBomBundle/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureBomBundleSchema(pool);

            const bundleId = parseInt(req.params.id, 10);
            if (!bundleId) {
                req.flash('error', 'Invalid raw materials bundle ID.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const checkResult = await pool.request()
                .input('id', sql.Int, bundleId)
                .query('SELECT BomBundleID, Name, IsActive FROM BomBundles WHERE BomBundleID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Raw materials bundle not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const bundle = checkResult.recordset[0];
            if (bundle.IsActive === 1) {
                req.flash('error', 'Raw materials bundle is already active.');
                return res.redirect('/Employee/Admin/Archived');
            }

            await pool.request()
                .input('id', sql.Int, bundleId)
                .input('userId', sql.Int, req.session.user?.id || null)
                .query(`
                    UPDATE BomBundles
                    SET IsActive = 1, UpdatedBy = @userId, DateUpdated = GETDATE()
                    WHERE BomBundleID = @id
                `);

            invalidateAdminPageCache('admin:');
            req.flash('success', `Raw materials bundle "${bundle.Name}" has been reactivated.`);
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating BOM bundle:', err);
            req.flash('error', 'Failed to reactivate raw materials bundle. Please try again.');
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived stock movement
    router.post('/Employee/Admin/Archived/ReactivateStockMovement/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const movementId = parseInt(req.params.id, 10);
            const result = await reactivateStockMovement(pool, movementId);
            if (!result.ok) {
                req.flash('error', result.message || 'Failed to restore stock movement.');
                return res.redirect('/Employee/Admin/Archived');
            }
            invalidateAdminPageCache('admin:');
            req.flash('success', 'Stock movement restored to history.');
            res.redirect('/Employee/Admin/Archived?reactivated=1');
        } catch (err) {
            console.error('Error reactivating stock movement:', err);
            req.flash('error', 'Failed to restore stock movement.');
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived inventory product
    router.post('/Employee/Admin/Archived/ReactivateInventoryProduct/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const inventoryProductId = req.params.id;

            // First check if product exists and is archived
            const checkResult = await pool.request()
                .input('id', sql.Int, inventoryProductId)
                .query('SELECT InventoryProductID, Name, IsActive FROM InventoryProducts WHERE InventoryProductID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Product not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const product = checkResult.recordset[0];
            if (product.IsActive === 1) {
                req.flash('error', 'Product is already active.');
                return res.redirect('/Employee/Admin/Archived');
            }

            // Reactivate the product
            await pool.request()
                .input('id', sql.Int, inventoryProductId)
                .query('UPDATE InventoryProducts SET IsActive = 1 WHERE InventoryProductID = @id');

            req.flash('success', `Product "${product.Name}" has been reactivated.`);
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating inventory product:', err);
            req.flash('error', 'Failed to reactivate product: ' + err.message);
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // Reactivate archived category
    router.post('/Employee/Admin/Archived/ReactivateCategory/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const categoryId = req.params.id;

            // First check if category exists and is archived
            const checkResult = await pool.request()
                .input('id', sql.Int, categoryId)
                .query('SELECT CategoryID, CategoryName, IsActive FROM Categories WHERE CategoryID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Category not found.');
                return res.redirect('/Employee/Admin/Archived');
            }

            const category = checkResult.recordset[0];
            if (category.IsActive === 1) {
                req.flash('error', 'Category is already active.');
                return res.redirect('/Employee/Admin/Archived');
            }

            // Reactivate the category (set IsActive = 1)
            await pool.request()
                .input('id', sql.Int, categoryId)
                .query('UPDATE Categories SET IsActive = 1 WHERE CategoryID = @id');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Categories',
                categoryId.toString(),
                `Admin reactivated category "${category.CategoryName}" (ID: ${categoryId})`,
                JSON.stringify({ IsActive: { old: 0, new: 1 } })
            );

            req.flash('success', `Category "${category.CategoryName}" has been reactivated and is now available.`);
            res.redirect('/Employee/Admin/Archived');
        } catch (err) {
            console.error('Error reactivating category:', err);
            req.flash('error', 'Failed to reactivate category. Please try again.');
            res.redirect('/Employee/Admin/Archived');
        }
    });

    // =============================================================================
    // REVIEWS ROUTE
    // =============================================================================

    // Admin Reviews page - displays product reviews and testimonials
    router.get('/Employee/Admin/Reviews', isAuthenticated, (req, res) => {
        res.render('Employee/Admin/AdminReviews', { user: req.session.user });
    });
};
