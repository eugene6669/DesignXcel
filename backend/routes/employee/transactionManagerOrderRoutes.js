'use strict';

/**
 * Extracted from routes.js lines 2849-3423.
 */
module.exports = function registerTransactionManagerOrderRoutes(router, ctx) {
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
    // TRANSACTION MANAGER ORDER PROCESSING ROUTES
    // =============================================================================

    // Transaction Manager OrdersPending: Proceed to Processing
    router.post('/Employee/TransactionManager/TransactionOrdersPending/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            console.log(`[TRANSACTION MANAGER ORDER PROCESSING] ====== Processing Order ${orderId} ======`);

            // Get order items to decrease stock when status changes to Processing
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            console.log(`[TRANSACTION MANAGER ORDER PROCESSING] Found ${orderItemsResult.recordset.length} order items`);

            let skipInventoryDecrementLegacy = false;
            try {
                const { orderHasInventoryStockReserved } = require('./utils/storefrontStockReserve');
                skipInventoryDecrementLegacy = await orderHasInventoryStockReserved(pool, orderId);
            } catch (e) { /* ignore */ }

            for (const item of orderItemsResult.recordset) {
                try {
                    if (skipInventoryDecrementLegacy) continue;
                    console.log(`[TRANSACTION MANAGER ORDER PROCESSING] Decrementing stock for ProductID: ${item.ProductID}, Quantity: ${item.Quantity}, VariationID: ${item.VariationID || 'none'}`);
                    await decrementStockFromInventory(item.ProductID, item.Quantity, item.VariationID || null, null);
                    console.log(`[TRANSACTION MANAGER ORDER PROCESSING] ✅ Successfully decremented stock for ProductID: ${item.ProductID}`);
                } catch (stockErr) {
                    console.error(`[TRANSACTION MANAGER ORDER PROCESSING] ❌ Error decrementing stock for ProductID ${item.ProductID}:`, stockErr);
                    // Continue processing other items even if one fails
                }
            }

            try {
                const { finalizeStorefrontDisplayForProcessingOrder } = require('./utils/storefrontStockReserve');
                const displayResult = await finalizeStorefrontDisplayForProcessingOrder(pool, orderId);
                console.log(`[TRANSACTION MANAGER ORDER PROCESSING] Storefront display stock:`, displayResult);
            } catch (displayErr) {
                console.error(`[TRANSACTION MANAGER ORDER PROCESSING] Storefront display finalize error:`, displayErr.message);
            }

            // Update order status to Processing
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Processing' WHERE OrderID = @orderId`);

            console.log(`[TRANSACTION MANAGER ORDER PROCESSING] ✅ Order ${orderId} status updated to Processing`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Orders',
                orderId,
                `Order #${orderId} status changed to Processing by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            console.error(`[TRANSACTION MANAGER ORDER PROCESSING] ❌ Error processing order ${req.params.orderId}:`, err);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Transaction Manager OrdersPending: Cancel order
    router.post('/Employee/TransactionManager/TransactionOrdersPending/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            try {
                await refundGatewayForPendingCancel(orderId, '[TM-PENDING-CANCEL-REFUND]');
            } catch (refundErr) {
                console.error('[TRANSACTION MANAGER ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            try {
                const { restoreStorefrontDisplayStockForOrder } = require('./utils/storefrontStockReserve');
                await restoreStorefrontDisplayStockForOrder(pool, orderId);
            } catch (restoreDisplayErr) {
                console.error('[TRANSACTION MANAGER ORDER CANCELLATION] Restore display stock:', restoreDisplayErr.message);
            }

            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Pending'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Pending status.' });
            }

            await updateBulkOrderStatus(orderId, 'Cancelled').catch((e) => console.error('[BULK ORDER UPDATE]', e));

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });
    // Transaction Manager OrdersProcessing: Proceed to Next Status (To Receive for pickup, Shipping for delivery)
    router.post('/Employee/TransactionManager/TransactionOrdersProcessing/Proceed/:orderId', isAuthenticated, async (req, res) => {
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
                logMessage = `Order #${orderId} status changed to Received by Transaction Manager (Pickup order)`;
            } else {
                // For delivery orders (delivery or rate_*)
                nextStatus = 'Shipping';
                logMessage = `Order #${orderId} status changed to Shipping by Transaction Manager (Delivery order)`;
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
                orderId,
                logMessage,
                JSON.stringify({ oldStatus: 'Processing', newStatus: nextStatus })
            );

            res.json({ success: true, nextStatus: nextStatus });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Transaction Manager OrdersProcessing: Cancel order
    router.post('/Employee/TransactionManager/TransactionOrdersProcessing/Cancel/:orderId', isAuthenticated, async (req, res) => {
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

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Transaction Manager OrdersShipping: Proceed to Delivery
    router.post('/Employee/TransactionManager/TransactionOrdersShipping/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Fetch order and customer details before updating status
            const orderDetailsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        o.OrderID,
                        o.ReferenceNumber,
                        o.TotalAmount,
                        c.Email,
                        c.FullName
                    FROM Orders o
                    INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                    WHERE o.OrderID = @orderId
                `);

            if (orderDetailsResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Order not found.' });
            }

            const orderDetails = orderDetailsResult.recordset[0];

            // Update order status
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Delivery' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Orders',
                orderId,
                `Order #${orderId} status changed to Delivery by Transaction Manager`
            );

            // Send email notification (non-blocking - don't fail if email fails)
            console.log('[ORDER STATUS UPDATE] Attempting to send out for delivery email...');
            console.log('[ORDER STATUS UPDATE] Customer Email:', orderDetails.Email);
            console.log('[ORDER STATUS UPDATE] Customer Name:', orderDetails.FullName);
            console.log('[ORDER STATUS UPDATE] Order Details:', {
                orderId: orderDetails.OrderID,
                referenceNumber: orderDetails.ReferenceNumber,
                totalAmount: parseFloat(orderDetails.TotalAmount) || 0
            });

            if (orderDetails.Email) {
                try {
                    const emailResult = await sendgridHelper.sendOrderOutForDeliveryEmail(
                        orderDetails.Email,
                        orderDetails.FullName || 'Valued Customer',
                        {
                            orderId: orderDetails.OrderID,
                            referenceNumber: orderDetails.ReferenceNumber,
                            totalAmount: parseFloat(orderDetails.TotalAmount) || 0
                        }
                    );
                    console.log('[ORDER STATUS UPDATE] Email result:', emailResult);
                } catch (emailError) {
                    console.error('[ORDER STATUS UPDATE] Failed to send order out for delivery email:', emailError);
                    console.error('[ORDER STATUS UPDATE] Error stack:', emailError.stack);
                    // Don't fail the request if email fails
                }
            } else {
                console.warn('[ORDER STATUS UPDATE] No customer email found, skipping email notification');
            }

            res.json({ success: true });
        } catch (err) {
            console.error('Error updating order status to Delivery:', err);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Transaction Manager OrdersShipping: Cancel order
    router.post('/Employee/TransactionManager/TransactionOrdersShipping/Cancel/:orderId', isAuthenticated, async (req, res) => {
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

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Transaction Manager OrdersDelivery: Proceed to Received
    router.post('/Employee/TransactionManager/TransactionOrdersDelivery/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Fetch order and customer details before updating status
            const orderDetailsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        o.OrderID,
                        o.ReferenceNumber,
                        o.TotalAmount,
                        c.Email,
                        c.FullName
                    FROM Orders o
                    INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                    WHERE o.OrderID = @orderId
                `);

            if (orderDetailsResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Order not found.' });
            }

            const orderDetails = orderDetailsResult.recordset[0];

            // Update order status
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Received' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Orders',
                orderId,
                `Order #${orderId} status changed to Received by Transaction Manager`
            );

            // Send email notification (non-blocking - don't fail if email fails)
            console.log('[ORDER STATUS UPDATE] Attempting to send order received email...');
            console.log('[ORDER STATUS UPDATE] Customer Email:', orderDetails.Email);
            console.log('[ORDER STATUS UPDATE] Customer Name:', orderDetails.FullName);
            console.log('[ORDER STATUS UPDATE] Order Details:', {
                orderId: orderDetails.OrderID,
                referenceNumber: orderDetails.ReferenceNumber,
                totalAmount: parseFloat(orderDetails.TotalAmount) || 0
            });

            if (orderDetails.Email) {
                try {
                    const emailResult = await sendgridHelper.sendOrderReceivedEmail(
                        orderDetails.Email,
                        orderDetails.FullName || 'Valued Customer',
                        {
                            orderId: orderDetails.OrderID,
                            referenceNumber: orderDetails.ReferenceNumber,
                            totalAmount: parseFloat(orderDetails.TotalAmount) || 0
                        }
                    );
                    console.log('[ORDER STATUS UPDATE] Email result:', emailResult);
                } catch (emailError) {
                    console.error('[ORDER STATUS UPDATE] Failed to send order received email:', emailError);
                    console.error('[ORDER STATUS UPDATE] Error stack:', emailError.stack);
                    // Don't fail the request if email fails
                }
            } else {
                console.warn('[ORDER STATUS UPDATE] No customer email found, skipping email notification');
            }

            res.json({ success: true });
        } catch (err) {
            console.error('Error updating order status to Received:', err);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Transaction Manager OrdersDelivery: Cancel order
    router.post('/Employee/TransactionManager/TransactionOrdersDelivery/Cancel/:orderId', isAuthenticated, async (req, res) => {
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

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Transaction Manager OrdersReceive: Proceed to Completed
    router.post('/Employee/TransactionManager/TransactionOrdersReceive/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Completed' WHERE OrderID = @orderId`);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Orders',
                orderId,
                `Order #${orderId} completed by Transaction Manager`
            );

            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });
};
