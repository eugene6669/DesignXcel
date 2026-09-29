'use strict';

/**
 * Admin Orders Routes
 * Handles: Orders (main page with tabs), ReturnedOrders, and all order status transitions (Proceed/Cancel)
 */

module.exports = function registerAdminOrdersRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        logActivity,
        updateBulkOrderStatus,
        decrementStockFromInventory,
        incrementStockToInventory,
        sendgridHelper,
        calculateEstimatedDeliveryDate,
        refundGatewayForPendingCancel,
        refundGatewayForAdminFulfilmentStageCancel
    } = context;

    // =============================================================================
    // CONFIGURATION
    // =============================================================================

    const adminOrdersTabRoutes = [
        { tab: 'pending', route: 'OrdersPending', status: 'Pending' },
        { tab: 'processing', route: 'OrdersProcessing', status: 'Processing' },
        { tab: 'shipping', route: 'OrdersShipping', status: 'Shipping' },
        { tab: 'delivery', route: 'OrdersDelivery', status: 'Delivery' },
        { tab: 'receive', route: 'OrdersReceive', status: 'Received' },
        { tab: 'cancelled', route: 'CancelledOrders', status: 'Cancelled' },
        { tab: 'completed', route: 'CompletedOrders', status: 'Completed' }
    ];

    const returnedOrdersConfig = {
        route: 'ReturnedOrders',
        status: 'Returned',
        includeStatuses: ['Return', 'Returned', 'Processing (Pickup)', 'Awaiting Inspection', 'Inspection Complete', 'Pickup Received', 'Declined', 'Completed Returned', 'Refunded']
    };

    // =============================================================================
    // HELPER FUNCTIONS
    // =============================================================================

    async function fetchAndRenderAdminOrders(req, res, { route, status, includeStatuses, extraWhere, tab }) {
        try {
            await pool.connect();

            const { 
                getOrdersSchemaFlags,
                attachOrderItemsBatch 
            } = require('../../utils/adminQueryHelpers');
            const returnedOrderDisplay = require('../../utils/returnedOrderDisplay');
            const { dedupeDoubledTransactionId, paymentMethodDisplayForOrder, isStripeCheckoutSessionId } = require('../../utils/orderDisplayHelpers');
            const getStripe = context.getStripe;

            // Get pagination parameters
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;

            // Build status filter - use includeStatuses if provided, otherwise use single status
            let statusFilter = '';
            const statusRequest = pool.request();

            const extraFilter = extraWhere || '';

            if (includeStatuses && Array.isArray(includeStatuses)) {
                const statusParams = includeStatuses.map((s, idx) => `@status${idx}`).join(', ');
                statusFilter = `WHERE o.Status IN (${statusParams})${extraFilter}`;
                includeStatuses.forEach((s, idx) => {
                    statusRequest.input(`status${idx}`, sql.NVarChar, s);
                });
            } else {
                statusFilter = `WHERE o.Status = @status${extraFilter}`;
                statusRequest.input('status', sql.NVarChar, status);
            }

            // First, get total count for pagination
            const countQuery = `
                SELECT COUNT(DISTINCT o.OrderID) as total
                FROM Orders o
                ${statusFilter}
            `;
            const countResult = await statusRequest.query(countQuery);

            const totalOrders = countResult.recordset[0].total;
            const totalPages = Math.ceil(totalOrders / limit);

            // Fetch orders with customer, address, and items including payment details
            const ordersRequest = pool.request();
            if (includeStatuses && Array.isArray(includeStatuses)) {
                includeStatuses.forEach((s, idx) => {
                    ordersRequest.input(`status${idx}`, sql.NVarChar, s);
                });
            } else {
                ordersRequest.input('status', sql.NVarChar, status);
            }
            ordersRequest.input('limit', sql.Int, limit);
            ordersRequest.input('offset', sql.Int, offset);

            const ordersSchema = await getOrdersSchemaFlags(pool);
            const hasReturnItemsColumn = ordersSchema.hasReturnItems;
            const returnItemsColumn = hasReturnItemsColumn ? ', o.ReturnItems' : ', NULL AS ReturnItems';

            const hasRefundAmountColumn = ordersSchema.hasRefundAmount;
            const refundAmountColumn = hasRefundAmountColumn ? ', ISNULL(o.RefundAmount, 0) AS RefundAmount' : ', 0 AS RefundAmount';

            let statusFilterForOrders;
            if (includeStatuses && Array.isArray(includeStatuses)) {
                statusFilterForOrders = `WHERE o.Status IN (${includeStatuses.map((s, idx) => `@status${idx}`).join(', ')})${extraFilter}`;
            } else {
                statusFilterForOrders = `WHERE o.Status = @status${extraFilter}`;
            }

            const ordersResult = await ordersRequest.query(`
                SELECT DISTINCT o.OrderID, o.ReferenceNumber, o.OrderDate, 
                       FORMAT(o.OrderDate, 'MMM dd, yyyy hh:mm tt') AS FormattedOrderDate,
                       o.Status, o.TotalAmount, o.PaymentMethod, o.Currency, o.PaymentDate,
                       o.DeliveryType, o.DeliveryCost, 
                       ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
                       o.StripeSessionID, o.TransactionID, o.PaymentStatus, o.PickupDate,
                       COALESCE(o.ServiceType,
                           CASE 
                               WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                               WHEN o.DeliveryType LIKE 'rate_%' THEN 
                                   CASE 
                                       WHEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') LIKE '%Delivery%' 
                                       THEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard')
                                       ELSE COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') + ' Delivery'
                                   END
                               ELSE o.DeliveryType
                           END
                       ) as DeliveryTypeName,
                       c.FullName AS CustomerName, c.Email AS CustomerEmail, c.PhoneNumber AS CustomerPhone,
                       a.Label AS AddressLabel, a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.Region, a.PostalCode, a.Country,
                       CASE WHEN bo.BulkOrderID IS NOT NULL THEN 1 ELSE 0 END AS IsBulkOrder,
                       o.ReturnType, o.ReturnReason, o.ReturnImageURL, o.ReturnVideoURL, o.ActionType,
                       ISNULL(o.OriginalPackaging, 0) AS OriginalPackaging,
                       ISNULL(o.AllParts, 0) AS AllParts,
                       ISNULL(o.Unused, 0) AS Unused,
                       ISNULL(o.ProofOfPurchase, 0) AS ProofOfPurchase,
                       o.ProofOfPurchaseImageURL${returnItemsColumn}${refundAmountColumn}
                FROM Orders o
                JOIN Customers c ON o.CustomerID = c.CustomerID
                OUTER APPLY (
                    SELECT TOP 1 ca.*
                    FROM CustomerAddresses ca
                    WHERE ca.CustomerID = c.CustomerID
                      AND (ca.AddressID = o.ShippingAddressID OR (o.ShippingAddressID IS NULL AND ca.IsDefault = 1))
                    ORDER BY CASE WHEN ca.AddressID = o.ShippingAddressID THEN 0 WHEN ca.IsDefault = 1 THEN 1 ELSE 2 END, ca.AddressID DESC
                ) a
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
                LEFT JOIN (
                    SELECT DISTINCT OrderID, BulkOrderID
                    FROM BulkOrders
                    WHERE OrderID IS NOT NULL
                ) bo ON bo.OrderID = o.OrderID
                ${statusFilterForOrders}
                ORDER BY o.OrderDate DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);

            const orders = ordersResult.recordset;
            await attachOrderItemsBatch(pool, orders);

            // Process orders - decrypt data, handle payment methods, etc.
            for (let order of orders) {
                // Address data (already plain text)
                const addressData = {
                    Label: order.AddressLabel,
                    HouseNumber: order.HouseNumber,
                    Street: order.Street,
                    Barangay: order.Barangay,
                    City: order.City,
                    Province: order.Province,
                    Region: order.Region,
                    PostalCode: order.PostalCode,
                    Country: order.Country
                };
                order.AddressLabel = addressData.Label;
                order.HouseNumber = addressData.HouseNumber;
                order.Street = addressData.Street;
                order.Barangay = addressData.Barangay;
                order.City = addressData.City;
                order.Province = addressData.Province;
                order.Region = addressData.Region;
                order.PostalCode = addressData.PostalCode;
                order.Country = addressData.Country;

                // Auto-sync Stripe order totals if needed
                if (order.StripeSessionID && isStripeCheckoutSessionId(order.StripeSessionID)) {
                    try {
                        const currentTotal = parseFloat(order.TotalAmount) || 0;
                        const stripeInstance = getStripe ? getStripe() : null;
                        if (stripeInstance) {
                            try {
                                const session = await stripeInstance.checkout.sessions.retrieve(order.StripeSessionID);
                                const stripeTotal = session.amount_total / 100;

                                if (Math.abs(currentTotal - stripeTotal) > 0.01) {
                                    await pool.request()
                                        .input('orderId', sql.Int, order.OrderID)
                                        .input('totalAmount', sql.Decimal(10, 2), stripeTotal)
                                        .query(`
                                            UPDATE Orders 
                                            SET TotalAmount = @totalAmount 
                                            WHERE OrderID = @orderId
                                        `);
                                    console.log(`[ADMIN ORDERS] ✅ Auto-synced Order ${order.OrderID} TotalAmount from ₱${currentTotal.toFixed(2)} to ₱${stripeTotal.toFixed(2)}`);
                                    order.TotalAmount = stripeTotal;
                                }
                            } catch (stripeErr) {
                                console.error(`[ADMIN ORDERS] Error syncing order ${order.OrderID} from Stripe:`, stripeErr.message);
                                order.needsSync = true;
                            }
                        }
                    } catch (err) {
                        console.error(`[ADMIN ORDERS] Error checking order ${order.OrderID} total:`, err.message);
                    }
                }

                order.TransactionID = dedupeDoubledTransactionId(order.TransactionID);
                order.PaymentMethodDisplay = paymentMethodDisplayForOrder(order);
            }

            // Handle "receive" tab - calculate days in receive status
            if (tab === 'receive' && orders.length > 0) {
                const AUTO_CONFIRM_RECEIVE_DAYS = 7;
                const orderIds = orders.map((o) => o.OrderID).filter(Boolean);
                const receiveAtByOrderId = new Map();
                if (orderIds.length > 0) {
                    try {
                        const logRequest = pool.request();
                        orderIds.forEach((id, idx) => {
                            logRequest.input(`oid${idx}`, sql.Int, id);
                        });
                        const idPlaceholders = orderIds.map((_, idx) => `@oid${idx}`).join(', ');
                        const receiveLogResult = await logRequest.query(`
                            SELECT CAST(al.RecordID AS INT) AS OrderID, MAX(al.Timestamp) AS MovedToReceiveAt
                            FROM ActivityLogs al
                            WHERE al.TableAffected = N'Orders'
                              AND al.Description LIKE N'%status changed to Received%'
                              AND CAST(al.RecordID AS INT) IN (${idPlaceholders})
                            GROUP BY CAST(al.RecordID AS INT)
                        `);
                        (receiveLogResult.recordset || []).forEach((row) => {
                            receiveAtByOrderId.set(row.OrderID, row.MovedToReceiveAt);
                        });
                    } catch (receiveLogErr) {
                        console.warn('[ADMIN ORDERS] Could not load receive timestamps:', receiveLogErr.message);
                    }
                }
                const nowMs = Date.now();
                for (const order of orders) {
                    const movedAt = receiveAtByOrderId.get(order.OrderID) || order.OrderDate;
                    const daysInReceive = Math.max(
                        0,
                        Math.floor((nowMs - new Date(movedAt).getTime()) / (24 * 60 * 60 * 1000))
                    );
                    order.DaysInReceiveStatus = daysInReceive;
                    order.CanAutoConfirmReceive = daysInReceive >= AUTO_CONFIRM_RECEIVE_DAYS;
                    order.DaysUntilAutoConfirm = Math.max(0, AUTO_CONFIRM_RECEIVE_DAYS - daysInReceive);
                }
            }

            const returnedOrdersLocals = route === 'ReturnedOrders' ? returnedOrderDisplay : {};

            res.render(`Employee/Admin/Admin${route}`, {
                user: req.session.user,
                orders: orders,
                ordersTab: tab || null,
                autoConfirmReceiveDays: tab === 'receive' ? 7 : null,
                activePage: route === 'ReturnedOrders' ? 'orders-returned' : 'orders',
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalOrders: totalOrders,
                    limit: limit,
                    offset: offset
                },
                ...returnedOrdersLocals
            });
        } catch (err) {
            console.error(`Error fetching ${status ? status.toLowerCase() : 'orders'}:`, err);
            const returnedOrdersLocals = route === 'ReturnedOrders' ? require('../../utils/returnedOrderDisplay') : {};
            res.render(`Employee/Admin/Admin${route}`, {
                user: req.session.user,
                orders: [],
                ordersTab: tab || null,
                autoConfirmReceiveDays: tab === 'receive' ? 7 : null,
                activePage: route === 'ReturnedOrders' ? 'orders-returned' : 'orders',
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalOrders: 0,
                    limit: 20,
                    offset: 0
                },
                ...returnedOrdersLocals
            });
        }
    }

    // =============================================================================
    // MAIN ORDERS PAGE (WITH TABS)
    // =============================================================================

    router.get('/Employee/Admin/Orders', isAuthenticated, async (req, res) => {
        const tab = String(req.query.tab || 'pending').toLowerCase();
        const config = adminOrdersTabRoutes.find((c) => c.tab === tab) || adminOrdersTabRoutes[0];
        return fetchAndRenderAdminOrders(req, res, config);
    });

    router.get('/Employee/Admin/ReturnedOrders', isAuthenticated, async (req, res) => {
        return fetchAndRenderAdminOrders(req, res, returnedOrdersConfig);
    });

    // =============================================================================
    // ORDER PROCESSING ROUTES (Proceed and Cancel for each status)
    // =============================================================================

    // Admin OrdersPending: Proceed to Processing
    router.post('/Employee/Admin/OrdersPending/Proceed/:orderId', isAuthenticated, async (req, res) => {
        console.log(`[ADMIN ORDER PROCESSING] ====== ROUTE CALLED ======`);
        console.log(`[ADMIN ORDER PROCESSING] Request params:`, req.params);
        console.log(`[ADMIN ORDER PROCESSING] Request body:`, req.body);
        console.log(`[ADMIN ORDER PROCESSING] Request method:`, req.method);
        console.log(`[ADMIN ORDER PROCESSING] Request path:`, req.path);

        try {
            await pool.connect();
            console.log(`[ADMIN ORDER PROCESSING] ✅ Database connected`);
            const orderId = parseInt(req.params.orderId);

            console.log(`[ADMIN ORDER PROCESSING] ====== Processing Order ${orderId} ======`);

            // Get order items to decrease stock when status changes to Processing
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            console.log(`[ADMIN ORDER PROCESSING] Found ${orderItemsResult.recordset.length} order items for Order ${orderId}`);

            const orderMetaResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`SELECT ActionType FROM Orders WHERE OrderID = @orderId`);
            const orderActionType = String(orderMetaResult.recordset[0]?.ActionType || '').toLowerCase().trim();
            const skipStockDecrement = orderActionType === 'refund';

            if (skipStockDecrement) {
                console.log(`[ADMIN ORDER PROCESSING] Skipping stock decrement for refund fulfillment order ${orderId}`);
            }

            let skipInventoryDecrementLegacy = false;
            if (!skipStockDecrement) {
                try {
                    const { orderHasInventoryStockReserved } = require('../../utils/storefrontStockReserve');
                    skipInventoryDecrementLegacy = await orderHasInventoryStockReserved(pool, orderId);
                } catch (e) { /* ignore */ }
            }

            for (const item of orderItemsResult.recordset) {
                if (skipStockDecrement || skipInventoryDecrementLegacy) {
                    continue;
                }
                try {
                    const variationId = item.VariationID ? parseInt(item.VariationID) : null;
                    console.log(`[ADMIN ORDER PROCESSING] Processing item - ProductID: ${item.ProductID}, Quantity: ${item.Quantity}, VariationID: ${variationId || 'none'} (raw: ${item.VariationID}, type: ${typeof item.VariationID})`);
                    console.log(`[ADMIN ORDER PROCESSING] Full item data:`, JSON.stringify(item));

                    await decrementStockFromInventory(item.ProductID, item.Quantity, variationId, null);
                    console.log(`[ADMIN ORDER PROCESSING] ✅ Successfully decremented stock for ProductID: ${item.ProductID}${variationId ? `, VariationID: ${variationId}` : ''}`);
                } catch (stockErr) {
                    console.error(`[ADMIN ORDER PROCESSING] ❌ Error decrementing stock for ProductID ${item.ProductID}:`, stockErr);
                    console.error(`[ADMIN ORDER PROCESSING] Error message:`, stockErr.message);
                    console.error(`[ADMIN ORDER PROCESSING] Error stack:`, stockErr.stack);
                }
            }

            try {
                const { finalizeStorefrontDisplayForProcessingOrder } = require('../../utils/storefrontStockReserve');
                const displayResult = await finalizeStorefrontDisplayForProcessingOrder(pool, orderId);
                console.log(`[ADMIN ORDER PROCESSING] Storefront display stock:`, displayResult);
            } catch (displayErr) {
                console.error(`[ADMIN ORDER PROCESSING] Storefront display finalize error:`, displayErr.message);
            }

            // Update order status to Processing
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Processing' WHERE OrderID = @orderId`);

            console.log(`[ADMIN ORDER PROCESSING] ✅ Order ${orderId} status updated to Processing`);

            // Update bulk order status if applicable
            await updateBulkOrderStatus(orderId, 'Processing');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'STATUS_CHANGE',
                'Orders',
                orderId,
                `Order #${orderId} status changed to Processing by Admin`
            );

            res.json({ success: true });
        } catch (err) {
            console.error('[ADMIN ORDER PROCESSING] ❌ Error updating order status to Processing:', err);
            console.error('[ADMIN ORDER PROCESSING] Error stack:', err.stack);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Admin OrdersPending: Cancel order
    router.post('/Employee/Admin/OrdersPending/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            console.log(`[ADMIN ORDER CANCELLATION] Cancelling Pending order ${orderId}`);

            try {
                await refundGatewayForPendingCancel(orderId, '[ADMIN-PENDING-CANCEL-REFUND]');
            } catch (refundErr) {
                console.error('[ADMIN ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            try {
                const { restoreStorefrontDisplayStockForOrder } = require('../../utils/storefrontStockReserve');
                await restoreStorefrontDisplayStockForOrder(pool, orderId);
            } catch (restoreDisplayErr) {
                console.error('[ADMIN ORDER CANCELLATION] Restore display stock:', restoreDisplayErr.message);
            }

            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Pending'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Pending status.' });
            }

            // Update bulk order status if applicable
            await updateBulkOrderStatus(orderId, 'Cancelled');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Admin`
            );

            console.log(`[ADMIN ORDER CANCELLATION] Order ${orderId} cancelled successfully`);
            res.json({ success: true, message: 'Order cancelled successfully.' });
        } catch (err) {
            console.error('Error cancelling order:', err);
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Admin OrdersProcessing: Proceed to Next Status (To Receive for pickup, Shipping for delivery)
    router.post('/Employee/Admin/OrdersProcessing/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            const orderId = parseInt(req.params.orderId);

            // Get order details including delivery type
            const orderDetailsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        o.OrderID,
                        o.ReferenceNumber,
                        o.TotalAmount,
                        o.DeliveryCost,
                        ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
                        o.TransactionID,
                        o.DeliveryType,
                        o.OrderDate,
                        c.Email,
                        c.FullName,
                        a.Region,
                        a.Province,
                        a.City
                    FROM Orders o
                    INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                    OUTER APPLY (
                        SELECT TOP 1 ca.Region, ca.Province, ca.City
                        FROM CustomerAddresses ca
                        WHERE ca.CustomerID = c.CustomerID
                          AND (ca.AddressID = o.ShippingAddressID OR (o.ShippingAddressID IS NULL AND ca.IsDefault = 1))
                        ORDER BY CASE WHEN ca.AddressID = o.ShippingAddressID THEN 0 WHEN ca.IsDefault = 1 THEN 1 ELSE 2 END, ca.AddressID DESC
                    ) a
                    WHERE o.OrderID = @orderId
                `);

            if (orderDetailsResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Order not found.' });
            }

            const orderDetails = orderDetailsResult.recordset[0];
            const deliveryType = orderDetails.DeliveryType;
            let nextStatus;
            let logMessage;

            // Determine next status based on delivery type
            if (deliveryType === 'pickup') {
                nextStatus = 'Received';
                logMessage = `Order #${orderId} status changed to Received by Admin (Pickup order)`;
            } else {
                nextStatus = 'Shipping';
                logMessage = `Order #${orderId} status changed to Shipping by Admin (Delivery order)`;
            }

            // Update order status immediately
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('status', sql.NVarChar, nextStatus)
                .query(`UPDATE Orders SET Status = @status WHERE OrderID = @orderId`);

            // Send response immediately
            res.json({ success: true, nextStatus: nextStatus });

            // Do non-critical operations asynchronously
            Promise.all([
                updateBulkOrderStatus(orderId, nextStatus).catch(err => console.error('[BULK ORDER UPDATE ERROR]', err)),

                logActivity(
                    req.session.user.id,
                    'STATUS_CHANGE',
                    'Orders',
                    orderId,
                    logMessage,
                    JSON.stringify({ oldStatus: 'Processing', newStatus: nextStatus })
                ).catch(err => console.error('[ACTIVITY LOG ERROR]', err)),

                // Send email notification asynchronously
                (async () => {
                    if (!orderDetails.Email) return;

                    try {
                        // Fetch order items for email
                        const orderItemsResult = await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                                SELECT 
                                    oi.Name,
                                    oi.Quantity,
                                    oi.PriceAtPurchase,
                                    pv.VariationName,
                                    pv.Color
                                FROM OrderItems oi
                                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                                WHERE oi.OrderID = @orderId
                            `);

                        const orderItems = orderItemsResult.recordset.map(item => ({
                            name: item.Name,
                            quantity: item.Quantity,
                            price: item.PriceAtPurchase,
                            variationName: item.VariationName,
                            color: item.Color
                        }));

                        const subtotal = orderItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

                        // Calculate Estimated Delivery Date (only for delivery orders)
                        let estimatedDeliveryDate = null;
                        if (nextStatus === 'Shipping' && orderDetails.DeliveryType !== 'pickup' && orderDetails.Region && orderDetails.City) {
                            estimatedDeliveryDate = calculateEstimatedDeliveryDate(
                                orderDetails.Region,
                                orderDetails.Province,
                                orderDetails.City,
                                new Date()
                            );
                        }

                        if (nextStatus === 'Shipping') {
                            await sendgridHelper.sendOrderShippingEmail(
                                orderDetails.Email,
                                orderDetails.FullName || 'Valued Customer',
                                {
                                    orderId: orderDetails.OrderID,
                                    referenceNumber: orderDetails.ReferenceNumber,
                                    transactionId: orderDetails.TransactionID,
                                    totalAmount: parseFloat(orderDetails.TotalAmount) || 0,
                                    subtotal: subtotal,
                                    shippingCost: parseFloat(orderDetails.DeliveryCost) || 0,
                                    extraDeliveryFee: parseFloat(orderDetails.ExtraDeliveryFee) || 0,
                                    items: orderItems,
                                    estimatedDeliveryDate: estimatedDeliveryDate
                                }
                            );
                        } else if (nextStatus === 'Received') {
                            await sendgridHelper.sendOrderReceivedEmail(
                                orderDetails.Email,
                                orderDetails.FullName || 'Valued Customer',
                                {
                                    orderId: orderDetails.OrderID,
                                    referenceNumber: orderDetails.ReferenceNumber,
                                    transactionId: orderDetails.TransactionID,
                                    totalAmount: parseFloat(orderDetails.TotalAmount) || 0,
                                    subtotal: subtotal,
                                    shippingCost: 0,
                                    extraDeliveryFee: 0,
                                    items: orderItems
                                }
                            );
                        }
                    } catch (emailError) {
                        console.error('[ADMIN STATUS UPDATE] Failed to send email notification:', emailError);
                    }
                })()
            ]).catch(err => console.error('[ASYNC OPERATIONS ERROR]', err));

        } catch (err) {
            console.error('[ADMIN ORDER PROCESSING ERROR]', err);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Admin OrdersProcessing: Cancel order
    router.post('/Employee/Admin/OrdersProcessing/Cancel/:orderId', isAuthenticated, async (req, res) => {
        console.log(`[ADMIN ORDER CANCELLATION] ====== CANCELLING ORDER ${req.params.orderId} ======`);
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            console.log(`[ADMIN ORDER CANCELLATION] Order ID: ${orderId}`);

            try {
                await refundGatewayForAdminFulfilmentStageCancel(
                    orderId,
                    'Processing',
                    '[ADMIN-PROCESSING-CANCEL-REFUND]',
                    'processing'
                );
            } catch (refundErr) {
                console.error('[ADMIN ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            console.log(`[ADMIN ORDER CANCELLATION] Found ${orderItemsResult.recordset.length} order items to restore`);

            // Restore stock for each item using inventory-aware increment
            for (const item of orderItemsResult.recordset) {
                try {
                    const variationId = item.VariationID ? parseInt(item.VariationID) : null;
                    console.log(`[ADMIN ORDER CANCELLATION] Restoring item - ProductID: ${item.ProductID}, Quantity: ${item.Quantity}, VariationID: ${variationId || 'none'}`);

                    // Use inventory-aware stock increment with isReturn=false
                    await incrementStockToInventory(item.ProductID, item.Quantity, variationId, null, false);

                    console.log(`[ADMIN ORDER CANCELLATION] ✅ Successfully restored stock for ProductID: ${item.ProductID}${variationId ? `, VariationID: ${variationId}` : ''}`);
                } catch (stockErr) {
                    console.error(`[ADMIN ORDER CANCELLATION] ❌ Error restoring stock for ProductID ${item.ProductID}:`, stockErr);
                    console.error(`[ADMIN ORDER CANCELLATION] Error message:`, stockErr.message);
                    console.error(`[ADMIN ORDER CANCELLATION] Error stack:`, stockErr.stack);
                }
            }

            // Update order status to cancelled
            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Processing'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Processing status.' });
            }

            // Update bulk order status if applicable
            await updateBulkOrderStatus(orderId, 'Cancelled');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Admin`
            );

            console.log(`[ADMIN ORDER CANCELLATION] ✅ Order ${orderId} cancelled and stock restored`);
            res.json({ success: true, message: 'Order cancelled and stock restored successfully.' });
        } catch (err) {
            console.error(`[ADMIN ORDER CANCELLATION] ❌ Error cancelling order ${req.params.orderId}:`, err);
            console.error(`[ADMIN ORDER CANCELLATION] Error stack:`, err.stack);
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Admin OrdersShipping: Proceed to Delivery
    router.post('/Employee/Admin/OrdersShipping/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            const orderId = parseInt(req.params.orderId);

            // Update order status immediately
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Delivery' WHERE OrderID = @orderId`);

            // Send response immediately
            res.json({ success: true });

            // Do non-critical operations asynchronously
            Promise.all([
                updateBulkOrderStatus(orderId, 'Delivery').catch(err => console.error('[BULK ORDER UPDATE ERROR]', err)),

                logActivity(
                    req.session.user.id,
                    'STATUS_CHANGE',
                    'Orders',
                    orderId,
                    `Order #${orderId} status changed to Delivery by Admin`
                ).catch(err => console.error('[ACTIVITY LOG ERROR]', err)),

                // Send email notification asynchronously
                (async () => {
                    try {
                        // Fetch order and customer details for email
                        const orderDetailsResult = await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                                SELECT 
                                    o.OrderID,
                                    o.ReferenceNumber,
                                    o.TotalAmount,
                                    o.DeliveryCost,
                                    ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
                                    o.TransactionID,
                                    o.DeliveryType,
                                    c.Email,
                                    c.FullName,
                                    a.Region,
                                    a.Province,
                                    a.City
                                FROM Orders o
                                INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                                OUTER APPLY (
                                    SELECT TOP 1 ca.Region, ca.Province, ca.City
                                    FROM CustomerAddresses ca
                                    WHERE ca.CustomerID = c.CustomerID
                                      AND (ca.AddressID = o.ShippingAddressID OR (o.ShippingAddressID IS NULL AND ca.IsDefault = 1))
                                    ORDER BY CASE WHEN ca.AddressID = o.ShippingAddressID THEN 0 WHEN ca.IsDefault = 1 THEN 1 ELSE 2 END, ca.AddressID DESC
                                ) a
                                WHERE o.OrderID = @orderId
                            `);

                        if (orderDetailsResult.recordset.length === 0 || !orderDetailsResult.recordset[0].Email) {
                            return;
                        }

                        const orderDetails = orderDetailsResult.recordset[0];

                        // Calculate Estimated Delivery Date
                        let estimatedDeliveryDate = null;
                        if (orderDetails.DeliveryType !== 'pickup' && orderDetails.Region && orderDetails.City) {
                            estimatedDeliveryDate = calculateEstimatedDeliveryDate(
                                orderDetails.Region,
                                orderDetails.Province,
                                orderDetails.City,
                                new Date()
                            );
                        }

                        // Fetch order items for email
                        const orderItemsResult = await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                                SELECT 
                                    oi.Name,
                                    oi.Quantity,
                                    oi.PriceAtPurchase,
                                    pv.VariationName,
                                    pv.Color
                                FROM OrderItems oi
                                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                                WHERE oi.OrderID = @orderId
                            `);

                        const orderItems = orderItemsResult.recordset.map(item => ({
                            name: item.Name,
                            quantity: item.Quantity,
                            price: item.PriceAtPurchase,
                            variationName: item.VariationName,
                            color: item.Color
                        }));

                        const subtotal = orderItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

                        await sendgridHelper.sendOrderOutForDeliveryEmail(
                            orderDetails.Email,
                            orderDetails.FullName || 'Valued Customer',
                            {
                                orderId: orderDetails.OrderID,
                                referenceNumber: orderDetails.ReferenceNumber,
                                transactionId: orderDetails.TransactionID,
                                totalAmount: parseFloat(orderDetails.TotalAmount) || 0,
                                subtotal: subtotal,
                                shippingCost: parseFloat(orderDetails.DeliveryCost) || 0,
                                extraDeliveryFee: parseFloat(orderDetails.ExtraDeliveryFee) || 0,
                                items: orderItems,
                                estimatedDeliveryDate: estimatedDeliveryDate
                            }
                        );
                    } catch (emailError) {
                        console.error('[ADMIN STATUS UPDATE] Failed to send order out for delivery email:', emailError);
                    }
                })()
            ]).catch(err => console.error('[ASYNC OPERATIONS ERROR]', err));

        } catch (err) {
            console.error('Error updating order status to Delivery:', err);
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Admin OrdersShipping: Cancel order
    router.post('/Employee/Admin/OrdersShipping/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            try {
                await refundGatewayForAdminFulfilmentStageCancel(
                    orderId,
                    'Shipping',
                    '[ADMIN-SHIPPING-CANCEL-REFUND]',
                    'shipping'
                );
            } catch (refundErr) {
                console.error('[ADMIN ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            // Restore stock for each item
            for (const item of orderItemsResult.recordset) {
                // Always restore main product stock first
                await pool.request()
                    .input('productId', sql.Int, item.ProductID)
                    .input('quantity', sql.Int, item.Quantity)
                    .query(`UPDATE Products 
                            SET StockQuantity = StockQuantity + @quantity 
                            WHERE ProductID = @productId`);
                console.log(`[ADMIN ORDER CANCELLATION] Restored ${item.Quantity} units to main product ${item.ProductID}`);

                // Additionally restore variation stock if there was a variation
                if (item.VariationID) {
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE ProductVariations 
                                SET Quantity = Quantity + @quantity 
                                WHERE VariationID = @variationID`);
                    console.log(`[ADMIN ORDER CANCELLATION] Additionally restored ${item.Quantity} units to variation ${item.VariationID}`);
                }
            }

            // Update order status to cancelled
            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Shipping'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Shipping status.' });
            }

            // Update bulk order status if applicable
            await updateBulkOrderStatus(orderId, 'Cancelled');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Admin`
            );

            console.log(`[ADMIN ORDER CANCELLATION] Order ${orderId} cancelled and stock restored`);
            res.json({ success: true, message: 'Order cancelled and stock restored successfully.' });
        } catch (err) {
            console.error('Error cancelling order:', err);
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Admin OrdersDelivery: Proceed to Received
    router.post('/Employee/Admin/OrdersDelivery/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            const orderId = parseInt(req.params.orderId);

            // Update order status immediately
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Received' WHERE OrderID = @orderId`);

            // Send response immediately
            res.json({ success: true });

            // Do non-critical operations asynchronously
            Promise.all([
                updateBulkOrderStatus(orderId, 'Received').catch(err => console.error('[BULK ORDER UPDATE ERROR]', err)),

                logActivity(
                    req.session.user.id,
                    'STATUS_CHANGE',
                    'Orders',
                    orderId,
                    `Order #${orderId} status changed to Received by Admin`
                ).catch(err => console.error('[ACTIVITY LOG ERROR]', err)),

                // Send email notification asynchronously
                (async () => {
                    try {
                        // Fetch order and customer details for email
                        const orderDetailsResult = await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                                SELECT 
                                    o.OrderID,
                                    o.ReferenceNumber,
                                    o.TotalAmount,
                                    o.DeliveryCost,
                                    ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
                                    o.TransactionID,
                                    c.Email,
                                    c.FullName
                                FROM Orders o
                                INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                                WHERE o.OrderID = @orderId
                            `);

                        if (orderDetailsResult.recordset.length === 0 || !orderDetailsResult.recordset[0].Email) {
                            return;
                        }

                        const orderDetails = orderDetailsResult.recordset[0];

                        // Fetch order items for email
                        const orderItemsResult = await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                                SELECT 
                                    oi.Name,
                                    oi.Quantity,
                                    oi.PriceAtPurchase,
                                    pv.VariationName,
                                    pv.Color
                                FROM OrderItems oi
                                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                                WHERE oi.OrderID = @orderId
                            `);

                        const orderItems = orderItemsResult.recordset.map(item => ({
                            name: item.Name,
                            quantity: item.Quantity,
                            price: item.PriceAtPurchase,
                            variationName: item.VariationName,
                            color: item.Color
                        }));

                        const subtotal = orderItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

                        await sendgridHelper.sendOrderReceivedEmail(
                            orderDetails.Email,
                            orderDetails.FullName || 'Valued Customer',
                            {
                                orderId: orderDetails.OrderID,
                                referenceNumber: orderDetails.ReferenceNumber,
                                transactionId: orderDetails.TransactionID,
                                totalAmount: parseFloat(orderDetails.TotalAmount) || 0,
                                subtotal: subtotal,
                                shippingCost: parseFloat(orderDetails.DeliveryCost) || 0,
                                extraDeliveryFee: parseFloat(orderDetails.ExtraDeliveryFee) || 0,
                                items: orderItems
                            }
                        );
                    } catch (emailError) {
                        console.error('[ADMIN STATUS UPDATE] Failed to send order received email:', emailError);
                    }
                })()
            ]).catch(err => console.error('[ASYNC OPERATIONS ERROR]', err));

        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });

    // Admin OrdersDelivery: Cancel order
    router.post('/Employee/Admin/OrdersDelivery/Cancel/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            try {
                await refundGatewayForAdminFulfilmentStageCancel(
                    orderId,
                    'Delivery',
                    '[ADMIN-DELIVERY-CANCEL-REFUND]',
                    'delivery'
                );
            } catch (refundErr) {
                console.error('[ADMIN ORDER CANCELLATION] Refund failed:', refundErr);
                return res.json({
                    success: false,
                    message: `Refund failed: ${refundErr.message}. Order was not cancelled.`
                });
            }

            // Get order items before cancelling to restore stock
            const orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT oi.ProductID, oi.Quantity, oi.VariationID
                    FROM OrderItems oi
                    WHERE oi.OrderID = @orderId
                `);

            // Restore stock for each item
            for (const item of orderItemsResult.recordset) {
                // Always restore main product stock first
                await pool.request()
                    .input('productId', sql.Int, item.ProductID)
                    .input('quantity', sql.Int, item.Quantity)
                    .query(`UPDATE Products 
                            SET StockQuantity = StockQuantity + @quantity 
                            WHERE ProductID = @productId`);
                console.log(`[ADMIN ORDER CANCELLATION] Restored ${item.Quantity} units to main product ${item.ProductID}`);

                // Additionally restore variation stock if there was a variation
                if (item.VariationID) {
                    await pool.request()
                        .input('variationID', sql.Int, item.VariationID)
                        .input('quantity', sql.Int, item.Quantity)
                        .query(`UPDATE ProductVariations 
                                SET Quantity = Quantity + @quantity 
                                WHERE VariationID = @variationID`);
                    console.log(`[ADMIN ORDER CANCELLATION] Additionally restored ${item.Quantity} units to variation ${item.VariationID}`);
                }
            }

            // Update order status to cancelled
            const cancelResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId AND Status = N'Delivery'`);
            if (!cancelResult.rowsAffected || cancelResult.rowsAffected[0] === 0) {
                return res.json({ success: false, message: 'Order not found or not in Delivery status.' });
            }

            // Update bulk order status if applicable
            await updateBulkOrderStatus(orderId, 'Cancelled');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'CANCEL',
                'Orders',
                orderId,
                `Order #${orderId} cancelled by Admin`
            );

            console.log(`[ADMIN ORDER CANCELLATION] Order ${orderId} cancelled and stock restored`);
            res.json({ success: true, message: 'Order cancelled and stock restored successfully.' });
        } catch (err) {
            console.error('Error cancelling order:', err);
            res.json({ success: false, message: 'Failed to cancel order.' });
        }
    });

    // Admin OrdersReceive: Proceed to Completed (or Completed Returned for replacement deliveries)
    router.post('/Employee/Admin/OrdersReceive/Proceed/:orderId', isAuthenticated, async (req, res) => {
        try {
            const orderId = parseInt(req.params.orderId);
            const AUTO_CONFIRM_RECEIVE_DAYS = 7;

            const orderMeta = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`SELECT ActionType, OrderDate FROM Orders WHERE OrderID = @orderId`);

            if (!orderMeta.recordset.length) {
                return res.json({ success: false, message: 'Order not found.' });
            }

            const receiveLog = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT TOP 1 Timestamp AS MovedToReceiveAt
                    FROM ActivityLogs
                    WHERE TableAffected = N'Orders'
                      AND RecordID = CAST(@orderId AS NVARCHAR(20))
                      AND Description LIKE N'%status changed to Received%'
                    ORDER BY Timestamp DESC
                `);
            const movedAt = receiveLog.recordset[0]?.MovedToReceiveAt || orderMeta.recordset[0].OrderDate;
            const daysInReceive = Math.max(
                0,
                Math.floor((Date.now() - new Date(movedAt).getTime()) / (24 * 60 * 60 * 1000))
            );
            if (daysInReceive < AUTO_CONFIRM_RECEIVE_DAYS) {
                const daysLeft = AUTO_CONFIRM_RECEIVE_DAYS - daysInReceive;
                return res.json({
                    success: false,
                    message: `This order can be confirmed after the ${AUTO_CONFIRM_RECEIVE_DAYS}-day customer return window (${daysLeft} day(s) remaining).`
                });
            }

            const actionType = orderMeta.recordset[0]?.ActionType;
            const newStatus = actionType === 'replacement' ? 'Completed Returned' : 'Completed';

            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('newStatus', sql.NVarChar, newStatus)
                .query(`UPDATE Orders SET Status = @newStatus WHERE OrderID = @orderId`);

            res.json({ success: true, status: newStatus, autoConfirmedAfterWindow: true });

            Promise.all([
                updateBulkOrderStatus(orderId, newStatus).catch(err => console.error('[BULK ORDER UPDATE ERROR]', err)),

                logActivity(
                    req.session.user.id,
                    'COMPLETE',
                    'Orders',
                    orderId,
                    `Order #${orderId} auto-confirmed after ${AUTO_CONFIRM_RECEIVE_DAYS}-day return window by Admin`
                ).catch(err => console.error('[ACTIVITY LOG ERROR]', err))
            ]).catch(err => console.error('[ASYNC OPERATIONS ERROR]', err));

        } catch (err) {
            res.json({ success: false, message: 'Failed to update order status.' });
        }
    });
};
