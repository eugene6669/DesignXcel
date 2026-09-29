'use strict';

/**
 * Admin Walk-In Orders Routes
 * Handles walk-in order management, payment processing, and delivery tracking
 */

module.exports = function registerAdminWalkInRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        generateReferenceNumber,
        generateTransactionId
    } = context;

    // Helper function to ensure WalkInOrders table exists
    async function ensureWalkInOrdersTable(pool) {
        try {
            await pool.request().query(`
                IF OBJECT_ID('dbo.WalkInOrders', 'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.WalkInOrders (
                        WalkInOrderID INT IDENTITY(1,1) PRIMARY KEY,
                        ReferenceNumber NVARCHAR(50) NULL,
                        CustomerName NVARCHAR(255) NOT NULL,
                        ContactNumber NVARCHAR(50) NULL,
                        ContactEmail NVARCHAR(255) NULL,
                        DeliveryAddress NVARCHAR(MAX) NULL,
                        OrderedProducts NVARCHAR(MAX) NULL,
                        DiscountPercent DECIMAL(5,2) DEFAULT 0,
                        TotalAmount DECIMAL(10,2) NOT NULL,
                        Status NVARCHAR(50) DEFAULT 'Pending',
                        PaymentMethod NVARCHAR(50) DEFAULT 'Cash',
                        PaymentStatus NVARCHAR(50) DEFAULT 'Pending',
                        ExpectedArrival DATETIME2 NULL,
                        DeliveryType NVARCHAR(50) NULL,
                        ServiceType NVARCHAR(150) NULL,
                        DeliveryCost DECIMAL(10,2) DEFAULT 0,
                        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
                        UpdatedAt DATETIME2 NULL,
                        LinkedOrderID INT NULL
                    );
                END
            `);
        } catch (err) {
            console.error('[WALKIN] Error ensuring WalkInOrders table:', err);
        }
    }

    // =============================================================================
    // WALK-IN ORDERS LIST PAGE
    // =============================================================================

    router.get('/Employee/Admin/WalkIn', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureWalkInOrdersTable(pool);

            const result = await pool.request().query(`
                SELECT 
                    WalkInOrderID,
                    ReferenceNumber,
                    CustomerName,
                    ContactNumber,
                    ContactEmail,
                    TotalAmount,
                    Status,
                    PaymentMethod,
                    PaymentStatus,
                    ExpectedArrival,
                    DeliveryType,
                    CreatedAt
                FROM WalkInOrders
                ORDER BY CreatedAt DESC
            `);

            res.render('Employee/Admin/AdminWalkIn', {
                user: req.session.user,
                walkInOrders: result.recordset || [],
                bulkOrders: []  // Added for view compatibility
            });
        } catch (err) {
            console.error('[WALKIN] Error fetching walk-in orders:', err);
            res.render('Employee/Admin/AdminWalkIn', {
                user: req.session.user,
                walkInOrders: [],
                bulkOrders: []  // Added for view compatibility
            });
        }
    });

    // =============================================================================
    // ADD WALK-IN ORDER
    // =============================================================================

    router.post('/Employee/Admin/WalkIn/Add', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureWalkInOrdersTable(pool);

            const {
                customerName,
                contactNumber,
                contactEmail,
                address,
                orderedProducts,
                discount,
                totalAmount,
                expectedArrival,
                deliveryType,
                deliveryRate,
                paymentMethod
            } = req.body;

            const manilaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
            
            // Insert walk-in order
            const insertResult = await pool.request()
                .input('customerName', sql.NVarChar, customerName)
                .input('contactNumber', sql.NVarChar, contactNumber || null)
                .input('contactEmail', sql.NVarChar, contactEmail || null)
                .input('address', sql.NVarChar, address || null)
                .input('orderedProducts', sql.NVarChar, orderedProducts)
                .input('discount', sql.Decimal(5, 2), parseFloat(discount) || 0)
                .input('totalAmount', sql.Decimal(10, 2), parseFloat(totalAmount))
                .input('expectedArrival', sql.DateTime2, expectedArrival ? new Date(expectedArrival) : null)
                .input('deliveryType', sql.NVarChar, deliveryType || 'pickup')
                .input('paymentMethod', sql.NVarChar, paymentMethod || 'Cash')
                .query(`
                    INSERT INTO WalkInOrders (
                        CustomerName, ContactNumber, ContactEmail, DeliveryAddress,
                        OrderedProducts, DiscountPercent, TotalAmount, Status,
                        PaymentMethod, PaymentStatus, ExpectedArrival, DeliveryType, CreatedAt
                    )
                    OUTPUT INSERTED.WalkInOrderID
                    VALUES (
                        @customerName, @contactNumber, @contactEmail, @address,
                        @orderedProducts, @discount, @totalAmount, 'Pending',
                        @paymentMethod, 'Pending', @expectedArrival, @deliveryType, GETDATE()
                    )
                `);

            const walkInOrderId = insertResult.recordset[0].WalkInOrderID;

            // Generate reference number
            const referenceNumber = generateReferenceNumber(manilaTime, walkInOrderId);
            await pool.request()
                .input('walkInOrderId', sql.Int, walkInOrderId)
                .input('referenceNumber', sql.NVarChar, referenceNumber)
                .query(`
                    UPDATE WalkInOrders 
                    SET ReferenceNumber = @referenceNumber 
                    WHERE WalkInOrderID = @walkInOrderId
                `);

            res.status(200).json({
                success: true,
                message: 'Walk-in order created successfully',
                walkInOrderId,
                referenceNumber
            });
        } catch (err) {
            console.error('[WALKIN] Error adding walk-in order:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to create walk-in order',
                error: err.message
            });
        }
    });

    // =============================================================================
    // PROCEED TO DELIVERY
    // =============================================================================

    router.post('/Employee/Admin/WalkIn/ProceedToDelivery/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const walkInOrderId = parseInt(req.params.id);

            await pool.request()
                .input('walkInOrderId', sql.Int, walkInOrderId)
                .input('status', sql.NVarChar, 'Out for Delivery')
                .query(`
                    UPDATE WalkInOrders 
                    SET Status = @status, UpdatedAt = GETDATE()
                    WHERE WalkInOrderID = @walkInOrderId
                `);

            res.status(200).json({
                success: true,
                message: 'Walk-in order moved to delivery'
            });
        } catch (err) {
            console.error('[WALKIN] Error proceeding to delivery:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to proceed to delivery',
                error: err.message
            });
        }
    });

    // =============================================================================
    // COMPLETE WALK-IN ORDER
    // =============================================================================

    router.post('/Employee/Admin/WalkIn/Complete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const walkInOrderId = parseInt(req.params.id);

            await pool.request()
                .input('walkInOrderId', sql.Int, walkInOrderId)
                .input('status', sql.NVarChar, 'Completed')
                .input('paymentStatus', sql.NVarChar, 'Paid')
                .query(`
                    UPDATE WalkInOrders 
                    SET Status = @status, PaymentStatus = @paymentStatus, UpdatedAt = GETDATE()
                    WHERE WalkInOrderID = @walkInOrderId
                `);

            res.status(200).json({
                success: true,
                message: 'Walk-in order completed successfully'
            });
        } catch (err) {
            console.error('[WALKIN] Error completing walk-in order:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to complete walk-in order',
                error: err.message
            });
        }
    });

    // =============================================================================
    // REMOVE/CANCEL WALK-IN ORDER
    // =============================================================================

    router.post('/Employee/Admin/WalkIn/Remove/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const walkInOrderId = parseInt(req.params.id);

            await pool.request()
                .input('walkInOrderId', sql.Int, walkInOrderId)
                .input('status', sql.NVarChar, 'Cancelled')
                .query(`
                    UPDATE WalkInOrders 
                    SET Status = @status, UpdatedAt = GETDATE()
                    WHERE WalkInOrderID = @walkInOrderId
                `);

            res.status(200).json({
                success: true,
                message: 'Walk-in order cancelled'
            });
        } catch (err) {
            console.error('[WALKIN] Error removing walk-in order:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel walk-in order',
                error: err.message
            });
        }
    });

    // =============================================================================
    // PAYMENT RECEIPT
    // =============================================================================

    router.get('/Employee/Admin/WalkIn/payment-receipt', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { orderId } = req.query;

            if (!orderId) {
                return res.status(400).send('Order ID is required');
            }

            const result = await pool.request()
                .input('walkInOrderId', sql.Int, parseInt(orderId))
                .query(`
                    SELECT 
                        WalkInOrderID,
                        ReferenceNumber,
                        CustomerName,
                        ContactNumber,
                        ContactEmail,
                        DeliveryAddress,
                        OrderedProducts,
                        DiscountPercent,
                        TotalAmount,
                        Status,
                        PaymentMethod,
                        PaymentStatus,
                        ExpectedArrival,
                        DeliveryType,
                        ServiceType,
                        DeliveryCost,
                        CreatedAt
                    FROM WalkInOrders
                    WHERE WalkInOrderID = @walkInOrderId
                `);

            if (!result.recordset.length) {
                return res.status(404).send('Walk-in order not found');
            }

            const order = result.recordset[0];
            
            res.render('Employee/Admin/WalkInPaymentReceipt', {
                user: req.session.user,
                order: order
            });
        } catch (err) {
            console.error('[WALKIN] Error fetching payment receipt:', err);
            res.status(500).send('Error fetching payment receipt');
        }
    });
};
