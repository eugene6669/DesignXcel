'use strict';

/**
 * Extracted from routes.js lines 3947-4370.
 */
module.exports = function registerOrderSupportOrderRoutes(router, ctx) {
    const {
        pool,
        sql,
        isAuthenticated,
        logActivity,
        decrementStockFromInventory,
        refundGatewayForPendingCancel,
        refundGatewayForAdminFulfilmentStageCancel,
        sendgridHelper
    } = ctx;


    // =============================================================================
    // ORDER SUPPORT ORDER PROCESSING ROUTES
    // =============================================================================

    // Order Support OrdersPending: Proceed to Processing
    router.post('/Employee/OrderSupport/OrderOrdersPending/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            let skipInventoryDecrementLegacy = false;
            try {
                const { orderHasInventoryStockReserved } = require('./utils/storefrontStockReserve');
                skipInventoryDecrementLegacy = await orderHasInventoryStockReserved(pool, orderId);
            } catch (e) { /* ignore */ }

            for (const item of orderItemsResult.recordset) {
                try {
                    if (skipInventoryDecrementLegacy) continue;
                    const variationId = item.VariationID ? parseInt(item.VariationID, 10) : null;
                    await decrementStockFromInventory(item.ProductID, item.Quantity, variationId, null);
                } catch (stockErr) {
                    console.error(`[ORDER SUPPORT ORDER PROCESSING] Stock decrement error:`, stockErr.message);
                }
            }

            try {
                const { finalizeStorefrontDisplayForProcessingOrder } = require('./utils/storefrontStockReserve');
                await finalizeStorefrontDisplayForProcessingOrder(pool, orderId);
            } catch (displayErr) {
                console.error(`[ORDER SUPPORT ORDER PROCESSING] Storefront display finalize:`, displayErr.message);
            }

            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Processing' WHERE OrderID = @orderId`);

            await updateBulkOrderStatus(orderId, 'Processing').catch((e) => console.error('[BULK ORDER UPDATE]', e));

            // Log the activity
            await logActivity(
                req.session.user.id,
                'STATUS_CHANGE',
                'Orders',
                orderId.toString(),
                `Order #${orderId} status changed to Processing by Order Support`,
                JSON.stringify({ oldStatus: 'Pending', newStatus: 'Processing' })
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Order Support OrdersPending: Cancel order
    router.post('/Employee/OrderSupport/OrderOrdersPending/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            try {
                await refundGatewayForPendingCancel(orderId, '[OS-PENDING-CANCEL-REFUND]');
            } catch (refundErr) {
                console.error('[ORDER SUPPORT ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            try {
                const { restoreStorefrontDisplayStockForOrder } = require('./utils/storefrontStockReserve');
                await restoreStorefrontDisplayStockForOrder(pool, orderId);
            } catch (restoreDisplayErr) {
                console.error('[ORDER SUPPORT ORDER CANCELLATION] Restore display stock:', restoreDisplayErr.message);
            }

            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Pending'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Pending status.' });
            }

            await updateBulkOrderStatus(orderId, 'Cancelled').catch((e) => console.error('[BULK ORDER UPDATE]', e));

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });
    // Order Support OrdersProcessing: Proceed to Next Status (To Receive for pickup, Shipping for delivery)
    router.post('/Employee/OrderSupport/OrderOrdersProcessing/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Get order DeliveryType
            const orderResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`SELECT DeliveryType FROM Orders WHERE OrderID = @orderId`);

            if (orderResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Order not found.' });
            }

            const deliveryType = orderResult.recordset[0].DeliveryType;
            let nextStatus;
            let logMessage;

            // Determine next status based on delivery type
            if (deliveryType === 'pickup') {
                nextStatus = 'Received';
                logMessage = `Order #${orderId} status changed to Received by Order Support (Pickup order)`;
            } else {
                // For delivery orders (delivery or rate_*)
                nextStatus = 'Shipping';
                logMessage = `Order #${orderId} status changed to Shipping by Order Support (Delivery order)`;
            }

            // Update order status
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('status', sql.NVarChar, nextStatus)
                .query(`UPDATE Orders SET Status = @status WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'STATUS_CHANGE',
                'Orders',
                orderId.toString(),
                logMessage,
                JSON.stringify({ oldStatus: 'Processing', newStatus: nextStatus })
            );

            res.json({ success: true, nextStatus: nextStatus });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Order Support OrdersProcessing: Cancel order
    router.post('/Employee/OrderSupport/OrderOrdersProcessing/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            // Restore stock for each item (cancelled orders should NOT add to ReturnedQuantity)
            for (const item of orderItemsResult.recordset) {
                if (item.VariationID) {
                    // Update variation stock
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE ProductVariations SET StockQuantity = StockQuantity + @quantity WHERE VariationID = @variationID`);

                    // Also update InventoryProductVariations available quantity if linked (NOT ReturnedQuantity)
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProductVariations 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                UpdatedAt = GETDATE()
                            WHERE VariationID = @variationID
                        `);
                } else {
                    // Update Products table stock
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE Products SET StockQuantity = StockQuantity + @quantity WHERE ProductID = @productId`);

                    // Update InventoryProducts available quantity if linked (NOT ReturnedQuantity)
                    // Check if product is linked to InventoryProducts via ProductID or InventoryProductID
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProducts 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                DateUpdated = GETDATE()
                            WHERE ProductID = @productId OR InventoryProductID = @productId
                        `);
                }
            }

            // Update order status to cancelled
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId`);

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Order Support OrdersShipping: Proceed to Delivery
    router.post('/Employee/OrderSupport/OrderOrdersShipping/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Delivery' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'STATUS_CHANGE',
                'Orders',
                orderId.toString(),
                `Order #${orderId} status changed to Delivery by Order Support`,
                JSON.stringify({ oldStatus: 'Shipping', newStatus: 'Delivery' })
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Order Support OrdersShipping: Cancel order
    router.post('/Employee/OrderSupport/OrderOrdersShipping/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            // Restore stock for each item (cancelled orders should NOT add to ReturnedQuantity)
            for (const item of orderItemsResult.recordset) {
                if (item.VariationID) {
                    // Update variation stock
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE ProductVariations SET StockQuantity = StockQuantity + @quantity WHERE VariationID = @variationID`);

                    // Also update InventoryProductVariations available quantity if linked (NOT ReturnedQuantity)
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProductVariations 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                UpdatedAt = GETDATE()
                            WHERE VariationID = @variationID
                        `);
                } else {
                    // Update Products table stock
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE Products SET StockQuantity = StockQuantity + @quantity WHERE ProductID = @productId`);

                    // Update InventoryProducts available quantity if linked (NOT ReturnedQuantity)
                    // Check if product is linked to InventoryProducts via ProductID or InventoryProductID
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProducts 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                DateUpdated = GETDATE()
                            WHERE ProductID = @productId OR InventoryProductID = @productId
                        `);
                }
            }

            // Update order status to cancelled
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId`);

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Order Support OrdersDelivery: Proceed to Received
    router.post('/Employee/OrderSupport/OrderOrdersDelivery/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Received' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'STATUS_CHANGE',
                'Orders',
                orderId.toString(),
                `Order #${orderId} status changed to Received by Order Support`,
                JSON.stringify({ oldStatus: 'Delivery', newStatus: 'Received' })
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Order Support OrdersDelivery: Cancel order
    router.post('/Employee/OrderSupport/OrderOrdersDelivery/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            // Restore stock for each item (cancelled orders should NOT add to ReturnedQuantity)
            for (const item of orderItemsResult.recordset) {
                if (item.VariationID) {
                    // Update variation stock
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE ProductVariations SET StockQuantity = StockQuantity + @quantity WHERE VariationID = @variationID`);

                    // Also update InventoryProductVariations available quantity if linked (NOT ReturnedQuantity)
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProductVariations 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                UpdatedAt = GETDATE()
                            WHERE VariationID = @variationID
                        `);
                } else {
                    // Update Products table stock
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE Products SET StockQuantity = StockQuantity + @quantity WHERE ProductID = @productId`);

                    // Update InventoryProducts available quantity if linked (NOT ReturnedQuantity)
                    // Check if product is linked to InventoryProducts via ProductID or InventoryProductID
                    await pool.request()
                        .input('productId', sql.Int, item.ProductID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`
                            UPDATE InventoryProducts 
                            SET AvailableQuantity = AvailableQuantity + @quantity,
                                DateUpdated = GETDATE()
                            WHERE ProductID = @productId OR InventoryProductID = @productId
                        `);
                }
            }

            // Update order status to cancelled
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId`);

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Order Support OrdersReceive: Proceed to Completed
    router.post('/Employee/OrderSupport/OrderOrdersReceive/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Completed' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'COMPLETE',
                'Orders',
                orderId.toString(),
                `Order #${orderId} completed by Order Support`,
                JSON.stringify({ oldStatus: 'Received', newStatus: 'Completed' })
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

};
