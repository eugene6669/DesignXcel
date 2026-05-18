// Load env: .env first, then env-specific file so local overrides work
require('dotenv').config(); // .env (base)
const envPath = process.env.NODE_ENV === 'development'
    ? '.env.development'
    : (process.env.NODE_ENV === 'production' ? '.env.production' : null);
if (envPath) {
    require('dotenv').config({ path: require('path').join(__dirname, envPath) });
}

// Minimal startup logging (removed verbose debug logs for faster startup)
if (process.env.NODE_ENV === 'development') {
    console.log('[STARTUP] Environment:', process.env.NODE_ENV || 'development');
}

// Global process-level error handlers to improve stability
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED_REJECTION] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT_EXCEPTION]', error);
});
const express = require('express');
const session = require('express-session');
const MSSqlStore = require('connect-mssql-v2');
const flash = require('connect-flash');
const sql = require('mssql');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const compression = require('compression');
const jwt = require('jsonwebtoken');
// All encryption removed - using plain text storage
// Lazy load Stripe - only initialize when needed (faster startup)
let stripe;
const getStripe = () => {
    if (!stripe) {
        try {
            if (!process.env.STRIPE_SECRET_KEY) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[STRIPE] STRIPE_SECRET_KEY not found');
                }
                return null;
            }
            stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            if (process.env.NODE_ENV === 'development') {
                console.log('[STRIPE] Initialized');
            }
        } catch (error) {
            console.error('[STRIPE] Error:', error.message);
            return null;
        }
    }
    return stripe;
};
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { generateReferenceNumber } = require('./utils/generateReferenceNumber');
const { generateTransactionId } = require('./utils/generateTransactionId');
const { calculateEstimatedDeliveryDate, formatEstimatedDeliveryDate } = require('./utils/deliveryEstimate');
const { cleanupExpiredDiscountsSafe } = require('./utils/cleanupExpiredDiscounts');
const { mapProductRecordAssetUrls } = require('./utils/productAssetUrls');
const { ORDER_ITEMS_CATALOG_CROSS_APPLY } = require('./utils/orderItemCatalogResolveSql');
const { resolveProductId: resolveProductIdFromDb } = require('./utils/productIdResolver');
const {
    computeAvailableStock,
    computeAvailableStockBatch,
    computeVariationAvailableStockMap
} = require('./utils/availableStockCalculator');

const app = express();

// Health check endpoint for Railway (must allow CORS — registered before global `cors()` middleware)
app.get('/api/health', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dest = path.join(__dirname, 'public', 'uploads', 'profile-images');
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Defer directory creation (non-blocking, async)
const ensureUploadDir = () => {
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'profile-images');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
};
// Create directory asynchronously after server starts
setImmediate(ensureUploadDir);

// --- Stripe webhook route: must come BEFORE express.json() and express.urlencoded() ---
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).send('Stripe not configured');
        }
        event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[STRIPE WEBHOOK] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('[STRIPE WEBHOOK] Received event type:', event.type);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_email;
        const metadata = session.metadata || {};

        // Check order type FIRST before parsing cart/items
        const orderType = metadata.orderType || 'regular';
        console.log('[STRIPE WEBHOOK] Received checkout.session.completed:', {
            email,
            orderType,
            metadata: Object.keys(metadata),
            sessionId: session.id,
            amount_total: session.amount_total,
            currency: session.currency
        });

        // Parse cart/items based on order type
        let cart = [];
        let bulkItems = [];

        if (orderType === 'bulk') {
            // Parse bulk order items
            try {
                if (metadata.items) {
                    bulkItems = JSON.parse(metadata.items);
                    console.log('[STRIPE WEBHOOK] Parsed bulk order items:', bulkItems.length);
                } else {
                    console.error('[STRIPE WEBHOOK] No items metadata found in bulk order session');
                }
            } catch (e) {
                console.error('[STRIPE WEBHOOK] Failed to parse bulk order items:', e.message);
            }
        } else {
            // Parse regular order cart
            try {
                if (metadata.cart) {
                    cart = JSON.parse(metadata.cart);
                    console.log('[STRIPE WEBHOOK] Parsed cart items:', cart.length);
                } else {
                    console.error('[STRIPE WEBHOOK] No cart metadata found in session');
                }
            } catch (e) {
                console.error('[STRIPE WEBHOOK] Failed to parse cart metadata:', e.message);
            }
        }

        // Save order to database
        try {
            // Restore session if not present (important for webhooks)
            if (!req.session || !req.session.user) {
                console.log('[STRIPE WEBHOOK] No session found, attempting to restore session for email:', email);

                await pool.connect();
                const customerResult = await pool.request()
                    .input('email', sql.NVarChar, email)
                    .query('SELECT * FROM Customers WHERE LOWER(Email) = LOWER(@email) AND IsActive = 1');

                if (customerResult.recordset.length > 0) {
                    const customer = customerResult.recordset[0];
                    req.session.user = {
                        id: customer.CustomerID,
                        fullName: customer.FullName,
                        email: customer.Email,
                        role: 'Customer',
                        type: 'customer'
                    };
                    console.log('[STRIPE WEBHOOK] Session restored successfully for:', email);
                } else {
                    console.error('[STRIPE WEBHOOK] Could not restore session, customer not found for email:', email);
                }
            }

            await pool.connect();
            console.log('[STRIPE WEBHOOK] Database connected successfully');

            console.log('[STRIPE WEBHOOK] Processing order type:', orderType);

            if (orderType === 'bulk') {
                // For bulk orders, create as regular Orders (same flow as regular orders, pickup only)
                console.log('[STRIPE WEBHOOK] Processing bulk order as regular order (pickup only)...');

                // CRITICAL: Check if order with this StripeSessionID already exists
                // This prevents duplicate orders if webhook is called multiple times
                const existingOrderCheck = await pool.request()
                    .input('stripeSessionId', sql.NVarChar, session.id)
                    .query('SELECT OrderID, Status FROM Orders WHERE StripeSessionID = @stripeSessionId');

                if (existingOrderCheck.recordset.length > 0) {
                    const existingOrder = existingOrderCheck.recordset[0];
                    console.warn('[STRIPE WEBHOOK] ⚠️ Order already exists for StripeSessionID:', session.id, 'OrderID:', existingOrder.OrderID, 'Status:', existingOrder.Status);
                    console.log('[STRIPE WEBHOOK] Skipping order creation to prevent duplicates');
                    return res.status(200).json({ received: true, message: 'Order already exists, skipped duplicate' });
                }

                if (!email) {
                    console.error('[STRIPE WEBHOOK] No customer email provided for bulk order. Order not saved.');
                    return res.status(200).send('No customer email, order not saved');
                }

                console.log('[STRIPE WEBHOOK] Looking up customer with email:', email);
                // Use case-insensitive email lookup - also get Email to ensure we use the correct one
                const customerResult = await pool.request()
                    .input('email', sql.NVarChar, email)
                    .query('SELECT CustomerID, FullName, Email FROM Customers WHERE LOWER(Email) = LOWER(@email)');
                console.log('[STRIPE WEBHOOK] Customer lookup result:', customerResult.recordset);

                let customer = customerResult.recordset[0];

                // If customer doesn't exist, create one for bulk order
                if (!customer) {
                    console.log('[STRIPE WEBHOOK] Customer not found, creating new customer for bulk order...');
                    const customerName = metadata.customerName || email.split('@')[0] || 'Guest Customer';

                    const createCustomerResult = await pool.request()
                        .input('email', sql.NVarChar, email)
                        .input('fullName', sql.NVarChar, customerName)
                        .query(`
                            INSERT INTO Customers (Email, FullName, IsActive, CreatedAt)
                            OUTPUT INSERTED.CustomerID, INSERTED.FullName, INSERTED.Email
                            VALUES (@email, @fullName, 1, GETDATE())
                        `);

                    customer = createCustomerResult.recordset[0];
                    console.log('[STRIPE WEBHOOK] Created new customer:', customer);
                }

                if (!customer) {
                    console.error('[STRIPE WEBHOOK] Failed to create/find customer for bulk order');
                    return res.status(200).send('Failed to create/find customer, order not saved');
                }

                console.log('[STRIPE WEBHOOK] Using customer for bulk order:', customer);

                // Use customer's email from database if available, otherwise use Stripe email
                const bulkEmailToUse = customer.Email || email;
                console.log('[STRIPE WEBHOOK] Bulk order - Using email for receipt:', bulkEmailToUse, '(from DB:', customer.Email, ', from Stripe:', email, ')');

                // Use the already parsed bulkItems from above
                if (!Array.isArray(bulkItems) || bulkItems.length === 0) {
                    console.error('[STRIPE WEBHOOK] Bulk order items is empty or malformed. Items:', bulkItems);
                    return res.status(200).send('Bulk order items is empty, order not saved');
                }

                console.log('[STRIPE WEBHOOK] Bulk order has', bulkItems.length, 'items');

                // Parse amounts - all should be in PHP
                const subtotal = parseFloat(metadata.subtotal) || 0;
                const discount = parseFloat(metadata.discount) || 0;
                let total = parseFloat(metadata.total) || 0;

                // Check if total is from Stripe amount_total (in cents)
                if (total > 100000 || (session.amount_total && Math.abs(total - session.amount_total) < 1)) {
                    console.log('[STRIPE WEBHOOK] Total appears to be in cents, converting to PHP:', total, '->', total / 100);
                    total = total / 100;
                } else if (total === 0 && session.amount_total) {
                    total = session.amount_total / 100;
                    console.log('[STRIPE WEBHOOK] Using session.amount_total (converted from cents):', session.amount_total, '->', total);
                }

                // IMPORTANT: Always use session.amount_total from Stripe as the source of truth
                const totalAmount = session.amount_total / 100; // Stripe total in PHP (converted from cents)

                console.log('[STRIPE WEBHOOK] Bulk order amounts - subtotal:', subtotal, 'discount:', discount, 'total (PHP):', total);
                console.log('[STRIPE WEBHOOK] Using Stripe amount_total as authoritative total:', totalAmount);

                const pickupDate = metadata.pickupDate ? String(metadata.pickupDate).trim() : null;

                // Parse and validate pickup date
                let pickupDateToSave = null;
                if (pickupDate && pickupDate !== '' && pickupDate !== 'null' && pickupDate !== 'undefined') {
                    try {
                        const dateObj = new Date(pickupDate);
                        if (!isNaN(dateObj.getTime())) {
                            pickupDateToSave = dateObj;
                        }
                    } catch (e) {
                        console.error('[STRIPE WEBHOOK] Error converting bulk order pickup date:', e.message);
                    }
                }

                // Calculate total quantity for BulkOrders reference
                const totalQuantity = bulkItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

                // Create regular Order (same as regular orders) using transaction
                const transaction = new sql.Transaction(pool);
                await transaction.begin();

                try {
                    // Get Manila timezone date
                    const manilaTime = getManilaTime();

                    // Bulk orders are pickup only
                    const deliveryType = 'pickup';
                    const serviceType = 'Pick up';
                    const shippingCost = 0; // No shipping for pickup
                    const tax = parseFloat(metadata.tax) || (subtotal * 0.12);
                    const extraDeliveryFee = parseFloat(metadata.extraDeliveryFee) || 0;

                    // Check if ExtraDeliveryFee column exists in Orders table
                    let hasExtraDeliveryFeeColumn = false;
                    try {
                        const columnCheck = await transaction.request().query(`
                            SELECT COUNT(*) as columnExists
                            FROM sys.columns 
                            WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
                            AND name = 'ExtraDeliveryFee'
                        `);
                        hasExtraDeliveryFeeColumn = columnCheck.recordset[0].columnExists > 0;
                        console.log('[STRIPE WEBHOOK] ExtraDeliveryFee column exists:', hasExtraDeliveryFeeColumn);
                    } catch (err) {
                        console.log('[STRIPE WEBHOOK] Could not check for ExtraDeliveryFee column, assuming it does not exist');
                    }

                    // Check if TransactionID column exists
                    let hasTransactionIDColumn = false;
                    try {
                        const transactionIdColumnCheck = await transaction.request().query(`
                            SELECT COUNT(*) as columnExists
                            FROM sys.columns 
                            WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
                            AND name = 'TransactionID'
                        `);
                        hasTransactionIDColumn = transactionIdColumnCheck.recordset[0].columnExists > 0;
                    } catch (err) {
                        console.log('[STRIPE WEBHOOK] Could not check for TransactionID column, assuming it does not exist');
                    }

                    // Prefer Stripe PaymentIntent id; fallback to internal TXN reference
                    const transactionId =
                        stripePaymentIntentIdFromCheckoutSession(session) || generateTransactionId(manilaTime);

                    console.log('[STRIPE WEBHOOK] Creating regular Order for bulk order with values:', {
                        customerId: customer.CustomerID,
                        totalAmount,
                        deliveryType,
                        serviceType,
                        status: 'Pending',
                        pickupDate: pickupDateToSave,
                        transactionId,
                        extraDeliveryFee,
                        hasExtraDeliveryFeeColumn
                    });

                    // Insert regular Order (same as regular orders)
                    const orderRequest = transaction.request()
                        .input('customerId', sql.Int, customer.CustomerID)
                        .input('status', sql.NVarChar, 'Pending')
                        .input('totalAmount', sql.Decimal(10, 2), totalAmount)
                        .input('paymentMethod', sql.NVarChar, 'E-Wallet')
                        .input('currency', sql.NVarChar, 'PHP')
                        .input('orderDate', sql.DateTime, manilaTime)
                        .input('paymentDate', sql.DateTime, manilaTime)
                        .input('shippingAddressId', sql.Int, null)
                        .input('deliveryType', sql.NVarChar, deliveryType)
                        .input('serviceType', sql.NVarChar, serviceType)
                        .input('deliveryCost', sql.Decimal(10, 2), shippingCost)
                        .input('stripeSessionId', sql.NVarChar, session.id)
                        .input('paymentStatus', sql.NVarChar, 'Paid');

                    // Add ExtraDeliveryFee if column exists
                    if (hasExtraDeliveryFeeColumn) {
                        orderRequest.input('extraDeliveryFee', sql.Decimal(10, 2), extraDeliveryFee);
                        console.log('[STRIPE WEBHOOK] Adding ExtraDeliveryFee to order:', extraDeliveryFee);
                    } else {
                        console.log('[STRIPE WEBHOOK] ExtraDeliveryFee column does not exist, skipping. Value would have been:', extraDeliveryFee);
                    }

                    if (pickupDateToSave && pickupDateToSave instanceof Date && !isNaN(pickupDateToSave.getTime())) {
                        orderRequest.input('pickupDate', sql.DateTime2, pickupDateToSave);
                    } else {
                        orderRequest.input('pickupDate', sql.DateTime2, null);
                    }

                    if (hasTransactionIDColumn) {
                        orderRequest.input('transactionId', sql.NVarChar, transactionId);
                    }

                    // Build INSERT statement conditionally
                    let insertQuery = `INSERT INTO Orders (CustomerID, Status, TotalAmount, PaymentMethod, Currency, OrderDate, PaymentDate, ShippingAddressID, DeliveryType, ServiceType, DeliveryCost, StripeSessionID, PaymentStatus, PickupDate`;
                    let valuesQuery = `VALUES (@customerId, @status, @totalAmount, @paymentMethod, @currency, @orderDate, @paymentDate, @shippingAddressId, @deliveryType, @serviceType, @deliveryCost, @stripeSessionId, @paymentStatus, @pickupDate`;

                    if (hasExtraDeliveryFeeColumn) {
                        insertQuery += `, ExtraDeliveryFee`;
                        valuesQuery += `, @extraDeliveryFee`;
                    }

                    if (hasTransactionIDColumn) {
                        insertQuery += `, TransactionID`;
                        valuesQuery += `, @transactionId`;
                    }

                    insertQuery += `) OUTPUT INSERTED.OrderID ` + valuesQuery + `)`;

                    const orderResult = await orderRequest.query(insertQuery);

                    const orderId = orderResult.recordset[0].OrderID;
                    console.log('[STRIPE WEBHOOK] Regular Order created for bulk order with OrderID:', orderId);

                    // Generate and update reference number
                    const referenceNumber = generateReferenceNumber(manilaTime, orderId);
                    await transaction.request()
                        .input('orderId', sql.Int, orderId)
                        .input('referenceNumber', sql.NVarChar, referenceNumber)
                        .query('UPDATE Orders SET ReferenceNumber = @referenceNumber WHERE OrderID = @orderId');
                    console.log('[STRIPE WEBHOOK] Reference number generated:', referenceNumber);

                    // Always try to update transaction ID (even if column check failed, in case column exists)
                    // This ensures transaction ID is set if the column exists
                    console.log('[STRIPE WEBHOOK] Attempting to update TransactionID for bulk order OrderID:', orderId, 'TransactionID:', transactionId);
                    try {
                        const updateResult = await transaction.request()
                            .input('orderId', sql.Int, orderId)
                            .input('transactionId', sql.NVarChar, transactionId)
                            .query('UPDATE Orders SET TransactionID = @transactionId WHERE OrderID = @orderId');

                        console.log('[STRIPE WEBHOOK] UPDATE query executed for bulk order. Rows affected:', updateResult.rowsAffected);

                        // Verify the update worked (within the same transaction)
                        const verifyResult = await transaction.request()
                            .input('orderId', sql.Int, orderId)
                            .query('SELECT TransactionID FROM Orders WHERE OrderID = @orderId');

                        if (verifyResult.recordset.length > 0) {
                            const savedTransactionId = verifyResult.recordset[0].TransactionID;
                            console.log('[STRIPE WEBHOOK] ✅ Transaction ID updated successfully for bulk order. Saved value:', savedTransactionId);
                            if (savedTransactionId !== transactionId) {
                                console.warn('[STRIPE WEBHOOK] ⚠️ WARNING: Saved TransactionID does not match generated one!');
                            }
                        } else {
                            console.warn('[STRIPE WEBHOOK] ⚠️ Could not verify TransactionID update for bulk order - order not found');
                        }
                    } catch (updateErr) {
                        // If update fails, it means column doesn't exist - log but don't fail the order
                        console.error('[STRIPE WEBHOOK] ❌ Error updating TransactionID for bulk order:', updateErr.message);
                        console.error('[STRIPE WEBHOOK] Error details:', updateErr);
                        console.log('[STRIPE WEBHOOK] 💡 Please run the migration script: backend/database/add_transaction_id_column.sql');
                    }

                    // Insert OrderItems from bulkItems (same as regular orders)
                    // Step 1: Deduplicate items by productId (string/UUID) - sum quantities for same products
                    // Normalize productId to string for consistent comparison
                    const itemMap = new Map();
                    for (const item of bulkItems) {
                        const productIdStr = String(item.productId || '').trim();
                        if (!productIdStr || productIdStr === 'undefined' || productIdStr === 'null' || productIdStr === '') {
                            console.warn('[STRIPE WEBHOOK] Skipping item with invalid productId:', item);
                            continue;
                        }

                        // Use normalized productId as key (convert to string, handle UUID and numeric)
                        const key = productIdStr.toLowerCase(); // Normalize to lowercase for comparison

                        if (itemMap.has(key)) {
                            // Sum quantities for duplicate products
                            const existing = itemMap.get(key);
                            const existingQty = parseInt(existing.quantity) || 0;
                            const newQty = parseInt(item.quantity) || 0;
                            existing.quantity = existingQty + newQty;
                            console.log(`[STRIPE WEBHOOK] Merged duplicate product ${key}: ${existingQty} + ${newQty} = ${existing.quantity}`);
                        } else {
                            itemMap.set(key, { ...item });
                        }
                    }

                    const deduplicatedItems = Array.from(itemMap.values());
                    console.log('[STRIPE WEBHOOK] Bulk order items before deduplication:', bulkItems.length, 'after:', deduplicatedItems.length);

                    if (bulkItems.length !== deduplicatedItems.length) {
                        console.warn('[STRIPE WEBHOOK] ⚠️ Duplicate items detected in bulk order! Original items:', bulkItems.map(i => ({ productId: i.productId, quantity: i.quantity })));
                    }

                    // Step 2: Convert all items to ProductID (integer) and deduplicate again by ProductID
                    // This handles cases where different UUIDs map to the same ProductID
                    const productIdMap = new Map(); // Key: ProductID (integer), Value: { quantity, unitPrice, productName }

                    for (const item of deduplicatedItems) {
                        try {
                            // Convert productId (could be UUID) to integer ProductID
                            let productId = null;
                            if (item.productId) {
                                const productIdStr = String(item.productId);
                                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productIdStr);

                                if (isUUID) {
                                    const productResult = await transaction.request()
                                        .input('publicId', sql.NVarChar, productIdStr)
                                        .query('SELECT ProductID, Name FROM Products WHERE PublicId = @publicId AND IsActive = 1');

                                    if (productResult.recordset.length > 0) {
                                        productId = productResult.recordset[0].ProductID;
                                    }
                                } else {
                                    productId = parseInt(productIdStr);
                                }
                            }

                            if (!productId || isNaN(productId)) {
                                console.error('[STRIPE WEBHOOK] Invalid productId for bulk order item:', item.productId);
                                continue;
                            }

                            // Get product details
                            const productResult = await transaction.request()
                                .input('productId', sql.Int, productId)
                                .query('SELECT ProductID, Name FROM Products WHERE ProductID = @productId AND IsActive = 1');

                            if (productResult.recordset.length === 0) {
                                console.error('[STRIPE WEBHOOK] Product not found for ID:', productId);
                                continue;
                            }

                            const product = productResult.recordset[0];
                            const quantity = parseInt(item.quantity) || 1;
                            const unitPrice = parseFloat(item.unitPrice || item.price || 0);

                            // Deduplicate by ProductID (integer) - merge quantities if same ProductID
                            if (productIdMap.has(productId)) {
                                const existing = productIdMap.get(productId);
                                existing.quantity = (existing.quantity || 0) + quantity;
                                console.log(`[STRIPE WEBHOOK] Merged duplicate ProductID ${productId}: ${existing.quantity - quantity} + ${quantity} = ${existing.quantity}`);
                            } else {
                                productIdMap.set(productId, {
                                    productId: productId,
                                    product: product,
                                    quantity: quantity,
                                    unitPrice: unitPrice
                                });
                            }
                        } catch (itemErr) {
                            console.error('[STRIPE WEBHOOK] Error processing bulk order item:', itemErr);
                        }
                    }

                    // Step 3: Check for existing items and insert/update deduplicated items into OrderItems
                    // First, check if order items already exist (in case webhook runs multiple times)
                    const existingItemsResult = await transaction.request()
                        .input('orderId', sql.Int, orderId)
                        .query(`
                            SELECT ProductID, VariationID, SUM(Quantity) as TotalQuantity
                            FROM OrderItems
                            WHERE OrderID = @orderId
                            GROUP BY ProductID, VariationID
                        `);

                    const existingItemsMap = new Map();
                    for (const existing of existingItemsResult.recordset) {
                        const key = `${existing.ProductID}_${existing.VariationID || 'null'}`;
                        existingItemsMap.set(key, parseInt(existing.TotalQuantity) || 0);
                    }

                    let itemsInserted = 0;
                    let itemsSkipped = 0;
                    let itemsUpdated = 0;

                    for (const [productId, itemData] of productIdMap) {
                        try {
                            const { product, quantity, unitPrice } = itemData;

                            // Calculate price with discount if applicable
                            let priceAtPurchase = unitPrice;
                            if (discount > 0 && subtotal > 0) {
                                const discountRatio = 1 - (discount / subtotal);
                                priceAtPurchase = unitPrice * discountRatio;
                            }

                            // Check if this ProductID already exists in OrderItems for this order
                            const key = `${product.ProductID}_null`; // VariationID is null for bulk orders
                            const existingQuantity = existingItemsMap.get(key) || 0;

                            if (existingQuantity > 0) {
                                // Item already exists - check if we need to update quantity
                                // Only update if the new quantity is different (to avoid unnecessary updates)
                                if (existingQuantity !== quantity) {
                                    // Delete existing items for this ProductID and insert new one with correct quantity
                                    await transaction.request()
                                        .input('orderId', sql.Int, orderId)
                                        .input('productId', sql.Int, product.ProductID)
                                        .input('variationId', sql.Int, null)
                                        .query(`
                                            DELETE FROM OrderItems
                                            WHERE OrderID = @orderId 
                                              AND ProductID = @productId 
                                              AND (VariationID = @variationId OR VariationID IS NULL)
                                        `);

                                    // Insert with correct quantity
                                    await transaction.request()
                                        .input('orderId', sql.Int, orderId)
                                        .input('productId', sql.Int, product.ProductID)
                                        .input('productName', sql.NVarChar(255), product.Name)
                                        .input('quantity', sql.Int, quantity)
                                        .input('priceAtPurchase', sql.Decimal(10, 2), priceAtPurchase)
                                        .input('variationId', sql.Int, null)
                                        .query(`
                                            INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                            VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)
                                        `);

                                    console.log(`[STRIPE WEBHOOK] Replaced existing OrderItem for ProductID ${product.ProductID}: ${existingQuantity} -> ${quantity}`);
                                    itemsUpdated++;
                                } else {
                                    // Quantity matches, skip insert
                                    console.log(`[STRIPE WEBHOOK] OrderItem for ProductID ${product.ProductID} already exists with correct quantity, skipping`);
                                    itemsSkipped++;
                                }
                            } else {
                                // Insert new OrderItem
                                await transaction.request()
                                    .input('orderId', sql.Int, orderId)
                                    .input('productId', sql.Int, product.ProductID)
                                    .input('productName', sql.NVarChar(255), product.Name)
                                    .input('quantity', sql.Int, quantity)
                                    .input('priceAtPurchase', sql.Decimal(10, 2), priceAtPurchase)
                                    .input('variationId', sql.Int, null)
                                    .query(`
                                        INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                        VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)
                                    `);

                                itemsInserted++;
                            }
                        } catch (itemErr) {
                            // Check if error is due to duplicate key constraint
                            if (itemErr.message && (itemErr.message.includes('duplicate') || itemErr.message.includes('UNIQUE'))) {
                                console.warn(`[STRIPE WEBHOOK] Duplicate OrderItem detected for ProductID ${itemData.product?.ProductID}, skipping insert`);
                                itemsSkipped++;
                            } else {
                                console.error('[STRIPE WEBHOOK] Error inserting bulk order item:', itemErr);
                                itemsSkipped++;
                            }
                        }
                    }

                    console.log('[STRIPE WEBHOOK] Bulk order items inserted:', itemsInserted, 'updated:', itemsUpdated, 'skipped:', itemsSkipped);

                    // Also create BulkOrder record for reference (optional, for admin bulk orders page)
                    // Check if BulkOrders table has OrderID column
                    const bulkOrderColumnCheck = await transaction.request()
                        .query(`
                            SELECT COUNT(*) as columnExists
                            FROM sys.columns 
                            WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
                            AND name = 'OrderID'
                        `);

                    const hasOrderIDColumn = bulkOrderColumnCheck.recordset[0].columnExists > 0;

                    if (hasOrderIDColumn) {
                        // Create BulkOrder record linked to the Order
                        const bulkOrderResult = await transaction.request()
                            .input('customerId', sql.Int, customer.CustomerID)
                            .input('customerEmail', sql.NVarChar(255), email)
                            .input('orderId', sql.Int, orderId)
                            .input('totalQuantity', sql.Int, totalQuantity)
                            .input('subtotal', sql.Decimal(10, 2), subtotal)
                            .input('discount', sql.Decimal(10, 2), discount)
                            .input('grandTotal', sql.Decimal(10, 2), totalAmount)
                            .input('status', sql.NVarChar(50), 'Pending')
                            .input('pickupDate', sql.DateTime2, pickupDateToSave)
                            .query(`
                                INSERT INTO BulkOrders (
                                    CustomerID, CustomerEmail, OrderID, TotalQuantity, 
                                    Subtotal, DiscountAmount, GrandTotal, 
                                    Status, PickupDate, CreatedAt
                                )
                                OUTPUT INSERTED.BulkOrderID
                                VALUES (
                                    @customerId, @customerEmail, @orderId, @totalQuantity,
                                    @subtotal, @discount, @grandTotal,
                                    @status, @pickupDate, GETDATE()
                                )
                            `);

                        const bulkOrderId = bulkOrderResult.recordset[0].BulkOrderID;
                        console.log('[STRIPE WEBHOOK] BulkOrder record created with ID:', bulkOrderId, 'linked to OrderID:', orderId);
                    }

                    await transaction.commit();
                    console.log('[STRIPE WEBHOOK] Bulk order transaction committed successfully. OrderID:', orderId);

                    // NOTE: Stock is NOT decreased here - it will be decreased when Admin changes status to Processing
                    console.log('[STRIPE WEBHOOK] ⚠️ Stock NOT decreased for bulk order. Stock will be decreased when Admin changes order status to Processing.');

                    // Send order receipt email to customer for bulk orders
                    try {
                        console.log('[STRIPE WEBHOOK] 📧 Preparing to send bulk order receipt email...');
                        // Use customer's email from database if available, otherwise use Stripe email
                        // bulkEmailToUse is already defined earlier in the function scope
                        console.log('[STRIPE WEBHOOK] 📧 Customer Email (from DB):', customer.Email);
                        console.log('[STRIPE WEBHOOK] 📧 Customer Email (from Stripe):', email);
                        console.log('[STRIPE WEBHOOK] 📧 Customer Email (will use):', bulkEmailToUse);
                        console.log('[STRIPE WEBHOOK] 📧 Customer Name:', customer.FullName);
                        console.log('[STRIPE WEBHOOK] 📧 Order ID:', orderId);
                        console.log('[STRIPE WEBHOOK] 📧 Reference Number:', referenceNumber);

                        const { sendOrderReceiptEmail } = require('./utils/sendgridHelper');

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

                        console.log('[STRIPE WEBHOOK] 📧 Bulk order items fetched:', orderItemsResult.recordset.length);

                        if (orderItemsResult.recordset.length === 0) {
                            console.warn('[STRIPE WEBHOOK] ⚠️ No bulk order items found for email. Waiting 1 second and retrying...');
                            // Wait a moment and retry in case of timing issue
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            const retryResult = await pool.request()
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

                            console.log('[STRIPE WEBHOOK] 📧 Retry - Bulk order items fetched:', retryResult.recordset.length);
                            orderItemsResult.recordset = retryResult.recordset;
                        }

                        const orderItems = orderItemsResult.recordset.map(item => ({
                            name: item.Name,
                            quantity: item.Quantity,
                            price: item.PriceAtPurchase,
                            variationName: item.VariationName,
                            color: item.Color
                        }));

                        console.log('[STRIPE WEBHOOK] 📧 Calling sendOrderReceiptEmail for bulk order with:', {
                            email: email,
                            customerName: customer.FullName,
                            orderId: orderId,
                            referenceNumber: referenceNumber,
                            transactionId: transactionId,
                            itemsCount: orderItems.length
                        });

                        // Use customer's email from database if available, otherwise use Stripe email
                        // bulkEmailToUse is already defined earlier in the function scope

                        // Validate email before sending
                        if (!bulkEmailToUse || typeof bulkEmailToUse !== 'string' || !bulkEmailToUse.includes('@')) {
                            console.error('[STRIPE WEBHOOK] ❌ Invalid customer email address for bulk order:', bulkEmailToUse);
                            throw new Error(`Invalid customer email: ${bulkEmailToUse}`);
                        }

                        console.log('[STRIPE WEBHOOK] 📧 Sending bulk order receipt email to:', bulkEmailToUse);

                        const receiptEmailResult = await sendOrderReceiptEmail(
                            bulkEmailToUse,
                            customer.FullName,
                            {
                                orderId: orderId,
                                referenceNumber: referenceNumber,
                                transactionId: transactionId,
                                orderDate: manilaTime,
                                paymentMethod: paymentMethodToSave,
                                subtotal: subtotal,
                                shippingCost: 0, // Bulk orders are pickup only
                                extraDeliveryFee: 0,
                                taxAmount: tax,
                                totalAmount: totalAmount,
                                items: orderItems
                            }
                        );

                        if (process.env.NODE_ENV !== 'production') {
                            console.log('[STRIPE WEBHOOK] 📧 Bulk order email sending result:', JSON.stringify(receiptEmailResult, null, 2));
                        }

                        if (receiptEmailResult.success) {
                            console.log('[STRIPE WEBHOOK] ✅ Bulk order receipt email sent successfully to:', bulkEmailToUse);
                            if (receiptEmailResult.messageId) {
                                console.log('[STRIPE WEBHOOK] ✅ Message ID:', receiptEmailResult.messageId);
                            }
                        } else {
                            console.error('[STRIPE WEBHOOK] ⚠️ Failed to send bulk order receipt email to:', bulkEmailToUse);
                            console.error('[STRIPE WEBHOOK] ⚠️ Error message:', receiptEmailResult.message);
                            if (receiptEmailResult.error) {
                                console.error('[STRIPE WEBHOOK] ⚠️ Error details:', receiptEmailResult.error);
                            }
                        }
                    } catch (emailError) {
                        // Don't fail the webhook if email fails
                        console.error('[STRIPE WEBHOOK] ⚠️ Exception sending bulk order receipt email:', emailError);
                        console.error('[STRIPE WEBHOOK] ⚠️ Error stack:', emailError.stack);
                    }

                    return res.status(200).json({ received: true, orderId: orderId, orderType: 'bulk' });
                } catch (err) {
                    await transaction.rollback();
                    console.error('[STRIPE WEBHOOK] Error creating bulk order:', err);
                    console.error('[STRIPE WEBHOOK] Error details:', {
                        message: err.message,
                        code: err.code,
                        number: err.number,
                        state: err.state,
                        class: err.class,
                        serverName: err.serverName,
                        procName: err.procName,
                        lineNumber: err.lineNumber
                    });
                    throw err;
                }
            }

            // Regular order handling continues below
            // Find customer by email (for regular orders)
            if (!email) {
                console.error('[STRIPE WEBHOOK] No customer email provided for regular order. Order not saved.');
                return res.status(200).send('No customer email, order not saved');
            }

            console.log('[STRIPE WEBHOOK] Looking up customer with email:', email);
            // Use case-insensitive email lookup - also get Email to ensure we use the correct one
            const customerResult = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT CustomerID, FullName, Email FROM Customers WHERE LOWER(Email) = LOWER(@email)');
            console.log('[STRIPE WEBHOOK] Customer lookup result:', customerResult.recordset);
            const customer = customerResult.recordset[0];
            if (!customer) {
                console.error('[STRIPE WEBHOOK] Customer not found for email:', email);
                return res.status(200).send('Customer not found, order not saved');
            }
            console.log('[STRIPE WEBHOOK] Found customer:', customer);

            // Use customer's email from database if available, otherwise use Stripe email
            const emailToUse = customer.Email || email;
            console.log('[STRIPE WEBHOOK] Using email for receipt:', emailToUse, '(from DB:', customer.Email, ', from Stripe:', email, ')');

            if (!Array.isArray(cart) || cart.length === 0) {
                console.error('[STRIPE WEBHOOK] Cart is empty or malformed. Order not saved.');
                return res.status(200).send('Cart is empty or malformed, order not saved');
            }

            // Extract shipping info and tax from metadata
            if (process.env.NODE_ENV !== 'production') {
                console.log('[STRIPE WEBHOOK] ===== METADATA DEBUG =====');
                console.log('[STRIPE WEBHOOK] Full metadata object:', JSON.stringify(metadata, null, 2));
                console.log('[STRIPE WEBHOOK] metadata.extraDeliveryFee (raw):', metadata.extraDeliveryFee);
                console.log('[STRIPE WEBHOOK] metadata.extraDeliveryFee (type):', typeof metadata.extraDeliveryFee);
            }

            const deliveryType = metadata.deliveryType || 'pickup';
            const shippingCost = parseFloat(metadata.shippingCost) || 0;
            const extraDeliveryFee = parseFloat(metadata.extraDeliveryFee) || 0;
            const tax = parseFloat(metadata.tax) || 0;
            const subtotal = parseFloat(metadata.subtotal) || 0;

            console.log('[STRIPE WEBHOOK] Parsed values - Subtotal:', subtotal, 'Shipping:', shippingCost, 'Extra Delivery Fee:', extraDeliveryFee, 'Tax:', tax);
            console.log('[STRIPE WEBHOOK] ============================');

            console.log('[STRIPE WEBHOOK] Order breakdown - Subtotal:', subtotal, 'Shipping:', shippingCost, 'Extra Delivery Fee:', extraDeliveryFee, 'Tax:', tax, 'Total:', totalAmount);

            // Extract pickupDate - SIMPLIFIED VERSION
            let pickupDate = null;
            // Direct access from metadata
            if (metadata.pickupDate) {
                const pd = String(metadata.pickupDate).trim();
                if (pd && pd !== '' && pd !== 'null' && pd !== 'undefined') {
                    pickupDate = pd;
                }
            }

            let shippingAddressId = metadata.shippingAddressId ? parseInt(metadata.shippingAddressId) : null;

            // If no shipping address in metadata, try to get customer's default shipping address
            // Also do this for pickup so admin views can still display an address
            if (!shippingAddressId) {
                console.log('[STRIPE WEBHOOK] No shipping address in metadata, looking up customer default address for CustomerID:', customer.CustomerID);
                const addressResult = await pool.request()
                    .input('customerId', sql.Int, customer.CustomerID)
                    .query('SELECT AddressID FROM CustomerAddresses WHERE CustomerID = @customerId AND IsDefault = 1');

                if (addressResult.recordset.length > 0) {
                    shippingAddressId = addressResult.recordset[0].AddressID;
                    console.log('[STRIPE WEBHOOK] Found default shipping address ID:', shippingAddressId);
                } else {
                    console.log('[STRIPE WEBHOOK] No default shipping address found for customer');
                }
            }

            // Insert order
            // IMPORTANT: Always use session.amount_total from Stripe as the source of truth
            // This includes: subtotal + tax + shipping fee
            const totalAmountFromCart = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const totalAmount = session.amount_total / 100; // Stripe total in PHP (converted from cents)

            // Validate that we're using the correct total from Stripe
            const calculatedSubtotal = parseFloat(metadata.subtotal) || totalAmountFromCart;
            const calculatedTax = parseFloat(metadata.tax) || (calculatedSubtotal * 0.12);
            const calculatedShipping = parseFloat(metadata.shippingCost) || parseFloat(shippingCost) || 0;
            const calculatedExtraDeliveryFee = parseFloat(metadata.extraDeliveryFee) || parseFloat(extraDeliveryFee) || 0;
            const expectedTotal = calculatedSubtotal + calculatedTax + calculatedShipping + calculatedExtraDeliveryFee;

            console.log('[STRIPE WEBHOOK] ===== ORDER TOTAL VALIDATION =====');
            console.log('[STRIPE WEBHOOK] Subtotal (from metadata):', calculatedSubtotal);
            console.log('[STRIPE WEBHOOK] Tax (12%):', calculatedTax);
            console.log('[STRIPE WEBHOOK] Shipping:', calculatedShipping);
            console.log('[STRIPE WEBHOOK] Extra Delivery Fee:', calculatedExtraDeliveryFee);
            console.log('[STRIPE WEBHOOK] Expected Total (calc):', expectedTotal);
            console.log('[STRIPE WEBHOOK] Stripe amount_total (cents):', session.amount_total);
            console.log('[STRIPE WEBHOOK] Stripe Total Amount (PHP):', totalAmount);
            console.log('[STRIPE WEBHOOK] Cart items subtotal:', totalAmountFromCart);

            // Warn if there's a significant discrepancy (more than ₱1 difference due to rounding)
            if (Math.abs(expectedTotal - totalAmount) > 1) {
                console.warn('[STRIPE WEBHOOK] ⚠️ WARNING: Total mismatch! Expected:', expectedTotal, 'Stripe:', totalAmount, 'Difference:', Math.abs(expectedTotal - totalAmount));
                console.warn('[STRIPE WEBHOOK] Using Stripe amount_total as source of truth:', totalAmount);
            } else {
                console.log('[STRIPE WEBHOOK] ✅ Total amounts match (within rounding tolerance)');
            }
            console.log('[STRIPE WEBHOOK] =====================================');

            // Use Stripe's amount_total as the authoritative source - this is what customer was actually charged
            // This ensures the database TotalAmount matches exactly what Stripe shows

            // Get Manila timezone date
            const manilaTime = getManilaTime();

            // Determine payment method from metadata (only E-Wallet is supported)
            const webhookPaymentMethod = metadata.paymentMethod || 'E-Wallet';
            // Only E-Wallet payment method is allowed
            const paymentMethodToSave = 'E-Wallet';

            // Convert pickup date if provided - SIMPLIFIED
            let pickupDateToSave = null;
            if (pickupDate) {
                try {
                    const dateObj = new Date(pickupDate);
                    if (!isNaN(dateObj.getTime())) {
                        pickupDateToSave = dateObj;
                    } else {
                        console.error('[STRIPE WEBHOOK] Invalid pickup date format:', pickupDate);
                    }
                } catch (e) {
                    console.error('[STRIPE WEBHOOK] Error converting pickup date:', e.message);
                }
            }

            // Get ServiceType from RegionDeliveryRates or DeliveryRates
            // ServiceType is directly connected to RegionDeliveryRates for accurate service type
            let serviceTypeToSave = null;
            if (deliveryType === 'pickup') {
                serviceTypeToSave = 'Pick up';
            } else if (deliveryType && deliveryType.startsWith('rate_')) {
                const rateIdStr = deliveryType.replace('rate_', '');
                const rateId = parseInt(rateIdStr);

                if (isNaN(rateId)) {
                    console.warn('[STRIPE WEBHOOK] Invalid rate ID:', rateIdStr, 'from deliveryType:', deliveryType);
                    serviceTypeToSave = 'Standard Delivery';
                } else {
                    try {
                        // Try RegionDeliveryRates first (primary source for service type)
                        const regionRateResult = await pool.request()
                            .input('regionRateId', sql.Int, rateId)
                            .query('SELECT ServiceType FROM RegionDeliveryRates WHERE RegionRateID = @regionRateId AND IsActive = 1');

                        if (regionRateResult.recordset.length > 0 && regionRateResult.recordset[0].ServiceType) {
                            serviceTypeToSave = regionRateResult.recordset[0].ServiceType.trim();
                            // Ensure " Delivery" suffix if not already present and not "Pick up"
                            if (!serviceTypeToSave.includes('Delivery') && serviceTypeToSave !== 'Pick up') {
                                serviceTypeToSave = serviceTypeToSave + ' Delivery';
                            }
                            console.log('[STRIPE WEBHOOK] Resolved ServiceType from RegionDeliveryRates:', serviceTypeToSave, '(RateID:', rateId, ')');
                        } else {
                            // Try DeliveryRates as fallback
                            const deliveryRateResult = await pool.request()
                                .input('rateId', sql.Int, rateId)
                                .query('SELECT ServiceType FROM DeliveryRates WHERE RateID = @rateId AND IsActive = 1');

                            if (deliveryRateResult.recordset.length > 0 && deliveryRateResult.recordset[0].ServiceType) {
                                serviceTypeToSave = deliveryRateResult.recordset[0].ServiceType.trim();
                                if (!serviceTypeToSave.includes('Delivery') && serviceTypeToSave !== 'Pick up') {
                                    serviceTypeToSave = serviceTypeToSave + ' Delivery';
                                }
                                console.log('[STRIPE WEBHOOK] Resolved ServiceType from DeliveryRates:', serviceTypeToSave, '(RateID:', rateId, ')');
                            } else {
                                console.warn('[STRIPE WEBHOOK] Rate ID', rateId, 'not found in RegionDeliveryRates or DeliveryRates. Using default.');
                                serviceTypeToSave = 'Standard Delivery';
                            }
                        }
                    } catch (err) {
                        console.error('[STRIPE WEBHOOK] Error querying ServiceType for rate', rateId, ':', err.message);
                        serviceTypeToSave = 'Standard Delivery';
                    }
                }
            } else {
                serviceTypeToSave = deliveryType || 'Standard Delivery';
            }

            // Check if ExtraDeliveryFee column exists in Orders table
            let hasExtraDeliveryFeeColumn = false;
            try {
                const columnCheck = await pool.request().query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
                    AND name = 'ExtraDeliveryFee'
                `);
                hasExtraDeliveryFeeColumn = columnCheck.recordset[0].columnExists > 0;
                console.log('[STRIPE WEBHOOK] ExtraDeliveryFee column exists:', hasExtraDeliveryFeeColumn);
            } catch (err) {
                console.log('[STRIPE WEBHOOK] Could not check for ExtraDeliveryFee column, assuming it does not exist:', err.message);
            }

            // Check if TransactionID column exists in Orders table
            let hasTransactionIDColumn = false;
            try {
                const transactionIdColumnCheck = await pool.request().query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
                    AND name = 'TransactionID'
                `);
                hasTransactionIDColumn = transactionIdColumnCheck.recordset[0].columnExists > 0;
                console.log('[STRIPE WEBHOOK] TransactionID column exists:', hasTransactionIDColumn);
            } catch (err) {
                console.log('[STRIPE WEBHOOK] Could not check for TransactionID column, assuming it does not exist:', err.message);
            }

            // Prefer Stripe PaymentIntent id (pi_) for gateway reconciliation; fallback to TXN
            const transactionId =
                stripePaymentIntentIdFromCheckoutSession(session) || generateTransactionId(manilaTime);
            console.log('[STRIPE WEBHOOK] Order TransactionID / gateway id:', transactionId);

            // Build the request with all parameters
            const request = pool.request()
                .input('customerId', sql.Int, customer.CustomerID)
                .input('status', sql.NVarChar, 'Pending')
                .input('totalAmount', sql.Decimal(10, 2), totalAmount)
                .input('paymentMethod', sql.NVarChar, paymentMethodToSave)
                .input('currency', sql.NVarChar, 'PHP')
                .input('orderDate', sql.DateTime, manilaTime)
                .input('paymentDate', sql.DateTime, manilaTime)
                .input('shippingAddressId', sql.Int, shippingAddressId)
                .input('deliveryType', sql.NVarChar, deliveryType)
                .input('serviceType', sql.NVarChar, serviceTypeToSave)
                .input('deliveryCost', sql.Decimal(10, 2), shippingCost)
                .input('stripeSessionId', sql.NVarChar, session.id)
                .input('paymentStatus', sql.NVarChar, 'Paid');

            // Handle pickupDate - explicitly set to null if not provided
            if (pickupDateToSave && pickupDateToSave instanceof Date && !isNaN(pickupDateToSave.getTime())) {
                request.input('pickupDate', sql.DateTime2, pickupDateToSave);
            } else {
                // Use sql.Null() or explicitly pass null - but use DateTime2 to match the column type
                request.input('pickupDate', sql.DateTime2, null);
            }

            // Add ExtraDeliveryFee if column exists
            if (hasExtraDeliveryFeeColumn) {
                request.input('extraDeliveryFee', sql.Decimal(10, 2), extraDeliveryFee);
                console.log('[STRIPE WEBHOOK] ✅ Adding ExtraDeliveryFee to order:', extraDeliveryFee, '(parsed from metadata:', metadata.extraDeliveryFee, ')');
            } else {
                console.log('[STRIPE WEBHOOK] ⚠️ ExtraDeliveryFee column does not exist, skipping. Value would have been:', extraDeliveryFee, '(from metadata:', metadata.extraDeliveryFee, ')');
            }

            // Add TransactionID if column exists
            if (hasTransactionIDColumn) {
                request.input('transactionId', sql.NVarChar, transactionId);
            }

            // Build INSERT statement conditionally
            let insertQuery = `INSERT INTO Orders (CustomerID, Status, TotalAmount, PaymentMethod, Currency, OrderDate, PaymentDate, ShippingAddressID, DeliveryType, ServiceType, DeliveryCost, StripeSessionID, PaymentStatus, PickupDate`;
            let valuesQuery = `VALUES (@customerId, @status, @totalAmount, @paymentMethod, @currency, @orderDate, @paymentDate, @shippingAddressId, @deliveryType, @serviceType, @deliveryCost, @stripeSessionId, @paymentStatus, @pickupDate`;

            if (hasExtraDeliveryFeeColumn) {
                insertQuery += `, ExtraDeliveryFee`;
                valuesQuery += `, @extraDeliveryFee`;
            }

            if (hasTransactionIDColumn) {
                insertQuery += `, TransactionID`;
                valuesQuery += `, @transactionId`;
            }

            insertQuery += `) OUTPUT INSERTED.OrderID ` + valuesQuery + `)`;

            const orderResult = await request.query(insertQuery);
            const orderId = orderResult.recordset[0].OrderID;
            console.log('[STRIPE WEBHOOK] Order inserted successfully with OrderID:', orderId);

            // Generate and update reference number
            const referenceNumber = generateReferenceNumber(manilaTime, orderId);
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('referenceNumber', sql.NVarChar, referenceNumber)
                .query('UPDATE Orders SET ReferenceNumber = @referenceNumber WHERE OrderID = @orderId');
            console.log('[STRIPE WEBHOOK] Reference number generated:', referenceNumber);

            // Always try to update transaction ID (even if column check failed, in case column exists)
            // This ensures transaction ID is set if the column exists
            console.log('[STRIPE WEBHOOK] Attempting to update TransactionID for OrderID:', orderId, 'TransactionID:', transactionId);
            try {
                const updateResult = await pool.request()
                    .input('orderId', sql.Int, orderId)
                    .input('transactionId', sql.NVarChar, transactionId)
                    .query('UPDATE Orders SET TransactionID = @transactionId WHERE OrderID = @orderId');

                console.log('[STRIPE WEBHOOK] UPDATE query executed. Rows affected:', updateResult.rowsAffected);

                // Verify the update worked
                const verifyResult = await pool.request()
                    .input('orderId', sql.Int, orderId)
                    .query('SELECT TransactionID FROM Orders WHERE OrderID = @orderId');

                if (verifyResult.recordset.length > 0) {
                    const savedTransactionId = verifyResult.recordset[0].TransactionID;
                    console.log('[STRIPE WEBHOOK] ✅ Transaction ID updated successfully. Saved value:', savedTransactionId);
                    if (savedTransactionId !== transactionId) {
                        console.warn('[STRIPE WEBHOOK] ⚠️ WARNING: Saved TransactionID does not match generated one!');
                    }
                } else {
                    console.warn('[STRIPE WEBHOOK] ⚠️ Could not verify TransactionID update - order not found');
                }
            } catch (updateErr) {
                // If update fails, it means column doesn't exist - log but don't fail the order
                console.error('[STRIPE WEBHOOK] ❌ Error updating TransactionID:', updateErr.message);
                console.error('[STRIPE WEBHOOK] Error details:', updateErr);
                console.log('[STRIPE WEBHOOK] 💡 Please run the migration script: backend/database/add_transaction_id_column.sql');
            }
            // Insert order items
            let itemsInserted = 0;
            let itemsSkipped = 0;

            if (!cart || !Array.isArray(cart) || cart.length === 0) {
                console.error('[STRIPE WEBHOOK] ERROR: Cart is empty or invalid');
            } else {
                for (const item of cart) {
                    try {
                        // Skip shipping and tax items
                        if (item.id === 'shipping' || item.name === 'Shipping' || item.name === 'shipping' || item.name === 'Delivery Fee' ||
                            item.id === 'tax' || item.name === 'Tax' || item.name === 'tax' || item.name === 'Tax (12%)') {
                            itemsSkipped++;
                            continue;
                        }

                        // Find product by ID or name - Handle different item structures from frontend
                        const productIdValue = item.id || item.productId || item.product?.id || item.product?.ProductID;
                        const productNameValue = item.name || item.productName || item.product?.name;

                        let product = null;
                        let productResult;

                        if (productIdValue && productIdValue !== 'shipping') {
                            const resolvedId = await resolveProductId(productIdValue);
                            if (resolvedId && resolvedId > 0) {
                                productResult = await pool.request()
                                    .input('id', sql.Int, resolvedId)
                                    .query('SELECT ProductID, Name FROM Products WHERE ProductID = @id AND IsActive = 1');

                                if (productResult.recordset.length > 0) {
                                    product = productResult.recordset[0];
                                }
                            }
                        }

                        // If not found by ID, try by name
                        if (!product && productNameValue && productNameValue !== 'Shipping' && productNameValue !== 'shipping' && productNameValue !== 'Delivery Fee') {
                            productResult = await pool.request()
                                .input('name', sql.NVarChar, productNameValue.trim())
                                .query('SELECT ProductID, Name FROM Products WHERE Name = @name AND IsActive = 1');

                            if (productResult.recordset.length > 0) {
                                product = productResult.recordset[0];
                            } else {
                                // Try fuzzy search
                                productResult = await pool.request()
                                    .input('name', sql.NVarChar, '%' + productNameValue.trim() + '%')
                                    .query('SELECT TOP 1 ProductID, Name FROM Products WHERE Name LIKE @name AND IsActive = 1');

                                if (productResult.recordset.length > 0) {
                                    product = productResult.recordset[0];
                                }
                            }
                        }

                        if (!product) {
                            console.error('[STRIPE WEBHOOK] Product not found for item:', item.name || item.id);
                            itemsSkipped++;
                            continue;
                        }

                        // Validate required fields
                        const quantity = parseInt(item.quantity) || 0;
                        const price = parseFloat(item.price) || 0;

                        if (quantity <= 0) {
                            console.error('[STRIPE WEBHOOK] ❌ Invalid quantity for item:', item);
                            itemsSkipped++;
                            continue;
                        }

                        // Parse variation ID if present
                        let variationId = null;
                        if (item.variationId !== undefined && item.variationId !== null) {
                            variationId = parseInt(item.variationId);
                            if (isNaN(variationId)) {
                                variationId = null;
                            }
                        }

                        await pool.request()
                            .input('orderId', sql.Int, orderId)
                            .input('productId', sql.Int, product.ProductID)
                            .input('productName', sql.NVarChar(255), product.Name)
                            .input('quantity', sql.Int, quantity)
                            .input('priceAtPurchase', sql.Decimal(10, 2), price)
                            .input('variationId', sql.Int, variationId)
                            .query(`INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                    VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)`);

                        itemsInserted++;
                    } catch (itemError) {
                        console.error('[STRIPE WEBHOOK] Error processing order item:', itemError.message);
                        itemsSkipped++;
                    }
                }
            }

            if (itemsInserted === 0) {
                console.error('[STRIPE WEBHOOK] WARNING: No order items were inserted for OrderID:', orderId);
            }

            // NOTE: Stock is NOT decreased when order is created with "Pending" status
            // Stock will be decreased when order status changes to "Processing" by Admin/Manager
            console.log('[STRIPE WEBHOOK] Order created with Pending status. Stock will be decreased when status changes to Processing.');

            // Send order receipt email to customer
            console.log('[STRIPE WEBHOOK] ===== STARTING EMAIL SENDING PROCESS =====');
            console.log('[STRIPE WEBHOOK] OrderID:', orderId);
            console.log('[STRIPE WEBHOOK] ReferenceNumber:', referenceNumber);
            console.log('[STRIPE WEBHOOK] Customer Email (from DB):', customer.Email);
            console.log('[STRIPE WEBHOOK] Customer Email (from Stripe):', email);
            console.log('[STRIPE WEBHOOK] Email to use:', emailToUse);
            console.log('[STRIPE WEBHOOK] SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
            console.log('[STRIPE WEBHOOK] SENDGRID_API_KEY length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);

            try {
                console.log('[STRIPE WEBHOOK] 📧 Preparing to send order receipt email...');
                // Use customer's email from database if available, otherwise use Stripe email
                // emailToUse is already defined earlier in the function scope
                console.log('[STRIPE WEBHOOK] 📧 Customer Email (from DB):', customer.Email);
                console.log('[STRIPE WEBHOOK] 📧 Customer Email (from Stripe):', email);
                console.log('[STRIPE WEBHOOK] 📧 Customer Email (will use):', emailToUse);
                console.log('[STRIPE WEBHOOK] 📧 Customer Name:', customer.FullName);
                console.log('[STRIPE WEBHOOK] 📧 Order ID:', orderId);
                console.log('[STRIPE WEBHOOK] 📧 Reference Number:', referenceNumber);

                // Verify SendGrid helper can be loaded
                console.log('[STRIPE WEBHOOK] 📧 Loading sendOrderReceiptEmail function...');
                const { sendOrderReceiptEmail } = require('./utils/sendgridHelper');
                console.log('[STRIPE WEBHOOK] 📧 sendOrderReceiptEmail function loaded successfully');

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

                console.log('[STRIPE WEBHOOK] 📧 Order items fetched:', orderItemsResult.recordset.length);

                if (orderItemsResult.recordset.length === 0) {
                    console.warn('[STRIPE WEBHOOK] ⚠️ No order items found for email. Waiting 1 second and retrying...');
                    // Wait a moment and retry in case of timing issue
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const retryResult = await pool.request()
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

                    console.log('[STRIPE WEBHOOK] 📧 Retry - Order items fetched:', retryResult.recordset.length);
                    orderItemsResult.recordset = retryResult.recordset;
                }

                const orderItems = orderItemsResult.recordset.map(item => ({
                    name: item.Name,
                    quantity: item.Quantity,
                    price: item.PriceAtPurchase,
                    variationName: item.VariationName,
                    color: item.Color
                }));

                console.log('[STRIPE WEBHOOK] 📧 Calling sendOrderReceiptEmail with:', {
                    email: email,
                    customerName: customer.FullName,
                    orderId: orderId,
                    referenceNumber: referenceNumber,
                    transactionId: transactionId,
                    itemsCount: orderItems.length
                });

                // Use customer's email from database if available, otherwise use Stripe email
                // emailToUse is already defined earlier in the function scope

                // Validate email before sending
                if (!emailToUse || typeof emailToUse !== 'string' || !emailToUse.includes('@')) {
                    console.error('[STRIPE WEBHOOK] ❌ Invalid customer email address:', emailToUse);
                    throw new Error(`Invalid customer email: ${emailToUse}`);
                }

                console.log('[STRIPE WEBHOOK] 📧 Sending receipt email to:', emailToUse);

                const receiptEmailResult = await sendOrderReceiptEmail(
                    emailToUse,
                    customer.FullName,
                    {
                        orderId: orderId,
                        referenceNumber: referenceNumber,
                        transactionId: transactionId,
                        orderDate: manilaTime,
                        paymentMethod: paymentMethodToSave,
                        subtotal: calculatedSubtotal,
                        shippingCost: calculatedShipping,
                        extraDeliveryFee: calculatedExtraDeliveryFee,
                        taxAmount: calculatedTax,
                        totalAmount: totalAmount,
                        items: orderItems
                    }
                );

                if (process.env.NODE_ENV !== 'production') {
                    console.log('[STRIPE WEBHOOK] 📧 Email sending result:', JSON.stringify(receiptEmailResult, null, 2));
                }

                if (receiptEmailResult.success) {
                    console.log('[STRIPE WEBHOOK] ✅ Order receipt email sent successfully to:', emailToUse);
                    if (receiptEmailResult.messageId) {
                        console.log('[STRIPE WEBHOOK] ✅ Message ID:', receiptEmailResult.messageId);
                    }
                } else {
                    console.error('[STRIPE WEBHOOK] ⚠️ Failed to send order receipt email to:', emailToUse);
                    console.error('[STRIPE WEBHOOK] ⚠️ Error message:', receiptEmailResult.message);
                    if (receiptEmailResult.error) {
                        console.error('[STRIPE WEBHOOK] ⚠️ Error details:', receiptEmailResult.error);
                    }
                }
            } catch (emailError) {
                // Don't fail the webhook if email fails
                console.error('[STRIPE WEBHOOK] ⚠️ Exception sending order receipt email:', emailError);
                console.error('[STRIPE WEBHOOK] ⚠️ Error stack:', emailError.stack);
                console.error('[STRIPE WEBHOOK] ⚠️ Email sending failed, but order was created successfully');
            }

            console.log('[STRIPE WEBHOOK] ===== EMAIL SENDING PROCESS COMPLETED =====');

            // Return success response after order is created and email is sent (or attempted)
            console.log('[STRIPE WEBHOOK] ✅ Regular order processing completed. Returning success response.');
            return res.status(200).json({
                received: true,
                orderId: orderId,
                orderType: 'regular',
                emailSent: true
            });

        } catch (err) {
            console.error('[STRIPE WEBHOOK] Error saving order:', err);
            console.error('[STRIPE WEBHOOK] Error stack:', err.stack);
            console.error('[STRIPE WEBHOOK] Error details:', {
                message: err.message,
                code: err.code,
                number: err.number,
                state: err.state,
                class: err.class,
                serverName: err.serverName,
                procName: err.procName,
                lineNumber: err.lineNumber
            });
            // Return error response so Stripe knows the webhook failed
            return res.status(500).send(`Webhook Error: ${err.message}`);
        }
    }
    res.status(200).send('Webhook received');
});

// --- All other middleware/routes ---
// CORS configuration for all environments
const normalizeOrigin = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    // Origins must include scheme for browser CORS (e.g. "https://example.com")
    // Always normalize to the URL origin (scheme + host + optional port), dropping any path.
    const withScheme = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed.replace(/^\/+/, '')}`;
    try {
        return new URL(withScheme).origin;
    } catch {
        // Best-effort fallback (avoid throwing during bootstrap)
        return withScheme.replace(/\/+$/, '');
    }
};

const normalizedFrontendUrl = normalizeOrigin(process.env.FRONTEND_URL) || 'http://localhost:3000';

// Base allowed origins
const baseAllowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5000',
    'https://localhost:3000',
    'https://localhost:3001',
    'https://localhost:3002',
    normalizedFrontendUrl,
    // Primary marketing domain(s)
    'https://www.designexcellencee.me',
    'https://designexcellencee.me',
    'https://designxcellwebsite-production.up.railway.app',
    // Correct inventory frontend domain (Railway)
    'https://designxcelinventory-production.up.railway.app',
    // Keep legacy/typo variants for safety
    'https://designxcellinventory-production.up.railway.app',
    'https://designexcellinventory-production.up.railway.app'
];

// Add origins from ALLOWED_ORIGINS environment variable if set
const envAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(',')
        .map(origin => normalizeOrigin(origin))
        .filter(origin => origin)
    : [];

// Combine base origins with environment origins, removing duplicates
const allowedOrigins = [...new Set([...baseAllowedOrigins, ...envAllowedOrigins])];

// CORS configuration - allow specific origins in production, all in development
console.log('CORS: Setting up CORS for environment:', process.env.NODE_ENV);
console.log('CORS: Allowed origins:', allowedOrigins);

// Throttle blocked-origin logs to avoid platform log rate limits
const blockedOriginLastLoggedAtMs = new Map();
const shouldLogBlockedOrigin = (origin) => {
    const now = Date.now();
    const last = blockedOriginLastLoggedAtMs.get(origin) || 0;
    // log at most once per origin per minute
    if (now - last < 60_000) return false;
    blockedOriginLastLoggedAtMs.set(origin, now);
    return true;
};

// Enable compression for all responses (gzip) - optimized for speed
app.use(compression({
    filter: (req, res) => {
        // Compress all responses except for SSE (Server-Sent Events) and WebSocket
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 4, // Faster compression (4 instead of 6) - good balance between speed and size
    threshold: 512, // Compress responses larger than 512 bytes (lower threshold for better performance)
    memLevel: 8 // Memory level for compression (8 is faster than default)
}));

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // In development, allow all origins
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        // Allow same-origin requests (backend making requests to itself / inventory frontend)
        if (origin && (origin.includes('designxcelinventory-production.up.railway.app') ||
            origin.includes('designxcellinventory-production.up.railway.app') ||
            origin.includes('designexcellinventory-production.up.railway.app'))) {
            return callback(null, true);
        }

        // In production, check against allowed origins
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        if (shouldLogBlockedOrigin(origin)) {
            console.warn('CORS: Blocked origin:', origin);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // IMPORTANT: Allow credentials (cookies) in cross-origin requests
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header
    maxAge: 86400 // 24 hours for preflight cache
}));
// Optimize JSON parsing - limit payload size for security and performance
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware - prevent hanging requests
app.use((req, res, next) => {
    req.setTimeout(30000); // 30 second timeout for all requests
    res.setTimeout(30000);
    next();
});

// Lightweight performance monitoring for slow requests
// When ENABLE_SLOW_REQUEST_LOGS is 'true', log requests taking longer than 1s
app.use((req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        if (process.env.ENABLE_SLOW_REQUEST_LOGS === 'true') {
            const diff = process.hrtime.bigint() - start;
            const durationMs = Number(diff) / 1e6;

            if (durationMs > 1000) {
                console.warn('[PERF] Slow request detected:', {
                    method: req.method,
                    path: req.originalUrl || req.url,
                    status: res.statusCode,
                    durationMs: Number(durationMs.toFixed(1))
                });
            }
        }
    });

    next();
});

// Serve static files with optimized caching headers
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    etag: true, // Enable ETag for better caching
    lastModified: true, // Enable Last-Modified header
    setHeaders: (res, filePath) => {
        // Optimize caching for different file types
        if (filePath.endsWith('.glb') || filePath.endsWith('.gltf')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 1 day cache, immutable
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        } else if (filePath.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
            // Images: cache for 7 days
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (filePath.match(/\.(css|js)$/i)) {
            // CSS/JS: cache for 1 day
            res.setHeader('Cache-Control', 'public, max-age=86400');
        } else {
            // Other static files: cache for 1 hour
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// IMPORTANT: Model file routes MUST come BEFORE static middleware
// This ensures proper CORS headers and error handling for 3D models

// OPTIONS handler for CORS preflight requests for GLTF files
app.options('/uploads/products/models/:filename', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(204).send();
});

// GLTF file serving endpoint with proper headers and timeout handling
app.get('/uploads/products/models/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'uploads', 'products', 'models', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`3D model file not found: ${filename}`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(404).json({ error: '3D model file not found' });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Determine content type based on file extension
    const contentType = filename.toLowerCase().endsWith('.glb')
        ? 'model/gltf-binary'
        : filename.toLowerCase().endsWith('.gltf')
            ? 'model/gltf+json'
            : 'application/octet-stream';

    // Set CORS headers FIRST before any other headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range');

    // Set proper headers for GLTF/GLB files with optimized caching
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 1 day cache, immutable for better performance
    res.setHeader('Accept-Ranges', 'bytes'); // Support range requests
    res.setHeader('ETag', `"${stats.mtime.getTime()}-${fileSize}"`); // ETag for conditional requests

    // Set a longer timeout for large files (5 minutes)
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);

    // Handle Range requests for better loading performance
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        };
        res.writeHead(206, head);
        file.pipe(res);
        return;
    }

    // Stream the file for non-range requests
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (error) => {
        console.error(`Error streaming GLTF file ${filename}:`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error loading 3D model file', details: error.message });
        } else {
            res.destroy();
        }
    });

    // Handle client disconnection
    req.on('close', () => {
        if (!res.finished) {
            fileStream.destroy();
        }
    });

    fileStream.pipe(res);
});

/**
 * Proxy 3D model downloads when the browser cannot use the asset URL directly (CORS).
 * Also resolves same-host /uploads/... to local disk (dev: CRA on :3000, API on :5000).
 */
function isAllowedModelProxyTarget(u) {
    const host = (u.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.blob.core.windows.net')) return true;
    const base = process.env.AZURE_BLOB_PUBLIC_BASE_URL;
    if (base) {
        try {
            if (host === new URL(base).hostname.toLowerCase()) return true;
        } catch {
            /* ignore */
        }
    }
    return false;
}

function sendLocalPublicUploadFile(req, res, relativeUnderPublic) {
    const abs = path.resolve(__dirname, 'public', relativeUnderPublic);
    const pubRoot = path.resolve(__dirname, 'public');
    if (!abs.startsWith(pubRoot) || !fs.existsSync(abs)) {
        return res.status(404).setHeader('Access-Control-Allow-Origin', '*').send('Not found');
    }
    const stats = fs.statSync(abs);
    const lower = abs.toLowerCase();
    const contentType = lower.endsWith('.glb')
        ? 'model/gltf-binary'
        : lower.endsWith('.gltf')
            ? 'model/gltf+json'
            : 'application/octet-stream';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') {
        return res.status(200).end();
    }
    const range = req.headers.range;
    if (range) {
        const parts = String(range).replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Content-Length', chunksize);
        return fs.createReadStream(abs, { start, end }).pipe(res);
    }
    return fs.createReadStream(abs).pipe(res);
}

app.options('/api/model-file', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
    res.status(204).end();
});

app.get('/api/model-file', (req, res) => {
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') {
        return res.status(400).setHeader('Access-Control-Allow-Origin', '*').send('Missing url');
    }
    let target;
    try {
        target = new URL(decodeURIComponent(raw));
    } catch {
        return res.status(400).setHeader('Access-Control-Allow-Origin', '*').send('Invalid url');
    }
    if (!/^https?:$/i.test(target.protocol)) {
        return res.status(400).setHeader('Access-Control-Allow-Origin', '*').send('Invalid protocol');
    }
    if (!isAllowedModelProxyTarget(target)) {
        return res.status(403).setHeader('Access-Control-Allow-Origin', '*').send('URL host not allowed');
    }

    const pathname = (target.pathname || '').replace(/^\//, '');
    if ((target.hostname === 'localhost' || target.hostname === '127.0.0.1') && pathname.startsWith('uploads/')) {
        return sendLocalPublicUploadFile(req, res, pathname);
    }

    const client = target.protocol === 'https:' ? https : http;
    const opts = {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
            Accept: 'model/gltf-binary, model/gltf+json, application/octet-stream, */*'
        }
    };
    const upstream = client.request(target, opts, (up) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Range');
        const ct = up.headers['content-type'] || 'application/octet-stream';
        res.status(up.statusCode || 502);
        if (up.headers['content-length']) res.setHeader('Content-Length', up.headers['content-length']);
        if (up.headers['content-range']) res.setHeader('Content-Range', up.headers['content-range']);
        res.setHeader('Content-Type', ct);
        if (req.method === 'HEAD') {
            up.resume();
            return res.end();
        }
        up.pipe(res);
    });
    upstream.on('error', (err) => {
        console.error('[model-file] upstream error:', err.message);
        if (!res.headersSent) {
            res.status(502).setHeader('Access-Control-Allow-Origin', '*').send('Bad gateway');
        }
    });
    upstream.setTimeout(120000, () => {
        upstream.destroy();
        if (!res.headersSent) {
            res.status(504).setHeader('Access-Control-Allow-Origin', '*').send('Gateway timeout');
        }
    });
    upstream.end();
});

// Static file serving for other uploads (images, etc.) - optimized caching
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
    maxAge: '7d', // Cache uploads for 7 days
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.glb') || filePath.endsWith('.gltf')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 1 day
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        } else if (filePath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            // Product images: cache for 7 days
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else {
            // Other uploads: cache for 1 day
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (process.env.NODE_ENV === 'production') {
    app.set('view cache', true);
}

// Trust proxy for Railway/Heroku/etc (important for HTTPS and correct IP detection)
// Must be set before session configuration
app.set('trust proxy', 1);

// Response time tracking middleware (for performance monitoring)
// Note: Headers cannot be set in 'finish' (response already sent), so we only log.
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (process.env.NODE_ENV === 'production' && duration > 1000) {
            console.log(`[PERF] ${req.method} ${req.path} - ${duration}ms`);
        }
    });
    next();
});

// Force UTF-8 encoding for all HTML responses (only for HTML, not JSON/API)
app.use((req, res, next) => {
    // Only set HTML content type for non-API routes
    if (!req.path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    next();
});

// Parse Azure SQL Server connection string
function parseConnectionString(connectionString) {
    const config = {};
    const pairs = connectionString.split(';').filter(part => part.trim().length > 0);

    for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) continue;
        const cleanKey = pair.slice(0, eqIndex).trim().toLowerCase();
        const cleanValue = pair.slice(eqIndex + 1).trim();
        if (!cleanValue) continue;

        switch (cleanKey) {
                case 'server':
                case 'data source':
                    // Remove tcp: prefix and handle port properly
                    let serverValue = cleanValue;
                    if (serverValue.startsWith('tcp:')) {
                        serverValue = serverValue.substring(4); // Remove 'tcp:' prefix
                    }
                    // Remove port from server name if it exists
                    if (serverValue.includes(',')) {
                        serverValue = serverValue.split(',')[0];
                    }
                    // Fix double backslashes in server name
                    serverValue = serverValue.replace(/\\\\/g, '\\');
                    config.server = serverValue;
                    break;
                case 'initial catalog':
                case 'database':
                    config.database = cleanValue;
                    break;
                case 'user id':
                    config.user = cleanValue;
                    break;
                case 'password':
                    config.password = cleanValue;
                    break;
                case 'encrypt':
                    config.options = config.options || {};
                    config.options.encrypt = cleanValue.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options = config.options || {};
                    config.options.trustServerCertificate = cleanValue.toLowerCase() === 'true';
                    break;
                case 'connection timeout':
                    config.connectionTimeout = parseInt(cleanValue) * 1000; // Convert to milliseconds
                    break;
        }
    }

    if (!config.server && process.env.DB_SERVER) {
        config.server = process.env.DB_SERVER;
    }

    return config;
}

// Database configuration for local SQL Server development
const connectionString = process.env.DB_CONNECTION_STRING;

console.log('Environment check:');
console.log('DB_CONNECTION_STRING exists:', !!process.env.DB_CONNECTION_STRING);
console.log('DB_CONNECTION_STRING value:', process.env.DB_CONNECTION_STRING ? 'Set (hidden for security)' : 'Not set');

let dbConfig;

if (connectionString) {
    // Use connection string if available
    const parsedConfig = parseConnectionString(connectionString);
    console.log('Parsed database config:', {
        server: parsedConfig.server,
        database: parsedConfig.database,
        user: parsedConfig.user,
        hasPassword: !!parsedConfig.password
    });

    dbConfig = {
        ...parsedConfig,
        options: {
            encrypt: parsedConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'), // Use parsed value or default based on environment
            trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'), // Trust cert for non-production
            enableArithAbort: true,
            requestTimeout: 30000
        },
        pool: {
            max: 25, // Increased for better concurrency under load
            min: 3, // Keep more connections alive for faster response
            idleTimeoutMillis: 20000, // Reduced idle timeout for faster cleanup
            acquireTimeoutMillis: 30000, // Reduced wait time for faster failure detection
            createTimeoutMillis: 20000, // Faster connection creation timeout
            reapIntervalMillis: 500, // Check for idle connections more frequently
            createRetryIntervalMillis: 100 // Faster retry for connection creation
        },
        requestTimeout: 25000, // Slightly reduced for faster timeout detection
        connectionTimeout: 20000 // Faster connection timeout
    };
} else {
    // Use individual database variables for local development
    console.log('Using individual database variables for local development');
    dbConfig = {
        server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
        user: process.env.DB_USERNAME || 'DesignXcel',
        password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
        database: process.env.DB_DATABASE || 'DesignXcellDB',
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production', // Use env var or default based on environment
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production', // Use env var or default based on environment
            enableArithAbort: true
        },
        pool: {
            max: 25, // Increased for better concurrency under load
            min: 3, // Keep more connections alive for faster response
            idleTimeoutMillis: 20000, // Reduced idle timeout for faster cleanup
            acquireTimeoutMillis: 30000, // Reduced wait time for faster failure detection
            createTimeoutMillis: 20000, // Faster connection creation timeout
            reapIntervalMillis: 500, // Check for idle connections more frequently
            createRetryIntervalMillis: 100 // Faster retry for connection creation
        },
        requestTimeout: 25000, // Slightly reduced for faster timeout detection
        connectionTimeout: 20000 // Faster connection timeout
    };
}

// Helper function to get Manila timezone date
function getManilaTime() {
    const now = new Date();
    // Get Manila time by adding 8 hours to UTC (Philippines is UTC+8)
    return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

// Database connection pool
const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect()
    .then(() => {
        console.log('✅ Connected to MSSQL database successfully');
        console.log('Database connection details:', {
            server: dbConfig.server,
            database: dbConfig.database,
            user: dbConfig.user,
            hasPassword: !!dbConfig.password
        });
    })
    .catch(err => {
        console.error('❌ Database Connection Failed! Bad Config: ', err);
        console.error('Connection details:', {
            server: dbConfig.server,
            database: dbConfig.database,
            user: dbConfig.user,
            hasPassword: !!dbConfig.password,
            encrypt: dbConfig.options?.encrypt,
            trustServerCertificate: dbConfig.options?.trustServerCertificate
        });

        // Enhanced error handling with specific guidance
        if (err.code === 'ELOGIN') {
            const errorMessage = err.message || '';
            const originalError = err.originalError?.message || '';

            // Check for expired password error
            if (errorMessage.includes('password') && errorMessage.includes('expired') ||
                originalError.includes('password') && originalError.includes('expired')) {
                console.log('\n🔴 PASSWORD EXPIRED ERROR:');
                console.log('The SQL Server password for user "' + dbConfig.user + '" has expired.');
                console.log('\n📋 TO FIX THIS ISSUE:');
                console.log('1. Open SQL Server Management Studio (SSMS)');
                console.log('2. Connect using Windows Authentication (as Administrator)');
                console.log('3. Run this SQL command to reset the password:');
                console.log(`   ALTER LOGIN [${dbConfig.user}] WITH PASSWORD = 'YourNewPassword123!', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;`);
                console.log('   (Replace YourNewPassword123! with your actual new password)');
                console.log('4. Update your .env file or environment variables with the new password');
                console.log('5. Restart your application');
                console.log('\n⚠️  If you cannot connect with Windows Authentication:');
                console.log('   - You may need to use "sa" account or another admin account');
                console.log('   - Or contact your database administrator');
            } else {
                console.log('\n🔧 LOGIN ERROR TROUBLESHOOTING:');
                console.log('1. Check SQL Server firewall - add your IP address');
                console.log('2. Verify user "' + dbConfig.user + '" exists and has proper permissions');
                console.log('3. Confirm password is correct (case-sensitive)');
                console.log('4. Ensure SQL Server allows SQL authentication');
                console.log('5. Check if password has expired (run: ALTER LOGIN to reset)');
                console.log('6. Try connecting with SQL Server Management Studio first');
            }
        } else if (err.code === 'ETIMEOUT') {
            console.log('\n🔧 TIMEOUT ERROR TROUBLESHOOTING:');
            console.log('1. Check network connectivity to SQL Server');
            console.log('2. Verify firewall rules allow connections');
            console.log('3. Check if SQL Server service is running');
            console.log('4. Verify SQL Server is listening on the correct port (default: 1433)');
        } else if (err.code === 'ECONNCLOSED') {
            console.log('\n🔧 CONNECTION CLOSED ERROR:');
            console.log('The database connection was closed unexpectedly.');
            console.log('This often happens after a password expiration or server restart.');
            console.log('1. Check if SQL Server service is running');
            console.log('2. Verify the password has not expired');
            console.log('3. Try restarting the application');
        }

        // Don't exit the process, let the app continue without database
        console.log('⚠️ App will continue without database connection');
        console.log('💡 Run "node test-fallback-connection.js" for detailed diagnostics');
    });

// Session configuration with environment-based settings
// This must be after dbConfig is defined
const isProduction = process.env.NODE_ENV === 'production';
const isHttps = process.env.FORCE_HTTPS === 'true' || isProduction;
const frontendUrl = normalizeOrigin(process.env.FRONTEND_URL) || 'http://localhost:3000';
const backendUrl = normalizeOrigin(process.env.BACKEND_URL);

// Determine if frontend and backend are on different domains
// For Railway, frontend and backend might be on different subdomains
let isCrossOrigin = false;
try {
    if (isProduction && frontendUrl && !frontendUrl.includes('localhost')) {
        const frontendHost = new URL(frontendUrl).hostname;
        // Check if backend URL is provided, or infer from environment
        const backendHost = backendUrl
            ? new URL(backendUrl).hostname
            : (isProduction ? 'designxcellinventory-production.up.railway.app' : 'localhost');

        // If hosts are different, it's cross-origin
        isCrossOrigin = frontendHost !== backendHost;
    }
} catch (e) {
    // If URL parsing fails, assume same-origin for safety
    console.warn('⚠️ Could not parse URLs for cross-origin detection:', e.message);
    isCrossOrigin = false;
}

// In production with HTTPS, always use secure cookies
// For cross-origin (different domains), use sameSite: 'none'
// For same-origin, use sameSite: 'lax'
const baseSessionConfig = {
    secret: process.env.SESSION_SECRET || 'your_session_secret_key_here',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Enable rolling expiration to refresh session on activity
    cookie: {
        httpOnly: true,
        secure: isHttps, // Must be true for HTTPS and for sameSite: 'none'
        sameSite: isCrossOrigin && isHttps ? 'none' : (isHttps ? 'lax' : 'lax'), // 'none' for cross-origin HTTPS, 'lax' otherwise
        maxAge: 24 * 60 * 60 * 1000, // 24 hours session timeout
        // Don't set domain - let browser use current domain automatically
        // Setting domain would restrict cookie to that domain only
        path: '/', // Cookie available for all paths
    }
};

// Ensure secure is true for cross-origin (sameSite: 'none' requires secure: true)
if (baseSessionConfig.cookie.sameSite === 'none') {
    baseSessionConfig.cookie.secure = true;
    console.log('🔐 Cross-origin session detected: Using secure cookies with sameSite: none');
}

// Configure session store - use MSSQL store for production to persist sessions
let sessionStore;

if (isProduction && process.env.DB_CONNECTION_STRING && dbConfig) {
    try {
        // Use MSSQL session store for production persistence
        // This is critical for Railway where containers can restart
        console.log('🔧 PRODUCTION: Configuring MSSQL session store for persistent sessions...');
        console.log('   Database:', dbConfig.database);
        console.log('   Server:', dbConfig.server);

        const mssqlStore = new MSSqlStore({
            user: dbConfig.user,
            password: dbConfig.password,
            server: dbConfig.server,
            database: dbConfig.database,
            options: {
                encrypt: dbConfig.options?.encrypt ?? true,
                trustServerCertificate: dbConfig.options?.trustServerCertificate ?? true,
                enableArithAbort: true
            },
            table: 'Sessions', // Table name for sessions
            expirationInterval: 15 * 60 * 1000, // Check for expired sessions every 15 minutes
        });

        sessionStore = mssqlStore;
        console.log('✅ MSSQL session store configured successfully');
        console.log('💡 Sessions will persist across server restarts and container deployments');
    } catch (error) {
        console.error('❌ Failed to configure MSSQL session store:', error.message);
        console.warn('⚠️ Falling back to memory store - sessions will NOT persist');
        console.warn('⚠️ Users will be logged out on server restart');
        sessionStore = undefined; // Fallback to memory store
    }
} else {
    // For local development, use memory store
    if (isProduction && !process.env.DB_CONNECTION_STRING) {
        console.warn('⚠️ PRODUCTION: DB_CONNECTION_STRING not found - using memory store');
        console.warn('⚠️ Sessions will NOT persist across server restarts');
    } else if (!isProduction) {
        console.log('🔧 DEVELOPMENT: Using memory session store for local development');
    }
    sessionStore = undefined; // undefined means use memory store
}

// Create separate session configurations for employee and customer
// Employee sessions use 'employee.sid' cookie (for localhost:5000)
// Customer sessions use 'customer.sid' cookie (for localhost:3000 API calls)

// Employee session config (for backend admin panel)
const employeeSessionConfig = {
    ...baseSessionConfig,
    name: 'employee.sid', // Different cookie name for employees
    store: sessionStore
};

// Customer session config (for frontend API calls)
const customerSessionConfig = {
    ...baseSessionConfig,
    name: 'customer.sid', // Different cookie name for customers
    store: sessionStore
};

// Log session configuration for debugging
console.log('🔐 Session Configuration:', {
    environment: process.env.NODE_ENV || 'development',
    secure: baseSessionConfig.cookie.secure,
    sameSite: baseSessionConfig.cookie.sameSite,
    store: sessionStore ? 'MSSQL (Persistent)' : 'Memory (Temporary)',
    maxAge: `${baseSessionConfig.cookie.maxAge / 1000 / 60} minutes`,
    crossOrigin: isCrossOrigin,
    frontendUrl: frontendUrl,
    httpOnly: baseSessionConfig.cookie.httpOnly,
    rolling: baseSessionConfig.rolling,
    employeeCookie: 'employee.sid',
    customerCookie: 'customer.sid'
});

if (isProduction && !sessionStore) {
    console.error('❌ CRITICAL: Production is using memory session store!');
    console.error('❌ Sessions will be lost on server restart.');
    console.error('❌ This will cause users to be logged out unexpectedly.');
}

// Create separate session middleware instances
const employeeSession = session(employeeSessionConfig);
const customerSession = session(customerSessionConfig);

// Middleware to route to appropriate session based on URL path
app.use((req, res, next) => {
    // Employee routes (backend admin panel)
    if (req.path.startsWith('/Employee/') ||
        req.path.startsWith('/employee-login') ||
        req.path.startsWith('/auth/login') ||
        req.path.startsWith('/api/dashboard/') ||
        req.path.startsWith('/api/admin/') ||
        req.path.startsWith('/api/safety-stock-value') ||
        req.path.startsWith('/Employee/Admin/') ||
        req.path.startsWith('/Employee/InventoryManager/') ||
        req.path.startsWith('/Employee/TransactionManager/') ||
        req.path.startsWith('/Employee/UserManager/') ||
        req.path.startsWith('/Employee/OrderSupport/')) {
        return employeeSession(req, res, next);
    }
    // Customer API routes (frontend)
    else if (req.path.startsWith('/api/auth/customer/') ||
        req.path.startsWith('/api/auth/google') ||
        req.path.startsWith('/api/auth/social-providers') ||
        req.path.startsWith('/api/auth/verify-otp') ||
        req.path.startsWith('/api/auth/register') ||
        req.path.startsWith('/api/auth/refresh-token') ||
        req.path.startsWith('/api/auth/status') ||
        req.path.startsWith('/api/auth/profile') ||
        req.path.startsWith('/api/auth/change-password') ||
        req.path.startsWith('/api/customer/') ||
        req.path.startsWith('/api/products') ||
        req.path.startsWith('/api/cart') ||
        req.path.startsWith('/api/orders') ||
        req.path.startsWith('/api/wishlist') ||
        req.path.startsWith('/api/checkout') ||
        req.path.startsWith('/api/payment') ||
        req.path.startsWith('/api/addresses') ||
        req.path.startsWith('/api/account') ||
        req.path.startsWith('/api/terms') ||
        req.path.startsWith('/api/bulk-order') ||
        req.path.startsWith('/api/reviews')) {
        return customerSession(req, res, next);
    }
    // Default to employee session for other routes
    else {
        return employeeSession(req, res, next);
    }
});

// Middleware to log session issues in production
if (isProduction) {
    app.use((req, res, next) => {
        // Log session creation for debugging
        if (req.session && !req.session.initialized) {
            req.session.initialized = true;
            if (req.session.user) {
                console.log('✅ Session created for user:', req.session.user.email);
            }
        }
        next();
    });
}

// Lazy load Passport - only initialize when OAuth routes are accessed
let passport;
let passportInitialized = false;
const initializePassport = () => {
    if (!passportInitialized) {
        passport = require('passport');
        app.use(passport.initialize());
        app.use(passport.session());
        passportInitialized = true;
        if (process.env.NODE_ENV === 'development') {
            console.log('[PASSPORT] Initialized');
        }
    }
    return passport;
};

// Passport (Google OAuth for customers). Must run after session middleware.
initializePassport();

app.use(flash());

// Middleware to make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.error = req.flash('error');
    res.locals.success = req.flash('success');
    next();
});


// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('EmpLogin/EmpLogin');
});

// Enhanced User Management Interface Route
app.get('/Employee/Admin/UserManagement', async (req, res) => {
    // Check if user is authenticated and has admin access
    if (!req.session.user || req.session.user.role !== 'Admin') {
        req.flash('error', 'Access denied. Admin privileges required.');
        return res.redirect('/login');
    }

    try {
        res.render('admin/AdminUserManagement');
    } catch (error) {
        console.error('Error rendering user management page:', error);
        req.flash('error', 'Error loading user management page.');
        res.redirect('/Employee/AdminManager');
    }
});




// --- OTP EMAIL ENDPOINTS ---
// Note: OTP endpoints are handled in routes.js for better organization

// Customer profile API endpoints
app.get('/api/customer/profile', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const customerId = req.session.user.id;

        // Database has old column names but encrypted data
        const result = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT CustomerID, Email, FullName, PhoneNumber, Gender, ProfileImage FROM Customers WHERE CustomerID = @customerId');
        const customerRecord = result.recordset[0];

        if (!customerRecord) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        // Customer data is already plain text
        const customer = {
            CustomerID: customerRecord.CustomerID,
            Email: customerRecord.Email,
            FullName: customerRecord.FullName,
            PhoneNumber: customerRecord.PhoneNumber,
            Gender: customerRecord.Gender,
            ProfileImage: customerRecord.ProfileImage
        };

        res.json({ success: true, customer });
    } catch (err) {
        console.error('Error fetching customer profile:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch profile', error: err.message });
    }
});

// Get all orders for the currently logged-in customer
// Get order status notifications for customer
app.get('/api/customer/order-notifications', async (req, res) => {
    try {
        // Use session-based authentication (same as other customer endpoints)
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const customerId = req.session.user.id;

        if (!customerId) {
            return res.status(401).json({ success: false, message: 'Invalid session' });
        }

        await poolConnect;

        // Include fulfillment statuses customers still care about after "Received".
        // Previously we omitted Delivered/Completed — those orders vanished from this list when staff closed them out.
        const result = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query(`
                SELECT 
                    o.OrderID,
                    o.ReferenceNumber,
                    o.Status,
                    o.OrderDate,
                    o.TotalAmount,
                    o.TransactionID,
                    o.DeliveryType,
                    FORMAT(o.OrderDate, 'yyyy-MM-dd HH:mm:ss') AS OrderDateFormatted,
                    a.Region,
                    a.Province,
                    a.City
                FROM Orders o
                OUTER APPLY (
                    SELECT TOP 1 ca.Region, ca.Province, ca.City
                    FROM CustomerAddresses ca
                    WHERE ca.CustomerID = o.CustomerID
                      AND (ca.AddressID = o.ShippingAddressID OR (o.ShippingAddressID IS NULL AND ca.IsDefault = 1))
                    ORDER BY CASE WHEN ca.AddressID = o.ShippingAddressID THEN 0 WHEN ca.IsDefault = 1 THEN 1 ELSE 2 END, ca.AddressID DESC
                ) a
                WHERE o.CustomerID = @customerId
                AND o.Status IN ('Processing', 'Shipping', 'Delivery', 'Delivered', 'Received', 'Completed')
                ORDER BY o.OrderDate DESC
            `);

        console.log(`[ORDER NOTIFICATIONS] Found ${result.recordset.length} active/fulfillment orders for customer ${customerId}`);

        const notifications = result.recordset.map(order => {
            let title, message, icon;

            // Calculate Estimated Delivery Date for Shipping and Delivery statuses
            let estimatedDeliveryDate = null;
            let estimatedDeliveryDateFormatted = null;
            if ((order.Status === 'Shipping' || order.Status === 'Delivery') &&
                order.DeliveryType !== 'pickup' &&
                order.Region && order.City) {
                estimatedDeliveryDate = calculateEstimatedDeliveryDate(
                    order.Region,
                    order.Province,
                    order.City,
                    new Date(order.OrderDate)
                );
                estimatedDeliveryDateFormatted = formatEstimatedDeliveryDate(estimatedDeliveryDate);
            }

            switch (order.Status) {
                case 'Processing':
                    title = 'Your Order is Being Processed!';
                    message = `Your order #${order.ReferenceNumber} is being prepared. We'll notify you when it ships.`;
                    break;
                case 'Shipping':
                    title = 'Your Order is Shipping!';
                    message = `Your order #${order.ReferenceNumber} has been processed and is now shipping to you.`;
                    break;
                case 'Delivery':
                    title = 'Your Order is Out for Delivery!';
                    message = `Your order #${order.ReferenceNumber} is now out for delivery and should arrive soon.`;
                    break;
                case 'Delivered':
                    title = 'Your Order Was Delivered!';
                    message = `Your order #${order.ReferenceNumber} has been marked as delivered.`;
                    break;
                case 'Received':
                    title = 'Your Order Has Been Received!';
                    message = `Your order #${order.ReferenceNumber} has been successfully received!`;
                    break;
                case 'Completed':
                    title = 'Your Order is Complete!';
                    message = `Your order #${order.ReferenceNumber} is complete. Thank you for your purchase!`;
                    break;
                default:
                    title = 'Order Update';
                    message = `Your order #${order.ReferenceNumber} status has been updated.`;
            }

            return {
                id: `order-status-${order.OrderID}-${order.Status}`,
                type: 'order_status',
                status: order.Status,
                title: title,
                message: message,
                orderId: order.OrderID,
                orderNumber: order.ReferenceNumber,
                transactionId: order.TransactionID,
                totalAmount: parseFloat(order.TotalAmount) || 0,
                timestamp: order.OrderDateFormatted,
                estimatedDeliveryDate: estimatedDeliveryDateFormatted,
                read: false
            };
        });

        res.json({
            success: true,
            notifications: notifications
        });
    } catch (error) {
        console.error('Error fetching order notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order notifications',
            error: error.message
        });
    }
});

app.get('/api/customer/orders', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        await poolConnect;
        const customerId = req.session.user.id;
        const result = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query(`SELECT OrderID, ReferenceNumber, Status, TotalAmount, OrderDate, PaymentMethod, TransactionID FROM Orders WHERE CustomerID = @customerId ORDER BY OrderDate DESC`);
        res.json({ success: true, orders: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch orders', error: err.message });
    }
});

// Get orders by email (for webhook order retrieval without authentication)
app.get('/api/orders/by-email', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email parameter is required' });
        }

        await poolConnect;
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT o.OrderID, o.ReferenceNumber, o.Status, o.TotalAmount, o.OrderDate, o.PaymentMethod, o.TransactionID,
                       c.FullName, c.Email
                FROM Orders o
                INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                WHERE c.Email = @email
                ORDER BY o.OrderDate DESC
            `);

        res.json({ success: true, orders: result.recordset });
    } catch (err) {
        console.error('Error fetching orders by email:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch orders', error: err.message });
    }
});

// Cancel an order for the currently logged-in customer
app.put('/api/customer/orders/:orderId/cancel', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        await poolConnect;
        const customerId = req.session.user.id;
        const orderId = parseInt(req.params.orderId);
        // Only allow cancelling if the order belongs to the customer and is not already cancelled
        const orderResult = await pool.request()
            .input('orderId', sql.Int, orderId)
            .input('customerId', sql.Int, customerId)
            .query(`
                SELECT o.OrderID, o.ReferenceNumber, o.Status, o.TotalAmount, o.OrderDate, 
                       o.PaymentMethod, o.TransactionID, o.DeliveryCost, o.ExtraDeliveryFee
                FROM Orders o
                WHERE o.OrderID = @orderId AND o.CustomerID = @customerId
            `);
        if (!orderResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orderResult.recordset[0];
        if (order.Status === 'Cancelled') {
            return res.json({ success: true, message: 'Order already cancelled.' });
        }
        // Get order items before cancelling to restore stock and for email
        const orderItemsResult = await pool.request()
            .input('orderId', sql.Int, orderId)
            .query(`
                SELECT oi.ProductID, oi.Quantity, oi.VariationID, oi.PriceAtPurchase,
                       COALESCE(p.Name, oi.Name) AS ProductName,
                       pv.VariationName, pv.Color
                FROM OrderItems oi
                LEFT JOIN Products p ON oi.ProductID = p.ProductID
                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                WHERE oi.OrderID = @orderId
            `);

        // Get customer info for email
        const customerResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT FullName, Email FROM Customers WHERE CustomerID = @customerId');
        const customer = customerResult.recordset[0];

        // Restore stock for each item
        for (const item of orderItemsResult.recordset) {
            // Always restore main product stock first
            await pool.request()
                .input('productId', sql.Int, item.ProductID)
                .input('quantity', sql.Int, item.Quantity)
                .query(`UPDATE Products 
                        SET StockQuantity = StockQuantity + @quantity 
                        WHERE ProductID = @productId`);
            console.log(`[ORDER CANCELLATION] Restored ${item.Quantity} units to main product ${item.ProductID}`);

            // Additionally restore variation stock if there was a variation
            if (item.VariationID) {
                await pool.request()
                    .input('variationId', sql.Int, item.VariationID)
                    .input('quantity', sql.Int, item.Quantity)
                    .query(`UPDATE ProductVariations 
                            SET Quantity = Quantity + @quantity 
                            WHERE VariationID = @variationId`);
                console.log(`[ORDER CANCELLATION] Additionally restored ${item.Quantity} units to variation ${item.VariationID}`);
            }
        }

        // Update order status to cancelled
        await pool.request()
            .input('orderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId`);

        console.log(`[ORDER CANCELLATION] Order ${orderId} cancelled and stock restored`);

        // Send refund receipt email
        try {
            const sendgridHelper = require('./utils/sendgridHelper');
            const orderItems = orderItemsResult.recordset.map(item => ({
                name: item.ProductName,
                quantity: item.Quantity,
                price: parseFloat(item.PriceAtPurchase || 0),
                variationName: item.VariationName || '',
                color: item.Color || ''
            }));

            // Calculate subtotal and tax
            const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const taxAmount = subtotal * 0.12;

            const emailResult = await sendgridHelper.sendRefundReceiptEmail(
                customer.Email,
                customer.FullName,
                {
                    orderId: order.OrderID,
                    referenceNumber: order.ReferenceNumber,
                    transactionId: order.TransactionID,
                    totalAmount: parseFloat(order.TotalAmount || 0),
                    subtotal: subtotal,
                    taxAmount: taxAmount,
                    shippingCost: parseFloat(order.DeliveryCost || 0),
                    extraDeliveryFee: parseFloat(order.ExtraDeliveryFee || 0),
                    paymentMethod: order.PaymentMethod || 'E-Wallet',
                    orderDate: order.OrderDate,
                    items: orderItems
                }
            );

            if (emailResult.success) {
                console.log(`[ORDER CANCELLATION] ✅ Refund receipt email sent successfully to ${customer.Email}`);

                // Return notification data in response for frontend to store
                return res.json({
                    success: true,
                    message: 'Order cancelled successfully and stock restored.',
                    notification: {
                        orderNumber: order.ReferenceNumber || order.OrderID,
                        timestamp: new Date().toISOString(),
                        dismissed: false,
                        refundAmount: parseFloat(order.TotalAmount || 0)
                    }
                });
            } else {
                console.error(`[ORDER CANCELLATION] ⚠️ Failed to send refund receipt email:`, emailResult.message);
            }
        } catch (emailError) {
            // Don't fail the cancellation if email fails
            console.error(`[ORDER CANCELLATION] ⚠️ Error sending refund receipt email:`, emailError);
        }

        res.json({ success: true, message: 'Order cancelled successfully and stock restored.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to cancel order', error: err.message });
    }
});

// Get all orders with items for the currently logged-in customer
app.get('/api/customer/orders-with-items', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        await poolConnect;
        const customerId = req.session.user.id;
        // Get user info
        const customerResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT CustomerID, FullName, Email, PhoneNumber FROM Customers WITH (NOLOCK) WHERE CustomerID = @customerId');
        const customer = customerResult.recordset[0];

        // Check if ReturnItems and RefundAmount columns exist
        const columnCheckResult = await pool.request().query(`
            SELECT COUNT(*) as columnExists 
            FROM sys.columns 
            WHERE object_id = OBJECT_ID('Orders') AND name = 'ReturnItems'
        `);
        const hasReturnItemsColumn = columnCheckResult.recordset[0].columnExists > 0;

        const refundAmountCheckResult = await pool.request().query(`
            SELECT COUNT(*) as columnExists 
            FROM sys.columns 
            WHERE object_id = OBJECT_ID('Orders') AND name = 'RefundAmount'
        `);
        const hasRefundAmountColumn = refundAmountCheckResult.recordset[0].columnExists > 0;

        // Get all orders with their per-order shipping address
        const returnItemsColumn = hasReturnItemsColumn ? ', o.ReturnItems' : ', NULL AS ReturnItems';
        const refundAmountColumn = hasRefundAmountColumn ? ', ISNULL(o.RefundAmount, 0) AS RefundAmount' : ', 0 AS RefundAmount';
        const ordersResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query(`
                SELECT 
                    o.OrderID, o.ReferenceNumber, o.Status, o.TotalAmount, o.OrderDate, o.PaymentMethod, o.TransactionID,
                    o.DeliveryType, o.ServiceType, o.DeliveryCost, o.ShippingAddressID, o.PickupDate,
                    o.ActionType, o.ReturnType, o.ReturnReason,
                    ISNULL(o.OriginalPackaging, 0) AS OriginalPackaging,
                    ISNULL(o.AllParts, 0) AS AllParts,
                    ISNULL(o.Unused, 0) AS Unused,
                    ISNULL(o.ProofOfPurchase, 0) AS ProofOfPurchase,
                    o.ProofOfPurchaseImageURL
                    ${returnItemsColumn}
                    ${refundAmountColumn},
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
                    ) AS DeliveryTypeName,
                    a.Label AS AddressLabel, a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.Region, a.PostalCode, a.Country
                FROM Orders o
                LEFT JOIN CustomerAddresses a ON o.ShippingAddressID = a.AddressID
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
                WHERE o.CustomerID = @customerId
                ORDER BY o.OrderDate DESC
            `);
        const orders = ordersResult.recordset;
        if (!orders.length) return res.json({ success: true, orders: [] });
        // Get all order items for these orders (with product image and variation info)
        const orderIds = orders.map(o => o.OrderID);
        if (!orderIds.length) {
            console.log('[API] No order IDs to fetch items for');
            return res.json({
                success: true, orders: orders.map(order => ({
                    ...order,
                    items: []
                }))
            });
        }

        // Build parameterized query for order items (handles up to 100 orders safely)
        let orderItemsResult;
        if (orderIds.length === 1) {
            // Single order - simple query
            orderItemsResult = await pool.request()
                .input('orderId', sql.Int, orderIds[0])
                .query(`
                    SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, oi.VariationID,
                           COALESCE(p.Name, oi.Name) AS Name, 
                           COALESCE(pv.VariationImageURL, p.ImageURL) AS ImageURL,
                           pv.VariationName, pv.Color
                    FROM OrderItems oi 
                    LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                    WHERE oi.OrderID = @orderId
                `);
        } else {
            // Multiple orders - use IN clause with parameters
            const orderItemParams = orderIds.map((id, idx) => `@orderId${idx}`).join(',');
            const orderItemsRequest = pool.request();
            orderIds.forEach((id, idx) => {
                orderItemsRequest.input(`orderId${idx}`, sql.Int, id);
            });

            orderItemsResult = await orderItemsRequest.query(`
                SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, oi.VariationID,
                       COALESCE(p.Name, oi.Name) AS Name, 
                       COALESCE(pv.VariationImageURL, p.ImageURL) AS ImageURL,
                       pv.VariationName, pv.Color
                FROM OrderItems oi 
                LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                WHERE oi.OrderID IN (${orderItemParams})
            `);
        }
        const itemsByOrder = {};
        for (const item of orderItemsResult.recordset) {
            if (!itemsByOrder[item.OrderID]) itemsByOrder[item.OrderID] = [];
            itemsByOrder[item.OrderID].push({
                ProductID: item.ProductID || null,
                name: item.Name || 'Unknown Product',
                quantity: item.Quantity || 0,
                price: item.PriceAtPurchase || 0,
                image: item.ImageURL || null,
                variationId: item.VariationID || null,
                variationName: item.VariationName || null,
                color: item.Color || null
            });
        }

        // Attach items, user, and per-order address to orders
        const ordersWithItems = orders.map(order => {
            let orderItems = itemsByOrder[order.OrderID] || [];

            // For returned/refunded/pickup processing orders with ReturnItems, filter and adjust quantities
            // "Processing (Pickup)" status occurs after return approval but before refund completion
            const shouldFilterItems = (order.Status === 'Returned' ||
                order.Status === 'Refunded' ||
                order.Status === 'Processing (Pickup)' ||
                order.Status === 'Processing') && order.ReturnItems;

            if (shouldFilterItems) {
                try {
                    const returnItemsJson = typeof order.ReturnItems === 'string'
                        ? JSON.parse(order.ReturnItems)
                        : order.ReturnItems;

                    if (Array.isArray(returnItemsJson) && returnItemsJson.length > 0) {
                        // Filter items to show only returned ones and update quantities
                        const allItems = [...orderItems];
                        orderItems = allItems
                            .map(item => {
                                const returnItem = returnItemsJson.find(ri => {
                                    const returnProductId = ri.productId || ri.ProductID;
                                    const itemProductId = item.ProductID;
                                    const returnVariationId = ri.variationId || ri.VariationID || null;
                                    const itemVariationId = item.variationId || null;

                                    const productMatch = String(returnProductId) === String(itemProductId);
                                    const variationMatch = (returnVariationId == null && (itemVariationId == null || itemVariationId === undefined)) ||
                                        (returnVariationId != null && String(returnVariationId) === String(itemVariationId));
                                    return productMatch && variationMatch;
                                });

                                if (returnItem) {
                                    const returnQty = parseInt(returnItem.quantity || returnItem.Quantity || 0);
                                    const originalQty = parseInt(item.quantity || 0);
                                    return {
                                        ...item,
                                        quantity: returnQty,
                                        Quantity: returnQty,
                                        OriginalQuantity: originalQty
                                    };
                                }
                                return null;
                            })
                            .filter(item => item !== null);
                    }
                } catch (e) {
                    console.error(`[CUSTOMER ORDERS] Error parsing ReturnItems for order ${order.OrderID}:`, e);
                }
            }

            // Ensure items array is always present and properly formatted
            const formattedItems = orderItems.map(item => ({
                ProductID: item.ProductID || null,
                name: item.name || 'Unknown Product',
                quantity: item.quantity || 0,
                Quantity: item.Quantity || item.quantity || 0,
                OriginalQuantity: item.OriginalQuantity || null,
                price: item.price || 0,
                image: item.image || null,
                variationId: item.variationId || null,
                variationName: item.variationName || null,
                color: item.color || null
            }));

            // Calculate estimated delivery date for delivery orders
            let estimatedDeliveryDate = null;
            let estimatedDeliveryDateFormatted = null;
            // Check if it's a delivery order (not pickup)
            const isDeliveryOrder = order.DeliveryType !== 'pickup' && order.DeliveryTypeName !== 'Pick up';
            if (isDeliveryOrder) {
                // Get Region, City, and Province from the SQL query result
                const region = order.Region || null;
                const city = order.City || null;
                const province = order.Province || null;

                if (region && city) {
                    try {
                        estimatedDeliveryDate = calculateEstimatedDeliveryDate(
                            region,
                            province,
                            city,
                            new Date(order.OrderDate)
                        );
                        estimatedDeliveryDateFormatted = formatEstimatedDeliveryDate(estimatedDeliveryDate);
                    } catch (error) {
                        console.error('[CUSTOMER ORDERS] Error calculating delivery date:', error);
                    }
                } else {
                    console.log('[CUSTOMER ORDERS] Missing region or city for delivery date calculation:', {
                        orderId: order.OrderID,
                        region,
                        city,
                        province,
                        deliveryType: order.DeliveryType,
                        deliveryTypeName: order.DeliveryTypeName,
                        hasShippingAddress: !!order.ShippingAddressID
                    });
                }
            }

            return {
                OrderID: order.OrderID,
                ReferenceNumber: order.ReferenceNumber,
                Status: order.Status,
                TotalAmount: order.TotalAmount,
                RefundAmount: order.RefundAmount || null,
                ReturnItems: order.ReturnItems || null,
                OrderDate: order.OrderDate,
                PaymentMethod: order.PaymentMethod,
                TransactionID: order.TransactionID,
                DeliveryType: order.DeliveryType,
                ServiceType: order.ServiceType,
                DeliveryTypeName: order.DeliveryTypeName,
                DeliveryCost: order.DeliveryCost,
                ShippingAddressID: order.ShippingAddressID,
                PickupDate: order.PickupDate,
                EstimatedDeliveryDate: estimatedDeliveryDate,
                EstimatedDeliveryDateFormatted: estimatedDeliveryDateFormatted,
                items: formattedItems, // Always an array, even if empty
                user: {
                    fullName: customer.FullName,
                    email: customer.Email,
                    phoneNumber: customer.PhoneNumber
                },
                address: order.ShippingAddressID ? {
                    Label: order.AddressLabel,
                    HouseNumber: order.HouseNumber,
                    Street: order.Street,
                    Barangay: order.Barangay,
                    City: order.City,
                    Province: order.Province,
                    Region: order.Region,
                    PostalCode: order.PostalCode,
                    Country: order.Country
                } : null
            };
        });
        res.json({ success: true, orders: ordersWithItems });
    } catch (err) {
        console.error('[CUSTOMER ORDERS] Error fetching orders with items:', err);
        console.error('[CUSTOMER ORDERS] Error stack:', err.stack);
        res.status(500).json({ success: false, message: 'Failed to fetch orders with items', error: err.message });
    }
});

app.put('/api/customer/profile', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { fullName, email, phoneNumber, gender } = req.body;
        const customerId = req.session.user.id;

        // Store data as plain text

        await poolConnect;
        await pool.request()
            .input('customerId', sql.Int, customerId)
            .input('fullName', sql.NVarChar, fullName)
            .input('email', sql.NVarChar, email)
            .input('phoneNumber', sql.NVarChar, phoneNumber)
            .input('gender', sql.NVarChar, gender)
            .query('UPDATE Customers SET FullName = @fullName, Email = @email, PhoneNumber = @phoneNumber, Gender = @gender WHERE CustomerID = @customerId');

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Error updating customer profile:', err);
        res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
    }
});

// Customer password change endpoint
app.put('/api/customer/change-password', async (req, res) => {
    try {
        console.log('[PASSWORD CHANGE] ===== PASSWORD CHANGE REQUEST =====');
        console.log('[PASSWORD CHANGE] Session ID:', req.sessionID);
        console.log('[PASSWORD CHANGE] Session user:', req.session.user);

        if (!req.session.user || req.session.user.role !== 'Customer') {
            console.log('[PASSWORD CHANGE] Unauthorized - no valid session');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - please log in first'
            });
        }

        const customerId = req.session.user.id;
        const { currentPassword, newPassword, setupInitialPassword } = req.body || {};
        const isInitialSetup =
            setupInitialPassword === true ||
            setupInitialPassword === 'true' ||
            setupInitialPassword === 1;

        const newPwd = typeof newPassword === 'string' ? newPassword.trim() : '';
        const currentPwd =
            typeof currentPassword === 'string' ? currentPassword.trim() : '';

        if (!newPwd) {
            return res.status(400).json({
                success: false,
                message: 'New password is required'
            });
        }

        if (!isInitialSetup && !currentPwd) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPwd.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        const { isCommonPassword } = require('./utils/passwordValidator');
        if (isCommonPassword(newPwd)) {
            return res.status(400).json({
                success: false,
                message: 'This password is too common. Please choose a more secure password.'
            });
        }

        console.log('[PASSWORD CHANGE] Customer ID:', customerId, 'initialSetup:', isInitialSetup);

        await poolConnect;

        let customerResult;
        try {
            customerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query(`
                    SELECT PasswordHash, PasswordSetupCompleted
                    FROM Customers
                    WHERE CustomerID = @customerId AND IsActive = 1
                `);
        } catch (colErr) {
            customerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT PasswordHash FROM Customers WHERE CustomerID = @customerId AND IsActive = 1');
        }

        const customer = customerResult.recordset[0];
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const passwordSetupIncomplete =
            customer.PasswordSetupCompleted === false ||
            customer.PasswordSetupCompleted === 0;
        const hasNoLocalPassword =
            customer.PasswordHash == null || String(customer.PasswordHash).trim() === '';
        const allowWithoutCurrent =
            isInitialSetup || passwordSetupIncomplete || hasNoLocalPassword;

        if (!allowWithoutCurrent) {
            const currentPasswordMatch = await bcrypt.compare(
                currentPwd,
                customer.PasswordHash
            );
            if (!currentPasswordMatch) {
                console.log('[PASSWORD CHANGE] Current password verification failed');
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }
            if (currentPwd === newPwd) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be different from current password'
                });
            }
        }

        const newPasswordHash = await bcrypt.hash(newPwd, 10);

        try {
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('newPasswordHash', sql.NVarChar, newPasswordHash)
                .query(`
                    UPDATE Customers
                    SET PasswordHash = @newPasswordHash, PasswordSetupCompleted = 1
                    WHERE CustomerID = @customerId
                `);
        } catch (updateErr) {
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('newPasswordHash', sql.NVarChar, newPasswordHash)
                .query('UPDATE Customers SET PasswordHash = @newPasswordHash WHERE CustomerID = @customerId');
        }

        if (req.session.user) {
            req.session.user.requiresPasswordSetup = false;
        }
        if (req.session.customerData) {
            req.session.customerData.requiresPasswordSetup = false;
        }

        console.log('[PASSWORD CHANGE] Password updated successfully for customer:', customerId);

        res.json({
            success: true,
            message: allowWithoutCurrent
                ? 'Password set successfully'
                : 'Password updated successfully'
        });

    } catch (err) {
        console.error('[PASSWORD CHANGE] Error changing password:', err);
        console.error('[PASSWORD CHANGE] Error stack:', err.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: err.message
        });
    }
});

// Test endpoint to check session status
app.get('/api/test/session', async (req, res) => {
    try {
        res.json({
            success: true,
            sessionID: req.sessionID,
            hasSession: !!req.session,
            sessionUser: req.session?.user,
            sessionCustomerData: req.session?.customerData,
            sessionKeys: req.session ? Object.keys(req.session) : []
        });
    } catch (err) {
        console.error('[SESSION TEST] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Test endpoint to check database connection and table existence
// Test endpoint to verify SendGrid receipt email sending
app.post('/api/test/send-receipt-email', async (req, res) => {
    try {
        const { email, orderNumber } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        console.log('[TEST] Testing receipt email sending to:', email);

        const { sendOrderReceiptEmail } = require('./utils/sendgridHelper');

        const testResult = await sendOrderReceiptEmail(
            email,
            'Test Customer',
            {
                orderId: 999,
                referenceNumber: orderNumber || 'TEST-001',
                transactionId: 'TXN' + Date.now(),
                orderDate: new Date(),
                paymentMethod: 'E-Wallet',
                subtotal: 1000,
                shippingCost: 100,
                extraDeliveryFee: 0,
                taxAmount: 120,
                totalAmount: 1220,
                items: [
                    {
                        name: 'Test Product',
                        quantity: 1,
                        price: 1000,
                        variationName: null,
                        color: null
                    }
                ]
            }
        );

        res.json({
            success: testResult.success,
            message: testResult.message,
            messageId: testResult.messageId,
            error: testResult.error,
            errorDetails: testResult.errorDetails
        });
    } catch (error) {
        console.error('[TEST] Error testing receipt email:', error);
        res.status(500).json({
            success: false,
            message: 'Test failed',
            error: error.message
        });
    }
});

app.get('/api/test/database', async (req, res) => {
    try {
        await poolConnect;

        // Test basic connection
        const testResult = await pool.request().query('SELECT 1 as test');
        console.log('[DB TEST] Basic connection test:', testResult.recordset);

        // Check if CustomerAddresses table exists
        const tableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'CustomerAddresses'
        `);
        console.log('[DB TEST] CustomerAddresses table check:', tableCheck.recordset);

        // Check table structure
        const structureCheck = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'CustomerAddresses'
            ORDER BY ORDINAL_POSITION
        `);
        console.log('[DB TEST] CustomerAddresses structure:', structureCheck.recordset);

        res.json({
            success: true,
            connection: 'OK',
            tableExists: tableCheck.recordset.length > 0,
            tableStructure: structureCheck.recordset
        });
    } catch (err) {
        console.error('[DB TEST] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Customer addresses API endpoints
app.get('/api/customer/addresses', async (req, res) => {
    try {
        console.log('[ADDRESS GET] ===== STARTING ADDRESS FETCH =====');
        console.log('[ADDRESS GET] Session ID:', req.sessionID);
        console.log('[ADDRESS GET] Session user:', req.session.user);
        console.log('[ADDRESS GET] Session customerData:', req.session.customerData);
        console.log('[ADDRESS GET] Request headers:', req.headers);

        // Check for session in both user and customerData
        const hasUserSession = req.session.user && req.session.user.role === 'Customer';
        const hasCustomerSession = req.session.customerData && req.session.customerData.role === 'Customer';

        if (!hasUserSession && !hasCustomerSession) {
            console.log('[ADDRESS GET] Unauthorized - no valid session');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Please log in to view addresses',
                debug: {
                    hasSession: !!req.session,
                    hasUser: !!req.session.user,
                    hasCustomerData: !!req.session.customerData,
                    userRole: req.session.user?.role,
                    customerRole: req.session.customerData?.role,
                    sessionID: req.sessionID
                }
            });
        }

        await poolConnect;
        // Get customer ID from either session type
        const customerId = req.session.user?.id || req.session.customerData?.id;
        console.log('[ADDRESS GET] Customer ID:', customerId);

        const result = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT * FROM CustomerAddresses WHERE CustomerID = @customerId');

        console.log('[ADDRESS GET] Query result:', result.recordset);

        // Address data is already plain text
        const addresses = result.recordset;

        res.json({ success: true, addresses: addresses });
    } catch (err) {
        console.error('[ADDRESS GET] Error fetching addresses:', err);
        console.error('[ADDRESS GET] Error stack:', err.stack);
        res.status(500).json({ success: false, message: 'Failed to fetch addresses', error: err.message });
    }
});

app.post('/api/customer/addresses', async (req, res) => {
    try {
        console.log('[ADDRESS API] ===== STARTING ADDRESS CREATION =====');
        console.log('[ADDRESS API] Session ID:', req.sessionID);
        console.log('[ADDRESS API] Session user:', req.session.user);
        console.log('[ADDRESS API] Session customerData:', req.session.customerData);
        console.log('[ADDRESS API] Request body:', req.body);
        console.log('[ADDRESS API] Request headers:', req.headers);

        // Check for session in both user and customerData
        const hasUserSession = req.session.user && req.session.user.role === 'Customer';
        const hasCustomerSession = req.session.customerData && req.session.customerData.role === 'Customer';

        if (!hasUserSession && !hasCustomerSession) {
            console.log('[ADDRESS API] Unauthorized - no valid session');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Please log in to add addresses',
                debug: {
                    hasSession: !!req.session,
                    hasUser: !!req.session.user,
                    hasCustomerData: !!req.session.customerData,
                    userRole: req.session.user?.role,
                    customerRole: req.session.customerData?.role,
                    sessionID: req.sessionID
                }
            });
        }

        // Get customer ID from either session type
        const customerId = req.session.user?.id || req.session.customerData?.id;
        const { label, houseNumber, street, barangay, city, province, region, postalCode, country, isDefault } = req.body;

        console.log('[ADDRESS API] Extracted data:', {
            customerId,
            label,
            houseNumber,
            street,
            barangay,
            city,
            province,
            region,
            postalCode,
            country,
            isDefault
        });

        await poolConnect;

        // Determine if this address should be default
        const existingCountResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT COUNT(1) AS Cnt, SUM(CASE WHEN IsDefault = 1 THEN 1 ELSE 0 END) AS DefaultCnt FROM CustomerAddresses WHERE CustomerID = @customerId');

        const existingCount = existingCountResult.recordset?.[0]?.Cnt || 0;
        const hasDefaultAlready = (existingCountResult.recordset?.[0]?.DefaultCnt || 0) > 0;
        const makeDefault = isDefault || existingCount === 0 || !hasDefaultAlready;

        // If setting as default, first set all existing addresses to non-default
        if (makeDefault) {
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('UPDATE CustomerAddresses SET IsDefault = 0 WHERE CustomerID = @customerId');
        }

        console.log('[ADDRESS API] About to execute INSERT query...');

        const insertResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .input('label', sql.NVarChar, label)
            .input('houseNumber', sql.NVarChar, houseNumber)
            .input('street', sql.NVarChar, street)
            .input('barangay', sql.NVarChar, barangay)
            .input('city', sql.NVarChar, city)
            .input('province', sql.NVarChar, province)
            .input('region', sql.NVarChar, region)
            .input('postalCode', sql.NVarChar, postalCode)
            .input('country', sql.NVarChar, country || 'Philippines')
            .input('isDefault', sql.Bit, makeDefault ? 1 : 0)
            .query(`INSERT INTO CustomerAddresses (CustomerID, Label, HouseNumber, Street, Barangay, City, Province, Region, PostalCode, Country, IsDefault)
                    OUTPUT INSERTED.AddressID
                    VALUES (@customerId, @label, @houseNumber, @street, @barangay, @city, @province, @region, @postalCode, @country, @isDefault)`);

        const newAddressId = insertResult.recordset?.[0]?.AddressID || null;
        console.log('[ADDRESS API] INSERT query executed successfully! New AddressID:', newAddressId);

        res.json({ success: true, addressId: newAddressId, isDefault: makeDefault });
    } catch (err) {
        console.error('[ADDRESS API] Error adding address:', err);
        console.error('[ADDRESS API] Error stack:', err.stack);
        res.status(500).json({ success: false, message: 'Failed to add address', error: err.message });
    }
});

app.put('/api/customer/addresses/:addressId', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const customerId = req.session.user.id;
        const addressId = req.params.addressId;
        const { label, houseNumber, street, barangay, city, province, region, postalCode, country, isDefault } = req.body;
        await poolConnect;

        // If setting as default, first set all existing addresses to non-default
        if (isDefault) {
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('UPDATE CustomerAddresses SET IsDefault = 0 WHERE CustomerID = @customerId');
        }

        await pool.request()
            .input('addressId', sql.Int, addressId)
            .input('customerId', sql.Int, customerId)
            .input('label', sql.NVarChar, label)
            .input('houseNumber', sql.NVarChar, houseNumber)
            .input('street', sql.NVarChar, street)
            .input('barangay', sql.NVarChar, barangay)
            .input('city', sql.NVarChar, city)
            .input('province', sql.NVarChar, province)
            .input('region', sql.NVarChar, region)
            .input('postalCode', sql.NVarChar, postalCode)
            .input('country', sql.NVarChar, country || 'Philippines')
            .input('isDefault', sql.Bit, isDefault ? 1 : 0)
            .query(`UPDATE CustomerAddresses SET Label=@label, HouseNumber=@houseNumber, Street=@street, Barangay=@barangay, City=@city, Province=@province, Region=@region, PostalCode=@postalCode, Country=@country, IsDefault=@isDefault WHERE AddressID=@addressId AND CustomerID=@customerId`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update address', error: err.message });
    }
});

app.delete('/api/customer/addresses/:addressId', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const customerId = req.session.user.id;
        const addressId = parseInt(req.params.addressId, 10);

        if (isNaN(addressId) || addressId <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid address ID' });
        }

        await poolConnect;

        // Check if address exists and belongs to customer
        const checkResult = await pool.request()
            .input('addressId', sql.Int, addressId)
            .input('customerId', sql.Int, customerId)
            .query('SELECT IsDefault FROM CustomerAddresses WHERE AddressID = @addressId AND CustomerID = @customerId');

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        const isDefault = checkResult.recordset[0].IsDefault;

        // Check if address is referenced by any orders
        const orderCheck = await pool.request()
            .input('addressId', sql.Int, addressId)
            .query('SELECT COUNT(*) as count FROM Orders WHERE ShippingAddressID = @addressId');

        const orderCount = orderCheck?.recordset?.[0]?.count || 0;

        if (orderCount > 0) {
            // Find an alternative address
            const altAddressResult = await pool.request()
                .input('addressId', sql.Int, addressId)
                .input('customerId', sql.Int, customerId)
                .query('SELECT TOP 1 AddressID FROM CustomerAddresses WHERE CustomerID = @customerId AND AddressID != @addressId');

            let alternativeAddressId = null;

            if (altAddressResult?.recordset?.length > 0) {
                alternativeAddressId = altAddressResult.recordset[0].AddressID;
            } else {
                // Create a temporary archived address
                const addressDetails = await pool.request()
                    .input('addressId', sql.Int, addressId)
                    .input('customerId', sql.Int, customerId)
                    .query(`
                        SELECT Label, HouseNumber, Street, Barangay, City, Province, Region, PostalCode, Country
                        FROM CustomerAddresses
                        WHERE AddressID = @addressId AND CustomerID = @customerId
                    `);

                if (addressDetails?.recordset?.length > 0) {
                    const addr = addressDetails.recordset[0];
                    const tempAddressResult = await pool.request()
                        .input('customerId', sql.Int, customerId)
                        .input('label', sql.NVarChar, (addr.Label || 'Previous Address') + ' (Archived)')
                        .input('houseNumber', sql.NVarChar, addr.HouseNumber || '')
                        .input('street', sql.NVarChar, addr.Street || '')
                        .input('barangay', sql.NVarChar, addr.Barangay || '')
                        .input('city', sql.NVarChar, addr.City || '')
                        .input('province', sql.NVarChar, addr.Province || '')
                        .input('region', sql.NVarChar, addr.Region || '')
                        .input('postalCode', sql.NVarChar, addr.PostalCode || '')
                        .input('country', sql.NVarChar, addr.Country || 'Philippines')
                        .query(`
                            INSERT INTO CustomerAddresses 
                            (CustomerID, Label, HouseNumber, Street, Barangay, City, Province, Region, PostalCode, Country)
                            OUTPUT INSERTED.AddressID
                            VALUES 
                            (@customerId, @label, @houseNumber, @street, @barangay, @city, @province, @region, @postalCode, @country)
                        `);

                    if (tempAddressResult?.recordset?.length > 0) {
                        alternativeAddressId = tempAddressResult.recordset[0].AddressID;
                    }
                }
            }

            if (!alternativeAddressId) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot delete address because it is referenced by ${orderCount} order(s). Please add another address first or contact support.`,
                    usedByOrders: true,
                    orderCount: orderCount
                });
            }

            // Use transaction to update orders and delete address
            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();

                // Update all orders to use alternative address
                await transaction.request()
                    .input('addressId', sql.Int, addressId)
                    .input('altAddressId', sql.Int, alternativeAddressId)
                    .query('UPDATE Orders SET ShippingAddressID = @altAddressId WHERE ShippingAddressID = @addressId');

                // Verify no orders still reference this address
                const verifyCheck = await transaction.request()
                    .input('addressId', sql.Int, addressId)
                    .query('SELECT COUNT(*) as count FROM Orders WHERE ShippingAddressID = @addressId');

                const remainingCount = verifyCheck?.recordset?.[0]?.count || 0;

                if (remainingCount > 0) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Cannot delete address. ${remainingCount} order(s) still reference this address. Please contact support.`,
                        usedByOrders: true
                    });
                }

                // Delete the address
                await transaction.request()
                    .input('addressId', sql.Int, addressId)
                    .input('customerId', sql.Int, customerId)
                    .query('DELETE FROM CustomerAddresses WHERE AddressID = @addressId AND CustomerID = @customerId');

                await transaction.commit();
            } catch (transactionErr) {
                try {
                    await transaction.rollback();
                } catch (e) {
                    // Ignore rollback errors
                }

                // Check if it's a foreign key constraint error
                const isFKError = transactionErr.number === 547 || (transactionErr.message && (
                    transactionErr.message.includes('REFERENCE constraint') ||
                    transactionErr.message.includes('FOREIGN KEY') ||
                    transactionErr.message.includes('The DELETE statement conflicted with the REFERENCE constraint')
                ));

                if (isFKError) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot delete address because it is still referenced by order(s). Please contact support.`,
                        usedByOrders: true,
                        error: process.env.NODE_ENV === 'development' ? transactionErr.message : undefined
                    });
                }

                throw transactionErr;
            }
        } else {
            // No orders reference this address, safe to delete
            await pool.request()
                .input('addressId', sql.Int, addressId)
                .input('customerId', sql.Int, customerId)
                .query('DELETE FROM CustomerAddresses WHERE AddressID = @addressId AND CustomerID = @customerId');
        }

        // If this was the default address, set another address as default if available
        if (isDefault) {
            const remainingAddresses = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT TOP 1 AddressID FROM CustomerAddresses WHERE CustomerID = @customerId ORDER BY CreatedAt ASC');

            if (remainingAddresses.recordset.length > 0) {
                await pool.request()
                    .input('addressId', sql.Int, remainingAddresses.recordset[0].AddressID)
                    .input('customerId', sql.Int, customerId)
                    .query('UPDATE CustomerAddresses SET IsDefault = 1 WHERE AddressID = @addressId AND CustomerID = @customerId');
            }
        }

        res.json({ success: true, message: 'Address deleted successfully' });
    } catch (err) {
        console.error('Error deleting address:', err);

        // Check for foreign key constraint error
        const isFKError = err.number === 547 || (err.message && (
            err.message.includes('REFERENCE constraint') ||
            err.message.includes('FOREIGN KEY') ||
            err.message.includes('The DELETE statement conflicted with the REFERENCE constraint')
        ));

        if (isFKError) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete address because it is associated with existing orders. Please contact support.',
                usedByOrders: true,
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to delete address',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Customer profile image upload endpoints
app.post('/api/customer/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        const customerId = req.session.user.id;
        const imageUrl = `/uploads/profile-images/${req.file.filename}`;

        await poolConnect;
        await pool.request()
            .input('customerId', sql.Int, customerId)
            .input('profileImage', sql.NVarChar, imageUrl)
            .query('UPDATE Customers SET ProfileImage = @profileImage WHERE CustomerID = @customerId');

        res.json({ success: true, imageUrl });
    } catch (err) {
        console.error('Profile image upload error:', err);
        res.status(500).json({ success: false, message: 'Failed to upload profile image', error: err.message });
    }
});

app.delete('/api/customer/remove-profile-image', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const customerId = req.session.user.id;

        await poolConnect;
        await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('UPDATE Customers SET ProfileImage = NULL WHERE CustomerID = @customerId');

        res.json({ success: true });
    } catch (err) {
        console.error('Remove profile image error:', err);
        res.status(500).json({ success: false, message: 'Failed to remove profile image', error: err.message });
    }
});

// Employee/Admin profile API endpoints
app.get('/api/user/profile', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role === 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // For demo, just return session user info
        const { id, username, fullName, email, role } = req.session.user;
        res.json({ success: true, user: { id, username, fullName, email, role } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch profile', error: err.message });
    }
});

app.put('/api/user/profile', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role === 'Customer') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { fullName, email } = req.body;
        const userId = req.session.user.id;
        await poolConnect;
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('fullName', sql.NVarChar, fullName)
            .input('email', sql.NVarChar, email)
            .query('UPDATE Users SET FullName = @fullName, Email = @email WHERE UserID = @userId');
        // Update session
        req.session.user.fullName = fullName;
        req.session.user.email = email;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
    }
});

// Logout routes
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Enhanced Role-Based Authentication System
// All routes are now consolidated in routes.js

// Make database connection available to middleware
app.locals.pool = pool;
app.locals.sql = sql;

// Lazy load routes - only load when first request comes in (faster startup)
let employeeRoutes, apiRoutes;
let routesLoaded = false;

const loadRoutes = () => {
    if (!routesLoaded) {
        const startTime = Date.now();
        try {
            employeeRoutes = require('./routes')(sql, pool, getStripe);
            apiRoutes = require('./api-routes')(sql, pool);
            app.use('/', employeeRoutes);
            app.use('/', apiRoutes);
            routesLoaded = true;
            const loadTime = Date.now() - startTime;
            if (process.env.NODE_ENV === 'development') {
                console.log(`[ROUTES] Loaded in ${loadTime}ms`);
            }
        } catch (error) {
            console.error('[ROUTES] Error loading routes:', error);
            throw error;
        }
    }
};

// Load routes on first request (non-blocking startup)
app.use((req, res, next) => {
    if (!routesLoaded) {
        loadRoutes();
    }
    next();
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err);
    console.error('Error Stack:', err.stack);
    console.error('Request URL:', req.url);
    console.error('Request Method:', req.method);
    console.error('Request Headers:', req.headers);

    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Legacy public delivery rates endpoint - redirects to region-based calculation
app.get('/api/public/delivery-rates', async (req, res) => {
    // Set cache headers for delivery rates (30 minutes - rates change infrequently)
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    try {
        // Return empty array - frontend should use /api/delivery-rate/calculate instead
        res.json({
            success: true,
            deliveryRates: [],
            message: 'Please use /api/delivery-rate/calculate for region-based rates'
        });
    } catch (error) {
        console.error('Error in legacy delivery rates endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch delivery rates',
            message: error.message
        });
    }
});

// Simple API test endpoint for frontend
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        origin: req.headers.origin || 'no-origin',
        cors: 'configured'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Cleanup expired discounts on server startup
    try {
        await poolConnect;
        const deletedCount = await cleanupExpiredDiscountsSafe(pool);
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} expired discount(s) on startup.`);
        }
    } catch (error) {
        console.error('Error cleaning up expired discounts on startup:', error);
    }

    // Set up periodic cleanup every hour (3600000 ms)
    setInterval(async () => {
        try {
            await poolConnect;
            const deletedCount = await cleanupExpiredDiscountsSafe(pool);
            if (deletedCount > 0) {
                console.log(`🧹 Periodic cleanup: Deleted ${deletedCount} expired discount(s).`);
            }
        } catch (error) {
            console.error('Error in periodic discount cleanup:', error);
        }
    }, 3600000); // Run every hour

    console.log('⏰ Expired discount cleanup scheduled to run every hour.');
});

// --- Products API for Frontend ---
// Get all products with caching
app.get('/api/products', async (req, res) => {
    try {
        console.log('Products API: Starting request');
        await poolConnect;
        console.log('Products API: Database connected');

        // Catalog parent products have no SKU; sellable units use variation SKUs only
        await pool.request().query(`
            UPDATE p
            SET p.SKU = NULL, p.UpdatedAt = GETDATE()
            FROM Products p
            INNER JOIN InventoryProducts ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
            WHERE p.SKU IS NOT NULL
        `);

        await pool.request().query(`
            IF COL_LENGTH('Products', 'IsBestSeller') IS NULL
                ALTER TABLE Products ADD IsBestSeller BIT NOT NULL CONSTRAINT DF_Products_IsBestSeller DEFAULT 0;
            IF COL_LENGTH('Products', 'IsNewArrival') IS NULL
                ALTER TABLE Products ADD IsNewArrival BIT NOT NULL CONSTRAINT DF_Products_IsNewArrival DEFAULT 0;
        `);

        // Disable caching so CMS toggle changes appear on homepage immediately
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        const result = await pool.request().query(`
            SELECT 
                p.PublicId as id,
                p.Slug as slug,
                p.SKU as sku,
                p.Name as name,
                p.Description as description,
                p.Price as price,
                p.StockQuantity as stockQuantity,
                p.StockQuantity - ISNULL((
                    SELECT SUM(oi.Quantity)
                    FROM OrderItems oi
                    INNER JOIN Orders o ON oi.OrderID = o.OrderID
                    ${ORDER_ITEMS_CATALOG_CROSS_APPLY}
                    WHERE cat.CatalogProductID = p.ProductID
                    AND o.Status = N'Pending'
                ), 0) as availableStock,
                COALESCE(sold.soldQuantity, 0) as soldQuantity,
                p.Category as categoryName,
                p.ImageURL as images,
                ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                p.DateAdded as dateAdded,
                p.IsActive as isActive,
                p.Dimensions as specifications,
                p.IsFeatured as featured,
                p.IsBestSeller as isBestSeller,
                p.IsNewArrival as isNewArrival,
                p.Model3DURL as model3d,
                p.Has3DModel as has3dModel
            FROM Products p WITH (NOLOCK)
            LEFT JOIN (
                SELECT 
                    cat.CatalogProductID AS ProductID,
                    SUM(oi.Quantity) AS soldQuantity
                FROM OrderItems oi
                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                CROSS APPLY (
                    SELECT COALESCE(
                        (SELECT TOP 1 p2.ProductID FROM Products p2 WHERE p2.ProductID = oi.ProductID),
                        (SELECT TOP 1 ip.ProductID FROM InventoryProducts ip
                         WHERE ip.InventoryProductID = oi.ProductID AND ISNULL(ip.IsActive, 1) = 1
                         ORDER BY ip.InventoryProductID DESC),
                        (SELECT TOP 1 ip2.ProductID FROM InventoryProducts ip2
                         WHERE ip2.ProductID = oi.ProductID AND ISNULL(ip2.IsActive, 1) = 1
                         ORDER BY ip2.InventoryProductID DESC)
                    ) AS CatalogProductID
                ) cat
                WHERE o.Status IN (N'Completed', N'Delivered', N'Received')
                  AND cat.CatalogProductID IS NOT NULL
                GROUP BY cat.CatalogProductID
            ) sold ON p.ProductID = sold.ProductID
            WHERE p.IsActive = 1
            ORDER BY p.IsFeatured DESC, p.IsBestSeller DESC, p.IsNewArrival DESC, p.DateAdded DESC
        `);

        console.log('Products API: Query executed, found', result.recordset.length, 'products');
        res.setHeader('Cache-Control', 'private, max-age=15');

        // Process images - convert single image URL to array
        const products = result.recordset.map((product) => {
            const row = {
                ...product,
                soldQuantity: Number(product.soldQuantity ?? 0) || 0,
                availableStock:
                    product.availableStock != null
                        ? Math.max(0, Number(product.availableStock) || 0)
                        : Math.max(0, Number(product.stockQuantity) || 0),
                images: product.images ? [product.images] : [],
                specifications: (() => {
                    try {
                        return product.specifications ? JSON.parse(product.specifications) : {};
                    } catch {
                        return {};
                    }
                })()
            };
            return mapProductRecordAssetUrls(row);
        });

        const {
            enrichProductsWithVariationPolicy,
            enrichProductsAssetsFromInventory
        } = require('./utils/productVariationPolicy');
        let productsForClient = await enrichProductsWithVariationPolicy(pool, products);
        productsForClient = await enrichProductsAssetsFromInventory(pool, productsForClient);

        console.log('Products API: Returning', productsForClient.length, 'products');
        res.json({
            success: true,
            products: productsForClient
        });
    } catch (err) {
        console.error('Products API Error:', err);
        console.error('Products API Error Stack:', err.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products',
            details: err.message
        });
    }
});

// Resolve product identifier (ProductID, PublicId, Slug, or SKU) to ProductID
async function resolveProductId(identifier) {
    return resolveProductIdFromDb(pool, identifier);
}

/** Cart/checkout item may send id (PublicId), productId, or ProductID. */
function getCheckoutItemProductIdentifier(item) {
    if (!item || typeof item !== 'object') return '';
    return String(
        item.productId ||
        item.id ||
        item.ProductID ||
        item.product?.id ||
        item.product?.ProductID ||
        ''
    ).trim();
}

/** Stripe Checkout session → PaymentIntent id (pi_) for Orders.TransactionID / receipts. */
function stripePaymentIntentIdFromCheckoutSession(session) {
    if (!session || session.payment_intent == null) return '';
    const pi = session.payment_intent;
    if (typeof pi === 'string') {
        const s = pi.trim();
        return /^pi_/i.test(s) ? s : '';
    }
    if (typeof pi === 'object' && pi && pi.id) {
        const s = String(pi.id).trim();
        return /^pi_/i.test(s) ? s : '';
    }
    return '';
}

function getPayMongoAuthHeader() {
    const key = process.env.PAYMONGO_SECRET_KEY;
    if (!key) return null;
    return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

async function fetchPayMongoCheckoutSession(sessionId) {
    const auth = getPayMongoAuthHeader();
    if (!auth || !sessionId) return null;
    const pmRes = await fetch(
        `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(String(sessionId).trim())}`,
        { headers: { accept: 'application/json', authorization: auth } }
    );
    if (!pmRes.ok) return null;
    const pmJson = await pmRes.json().catch(() => ({}));
    return pmJson?.data || null;
}

/** True when PayMongo reports the checkout session as paid (several attribute shapes). */
function isPayMongoCheckoutSessionPaid(attrs) {
    if (!attrs) return false;
    const paidStatuses = new Set(['paid', 'succeeded', 'success', 'completed']);
    const candidates = [
        attrs.status,
        attrs.payment_status,
        attrs.payment_intent?.attributes?.status
    ];
    for (const payment of attrs.payments || []) {
        candidates.push(payment?.attributes?.status);
        candidates.push(payment?.attributes?.paid_at ? 'paid' : null);
    }
    if (candidates.some((s) => paidStatuses.has(String(s || '').toLowerCase()))) {
        return true;
    }
    if (Array.isArray(attrs.payments) && attrs.payments.length > 0) {
        return attrs.payments.some((p) =>
            paidStatuses.has(String(p?.attributes?.status || '').toLowerCase())
        );
    }
    return false;
}

function getCheckoutItemVariationId(item) {
    if (!item || typeof item !== 'object') return null;
    const v =
        item.variationId ??
        item.VariationID ??
        item.variation?.id ??
        item.variation?.VariationID ??
        item.product?.variationId ??
        item.product?.VariationID;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Shared stock validation for Stripe/PayMongo checkout (supports UUID PublicId in item.id). */
async function validateCheckoutItemsStock(items) {
    const stockIssues = [];
    if (!items || !Array.isArray(items)) {
        return ['No items provided'];
    }

    const {
        getProductVariationQuantity,
        productHasActiveProductVariations
    } = require('./utils/productVariationPolicy');

    await pool.connect();

    for (const item of items) {
        const requestedQuantity = parseInt(item.quantity, 10) || 0;
        if (requestedQuantity <= 0) continue;

        const rawId = getCheckoutItemProductIdentifier(item);
        const productId = await resolveProductId(rawId);
        if (!productId || productId <= 0) {
            stockIssues.push(`Product not found or inactive: ${rawId || 'unknown'}`);
            continue;
        }

        const productResult = await pool.request()
            .input('productId', sql.Int, productId)
            .query('SELECT StockQuantity, Name FROM Products WHERE ProductID = @productId AND IsActive = 1');

        if (productResult.recordset.length === 0) {
            stockIssues.push(`Product ID ${productId} not found`);
            continue;
        }

        const productName = productResult.recordset[0].Name || 'Unknown Product';
        const cmsProductStock = productResult.recordset[0].StockQuantity || 0;
        const variationId = getCheckoutItemVariationId(item);
        const hasVariations = await productHasActiveProductVariations(pool, productId);

        let actualStock;
        let pendingQuantity;

        if (hasVariations) {
            if (!variationId) {
                stockIssues.push(
                    `${productName}: Select a variation before checkout (variation stock is tracked per option).`
                );
                continue;
            }
            actualStock = await getProductVariationQuantity(pool, productId, variationId);
            const pendingResult = await pool.request()
                .input('productId', sql.Int, productId)
                .input('variationId', sql.Int, variationId)
                .query(`
                    SELECT ISNULL(SUM(oi.Quantity), 0) as PendingQuantity
                    FROM OrderItems oi
                    INNER JOIN Orders o ON oi.OrderID = o.OrderID
                    ${ORDER_ITEMS_CATALOG_CROSS_APPLY}
                    WHERE cat.CatalogProductID = @productId
                    AND oi.VariationID = @variationId
                    AND o.Status = N'Pending'
                `);
            pendingQuantity = pendingResult.recordset[0].PendingQuantity || 0;
        } else {
            actualStock = cmsProductStock;
            const pendingResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT ISNULL(SUM(oi.Quantity), 0) as PendingQuantity
                    FROM OrderItems oi
                    INNER JOIN Orders o ON oi.OrderID = o.OrderID
                    ${ORDER_ITEMS_CATALOG_CROSS_APPLY}
                    WHERE cat.CatalogProductID = @productId
                    AND o.Status = N'Pending'
                `);
            pendingQuantity = pendingResult.recordset[0].PendingQuantity || 0;
        }

        const availableStock = Math.max(0, actualStock - pendingQuantity);

        if (requestedQuantity > availableStock) {
            const scope = hasVariations && variationId ? `variation #${variationId}` : 'product';
            stockIssues.push(
                `${productName}: Requested ${requestedQuantity}, but only ${availableStock} available for this ${scope} (${actualStock} in stock, ${pendingQuantity} in pending orders)`
            );
        }
    }

    return stockIssues;
}

// Search products (must be declared before /api/products/:id)
app.get('/api/products/search', async (req, res) => {
    try {
        const query = String(req.query.q || '').trim().toLowerCase();

        if (!query) {
            return res.json({ success: true, products: [] });
        }

        await poolConnect;

        const searchPattern = `%${query}%`;
        const startsPattern = `${query}%`;

        const result = await pool.request()
            .input('searchTerm', sql.NVarChar, query)
            .input('searchPattern', sql.NVarChar, searchPattern)
            .input('startsPattern', sql.NVarChar, startsPattern)
            .query(`
                SELECT TOP 20
                    ProductID as id,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    ISNULL(ThumbnailURLs, '[]') as thumbnails,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Slug as slug,
                    SKU as sku,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products WITH (NOLOCK)
                WHERE IsActive = 1
                  AND (
                    LOWER(Name) LIKE @searchPattern
                    OR LOWER(Description) LIKE @searchPattern
                    OR LOWER(Category) LIKE @searchPattern
                    OR LOWER(Name) LIKE @startsPattern
                    OR LOWER(Category) LIKE @startsPattern
                  )
                ORDER BY
                    CASE
                        WHEN LOWER(Name) = @searchTerm THEN 1
                        WHEN LOWER(Name) LIKE @startsPattern THEN 2
                        WHEN LOWER(Category) = @searchTerm THEN 3
                        WHEN LOWER(Category) LIKE @startsPattern THEN 4
                        ELSE 5
                    END,
                    IsFeatured DESC,
                    DateAdded DESC
            `);

        const products = result.recordset.map((product) => {
            const row = {
                ...product,
                images: product.images ? [product.images] : [],
                specifications: (() => {
                    try {
                        return product.specifications ? JSON.parse(product.specifications) : {};
                    } catch {
                        return {};
                    }
                })()
            };
            return mapProductRecordAssetUrls(row);
        });

        return res.json({ success: true, products });
    } catch (err) {
        console.error('Product search error:', err);
        return res.status(500).json({ success: false, error: 'Failed to search products' });
    }
});

// Get product by ID (supports UUID, slug, SKU, and legacy numeric ID)
app.get('/api/products/:id', async (req, res) => {
    try {
        const identifier = req.params.id;
        await poolConnect;

        // Catalog parent products have no SKU; sellable units use variation SKUs only
        await pool.request().query(`
            UPDATE p
            SET p.SKU = NULL, p.UpdatedAt = GETDATE()
            FROM Products p
            INNER JOIN InventoryProducts ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
            WHERE p.SKU IS NOT NULL
        `);

        // Set cache headers for product detail (2 minutes - products change less frequently)
        res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

        // Determine if identifier is UUID, slug, SKU, or legacy numeric ID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
        const isNumeric = /^\d+$/.test(identifier);
        const isSKU = /^SKU-[A-Z0-9]+-[0-9]{6}$/i.test(identifier) || /^DX-[A-F0-9]{8}-[0-9]{4}$/i.test(identifier);

        let query, inputParam;
        if (isUUID) {
            query = `
                SELECT 
                    PublicId as id,
                    Slug as slug,
                    SKU as sku,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    ISNULL(ThumbnailURLs, '[]') as thumbnails,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products WITH (NOLOCK)
                WHERE PublicId = @identifier AND IsActive = 1
            `;
            inputParam = sql.UniqueIdentifier;
        } else if (isNumeric) {
            // Legacy support for numeric IDs - map to PublicId
            query = `
                SELECT 
                    PublicId as id,
                    Slug as slug,
                    SKU as sku,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    ISNULL(ThumbnailURLs, '[]') as thumbnails,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products WITH (NOLOCK)
                WHERE ProductID = @identifier AND IsActive = 1
            `;
            inputParam = sql.Int;
        } else if (isSKU) {
            query = `
                SELECT 
                    PublicId as id,
                    Slug as slug,
                    SKU as sku,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    ISNULL(ThumbnailURLs, '[]') as thumbnails,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products WITH (NOLOCK)
                WHERE SKU = @identifier AND IsActive = 1
            `;
            inputParam = sql.NVarChar;
        } else {
            // Assume it's a slug
            query = `
                SELECT 
                    PublicId as id,
                    Slug as slug,
                    SKU as sku,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    ISNULL(ThumbnailURLs, '[]') as thumbnails,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products WITH (NOLOCK)
                WHERE Slug = @identifier AND IsActive = 1
            `;
            inputParam = sql.NVarChar;
        }

        const result = await pool.request()
            .input('identifier', inputParam, identifier)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        const product = result.recordset[0];

        product.images = product.images ? [product.images] : [];
        try {
            product.specifications = product.specifications ? JSON.parse(product.specifications) : {};
        } catch {
            product.specifications = {};
        }

        const mapped = mapProductRecordAssetUrls(product);

        res.json({
            success: true,
            product: mapped
        });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product',
            details: err.message
        });
    }
});

// Backward-compatible alias used by frontend service
app.get('/api/products/detail/:id', async (req, res) => {
    req.url = `/api/products/${encodeURIComponent(req.params.id)}`;
    return app._router.handle(req, res, () => {});
});

// Stripe Payment Routes
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { items, email, paymentMethod, deliveryType, pickupDate, shippingCost, extraDeliveryFee, tax, subtotal, total, shippingAddressId } = req.body;

        if (process.env.NODE_ENV !== 'production') {
            console.log('Received checkout session request:', {
                items: items?.length,
                email,
                paymentMethod,
                deliveryType,
                pickupDate,
                pickupDateType: typeof pickupDate,
                pickupDateValue: pickupDate,
                shippingCost,
                extraDeliveryFee,
                tax,
                subtotal,
                total,
                shippingAddressId
            });

            // Log the full request body to debug
            console.log('[CREATE CHECKOUT SESSION] Full request body:', JSON.stringify(req.body, null, 2));
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            console.error('No items provided in request');
            return res.status(400).json({ error: 'No items provided' });
        }

        const stockIssues = await validateCheckoutItemsStock(items);

        if (stockIssues.length > 0) {
            console.error('[CHECKOUT] Stock validation failed:', stockIssues);
            return res.status(400).json({
                success: false,
                error: 'Insufficient stock',
                message: stockIssues.join('; '),
                issues: stockIssues
            });
        }
        // ✅ END OF STOCK VALIDATION

        const line_items = items.map(item => ({
            price_data: {
                currency: 'php',
                product_data: {
                    name: item.name,
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        // Add shipping cost as a separate line item if it's greater than 0
        if (shippingCost && shippingCost > 0) {
            line_items.push({
                price_data: {
                    currency: 'php',
                    product_data: {
                        name: 'Delivery Fee',
                    },
                    unit_amount: Math.round(shippingCost * 100),
                },
                quantity: 1,
            });
        }

        // Add extra delivery fee as a separate line item if it's greater than 0
        const extraFeeAmount = parseFloat(extraDeliveryFee) || 0;
        if (extraFeeAmount > 0) {
            console.log('[CREATE CHECKOUT SESSION] Adding extra delivery fee to Stripe:', extraFeeAmount);
            line_items.push({
                price_data: {
                    currency: 'php',
                    product_data: {
                        name: 'Extra Delivery Fee (Qty > 4)',
                    },
                    unit_amount: Math.round(extraFeeAmount * 100),
                },
                quantity: 1,
            });
        } else {
            console.log('[CREATE CHECKOUT SESSION] Extra delivery fee is 0 or not provided, skipping');
        }

        // Add tax as a separate line item if it's greater than 0
        if (tax && tax > 0) {
            line_items.push({
                price_data: {
                    currency: 'php',
                    product_data: {
                        name: 'Tax (12%)',
                    },
                    unit_amount: Math.round(tax * 100),
                },
                quantity: 1,
            });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('[CREATE CHECKOUT SESSION] Created line items for Stripe:', JSON.stringify(line_items, null, 2));
            console.log('[CREATE CHECKOUT SESSION] Total line items:', line_items.length);
            console.log('[CREATE CHECKOUT SESSION] Extra delivery fee included:', extraFeeAmount > 0 ? `Yes (₱${extraFeeAmount})` : 'No');
        }

        // Build session params
        const sessionParams = {
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: `${req.headers.origin || 'http://localhost:3000'}/order-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/payment?cancelled=true`,
            metadata: {
                cart: JSON.stringify(items),
                paymentMethod: paymentMethod || 'E-Wallet',
                deliveryType: deliveryType || 'pickup',
                pickupDate: (pickupDate && typeof pickupDate === 'string' && pickupDate.trim() !== '') ? pickupDate.trim() : '',
                shippingCost: String(typeof shippingCost === 'number' ? shippingCost : 0),
                extraDeliveryFee: String(typeof extraDeliveryFee === 'number' ? extraDeliveryFee : 0),
                tax: String(typeof tax === 'number' ? tax : 0),
                subtotal: String(typeof subtotal === 'number' ? subtotal : 0),
                total: String(typeof total === 'number' ? total : 0),
                shippingAddressId: shippingAddressId ? String(shippingAddressId) : ''
            },
        };

        if (email && typeof email === 'string' && email.includes('@')) {
            sessionParams.customer_email = email;
            console.log('Adding customer email to session:', email);
        } else {
            console.log('No valid email provided, session will not have customer_email');
        }

        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }
        const session = await stripeInstance.checkout.sessions.create(sessionParams);
        console.log('Stripe session created successfully:', session.id);

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session', message: error.message });
    }
});

// PayMongo customer checkout
app.post('/api/create-paymongo-checkout-session', async (req, res) => {
    try {
        const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;
        if (!paymongoSecretKey) {
            return res.status(500).json({ success: false, error: 'PayMongo is not configured' });
        }

        const {
            items,
            email,
            paymentMethod,
            deliveryType,
            pickupDate,
            shippingCost,
            extraDeliveryFee,
            subtotal,
            total,
            shippingAddressId
        } = req.body || {};

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'No items provided' });
        }

        const stockIssues = await validateCheckoutItemsStock(items);
        if (stockIssues.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient stock',
                message: stockIssues.join('; '),
                issues: stockIssues
            });
        }

        const cartForMetadata = items.map((item) => ({
            ...item,
            id: getCheckoutItemProductIdentifier(item) || item.id,
            productId: getCheckoutItemProductIdentifier(item) || item.productId
        }));

        const line_items = cartForMetadata.map((item) => {
            const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
            const unit = Number(item.price) || 0;
            return {
                currency: 'PHP',
                amount: Math.round(unit * 100) * qty,
                name: String(item.name || 'Product').trim().slice(0, 200),
                quantity: qty
            };
        });

        const shipPesos = Math.max(0, Number(shippingCost) || 0);
        if (shipPesos > 0.001) {
            line_items.push({
                currency: 'PHP',
                amount: Math.round(shipPesos * 100),
                name: 'Delivery Fee',
                quantity: 1
            });
        }

        const extraFeePesos = Math.max(0, Number(extraDeliveryFee) || 0);
        if (extraFeePesos > 0.001) {
            line_items.push({
                currency: 'PHP',
                amount: Math.round(extraFeePesos * 100),
                name: 'Extra Delivery Fee (Qty > 4)',
                quantity: 1
            });
        }

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const authHeader = getPayMongoAuthHeader();

        const pmRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        send_email_receipt: false,
                        show_description: true,
                        show_line_items: true,
                        description: `DesignXcel order — ${email || 'customer'}`,
                        line_items,
                        payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
                        success_url: `${origin}/order-success?provider=paymongo&paymongo_session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${origin}/payment?cancelled=true`,
                        billing: email && String(email).includes('@')
                            ? { email: String(email).trim() }
                            : undefined,
                        metadata: {
                            cart: JSON.stringify(cartForMetadata),
                            paymentMethod: paymentMethod || 'E-Wallet',
                            deliveryType: deliveryType || 'pickup',
                            pickupDate: pickupDate ? String(pickupDate).trim() : '',
                            shippingCost: String(typeof shippingCost === 'number' ? shippingCost : 0),
                            extraDeliveryFee: String(typeof extraDeliveryFee === 'number' ? extraDeliveryFee : 0),
                            subtotal: String(typeof subtotal === 'number' ? subtotal : 0),
                            total: String(typeof total === 'number' ? total : 0),
                            shippingAddressId: shippingAddressId ? String(shippingAddressId) : '',
                            email: email ? String(email).trim() : '',
                            orderType: 'regular'
                        }
                    }
                }
            })
        });

        const pmJson = await pmRes.json().catch(() => ({}));
        if (!pmRes.ok || !pmJson?.data?.id) {
            const errMsg =
                pmJson?.errors?.[0]?.detail ||
                pmJson?.errors?.[0]?.code ||
                'PayMongo checkout failed';
            console.error('[PAYMONGO CHECKOUT]', errMsg, pmJson);
            return res.status(500).json({ success: false, error: errMsg });
        }

        const checkoutUrl = pmJson.data.attributes?.checkout_url;
        if (!checkoutUrl) {
            return res.status(500).json({
                success: false,
                error: 'PayMongo did not return checkout_url'
            });
        }

        res.json({
            success: true,
            sessionId: pmJson.data.id,
            checkoutUrl
        });
    } catch (error) {
        console.error('Error creating PayMongo checkout session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create PayMongo checkout session',
            message: error.message
        });
    }
});

app.get('/api/paymongo-checkout-session/:sessionId', async (req, res) => {
    try {
        const session = await fetchPayMongoCheckoutSession(req.params.sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'PayMongo checkout session not found'
            });
        }
        res.json({ success: true, session });
    } catch (error) {
        console.error('Error retrieving PayMongo checkout session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve PayMongo checkout session'
        });
    }
});

app.post('/api/paymongo/finalize-checkout-session/:sessionId', async (req, res) => {
    try {
        const sessionId = String(req.params.sessionId || '').trim();
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Session ID is required' });
        }

        const pmData = await fetchPayMongoCheckoutSession(sessionId);
        if (!pmData) {
            return res.status(404).json({ success: false, message: 'PayMongo session not found' });
        }

        const attrs = pmData.attributes || {};
        const pmStatus = String(
            attrs.status || attrs.payment_intent?.attributes?.status || ''
        ).toLowerCase();

        if (!isPayMongoCheckoutSessionPaid(attrs)) {
            return res.json({
                success: false,
                message: 'Payment not completed yet',
                status: pmStatus || 'pending'
            });
        }

        await poolConnect;
        const existingOrder = await pool.request()
            .input('sessionId', sql.NVarChar, sessionId)
            .query('SELECT OrderID FROM Orders WHERE StripeSessionID = @sessionId');

        if (existingOrder.recordset.length > 0) {
            return res.json({
                success: true,
                message: 'Order already exists',
                orderId: existingOrder.recordset[0].OrderID
            });
        }

        const metadata = attrs.metadata || {};
        const sessionUser = req.session?.user || req.session?.customerData || {};
        const email =
            attrs.billing?.email ||
            metadata.email ||
            sessionUser.email ||
            '';

        const paymongoPaymentId = attrs.payments?.[0]?.id || null;
        const amountRaw = Number(attrs.amount);
        const amountPhp = Number.isFinite(amountRaw) && amountRaw > 0
            ? amountRaw / 100
            : parseFloat(metadata.total) || 0;

        let cartItems = [];
        try {
            if (metadata.cart) {
                cartItems = typeof metadata.cart === 'string'
                    ? JSON.parse(metadata.cart)
                    : metadata.cart;
            }
        } catch (cartErr) {
            console.warn('[PAYMONGO FINALIZE] Could not parse cart metadata:', cartErr.message);
        }

        const webhookPayload = {
            sessionId,
            email,
            customerId: sessionUser.id || sessionUser.CustomerID || null,
            paymentMethod: metadata.paymentMethod || 'E-Wallet',
            deliveryType: metadata.deliveryType || 'pickup',
            pickupDate: metadata.pickupDate || '',
            shippingCost: metadata.shippingCost || '0',
            extraDeliveryFee: metadata.extraDeliveryFee || '0',
            subtotal: metadata.subtotal || '0',
            total: amountPhp,
            shippingAddressId: metadata.shippingAddressId || '',
            items: Array.isArray(cartItems) ? cartItems : [],
            paymongoPaymentId
        };

        const port = process.env.PORT || 5000;
        const baseUrl = process.env.API_BASE_URL || `http://127.0.0.1:${port}`;
        const webhookRes = await fetch(`${baseUrl}/api/test-webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
            },
            body: JSON.stringify(webhookPayload)
        });

        const webhookJson = await webhookRes.json().catch(() => ({}));

        if (!webhookRes.ok) {
            console.error('[PAYMONGO FINALIZE] test-webhook HTTP', webhookRes.status, webhookJson);
            return res.status(500).json({
                success: false,
                message: webhookJson.message || webhookJson.error || 'Failed to create order from PayMongo payment',
                details: webhookJson.details
            });
        }

        if (webhookJson.success === false) {
            console.error('[PAYMONGO FINALIZE] test-webhook rejected:', webhookJson.message);
            return res.status(422).json({
                success: false,
                message: webhookJson.message || 'Order could not be created',
                details: webhookJson.details
            });
        }

        if (paymongoPaymentId) {
            try {
                await pool.request()
                    .input('sessionId', sql.NVarChar, sessionId)
                    .input('txn', sql.NVarChar, paymongoPaymentId)
                    .query(`
                        UPDATE Orders
                        SET TransactionID = @txn
                        WHERE StripeSessionID = @sessionId
                          AND (TransactionID IS NULL OR TransactionID LIKE 'TXN%')
                    `);
            } catch (txnErr) {
                console.warn('[PAYMONGO FINALIZE] Could not set gateway TransactionID:', txnErr.message);
            }
        }

        const orderAfter = await pool.request()
            .input('sessionId', sql.NVarChar, sessionId)
            .query('SELECT OrderID FROM Orders WHERE StripeSessionID = @sessionId');

        const orderId = orderAfter.recordset[0]?.OrderID || webhookJson.orderId || null;
        if (!orderId) {
            return res.status(500).json({
                success: false,
                message: 'Payment received but order was not saved. Please contact support with your payment reference.'
            });
        }

        res.json({
            success: true,
            message: webhookJson.message || 'Order finalized',
            orderId
        });
    } catch (error) {
        console.error('[PAYMONGO FINALIZE] Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to finalize PayMongo checkout'
        });
    }
});

app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId } = req.body;

        // Retrieve the payment intent to confirm it was successful
        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }
        const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            // Here you would typically save the order to your database
            res.json({
                success: true,
                message: 'Payment successful',
                paymentIntent: paymentIntent
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment failed',
                status: paymentIntent.status
            });
        }
    } catch (error) {
        console.error('Error confirming payment:', error);
        res.status(500).json({
            error: 'Failed to confirm payment',
            message: error.message
        });
    }
});

// COD endpoint removed - Only E-Wallet payment method is supported

// Cache whether BulkOrders.OrderID column exists to avoid repeated metadata lookups
let hasBulkOrdersOrderIdColumn = null;

// Batch sellable stock (one request for product grids — faster than per-card polling)
app.post('/api/products/available-stock/batch', async (req, res) => {
    try {
        await pool.connect();
        const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
        if (productIds.length === 0) {
            return res.json({ success: true, stocks: {} });
        }
        if (productIds.length > 80) {
            return res.status(400).json({ success: false, message: 'Maximum 80 products per batch' });
        }
        const result = await computeAvailableStockBatch(pool, resolveProductId, productIds);
        res.setHeader('Cache-Control', 'private, max-age=3');
        return res.json(result);
    } catch (err) {
        console.error('Error in batch available stock:', err);
        res.status(500).json({ success: false, message: 'Failed to calculate available stock' });
    }
});

// Per-variation sellable stock for product detail (one request)
app.get('/api/products/:productId/available-stock/variations', async (req, res) => {
    try {
        await pool.connect();
        const productId = await resolveProductId(req.params.productId);
        if (!productId || productId <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid product identifier' });
        }
        const result = await computeVariationAvailableStockMap(pool, productId);
        res.setHeader('Cache-Control', 'private, max-age=3');
        return res.json(result);
    } catch (err) {
        console.error('Error in variation available stock map:', err);
        res.status(500).json({ success: false, message: 'Failed to calculate variation stock' });
    }
});

// Get available stock for a product (accounting for pending orders)
app.get('/api/products/:productId/available-stock', async (req, res) => {
    try {
        await pool.connect();
        const productId = await resolveProductId(req.params.productId);

        if (!productId || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product identifier'
            });
        }

        const variationIdParam = req.query.variationId;
        const stockRow = await computeAvailableStock(pool, productId, {
            variationId: variationIdParam
        });

        if (!stockRow.success) {
            return res.json(stockRow);
        }

        const soldResult = await pool.request()
            .input('productId', sql.Int, productId)
            .query(`
                SELECT ISNULL(SUM(oi.Quantity), 0) as soldQuantity
                FROM OrderItems oi
                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                CROSS APPLY (
                    SELECT COALESCE(
                        (SELECT TOP 1 p2.ProductID FROM Products p2 WHERE p2.ProductID = oi.ProductID),
                        (SELECT TOP 1 ip.ProductID FROM InventoryProducts ip
                         WHERE ip.InventoryProductID = oi.ProductID AND ISNULL(ip.IsActive, 1) = 1
                         ORDER BY ip.InventoryProductID DESC),
                        (SELECT TOP 1 ip2.ProductID FROM InventoryProducts ip2
                         WHERE ip2.ProductID = oi.ProductID AND ISNULL(ip2.IsActive, 1) = 1
                         ORDER BY ip2.InventoryProductID DESC)
                    ) AS CatalogProductID
                ) cat
                WHERE o.Status IN (N'Completed', N'Delivered', N'Received')
                  AND cat.CatalogProductID = @productId
            `);

        res.setHeader('Cache-Control', 'private, max-age=3');
        res.json({
            ...stockRow,
            soldQuantity: soldResult.recordset[0]?.soldQuantity || 0
        });
    } catch (err) {
        console.error('Error calculating available stock:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate available stock',
            error: err.message
        });
    }
});

// Check bulk order stock availability endpoint
app.post('/api/check-bulk-order-stock', async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No items provided'
            });
        }

        await pool.connect();

        // Check stock for each item
        const stockIssues = [];
        for (const item of items) {
            const requestedQuantity = parseInt(item.quantity) || 0;
            if (requestedQuantity <= 0) {
                stockIssues.push({
                    productId: item.productId,
                    message: 'Invalid product ID or quantity'
                });
                continue;
            }

            // Match /api/products list (PublicId as id) and available-stock: resolve UUID/slug/SKU to ProductID
            const rawProductId = getCheckoutItemProductIdentifier(item) || item.productId;
            const productId = await resolveProductId(rawProductId);
            if (!productId || productId <= 0) {
                stockIssues.push({
                    productId: rawProductId,
                    message: 'Product not found or inactive'
                });
                continue;
            }

            // Get current stock quantity
            const stockResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT StockQuantity, Name FROM Products WHERE ProductID = @productId AND IsActive = 1');

            if (stockResult.recordset.length === 0) {
                stockIssues.push({
                    productId: rawProductId,
                    message: 'Product not found or inactive'
                });
                continue;
            }

            const product = stockResult.recordset[0];
            const actualStock = product.StockQuantity || 0;

            // ✅ CALCULATE PENDING QUANTITIES (REGULAR ORDERS)
            const pendingResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT ISNULL(SUM(oi.Quantity), 0) as PendingQuantity
                    FROM OrderItems oi
                    INNER JOIN Orders o ON oi.OrderID = o.OrderID
                    ${ORDER_ITEMS_CATALOG_CROSS_APPLY}
                    WHERE cat.CatalogProductID = @productId
                    AND o.Status = N'Pending'
                `);

            const pendingQuantity = pendingResult.recordset[0].PendingQuantity || 0;

            // ✅ CALCULATE PENDING QUANTITIES (BULK ORDERS)
            let bulkPendingQuantity = 0;
            try {
                const bulkOrderCheck = await pool.request().query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
                    AND name = 'OrderID'
                `);

                if (bulkOrderCheck.recordset[0].columnExists > 0) {
                    const bulkItemsResult = await pool.request()
                        .input('productId', sql.Int, productId)
                        .query(`
                            SELECT ISNULL(SUM(boi.Quantity), 0) as BulkPendingQuantity
                            FROM BulkOrderItems boi
                            INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                            WHERE boi.ProductID = @productId
                            AND bo.Status = 'Pending'
                            AND (bo.OrderID IS NULL)
                        `);
                    bulkPendingQuantity = bulkItemsResult.recordset[0].BulkPendingQuantity || 0;
                }
            } catch (bulkError) {
                console.log('Bulk order check skipped:', bulkError.message);
            }

            // ✅ CALCULATE AVAILABLE STOCK
            const totalPending = pendingQuantity + bulkPendingQuantity;
            const availableStock = Math.max(0, actualStock - totalPending);

            if (requestedQuantity > availableStock) {
                stockIssues.push({
                    productId: productId,
                    productName: product.Name,
                    requested: requestedQuantity,
                    available: availableStock,
                    actualStock: actualStock,
                    pendingQuantity: totalPending,
                    message: `${product.Name}: Requested ${requestedQuantity}, but only ${availableStock} available (${actualStock} in stock, ${totalPending} in pending orders)`
                });
            }
        }

        if (stockIssues.length > 0) {
            const messages = stockIssues.map(issue => issue.message).join('; ');
            return res.json({
                success: false,
                message: messages,
                issues: stockIssues
            });
        }

        res.json({
            success: true,
            message: 'All items are in stock'
        });
    } catch (error) {
        console.error('Error checking bulk order stock:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking stock availability',
            error: error.message
        });
    }
});

// Bulk Order Checkout Session endpoint
app.post('/api/create-bulk-order-checkout-session', async (req, res) => {
    try {
        const { items, email, paymentMethod, pickupDate, subtotal, tax, discount, total } = req.body;

        console.log('Received bulk order checkout session request:', {
            items: items?.length,
            email,
            paymentMethod,
            pickupDate,
            subtotal,
            discount,
            total
        });

        if (!items || !Array.isArray(items) || items.length === 0) {
            console.error('No items provided in bulk order request');
            return res.status(400).json({ error: 'No items provided' });
        }

        // Validate and calculate totals
        const parsedSubtotal = parseFloat(subtotal) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTotal = parseFloat(total) || 0;

        // Calculate the total from items to verify
        const calculatedSubtotal = items.reduce((sum, item) => {
            const price = parseFloat(item.unitPrice || item.price || 0);
            const qty = parseInt(item.quantity || 1);
            return sum + (price * qty);
        }, 0);

        // If we have a discount, we need to adjust the line items
        // Stripe doesn't support negative amounts, so we'll calculate proportional discounts
        // or use the final total to create a single line item for the discounted total
        let line_items = [];

        if (parsedDiscount > 0 && parsedDiscount < parsedSubtotal) {
            // Apply discount proportionally to items
            const discountRatio = 1 - (parsedDiscount / parsedSubtotal);

            line_items = items.map(item => {
                const basePrice = parseFloat(item.unitPrice || item.price || 0);
                const qty = parseInt(item.quantity || 1);
                const discountedPrice = basePrice * discountRatio;
                const unitAmount = Math.round(discountedPrice * 100);

                // Ensure unit_amount is a valid non-negative integer
                if (isNaN(unitAmount) || unitAmount < 0) {
                    console.error('Invalid unit_amount calculated:', unitAmount, 'for item:', item);
                    throw new Error(`Invalid price for item: ${item.name}`);
                }

                return {
                    price_data: {
                        currency: 'php',
                        product_data: {
                            name: item.name || 'Product',
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: qty,
                };
            });
        } else {
            // No discount or discount >= subtotal, use original prices
            line_items = items.map(item => {
                const price = parseFloat(item.unitPrice || item.price || 0);
                const qty = parseInt(item.quantity || 1);
                const unitAmount = Math.round(price * 100);

                // Ensure unit_amount is a valid non-negative integer
                if (isNaN(unitAmount) || unitAmount < 0) {
                    console.error('Invalid unit_amount calculated:', unitAmount, 'for item:', item);
                    throw new Error(`Invalid price for item: ${item.name}`);
                }

                return {
                    price_data: {
                        currency: 'php',
                        product_data: {
                            name: item.name || 'Product',
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: qty,
                };
            });
        }

        // Validate all line items have valid amounts
        for (const lineItem of line_items) {
            if (!lineItem.price_data || !lineItem.price_data.unit_amount ||
                isNaN(lineItem.price_data.unit_amount) || lineItem.price_data.unit_amount < 0) {
                console.error('Invalid line item:', lineItem);
                throw new Error('Invalid line item data');
            }
            if (!lineItem.quantity || isNaN(lineItem.quantity) || lineItem.quantity < 1) {
                console.error('Invalid quantity:', lineItem.quantity);
                throw new Error('Invalid item quantity');
            }
        }

        // Add tax as a separate line item if provided
        const parsedTax = parseFloat(tax) || 0;
        if (parsedTax > 0) {
            const taxAmountCents = Math.round(parsedTax * 100);
            line_items.push({
                price_data: {
                    currency: 'php',
                    product_data: {
                        name: 'Tax (12%)',
                    },
                    unit_amount: taxAmountCents,
                },
                quantity: 1,
            });
            console.log('Added tax line item:', taxAmountCents, 'cents');
        }

        // Calculate the total from line items to verify it matches expected total
        const lineItemsTotal = line_items.reduce((sum, item) => {
            return sum + (item.price_data.unit_amount * item.quantity);
        }, 0);
        const expectedTotalCents = Math.round(parsedTotal * 100);

        console.log('Created line items for bulk order Stripe session:', {
            lineItemsCount: line_items.length,
            lineItemsTotalCents: lineItemsTotal,
            expectedTotalCents: expectedTotalCents,
            taxAmountCents: parsedTax > 0 ? Math.round(parsedTax * 100) : 0,
            difference: Math.abs(lineItemsTotal - expectedTotalCents)
        });

        // If there's a small rounding difference, adjust the last item (but not tax)
        if (Math.abs(lineItemsTotal - expectedTotalCents) > 0 && line_items.length > 0) {
            // Find the last non-tax item to adjust
            let lastItemIndex = line_items.length - 1;
            if (parsedTax > 0 && line_items[lastItemIndex].price_data.product_data.name === 'Tax (12%)') {
                lastItemIndex = line_items.length - 2; // Use second-to-last item
            }

            if (lastItemIndex >= 0) {
                const difference = expectedTotalCents - lineItemsTotal;
                const lastItem = line_items[lastItemIndex];
                const adjustedAmount = lastItem.price_data.unit_amount + Math.round(difference / lastItem.quantity);

                if (adjustedAmount >= 0) {
                    lastItem.price_data.unit_amount = adjustedAmount;
                    console.log('Adjusted last item unit_amount to match total:', adjustedAmount);
                } else {
                    console.warn('Cannot adjust last item - would result in negative amount. Difference:', difference);
                }
            }
        }

        // Get customer name if available
        let customerName = null;
        if (email) {
            try {
                await pool.connect();
                const customerResult = await pool.request()
                    .input('email', sql.NVarChar, email)
                    .query('SELECT FullName FROM Customers WHERE LOWER(Email) = LOWER(@email)');
                if (customerResult.recordset.length > 0) {
                    customerName = customerResult.recordset[0].FullName;
                }
            } catch (err) {
                console.error('Error fetching customer name for bulk order:', err);
            }
        }

        // Build session params
        const sessionParams = {
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: `${req.headers.origin || 'http://localhost:3000'}/order-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/bulk-order?cancelled=true`,
            metadata: {
                orderType: 'bulk',
                items: JSON.stringify(items),
                paymentMethod: paymentMethod || 'E-Wallet',
                deliveryType: 'pickup',
                pickupDate: (pickupDate && typeof pickupDate === 'string' && pickupDate.trim() !== '') ? pickupDate.trim() : '',
                subtotal: String(parsedSubtotal),
                tax: String(parsedTax),
                discount: String(parsedDiscount),
                total: String(parsedTotal),
                customerName: customerName || email.split('@')[0] || 'Guest Customer'
            },
        };

        if (email && typeof email === 'string' && email.includes('@')) {
            sessionParams.customer_email = email;
            console.log('Adding customer email to bulk order session:', email);
        } else {
            console.log('No valid email provided for bulk order session');
        }

        // Log final session params for debugging (without sensitive data)
        console.log('Final session params:', {
            line_items_count: sessionParams.line_items.length,
            payment_method_types: sessionParams.payment_method_types,
            mode: sessionParams.mode,
            has_email: !!sessionParams.customer_email,
            metadata_keys: Object.keys(sessionParams.metadata)
        });

        // Validate line items one more time before sending to Stripe
        for (let i = 0; i < sessionParams.line_items.length; i++) {
            const item = sessionParams.line_items[i];
            if (!item.price_data || typeof item.price_data.unit_amount !== 'number' ||
                item.price_data.unit_amount < 0 || !Number.isInteger(item.price_data.unit_amount)) {
                console.error(`Invalid line item at index ${i}:`, item);
                throw new Error(`Invalid line item at index ${i}: unit_amount must be a non-negative integer`);
            }
            if (typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
                console.error(`Invalid quantity at index ${i}:`, item.quantity);
                throw new Error(`Invalid quantity at index ${i}: must be a positive integer`);
            }
        }

        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }
        const session = await stripeInstance.checkout.sessions.create(sessionParams);
        console.log('Bulk order Stripe session created successfully:', session.id);

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating bulk order checkout session:', error);
        console.error('Error details:', {
            message: error.message,
            type: error.type,
            code: error.code,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Failed to create checkout session',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Test endpoint to simulate webhook locally (for development only)
app.post('/api/test-webhook', async (req, res) => {
    // If we have a sessionId, load Stripe or PayMongo session for real metadata
    let actualSession = null;
    const bodySessionId = String(req.body.sessionId || '').trim();
    if (bodySessionId.startsWith('cs_')) {
        try {
            const stripeInstance = getStripe();
            if (!stripeInstance) {
                return res.status(500).json({ error: 'Stripe not configured' });
            }
            actualSession = await stripeInstance.checkout.sessions.retrieve(bodySessionId);
        } catch (stripeError) {
            // Session might not be available in test mode
        }
    } else if (bodySessionId) {
        const pmData = await fetchPayMongoCheckoutSession(bodySessionId);
        if (pmData) {
            const attrs = pmData.attributes || {};
            actualSession = {
                id: pmData.id,
                customer_email: attrs.billing?.email || attrs.metadata?.email || req.body.email,
                metadata: attrs.metadata || {},
                amount_total: Number(attrs.amount) || 0,
                currency: 'php'
            };
        }
    }

    // Get pickupDate - prioritize Stripe session metadata, then request body
    let finalPickupDate = '';
    if (actualSession?.metadata?.pickupDate) {
        finalPickupDate = String(actualSession.metadata.pickupDate).trim();
    } else if (req.body.pickupDate) {
        finalPickupDate = String(req.body.pickupDate).trim();
    }

    // Get email for customerName fallback
    const email = req.body.email || actualSession?.customer_email || '';

    // Determine order type
    const orderType = req.body.orderType || (actualSession?.metadata?.orderType) || 'regular';

    // Build metadata based on order type
    const metadata = {
        orderType: orderType,
        paymentMethod: req.body.paymentMethod || actualSession?.metadata?.paymentMethod || 'E-Wallet',
        deliveryType: req.body.deliveryType || actualSession?.metadata?.deliveryType || 'pickup',
        pickupDate: finalPickupDate,
        shippingCost: req.body.shippingCost || actualSession?.metadata?.shippingCost || '0',
        shippingAddressId: req.body.shippingAddressId || actualSession?.metadata?.shippingAddressId || '',
        extraDeliveryFee: req.body.extraDeliveryFee || actualSession?.metadata?.extraDeliveryFee || '0',
        tax: req.body.tax || actualSession?.metadata?.tax || '0',
        subtotal: req.body.subtotal || actualSession?.metadata?.subtotal || '0'
    };

    // Add order type specific metadata
    if (orderType === 'bulk') {
        // For bulk orders, include items, subtotal, discount, total, customerName
        metadata.items = JSON.stringify(req.body.items || []);
        metadata.subtotal = req.body.subtotal || actualSession?.metadata?.subtotal || '0';
        metadata.discount = req.body.discount || actualSession?.metadata?.discount || '0';
        // For total: prefer metadata.total (in PHP) from actualSession, then req.body.total (might be in cents), then amount_total (in cents)
        // If using amount_total, convert from cents to PHP
        let totalValue = actualSession?.metadata?.total;
        if (!totalValue) {
            // If req.body.total exists, check if it's in cents (large number) or PHP
            const reqTotal = req.body.total;
            if (reqTotal) {
                // If it's > 10000, it's likely in cents, convert to PHP
                totalValue = reqTotal > 10000 ? (reqTotal / 100).toFixed(2) : String(reqTotal);
            } else if (actualSession?.amount_total) {
                // amount_total is always in cents, convert to PHP
                totalValue = String((actualSession.amount_total / 100).toFixed(2));
            } else {
                totalValue = '2000';
            }
        }
        metadata.total = String(totalValue);
        metadata.cart = JSON.stringify([]); // Empty cart for bulk orders
        metadata.customerName = req.body.customerName || actualSession?.metadata?.customerName || (email ? email.split('@')[0] : 'Guest Customer');
    } else {
        if (actualSession?.metadata?.cart) {
            metadata.cart =
                typeof actualSession.metadata.cart === 'string'
                    ? actualSession.metadata.cart
                    : JSON.stringify(actualSession.metadata.cart);
        } else {
            metadata.cart = JSON.stringify(req.body.items || req.body.cart || []);
        }
    }

    let amountTotalCents = 2000;
    if (actualSession?.amount_total != null && Number.isFinite(Number(actualSession.amount_total))) {
        amountTotalCents = Number(actualSession.amount_total);
    } else if (req.body.total != null && Number.isFinite(Number(req.body.total))) {
        const t = Number(req.body.total);
        amountTotalCents = t > 100000 ? t : Math.round(t * 100);
    }

    // Simulate the webhook event data
    const mockSessionObject = {
        id: req.body.sessionId || 'cs_test_' + Date.now(),
        customer_email: req.body.email || actualSession?.customer_email || 'augmentdoe@gmail.com',
        metadata: metadata,
        amount_total: amountTotalCents,
        currency: 'php',
        payment_intent: (() => {
            const pi = actualSession?.payment_intent;
            if (typeof pi === 'string') return pi;
            return pi?.id || null;
        })()
    };
    const mockEvent = {
        type: 'checkout.session.completed',
        data: {
            object: mockSessionObject
        }
    };


    // Process the mock event - reuse the main webhook handler logic
    // The webhook handler will process this correctly based on orderType
    console.log('[TEST WEBHOOK] Simulating webhook event with orderType:', orderType);

    // Call the actual webhook handler logic
    try {
        // Use the same webhook processing logic
        const sig = 'test-signature';
        const event = mockEvent;

        // Process the event using the same logic as the real webhook
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email;
            const metadata = session.metadata || {};

            // Check order type FIRST before parsing cart/items
            const eventOrderType = metadata.orderType || 'regular';
            console.log('[TEST WEBHOOK] Processing order type:', eventOrderType);

            // Parse cart/items based on order type
            let cart = [];
            let bulkItems = [];

            if (eventOrderType === 'bulk') {
                // Parse bulk order items
                try {
                    if (metadata.items) {
                        bulkItems = JSON.parse(metadata.items);
                        console.log('[TEST WEBHOOK] Parsed bulk order items:', bulkItems.length);
                    } else {
                        console.error('[TEST WEBHOOK] No items metadata found in bulk order session');
                    }
                } catch (e) {
                    console.error('[TEST WEBHOOK] Failed to parse bulk order items:', e.message);
                }
            } else {
                // Parse regular order cart
                try {
                    if (metadata.cart) {
                        cart = JSON.parse(metadata.cart);
                        console.log('[TEST WEBHOOK] Parsed cart items:', cart.length);
                    } else {
                        console.error('[TEST WEBHOOK] No cart metadata found in session');
                    }
                } catch (e) {
                    console.error('[TEST WEBHOOK] Failed to parse cart metadata:', e.message);
                }
            }

            // Save order to database
            try {
                await pool.connect();
                console.log('[TEST WEBHOOK] Database connected successfully');

                console.log('[TEST WEBHOOK] Processing order type:', eventOrderType);

                if (eventOrderType === 'bulk') {
                    // For bulk orders, create as regular Orders (same flow as regular orders, pickup only)
                    console.log('[TEST WEBHOOK] Processing bulk order as regular order (pickup only)...');

                    // CRITICAL: Check if order with this StripeSessionID already exists
                    // This prevents duplicate orders if webhook is called multiple times
                    const existingOrderCheck = await pool.request()
                        .input('stripeSessionId', sql.NVarChar, session.id)
                        .query('SELECT OrderID, Status FROM Orders WHERE StripeSessionID = @stripeSessionId');

                    if (existingOrderCheck.recordset.length > 0) {
                        const existingOrder = existingOrderCheck.recordset[0];
                        console.warn('[TEST WEBHOOK] ⚠️ Order already exists for StripeSessionID:', session.id, 'OrderID:', existingOrder.OrderID, 'Status:', existingOrder.Status);
                        console.log('[TEST WEBHOOK] Skipping order creation to prevent duplicates');
                        return res.status(200).json({ received: true, message: 'Order already exists, skipped duplicate' });
                    }

                    if (!email) {
                        console.error('[TEST WEBHOOK] No customer email provided for bulk order. Order not saved.');
                        return res.status(200).json({ success: false, message: 'No customer email, order not saved' });
                    }

                    console.log('[TEST WEBHOOK] Looking up customer with email:', email);
                    // Use case-insensitive email lookup
                    const customerResult = await pool.request()
                        .input('email', sql.NVarChar, email)
                        .query('SELECT CustomerID, FullName FROM Customers WHERE LOWER(Email) = LOWER(@email)');
                    console.log('[TEST WEBHOOK] Customer lookup result:', customerResult.recordset);

                    let customer = customerResult.recordset[0];

                    // If customer doesn't exist, create one for bulk order
                    if (!customer) {
                        console.log('[TEST WEBHOOK] Customer not found, creating new customer for bulk order...');
                        const customerName = metadata.customerName || email.split('@')[0] || 'Guest Customer';

                        const createCustomerResult = await pool.request()
                            .input('email', sql.NVarChar, email)
                            .input('fullName', sql.NVarChar, customerName)
                            .query(`
                                INSERT INTO Customers (Email, FullName, IsActive, CreatedAt)
                                OUTPUT INSERTED.CustomerID, INSERTED.FullName
                                VALUES (@email, @fullName, 1, GETDATE())
                            `);

                        customer = createCustomerResult.recordset[0];
                        console.log('[TEST WEBHOOK] Created new customer:', customer);
                    }

                    if (!customer) {
                        console.error('[TEST WEBHOOK] Failed to create/find customer for bulk order');
                        return res.status(200).json({ success: false, message: 'Failed to create/find customer, order not saved' });
                    }

                    console.log('[TEST WEBHOOK] Using customer for bulk order:', customer);

                    // Use the already parsed bulkItems from above
                    if (!Array.isArray(bulkItems) || bulkItems.length === 0) {
                        console.error('[TEST WEBHOOK] Bulk order items is empty or malformed. Items:', bulkItems);
                        return res.status(200).json({ success: false, message: 'Bulk order items is empty, order not saved' });
                    }

                    console.log('[TEST WEBHOOK] Bulk order has', bulkItems.length, 'items');

                    // Deduplicate items by productId - sum quantities for same products
                    const itemMap = new Map();
                    for (const item of bulkItems) {
                        const productIdStr = String(item.productId || '');
                        if (!productIdStr || productIdStr === 'undefined') {
                            continue;
                        }

                        const key = productIdStr; // Use productId as key

                        if (itemMap.has(key)) {
                            // Sum quantities for duplicate products
                            const existing = itemMap.get(key);
                            existing.quantity = (parseInt(existing.quantity) || 0) + (parseInt(item.quantity) || 0);
                        } else {
                            itemMap.set(key, { ...item });
                        }
                    }

                    const deduplicatedItems = Array.from(itemMap.values());
                    console.log('[TEST WEBHOOK] Bulk order items before deduplication:', bulkItems.length, 'after:', deduplicatedItems.length);

                    // Parse amounts - all should be in PHP
                    const subtotal = parseFloat(metadata.subtotal) || 0;
                    const discount = parseFloat(metadata.discount) || 0;
                    let total = parseFloat(metadata.total) || 0;

                    // Check if total is from Stripe amount_total (in cents)
                    if (total > 100000 || (session.amount_total && Math.abs(total - session.amount_total) < 1)) {
                        console.log('[TEST WEBHOOK] Total appears to be in cents, converting to PHP:', total, '->', total / 100);
                        total = total / 100;
                    } else if (total === 0 && session.amount_total) {
                        total = session.amount_total / 100;
                        console.log('[TEST WEBHOOK] Using session.amount_total (converted from cents):', session.amount_total, '->', total);
                    }

                    // IMPORTANT: Always use session.amount_total from Stripe as the source of truth
                    const totalAmount = session.amount_total / 100; // Stripe total in PHP (converted from cents)

                    console.log('[TEST WEBHOOK] Bulk order amounts - subtotal:', subtotal, 'discount:', discount, 'total (PHP):', total);
                    console.log('[TEST WEBHOOK] Using Stripe amount_total as authoritative total:', totalAmount);

                    const pickupDate = metadata.pickupDate ? String(metadata.pickupDate).trim() : null;

                    // Parse and validate pickup date
                    let pickupDateToSave = null;
                    if (pickupDate && pickupDate !== '' && pickupDate !== 'null' && pickupDate !== 'undefined') {
                        try {
                            const dateObj = new Date(pickupDate);
                            if (!isNaN(dateObj.getTime())) {
                                pickupDateToSave = dateObj;
                            }
                        } catch (e) {
                            console.error('[TEST WEBHOOK] Error converting bulk order pickup date:', e.message);
                        }
                    }

                    // Calculate total quantity for BulkOrders reference (use deduplicated items)
                    const totalQuantity = deduplicatedItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

                    // Create regular Order (same as regular orders) using transaction
                    const transaction = new sql.Transaction(pool);
                    await transaction.begin();

                    try {
                        // Get Manila timezone date
                        const manilaTime = getManilaTime();

                        // Bulk orders are pickup only
                        const deliveryType = 'pickup';
                        const serviceType = 'Pick up';
                        const shippingCost = 0; // No shipping for pickup
                        const tax = parseFloat(metadata.tax) || (subtotal * 0.12);

                        console.log('[TEST WEBHOOK] Creating regular Order for bulk order with values:', {
                            customerId: customer.CustomerID,
                            totalAmount,
                            deliveryType,
                            serviceType,
                            status: 'Pending',
                            pickupDate: pickupDateToSave
                        });

                        // Insert regular Order (same as regular orders)
                        const orderRequest = transaction.request()
                            .input('customerId', sql.Int, customer.CustomerID)
                            .input('status', sql.NVarChar, 'Pending')
                            .input('totalAmount', sql.Decimal(10, 2), totalAmount)
                            .input('paymentMethod', sql.NVarChar, 'E-Wallet')
                            .input('currency', sql.NVarChar, 'PHP')
                            .input('orderDate', sql.DateTime, manilaTime)
                            .input('paymentDate', sql.DateTime, manilaTime)
                            .input('shippingAddressId', sql.Int, null)
                            .input('deliveryType', sql.NVarChar, deliveryType)
                            .input('serviceType', sql.NVarChar, serviceType)
                            .input('deliveryCost', sql.Decimal(10, 2), shippingCost)
                            .input('stripeSessionId', sql.NVarChar, session.id)
                            .input('paymentStatus', sql.NVarChar, 'Paid');

                        if (pickupDateToSave && pickupDateToSave instanceof Date && !isNaN(pickupDateToSave.getTime())) {
                            orderRequest.input('pickupDate', sql.DateTime2, pickupDateToSave);
                        } else {
                            orderRequest.input('pickupDate', sql.DateTime2, null);
                        }

                        const orderResult = await orderRequest.query(`
                            INSERT INTO Orders (CustomerID, Status, TotalAmount, PaymentMethod, Currency, OrderDate, PaymentDate, ShippingAddressID, DeliveryType, ServiceType, DeliveryCost, StripeSessionID, PaymentStatus, PickupDate)
                            OUTPUT INSERTED.OrderID
                            VALUES (@customerId, @status, @totalAmount, @paymentMethod, @currency, @orderDate, @paymentDate, @shippingAddressId, @deliveryType, @serviceType, @deliveryCost, @stripeSessionId, @paymentStatus, @pickupDate)
                        `);

                        const orderId = orderResult.recordset[0].OrderID;
                        console.log('[TEST WEBHOOK] Regular Order created for bulk order with OrderID:', orderId);

                        // Generate and update reference number
                        const referenceNumber = generateReferenceNumber(manilaTime, orderId);
                        await transaction.request()
                            .input('orderId', sql.Int, orderId)
                            .input('referenceNumber', sql.NVarChar, referenceNumber)
                            .query('UPDATE Orders SET ReferenceNumber = @referenceNumber WHERE OrderID = @orderId');
                        console.log('[TEST WEBHOOK] Reference number generated:', referenceNumber);

                        const paymongoPid = String(req.body.paymongoPaymentId || '').trim();
                        const transactionId =
                            paymongoPid ||
                            stripePaymentIntentIdFromCheckoutSession(session) ||
                            generateTransactionId(manilaTime);
                        console.log('[TEST WEBHOOK] Attempting to update TransactionID for bulk order OrderID:', orderId, 'TransactionID:', transactionId);
                        try {
                            const updateResult = await transaction.request()
                                .input('orderId', sql.Int, orderId)
                                .input('transactionId', sql.NVarChar, transactionId)
                                .query('UPDATE Orders SET TransactionID = @transactionId WHERE OrderID = @orderId');

                            console.log('[TEST WEBHOOK] UPDATE query executed for bulk order. Rows affected:', updateResult.rowsAffected);

                            // Verify the update worked (within the same transaction)
                            const verifyResult = await transaction.request()
                                .input('orderId', sql.Int, orderId)
                                .query('SELECT TransactionID FROM Orders WHERE OrderID = @orderId');

                            if (verifyResult.recordset.length > 0) {
                                const savedTransactionId = verifyResult.recordset[0].TransactionID;
                                console.log('[TEST WEBHOOK] ✅ Transaction ID updated successfully for bulk order. Saved value:', savedTransactionId);
                            }
                        } catch (updateErr) {
                            console.error('[TEST WEBHOOK] ❌ Error updating TransactionID for bulk order:', updateErr.message);
                        }

                        // Step 1: Deduplicate items by productId (string/UUID) - sum quantities for same products
                        // Normalize productId to string for consistent comparison
                        const itemMap = new Map();
                        for (const item of bulkItems) {
                            const productIdStr = String(item.productId || '').trim();
                            if (!productIdStr || productIdStr === 'undefined' || productIdStr === 'null' || productIdStr === '') {
                                console.warn('[TEST WEBHOOK] Skipping item with invalid productId:', item);
                                continue;
                            }

                            // Use normalized productId as key (convert to string, handle UUID and numeric)
                            const key = productIdStr.toLowerCase(); // Normalize to lowercase for comparison

                            if (itemMap.has(key)) {
                                // Sum quantities for duplicate products
                                const existing = itemMap.get(key);
                                const existingQty = parseInt(existing.quantity) || 0;
                                const newQty = parseInt(item.quantity) || 0;
                                existing.quantity = existingQty + newQty;
                                console.log(`[TEST WEBHOOK] Merged duplicate product ${key}: ${existingQty} + ${newQty} = ${existing.quantity}`);
                            } else {
                                itemMap.set(key, { ...item });
                            }
                        }

                        const deduplicatedItems = Array.from(itemMap.values());
                        console.log('[TEST WEBHOOK] Bulk order items before deduplication:', bulkItems.length, 'after:', deduplicatedItems.length);

                        if (bulkItems.length !== deduplicatedItems.length) {
                            console.warn('[TEST WEBHOOK] ⚠️ Duplicate items detected in bulk order! Original items:', bulkItems.map(i => ({ productId: i.productId, quantity: i.quantity })));
                        }

                        // Step 2: Convert all items to ProductID (integer) and deduplicate again by ProductID
                        // This handles cases where different UUIDs map to the same ProductID
                        const productIdMap = new Map(); // Key: ProductID (integer), Value: { quantity, unitPrice, productName }

                        for (const item of deduplicatedItems) {
                            try {
                                // Convert productId (could be UUID) to integer ProductID
                                let productId = null;
                                if (item.productId) {
                                    const productIdStr = String(item.productId);
                                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productIdStr);

                                    if (isUUID) {
                                        const productResult = await transaction.request()
                                            .input('publicId', sql.NVarChar, productIdStr)
                                            .query('SELECT ProductID, Name FROM Products WHERE PublicId = @publicId AND IsActive = 1');

                                        if (productResult.recordset.length > 0) {
                                            productId = productResult.recordset[0].ProductID;
                                        }
                                    } else {
                                        productId = parseInt(productIdStr);
                                    }
                                }

                                if (!productId || isNaN(productId)) {
                                    console.error('[TEST WEBHOOK] Invalid productId for bulk order item:', item.productId);
                                    continue;
                                }

                                // Get product details
                                const productResult = await transaction.request()
                                    .input('productId', sql.Int, productId)
                                    .query('SELECT ProductID, Name FROM Products WHERE ProductID = @productId AND IsActive = 1');

                                if (productResult.recordset.length === 0) {
                                    console.error('[TEST WEBHOOK] Product not found for ID:', productId);
                                    continue;
                                }

                                const product = productResult.recordset[0];
                                const quantity = parseInt(item.quantity) || 1;
                                const unitPrice = parseFloat(item.unitPrice || item.price || 0);

                                // Deduplicate by ProductID (integer) - merge quantities if same ProductID
                                if (productIdMap.has(productId)) {
                                    const existing = productIdMap.get(productId);
                                    existing.quantity = (existing.quantity || 0) + quantity;
                                    console.log(`[TEST WEBHOOK] Merged duplicate ProductID ${productId}: ${existing.quantity - quantity} + ${quantity} = ${existing.quantity}`);
                                } else {
                                    productIdMap.set(productId, {
                                        productId: productId,
                                        product: product,
                                        quantity: quantity,
                                        unitPrice: unitPrice
                                    });
                                }
                            } catch (itemErr) {
                                console.error('[TEST WEBHOOK] Error processing bulk order item:', itemErr);
                            }
                        }

                        // Step 3: Check for existing items and insert/update deduplicated items into OrderItems
                        // First, check if order items already exist (in case webhook runs multiple times)
                        const existingItemsResult = await transaction.request()
                            .input('orderId', sql.Int, orderId)
                            .query(`
                            SELECT ProductID, VariationID, SUM(Quantity) as TotalQuantity
                            FROM OrderItems
                            WHERE OrderID = @orderId
                            GROUP BY ProductID, VariationID
                        `);

                        const existingItemsMap = new Map();
                        for (const existing of existingItemsResult.recordset) {
                            const key = `${existing.ProductID}_${existing.VariationID || 'null'}`;
                            existingItemsMap.set(key, parseInt(existing.TotalQuantity) || 0);
                        }

                        let itemsInserted = 0;
                        let itemsSkipped = 0;
                        let itemsUpdated = 0;

                        for (const [productId, itemData] of productIdMap) {
                            try {
                                const { product, quantity, unitPrice } = itemData;

                                // Calculate price with discount if applicable
                                let priceAtPurchase = unitPrice;
                                if (discount > 0 && subtotal > 0) {
                                    const discountRatio = 1 - (discount / subtotal);
                                    priceAtPurchase = unitPrice * discountRatio;
                                }

                                // Check if this ProductID already exists in OrderItems for this order
                                const key = `${product.ProductID}_null`; // VariationID is null for bulk orders
                                const existingQuantity = existingItemsMap.get(key) || 0;

                                if (existingQuantity > 0) {
                                    // Item already exists - check if we need to update quantity
                                    // Only update if the new quantity is different (to avoid unnecessary updates)
                                    if (existingQuantity !== quantity) {
                                        // Delete existing items for this ProductID and insert new one with correct quantity
                                        await transaction.request()
                                            .input('orderId', sql.Int, orderId)
                                            .input('productId', sql.Int, product.ProductID)
                                            .input('variationId', sql.Int, null)
                                            .query(`
                                            DELETE FROM OrderItems
                                            WHERE OrderID = @orderId 
                                              AND ProductID = @productId 
                                              AND (VariationID = @variationId OR VariationID IS NULL)
                                        `);

                                        // Insert with correct quantity
                                        await transaction.request()
                                            .input('orderId', sql.Int, orderId)
                                            .input('productId', sql.Int, product.ProductID)
                                            .input('productName', sql.NVarChar(255), product.Name)
                                            .input('quantity', sql.Int, quantity)
                                            .input('priceAtPurchase', sql.Decimal(10, 2), priceAtPurchase)
                                            .input('variationId', sql.Int, null)
                                            .query(`
                                            INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                            VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)
                                        `);

                                        console.log(`[TEST WEBHOOK] Replaced existing OrderItem for ProductID ${product.ProductID}: ${existingQuantity} -> ${quantity}`);
                                        itemsUpdated++;
                                    } else {
                                        // Quantity matches, skip insert
                                        console.log(`[TEST WEBHOOK] OrderItem for ProductID ${product.ProductID} already exists with correct quantity, skipping`);
                                        itemsSkipped++;
                                    }
                                } else {
                                    // Insert new OrderItem
                                    await transaction.request()
                                        .input('orderId', sql.Int, orderId)
                                        .input('productId', sql.Int, product.ProductID)
                                        .input('productName', sql.NVarChar(255), product.Name)
                                        .input('quantity', sql.Int, quantity)
                                        .input('priceAtPurchase', sql.Decimal(10, 2), priceAtPurchase)
                                        .input('variationId', sql.Int, null)
                                        .query(`
                                        INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                        VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)
                                    `);

                                    itemsInserted++;
                                }
                            } catch (itemErr) {
                                // Check if error is due to duplicate key constraint
                                if (itemErr.message && (itemErr.message.includes('duplicate') || itemErr.message.includes('UNIQUE'))) {
                                    console.warn(`[TEST WEBHOOK] Duplicate OrderItem detected for ProductID ${itemData.product?.ProductID}, skipping insert`);
                                    itemsSkipped++;
                                } else {
                                    console.error('[TEST WEBHOOK] Error inserting bulk order item:', itemErr);
                                    itemsSkipped++;
                                }
                            }
                        }

                        console.log('[TEST WEBHOOK] Bulk order items inserted:', itemsInserted, 'updated:', itemsUpdated, 'skipped:', itemsSkipped);

                        // Also create BulkOrder record for reference (optional, for admin bulk orders page)
                        // Check if BulkOrders table has OrderID column
                        const bulkOrderColumnCheck = await transaction.request()
                            .query(`
                                SELECT COUNT(*) as columnExists
                                FROM sys.columns 
                                WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
                                AND name = 'OrderID'
                            `);

                        const hasOrderIDColumn = bulkOrderColumnCheck.recordset[0].columnExists > 0;

                        if (hasOrderIDColumn) {
                            // Create BulkOrder record linked to the Order
                            const bulkOrderResult = await transaction.request()
                                .input('customerId', sql.Int, customer.CustomerID)
                                .input('customerEmail', sql.NVarChar(255), email)
                                .input('orderId', sql.Int, orderId)
                                .input('totalQuantity', sql.Int, totalQuantity)
                                .input('subtotal', sql.Decimal(10, 2), subtotal)
                                .input('discount', sql.Decimal(10, 2), discount)
                                .input('grandTotal', sql.Decimal(10, 2), totalAmount)
                                .input('status', sql.NVarChar(50), 'Pending')
                                .input('pickupDate', sql.DateTime2, pickupDateToSave)
                                .query(`
                                    INSERT INTO BulkOrders (
                                        CustomerID, CustomerEmail, OrderID, TotalQuantity, 
                                        Subtotal, DiscountAmount, GrandTotal, 
                                        Status, PickupDate, CreatedAt
                                    )
                                    OUTPUT INSERTED.BulkOrderID
                                        VALUES (
                                        @customerId, @customerEmail, @orderId, @totalQuantity,
                                        @subtotal, @discount, @grandTotal,
                                        @status, @pickupDate, GETDATE()
                                        )
                                    `);

                            const bulkOrderId = bulkOrderResult.recordset[0].BulkOrderID;
                            console.log('[TEST WEBHOOK] BulkOrder record created with ID:', bulkOrderId, 'linked to OrderID:', orderId);
                        }

                        await transaction.commit();
                        console.log('[TEST WEBHOOK] Bulk order transaction committed successfully. OrderID:', orderId);

                        // NOTE: Stock is NOT decreased here - it will be decreased when Admin changes status to Processing
                        console.log('[TEST WEBHOOK] ⚠️ Stock NOT decreased for bulk order. Stock will be decreased when Admin changes order status to Processing.');

                        // Send order receipt email to customer for bulk orders
                        console.log('[TEST WEBHOOK] ===== STARTING EMAIL SENDING PROCESS (BULK ORDER) =====');
                        console.log('[TEST WEBHOOK] OrderID:', orderId);
                        console.log('[TEST WEBHOOK] ReferenceNumber:', referenceNumber);
                        console.log('[TEST WEBHOOK] Customer Email (from DB):', customer.Email);
                        console.log('[TEST WEBHOOK] Customer Email (from Stripe):', email);
                        console.log('[TEST WEBHOOK] Email to use:', bulkEmailToUse);
                        console.log('[TEST WEBHOOK] SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);

                        try {
                            console.log('[TEST WEBHOOK] 📧 Preparing to send bulk order receipt email...');
                            const { sendOrderReceiptEmail } = require('./utils/sendgridHelper');

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

                            console.log('[TEST WEBHOOK] 📧 Bulk order items fetched:', orderItemsResult.recordset.length);

                            if (orderItemsResult.recordset.length === 0) {
                                console.warn('[TEST WEBHOOK] ⚠️ No bulk order items found for email. Waiting 1 second and retrying...');
                                await new Promise(resolve => setTimeout(resolve, 1000));

                                const retryResult = await pool.request()
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

                                console.log('[TEST WEBHOOK] 📧 Retry - Bulk order items fetched:', retryResult.recordset.length);
                                orderItemsResult.recordset = retryResult.recordset;
                            }

                            const orderItems = orderItemsResult.recordset.map(item => ({
                                name: item.Name,
                                quantity: item.Quantity,
                                price: item.PriceAtPurchase,
                                variationName: item.VariationName,
                                color: item.Color
                            }));

                            console.log('[TEST WEBHOOK] 📧 Calling sendOrderReceiptEmail for bulk order with:', {
                                email: bulkEmailToUse,
                                customerName: customer.FullName,
                                orderId: orderId,
                                referenceNumber: referenceNumber,
                                transactionId: transactionId,
                                itemsCount: orderItems.length
                            });

                            // Validate email before sending
                            if (!bulkEmailToUse || typeof bulkEmailToUse !== 'string' || !bulkEmailToUse.includes('@')) {
                                console.error('[TEST WEBHOOK] ❌ Invalid customer email address for bulk order:', bulkEmailToUse);
                                throw new Error(`Invalid customer email: ${bulkEmailToUse}`);
                            }

                            console.log('[TEST WEBHOOK] 📧 Sending bulk order receipt email to:', bulkEmailToUse);

                            const receiptEmailResult = await sendOrderReceiptEmail(
                                bulkEmailToUse,
                                customer.FullName,
                                {
                                    orderId: orderId,
                                    referenceNumber: referenceNumber,
                                    transactionId: transactionId,
                                    orderDate: manilaTime,
                                    paymentMethod: paymentMethodToSave,
                                    subtotal: subtotal,
                                    shippingCost: 0, // Bulk orders are pickup only
                                    extraDeliveryFee: 0,
                                    taxAmount: tax,
                                    totalAmount: totalAmount,
                                    items: orderItems
                                }
                            );

                            if (process.env.NODE_ENV !== 'production') {
                                console.log('[TEST WEBHOOK] 📧 Bulk order email sending result:', JSON.stringify(receiptEmailResult, null, 2));
                            }

                            if (receiptEmailResult.success) {
                                console.log('[TEST WEBHOOK] ✅ Bulk order receipt email sent successfully to:', bulkEmailToUse);
                                if (receiptEmailResult.messageId) {
                                    console.log('[TEST WEBHOOK] ✅ Message ID:', receiptEmailResult.messageId);
                                }
                            } else {
                                console.error('[TEST WEBHOOK] ⚠️ Failed to send bulk order receipt email to:', bulkEmailToUse);
                                console.error('[TEST WEBHOOK] ⚠️ Error message:', receiptEmailResult.message);
                                if (receiptEmailResult.error) {
                                    console.error('[TEST WEBHOOK] ⚠️ Error details:', receiptEmailResult.error);
                                }
                            }
                        } catch (emailError) {
                            console.error('[TEST WEBHOOK] ⚠️ Exception sending bulk order receipt email:', emailError);
                            console.error('[TEST WEBHOOK] ⚠️ Error stack:', emailError.stack);
                        }

                        console.log('[TEST WEBHOOK] ===== EMAIL SENDING PROCESS COMPLETED (BULK ORDER) =====');

                        return res.status(200).json({ success: true, orderId: orderId, orderType: 'bulk', emailSent: true });
                    } catch (err) {
                        await transaction.rollback();
                        console.error('[TEST WEBHOOK] Error creating bulk order:', err);
                        throw err;
                    }
                }

                // Regular order handling continues below (existing code)
                if (!Array.isArray(cart) || cart.length === 0) {
                    console.error('[TEST WEBHOOK] Cart is empty or malformed. Order not saved.');
                    return res.status(200).json({ success: false, message: 'Cart is empty or malformed, order not saved' });
                }

                // Check if order already exists with this session ID to prevent duplicates
                const existingOrderResult = await pool.request()
                    .input('sessionId', sql.NVarChar, session.id)
                    .query('SELECT OrderID FROM Orders WHERE StripeSessionID = @sessionId');

                if (existingOrderResult.recordset.length > 0) {
                    console.log('[TEST WEBHOOK] Order already exists with session ID:', session.id);
                    return res.status(200).json({
                        success: true,
                        orderId: existingOrderResult.recordset[0].OrderID,
                        message: 'Order already exists'
                    });
                }

                // Find customer — prefer logged-in customer id from PayMongo finalize payload
                let customer = null;
                const bodyCustomerId = parseInt(req.body.customerId, 10);
                if (bodyCustomerId && !Number.isNaN(bodyCustomerId)) {
                    const byIdResult = await pool.request()
                        .input('customerId', sql.Int, bodyCustomerId)
                        .query('SELECT CustomerID, FullName, Email FROM Customers WHERE CustomerID = @customerId');
                    customer = byIdResult.recordset[0];
                    if (customer) {
                        console.log('[TEST WEBHOOK] Using customer from session customerId:', customer.CustomerID);
                    }
                }

                if (!email && !customer) {
                    console.error('[TEST WEBHOOK] No customer email provided. Order not saved.');
                    return res.status(200).json({ success: false, message: 'No customer email, order not saved' });
                }

                if (!customer && email) {
                    console.log('[TEST WEBHOOK] Looking up customer with email:', email);
                    const customerResult = await pool.request()
                        .input('email', sql.NVarChar, email)
                        .query('SELECT CustomerID, FullName, Email FROM Customers WHERE LOWER(Email) = LOWER(@email)');

                    console.log('[TEST WEBHOOK] Customer lookup result:', customerResult.recordset);
                    customer = customerResult.recordset[0];
                }

                if (!customer && email) {
                    const customerName = metadata.customerName || email.split('@')[0] || 'Customer';
                    console.log('[TEST WEBHOOK] Customer not found, creating account for:', email);
                    const createCustomerResult = await pool.request()
                        .input('email', sql.NVarChar, email)
                        .input('fullName', sql.NVarChar, customerName)
                        .query(`
                            INSERT INTO Customers (Email, FullName, IsActive, CreatedAt)
                            OUTPUT INSERTED.CustomerID, INSERTED.FullName, INSERTED.Email
                            VALUES (@email, @fullName, 1, GETDATE())
                        `);
                    customer = createCustomerResult.recordset[0];
                }

                if (!customer) {
                    console.error('[TEST WEBHOOK] Customer not found for email:', email);
                    return res.status(200).json({ success: false, message: 'Customer not found, order not saved' });
                }

                console.log('[TEST WEBHOOK] Found customer:', customer);

                // Use customer's email from database if available, otherwise use Stripe email
                const emailToUse = customer.Email || email;
                console.log('[TEST WEBHOOK] Using email for receipt:', emailToUse, '(from DB:', customer.Email, ', from Stripe:', email, ')');
                if (!Array.isArray(cart) || cart.length === 0) {
                    console.error('[TEST WEBHOOK] Cart is empty or malformed. Order not saved.');
                    return res.status(200).json({ success: false, message: 'Cart is empty or malformed, order not saved' });
                }

                // Extract metadata (already defined above, reuse it)

                // Extract shipping address ID from metadata first, then fallback to default
                let shippingAddressId = metadata.shippingAddressId ? parseInt(metadata.shippingAddressId) : null;

                // If no shipping address in metadata, try to get customer's default shipping address
                if (!shippingAddressId) {
                    console.log('[TEST WEBHOOK] No shipping address in metadata, looking up customer default address for CustomerID:', customer.CustomerID);
                    const addressResult = await pool.request()
                        .input('customerId', sql.Int, customer.CustomerID)
                        .query('SELECT AddressID FROM CustomerAddresses WHERE CustomerID = @customerId AND IsDefault = 1');

                    if (addressResult.recordset.length > 0) {
                        shippingAddressId = addressResult.recordset[0].AddressID;
                        console.log('[TEST WEBHOOK] Found default shipping address ID:', shippingAddressId);
                    } else {
                        console.log('[TEST WEBHOOK] No default shipping address found for customer');
                    }
                } else {
                    console.log('[TEST WEBHOOK] Using shipping address from metadata:', shippingAddressId);
                }

                // Insert order
                // IMPORTANT: Always use session.amount_total from Stripe as the source of truth
                // This includes: subtotal + tax + shipping fee
                const totalAmountFromCart = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const totalAmount = session.amount_total / 100; // Stripe total in PHP (converted from cents)

                // Extract shipping, tax, and extra delivery fee from metadata for validation
                const shippingCost = parseFloat(metadata.shippingCost) || 0;
                const tax = parseFloat(metadata.tax) || 0;
                const subtotal = parseFloat(metadata.subtotal) || totalAmountFromCart;
                const extraDeliveryFee = parseFloat(metadata.extraDeliveryFee) || 0;

                // Validate that we're using the correct total from Stripe
                const calculatedSubtotal = subtotal;
                const calculatedTax = tax || (calculatedSubtotal * 0.12);
                const calculatedShipping = shippingCost;
                const calculatedExtraDeliveryFee = extraDeliveryFee;
                const expectedTotal = calculatedSubtotal + calculatedTax + calculatedShipping + calculatedExtraDeliveryFee;

                console.log('[TEST WEBHOOK] ===== ORDER TOTAL VALIDATION =====');
                console.log('[TEST WEBHOOK] Subtotal (from metadata):', calculatedSubtotal);
                console.log('[TEST WEBHOOK] Tax (12%):', calculatedTax);
                console.log('[TEST WEBHOOK] Shipping:', calculatedShipping);
                console.log('[TEST WEBHOOK] Extra Delivery Fee:', calculatedExtraDeliveryFee);
                console.log('[TEST WEBHOOK] Expected Total (calc):', expectedTotal);
                console.log('[TEST WEBHOOK] Stripe amount_total (cents):', session.amount_total);
                console.log('[TEST WEBHOOK] Stripe Total Amount (PHP):', totalAmount);
                console.log('[TEST WEBHOOK] Cart items subtotal:', totalAmountFromCart);

                // Warn if there's a significant discrepancy (more than ₱1 difference due to rounding)
                if (Math.abs(expectedTotal - totalAmount) > 1) {
                    console.warn('[TEST WEBHOOK] ⚠️ WARNING: Total mismatch! Expected:', expectedTotal, 'Stripe:', totalAmount, 'Difference:', Math.abs(expectedTotal - totalAmount));
                    console.warn('[TEST WEBHOOK] Using Stripe amount_total as source of truth:', totalAmount);
                } else {
                    console.log('[TEST WEBHOOK] ✅ Total amounts match (within rounding tolerance)');
                }
                console.log('[TEST WEBHOOK] =====================================');

                // Use Stripe's amount_total as the authoritative source - this is what customer was actually charged
                // This ensures the database TotalAmount matches exactly what Stripe shows

                // Get Manila timezone date
                const manilaTime = getManilaTime();

                // Determine payment method from metadata (only E-Wallet is supported)
                const webhookPaymentMethod = metadata.paymentMethod || 'E-Wallet';
                // Only E-Wallet payment method is allowed
                const paymentMethodToSave = 'E-Wallet';

                const deliveryType = metadata.deliveryType || 'pickup';

                // Extract pickupDate - SIMPLIFIED VERSION
                let pickupDate = null;
                if (session.metadata?.pickupDate) {
                    const pd = String(session.metadata.pickupDate).trim();
                    if (pd && pd !== '' && pd !== 'null' && pd !== 'undefined') {
                        pickupDate = pd;
                    }
                }

                // Convert pickup date if provided
                let pickupDateToSave = null;
                if (pickupDate) {
                    try {
                        const dateObj = new Date(pickupDate);
                        if (!isNaN(dateObj.getTime())) {
                            pickupDateToSave = dateObj;
                        }
                    } catch (e) {
                        console.error('[TEST WEBHOOK] Error converting pickup date:', e.message);
                    }
                }

                // Get ServiceType from RegionDeliveryRates or DeliveryRates
                // ServiceType is directly connected to RegionDeliveryRates for accurate service type
                let serviceTypeToSave = null;
                if (deliveryType === 'pickup') {
                    serviceTypeToSave = 'Pick up';
                } else if (deliveryType && deliveryType.startsWith('rate_')) {
                    const rateIdStr = deliveryType.replace('rate_', '');
                    const rateId = parseInt(rateIdStr);

                    if (isNaN(rateId)) {
                        console.warn('[TEST WEBHOOK] Invalid rate ID:', rateIdStr, 'from deliveryType:', deliveryType);
                        serviceTypeToSave = 'Standard Delivery';
                    } else {
                        try {
                            // Try RegionDeliveryRates first (primary source for service type)
                            const regionRateResult = await pool.request()
                                .input('regionRateId', sql.Int, rateId)
                                .query('SELECT ServiceType FROM RegionDeliveryRates WHERE RegionRateID = @regionRateId AND IsActive = 1');

                            if (regionRateResult.recordset.length > 0 && regionRateResult.recordset[0].ServiceType) {
                                serviceTypeToSave = regionRateResult.recordset[0].ServiceType.trim();
                                // Ensure " Delivery" suffix if not already present and not "Pick up"
                                if (!serviceTypeToSave.includes('Delivery') && serviceTypeToSave !== 'Pick up') {
                                    serviceTypeToSave = serviceTypeToSave + ' Delivery';
                                }
                                console.log('[TEST WEBHOOK] Resolved ServiceType from RegionDeliveryRates:', serviceTypeToSave, '(RateID:', rateId, ')');
                            } else {
                                // Try DeliveryRates as fallback
                                const deliveryRateResult = await pool.request()
                                    .input('rateId', sql.Int, rateId)
                                    .query('SELECT ServiceType FROM DeliveryRates WHERE RateID = @rateId AND IsActive = 1');

                                if (deliveryRateResult.recordset.length > 0 && deliveryRateResult.recordset[0].ServiceType) {
                                    serviceTypeToSave = deliveryRateResult.recordset[0].ServiceType.trim();
                                    if (!serviceTypeToSave.includes('Delivery') && serviceTypeToSave !== 'Pick up') {
                                        serviceTypeToSave = serviceTypeToSave + ' Delivery';
                                    }
                                    console.log('[TEST WEBHOOK] Resolved ServiceType from DeliveryRates:', serviceTypeToSave, '(RateID:', rateId, ')');
                                } else {
                                    console.warn('[TEST WEBHOOK] Rate ID', rateId, 'not found in RegionDeliveryRates or DeliveryRates. Using default.');
                                    serviceTypeToSave = 'Standard Delivery';
                                }
                            }
                        } catch (err) {
                            console.error('[TEST WEBHOOK] Error querying ServiceType for rate', rateId, ':', err.message);
                            serviceTypeToSave = 'Standard Delivery';
                        }
                    }
                } else {
                    serviceTypeToSave = deliveryType || 'Standard Delivery';
                }

                // Check if ExtraDeliveryFee column exists in Orders table
                let hasExtraDeliveryFeeColumn = false;
                try {
                    const columnCheck = await pool.request().query(`
                    SELECT COUNT(*) as columnExists
                    FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
                    AND name = 'ExtraDeliveryFee'
                `);
                    hasExtraDeliveryFeeColumn = columnCheck.recordset[0].columnExists > 0;
                    console.log('[TEST WEBHOOK] ExtraDeliveryFee column exists:', hasExtraDeliveryFeeColumn);
                } catch (err) {
                    console.log('[TEST WEBHOOK] Could not check for ExtraDeliveryFee column, assuming it does not exist:', err.message);
                }

                // Build the request with all parameters
                const request = pool.request()
                    .input('customerId', sql.Int, customer.CustomerID)
                    .input('status', sql.NVarChar, 'Pending')
                    .input('totalAmount', sql.Decimal(10, 2), totalAmount)
                    .input('paymentMethod', sql.NVarChar, paymentMethodToSave)
                    .input('currency', sql.NVarChar, 'PHP')
                    .input('orderDate', sql.DateTime, manilaTime)
                    .input('paymentDate', sql.DateTime, manilaTime)
                    .input('shippingAddressId', sql.Int, shippingAddressId)
                    .input('deliveryType', sql.NVarChar, deliveryType)
                    .input('serviceType', sql.NVarChar, serviceTypeToSave)
                    .input('deliveryCost', sql.Decimal(10, 2), calculatedShipping)
                    .input('stripeSessionId', sql.NVarChar, session.id)
                    .input('paymentStatus', sql.NVarChar, 'Paid');

                // Handle pickupDate - explicitly set to null if not provided
                if (pickupDateToSave && pickupDateToSave instanceof Date && !isNaN(pickupDateToSave.getTime())) {
                    request.input('pickupDate', sql.DateTime2, pickupDateToSave);
                } else {
                    // Use sql.Null() or explicitly pass null - but use DateTime2 to match the column type
                    request.input('pickupDate', sql.DateTime2, null);
                }

                // Add ExtraDeliveryFee if column exists
                if (hasExtraDeliveryFeeColumn) {
                    request.input('extraDeliveryFee', sql.Decimal(10, 2), calculatedExtraDeliveryFee);
                    console.log('[TEST WEBHOOK] ✅ Adding ExtraDeliveryFee to order:', calculatedExtraDeliveryFee, '(parsed from metadata:', metadata.extraDeliveryFee, ')');
                } else {
                    console.log('[TEST WEBHOOK] ⚠️ ExtraDeliveryFee column does not exist, skipping. Value would have been:', calculatedExtraDeliveryFee, '(from metadata:', metadata.extraDeliveryFee, ')');
                }

                // Build INSERT statement conditionally
                let insertQuery = `INSERT INTO Orders (CustomerID, Status, TotalAmount, PaymentMethod, Currency, OrderDate, PaymentDate, ShippingAddressID, DeliveryType, ServiceType, DeliveryCost, StripeSessionID, PaymentStatus, PickupDate`;
                let valuesQuery = `VALUES (@customerId, @status, @totalAmount, @paymentMethod, @currency, @orderDate, @paymentDate, @shippingAddressId, @deliveryType, @serviceType, @deliveryCost, @stripeSessionId, @paymentStatus, @pickupDate`;

                if (hasExtraDeliveryFeeColumn) {
                    insertQuery += `, ExtraDeliveryFee`;
                    valuesQuery += `, @extraDeliveryFee`;
                }

                insertQuery += `) OUTPUT INSERTED.OrderID ` + valuesQuery + `)`;

                const orderResult = await request.query(insertQuery);

                const orderId = orderResult.recordset[0].OrderID;
                console.log('[TEST WEBHOOK] Order inserted successfully with OrderID:', orderId);
                console.log('[TEST WEBHOOK] PickupDate saved:', pickupDateToSave ? pickupDateToSave.toISOString() : 'null');

                // Verify the pickupDate was actually saved by querying it back
                const verifyResult = await pool.request()
                    .input('orderId', sql.Int, orderId)
                    .query('SELECT PickupDate FROM Orders WHERE OrderID = @orderId');
                console.log('[TEST WEBHOOK] Verified PickupDate in database:', verifyResult.recordset[0]?.PickupDate);

                // Generate and update reference number
                const referenceNumber = generateReferenceNumber(manilaTime, orderId);
                await pool.request()
                    .input('orderId', sql.Int, orderId)
                    .input('referenceNumber', sql.NVarChar, referenceNumber)
                    .query('UPDATE Orders SET ReferenceNumber = @referenceNumber WHERE OrderID = @orderId');
                console.log('[TEST WEBHOOK] Reference number generated:', referenceNumber);

                const paymongoPid = String(req.body.paymongoPaymentId || '').trim();
                const transactionId =
                    paymongoPid ||
                    stripePaymentIntentIdFromCheckoutSession(session) ||
                    generateTransactionId(manilaTime);
                console.log('[TEST WEBHOOK] Attempting to update TransactionID for OrderID:', orderId, 'TransactionID:', transactionId);
                try {
                    const updateResult = await pool.request()
                        .input('orderId', sql.Int, orderId)
                        .input('transactionId', sql.NVarChar, transactionId)
                        .query('UPDATE Orders SET TransactionID = @transactionId WHERE OrderID = @orderId');

                    console.log('[TEST WEBHOOK] UPDATE query executed. Rows affected:', updateResult.rowsAffected);

                    // Verify the update worked
                    const verifyResult = await pool.request()
                        .input('orderId', sql.Int, orderId)
                        .query('SELECT TransactionID FROM Orders WHERE OrderID = @orderId');

                    if (verifyResult.recordset.length > 0) {
                        const savedTransactionId = verifyResult.recordset[0].TransactionID;
                        console.log('[TEST WEBHOOK] ✅ Transaction ID updated successfully. Saved value:', savedTransactionId);
                        if (savedTransactionId !== transactionId) {
                            console.warn('[TEST WEBHOOK] ⚠️ WARNING: Saved TransactionID does not match generated one!');
                        }
                    } else {
                        console.warn('[TEST WEBHOOK] ⚠️ Could not verify TransactionID update - order not found');
                    }
                } catch (updateErr) {
                    console.error('[TEST WEBHOOK] ❌ Error updating TransactionID:', updateErr.message);
                    console.error('[TEST WEBHOOK] Error details:', updateErr);
                }

                // Insert order items
                let itemsInserted = 0;
                let itemsSkipped = 0;

                if (!cart || !Array.isArray(cart) || cart.length === 0) {
                    console.error('[TEST WEBHOOK] ERROR: Cart is empty or invalid');
                } else {
                    for (const item of cart) {
                        try {
                            // Skip shipping and tax items
                            if (item.id === 'shipping' || item.name === 'Shipping' || item.name === 'shipping' || item.name === 'Delivery Fee' ||
                                item.id === 'tax' || item.name === 'Tax' || item.name === 'tax' || item.name === 'Tax (12%)') {
                                itemsSkipped++;
                                continue;
                            }

                            // Handle different item structures from frontend
                            const productIdValue = item.id || item.productId || item.product?.id || item.product?.ProductID;
                            const productNameValue = item.name || item.productName || item.product?.name;

                            // Find product by ID or name
                            let product = null;
                            let productResult;

                            if (productIdValue && productIdValue !== 'shipping') {
                                const resolvedId = await resolveProductId(productIdValue);
                                if (resolvedId && resolvedId > 0) {
                                    productResult = await pool.request()
                                        .input('id', sql.Int, resolvedId)
                                        .query('SELECT ProductID, Name FROM Products WHERE ProductID = @id AND IsActive = 1');

                                    if (productResult.recordset.length > 0) {
                                        product = productResult.recordset[0];
                                    }
                                }
                            }

                            // If not found by ID, try by name
                            if (!product && productNameValue && productNameValue !== 'Shipping' && productNameValue !== 'shipping' && productNameValue !== 'Delivery Fee') {
                                productResult = await pool.request()
                                    .input('name', sql.NVarChar, productNameValue.trim())
                                    .query('SELECT ProductID, Name FROM Products WHERE Name = @name AND IsActive = 1');

                                if (productResult.recordset.length > 0) {
                                    product = productResult.recordset[0];
                                } else {
                                    // Try fuzzy search
                                    productResult = await pool.request()
                                        .input('name', sql.NVarChar, '%' + productNameValue.trim() + '%')
                                        .query('SELECT TOP 1 ProductID, Name FROM Products WHERE Name LIKE @name AND IsActive = 1');

                                    if (productResult.recordset.length > 0) {
                                        product = productResult.recordset[0];
                                    }
                                }
                            }

                            if (!product) {
                                console.error('[TEST WEBHOOK] Product not found for item:', item.name || item.id);
                                itemsSkipped++;
                                continue;
                            }

                            // Validate required fields
                            const quantity = parseInt(item.quantity) || 0;
                            const price = parseFloat(item.price) || 0;

                            if (quantity <= 0) {
                                console.error('[TEST WEBHOOK] ❌ Invalid quantity for item:', item);
                                itemsSkipped++;
                                continue;
                            }

                            // Parse variation ID if present
                            let variationId = null;
                            if (item.variationId !== undefined && item.variationId !== null) {
                                variationId = parseInt(item.variationId);
                                if (isNaN(variationId)) {
                                    variationId = null;
                                }
                            }

                            await pool.request()
                                .input('orderId', sql.Int, orderId)
                                .input('productId', sql.Int, product.ProductID)
                                .input('productName', sql.NVarChar(255), product.Name)
                                .input('quantity', sql.Int, quantity)
                                .input('priceAtPurchase', sql.Decimal(10, 2), price)
                                .input('variationId', sql.Int, variationId)
                                .query(`INSERT INTO OrderItems (OrderID, ProductID, Name, Quantity, PriceAtPurchase, VariationID)
                                    VALUES (@orderId, @productId, @productName, @quantity, @priceAtPurchase, @variationId)`);

                            itemsInserted++;
                        } catch (itemError) {
                            console.error('[TEST WEBHOOK] Error processing order item:', itemError.message);
                            itemsSkipped++;
                        }
                    }
                }

                if (itemsInserted === 0) {
                    console.error('[TEST WEBHOOK] WARNING: No order items were inserted for OrderID:', orderId);
                }

                // NOTE: Stock is NOT decreased when order is created with "Pending" status
                // Stock will be decreased when order status changes to "Processing" by Admin/Manager
                console.log('[TEST WEBHOOK] Order created with Pending status. Stock will be decreased when status changes to Processing.');

                // Send order receipt email to customer
                console.log('[TEST WEBHOOK] ===== STARTING EMAIL SENDING PROCESS =====');
                console.log('[TEST WEBHOOK] OrderID:', orderId);
                console.log('[TEST WEBHOOK] ReferenceNumber:', referenceNumber);
                console.log('[TEST WEBHOOK] Customer Email (from DB):', customer.Email);
                console.log('[TEST WEBHOOK] Customer Email (from Stripe):', email);
                console.log('[TEST WEBHOOK] Email to use:', emailToUse);
                console.log('[TEST WEBHOOK] SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
                console.log('[TEST WEBHOOK] SENDGRID_API_KEY length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);

                try {
                    console.log('[TEST WEBHOOK] 📧 Preparing to send order receipt email...');
                    console.log('[TEST WEBHOOK] 📧 Customer Email (from DB):', customer.Email);
                    console.log('[TEST WEBHOOK] 📧 Customer Email (from Stripe):', email);
                    console.log('[TEST WEBHOOK] 📧 Customer Email (will use):', emailToUse);
                    console.log('[TEST WEBHOOK] 📧 Customer Name:', customer.FullName);
                    console.log('[TEST WEBHOOK] 📧 Order ID:', orderId);
                    console.log('[TEST WEBHOOK] 📧 Reference Number:', referenceNumber);

                    // Verify SendGrid helper can be loaded
                    console.log('[TEST WEBHOOK] 📧 Loading sendOrderReceiptEmail function...');
                    const { sendOrderReceiptEmail } = require('./utils/sendgridHelper');
                    console.log('[TEST WEBHOOK] 📧 sendOrderReceiptEmail function loaded successfully');

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

                    console.log('[TEST WEBHOOK] 📧 Order items fetched:', orderItemsResult.recordset.length);

                    if (orderItemsResult.recordset.length === 0) {
                        console.warn('[TEST WEBHOOK] ⚠️ No order items found for email. Waiting 1 second and retrying...');
                        // Wait a moment and retry in case of timing issue
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        const retryResult = await pool.request()
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

                        console.log('[TEST WEBHOOK] 📧 Retry - Order items fetched:', retryResult.recordset.length);
                        orderItemsResult.recordset = retryResult.recordset;
                    }

                    const orderItems = orderItemsResult.recordset.map(item => ({
                        name: item.Name,
                        quantity: item.Quantity,
                        price: item.PriceAtPurchase,
                        variationName: item.VariationName,
                        color: item.Color
                    }));

                    console.log('[TEST WEBHOOK] 📧 Calling sendOrderReceiptEmail with:', {
                        email: emailToUse,
                        customerName: customer.FullName,
                        orderId: orderId,
                        referenceNumber: referenceNumber,
                        transactionId: transactionId,
                        itemsCount: orderItems.length
                    });

                    // Validate email before sending
                    if (!emailToUse || typeof emailToUse !== 'string' || !emailToUse.includes('@')) {
                        console.error('[TEST WEBHOOK] ❌ Invalid customer email address:', emailToUse);
                        throw new Error(`Invalid customer email: ${emailToUse}`);
                    }

                    console.log('[TEST WEBHOOK] 📧 Sending receipt email to:', emailToUse);

                    const receiptEmailResult = await sendOrderReceiptEmail(
                        emailToUse,
                        customer.FullName,
                        {
                            orderId: orderId,
                            referenceNumber: referenceNumber,
                            transactionId: transactionId,
                            orderDate: manilaTime,
                            paymentMethod: paymentMethodToSave,
                            subtotal: calculatedSubtotal,
                            shippingCost: calculatedShipping,
                            extraDeliveryFee: calculatedExtraDeliveryFee,
                            taxAmount: calculatedTax,
                            totalAmount: totalAmount,
                            items: orderItems
                        }
                    );

                    if (process.env.NODE_ENV !== 'production') {
                        console.log('[TEST WEBHOOK] 📧 Email sending result:', JSON.stringify(receiptEmailResult, null, 2));
                    }

                    if (receiptEmailResult.success) {
                        console.log('[TEST WEBHOOK] ✅ Order receipt email sent successfully to:', emailToUse);
                        if (receiptEmailResult.messageId) {
                            console.log('[TEST WEBHOOK] ✅ Message ID:', receiptEmailResult.messageId);
                        }
                    } else {
                        console.error('[TEST WEBHOOK] ⚠️ Failed to send order receipt email to:', emailToUse);
                        console.error('[TEST WEBHOOK] ⚠️ Error message:', receiptEmailResult.message);
                        if (receiptEmailResult.error) {
                            console.error('[TEST WEBHOOK] ⚠️ Error details:', receiptEmailResult.error);
                        }
                    }
                } catch (emailError) {
                    // Don't fail the webhook if email fails
                    console.error('[TEST WEBHOOK] ⚠️ Exception sending order receipt email:', emailError);
                    console.error('[TEST WEBHOOK] ⚠️ Error stack:', emailError.stack);
                    console.error('[TEST WEBHOOK] ⚠️ Email sending failed, but order was created successfully');
                }

                console.log('[TEST WEBHOOK] ===== EMAIL SENDING PROCESS COMPLETED =====');

                res.json({ success: true, orderId, message: 'Order saved successfully', emailSent: true });

            } catch (err) {
                console.error('[TEST WEBHOOK] Error saving order:', err);
                console.error('[TEST WEBHOOK] Error stack:', err.stack);
                res.status(500).json({ success: false, error: 'Failed to save order', details: err.message });
            }
        } else {
            res.json({ success: false, message: 'Not a checkout.session.completed event' });
        }
    } catch (err) {
        console.error('[TEST WEBHOOK] Error processing webhook simulation:', err);
        console.error('[TEST WEBHOOK] Error stack:', err.stack);
        res.status(500).json({ success: false, error: 'Failed to process webhook simulation', details: err.message });
    }
});

// Get checkout session details
app.get('/api/checkout-session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }
        const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

        res.json({
            success: true,
            session: session
        });
    } catch (error) {
        console.error('Error retrieving checkout session:', error);
        res.status(500).json({
            error: 'Failed to retrieve checkout session',
            message: error.message
        });
    }
});

// Get order details by Stripe session ID
app.get('/api/order/stripe-session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        await poolConnect;
        const result = await pool.request()
            .input('sessionId', sql.NVarChar, sessionId)
            .query(`
                SELECT o.*, c.FullName, c.Email,
                       ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
                       o.TransactionID,
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
                       ) AS DeliveryTypeName,
                       a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.PostalCode, a.Country
                FROM Orders o
                INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                LEFT JOIN CustomerAddresses a ON o.ShippingAddressID = a.AddressID
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
                WHERE o.StripeSessionID = @sessionId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found for this session'
            });
        }

        const order = result.recordset[0];

        // Get order items with product names
        const itemsResult = await pool.request()
            .input('orderId', sql.Int, order.OrderID)
            .query(`
                SELECT 
                    oi.OrderItemID,
                    oi.ProductID,
                    oi.Quantity,
                    oi.PriceAtPurchase,
                    COALESCE(p.Name, oi.Name, 'Product') AS ProductName,
                    COALESCE(p.SKU, '') AS SKU
                FROM OrderItems oi
                LEFT JOIN Products p ON oi.ProductID = p.ProductID
                WHERE oi.OrderID = @orderId
                ORDER BY oi.OrderItemID
            `);

        order.items = itemsResult.recordset;

        res.json({
            success: true,
            order: order
        });
    } catch (error) {
        console.error('Error retrieving order by session ID:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve order',
            message: error.message
        });
    }
});

// API endpoint for admin to check payment status
app.get('/api/admin/payment-status/:orderId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const role = String(req.session.user.role || req.session.user.RoleName || '').trim();
        const allowedRoles = ['Admin', 'Transaction Manager', 'Order Support', 'Inventory Manager', 'User Manager'];
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - insufficient permissions'
            });
        }

        const { orderId } = req.params;
        const {
            dedupeDoubledTransactionId,
            isStripeCheckoutSessionId,
            paymentMethodDisplayForOrder
        } = require('./utils/orderDisplayHelpers');

        await poolConnect;
        const result = await pool.request()
            .input('orderId', sql.Int, orderId)
            .query(`
                SELECT 
                    o.OrderID,
                    o.PaymentMethod,
                    o.PaymentStatus,
                    o.StripeSessionID,
                    o.TransactionID,
                    o.TotalAmount,
                    o.OrderDate,
                    o.PaymentDate,
                    o.ReferenceNumber,
                    c.Email AS CustomerEmail
                FROM Orders o
                LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
                WHERE o.OrderID = @orderId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = result.recordset[0];
        order.TransactionID = dedupeDoubledTransactionId(order.TransactionID);
        order.DisplayPaymentMethod = paymentMethodDisplayForOrder(order);

        const sid = String(order.StripeSessionID || '').trim();
        const txn = String(order.TransactionID || '').trim();
        const totalPhp = Number(order.TotalAmount || 0);

        const fallbackGatewayShape = (email) => ({
            payment_status: String(order.PaymentStatus || 'Paid').toLowerCase(),
            amount_total: Math.round((Number.isFinite(totalPhp) ? totalPhp : 0) * 100),
            currency: 'php',
            customer_email: email || order.CustomerEmail || null
        });

        const normalizeStripeSession = (session) => {
            const rawAmt = session.amount_total;
            const amountTotal =
                rawAmt != null && Number.isFinite(Number(rawAmt)) && Number(rawAmt) >= 0
                    ? Number(rawAmt)
                    : Math.round((Number.isFinite(totalPhp) ? totalPhp : 0) * 100);
            const piId =
                typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id || null;
            return {
                payment_status: session.payment_status || String(order.PaymentStatus || 'paid').toLowerCase(),
                amount_total: amountTotal,
                currency: session.currency || 'php',
                customer_email:
                    session.customer_email ||
                    session.customer_details?.email ||
                    order.CustomerEmail ||
                    null,
                payment_intent_id: piId
            };
        };

        const fetchPayMongoCheckoutNormalized = async () => {
            const key = process.env.PAYMONGO_SECRET_KEY;
            if (!key || !sid) return null;
            const auth = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
            const pmRes = await fetch(
                `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(sid)}`,
                { headers: { accept: 'application/json', authorization: auth } }
            );
            if (!pmRes.ok) return null;
            const pmJson = await pmRes.json().catch(() => ({}));
            const attrs = pmJson?.data?.attributes;
            if (!attrs) return null;
            const payId = attrs.payments?.[0]?.id || null;
            const amountRaw = attrs.amount;
            const amountTotal =
                amountRaw != null && Number.isFinite(Number(amountRaw)) && Number(amountRaw) > 0
                    ? Number(amountRaw)
                    : Math.round((Number.isFinite(totalPhp) ? totalPhp : 0) * 100);
            const pmStatus =
                attrs.status ||
                attrs.payment_intent?.attributes?.status ||
                order.PaymentStatus ||
                'paid';
            return {
                payment_status: String(pmStatus).toLowerCase(),
                amount_total: amountTotal,
                currency: (attrs.currency || 'PHP').toLowerCase(),
                customer_email: attrs.billing?.email || attrs.customer_email || order.CustomerEmail || null,
                paymongo_payment_id: typeof payId === 'string' ? payId : null
            };
        };

        let stripeDetails = null;
        const stripeInstance = getStripe();

        if (sid && stripeInstance && isStripeCheckoutSessionId(sid)) {
            try {
                const session = await stripeInstance.checkout.sessions.retrieve(sid);
                stripeDetails = normalizeStripeSession(session);
            } catch (e) {
                console.error('[payment-status] Stripe session retrieve failed:', e.message);
            }
        } else if (sid && stripeInstance && /^cs_[a-z0-9_]+$/i.test(sid)) {
            try {
                const session = await stripeInstance.checkout.sessions.retrieve(sid);
                stripeDetails = normalizeStripeSession(session);
            } catch (e) {
                console.warn('[payment-status] Stripe retrieve for cs_ id failed (will try PayMongo):', e.message);
            }
        }

        if (!stripeDetails && process.env.PAYMONGO_SECRET_KEY && sid) {
            try {
                stripeDetails = await fetchPayMongoCheckoutNormalized();
            } catch (e) {
                console.warn('[payment-status] PayMongo checkout session lookup failed:', e.message);
            }
        }

        if (!stripeDetails) {
            stripeDetails = fallbackGatewayShape(order.CustomerEmail);
        } else {
            const at = Number(stripeDetails.amount_total);
            if (!Number.isFinite(at) || at <= 0) {
                stripeDetails.amount_total = Math.round((Number.isFinite(totalPhp) ? totalPhp : 0) * 100);
            }
        }

        let primaryPaymentId = '';
        if (/^(pay_|pi_|ch_)/i.test(txn)) {
            primaryPaymentId = txn;
        }
        if (!primaryPaymentId && stripeDetails.payment_intent_id) {
            primaryPaymentId = String(stripeDetails.payment_intent_id);
        }
        if (!primaryPaymentId && stripeDetails.paymongo_payment_id) {
            primaryPaymentId = String(stripeDetails.paymongo_payment_id);
        }
        if (!primaryPaymentId && /^TXN/i.test(txn)) {
            primaryPaymentId = txn;
        }

        let displayPaymentId = primaryPaymentId;
        if (!displayPaymentId && sid) {
            displayPaymentId = sid;
            order.PaymentIdentifier = displayPaymentId;
            order.PaymentIdentifierLabel = isStripeCheckoutSessionId(sid)
                ? 'Stripe Checkout session ID'
                : 'Gateway checkout session ID';
        } else {
            order.PaymentIdentifier = displayPaymentId;
            order.PaymentIdentifierLabel = displayPaymentId ? 'Payment ID' : 'Payment / transaction ID';
        }

        if (sid && primaryPaymentId && sid !== primaryPaymentId) {
            order.CheckoutSessionLabel = isStripeCheckoutSessionId(sid)
                ? 'Stripe Checkout session ID'
                : 'Gateway checkout session ID';
            order.CheckoutSessionValue = sid;
        }

        order.stripeDetails = stripeDetails;

        res.json({
            success: true,
            paymentDetails: order
        });
    } catch (error) {
        console.error('Error retrieving payment status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve payment status',
            message: error.message
        });
    }
});

// Admin endpoint to sync order TotalAmount from Stripe
app.post('/api/admin/sync-order-total/:orderId', async (req, res) => {
    try {
        // Check if user is authenticated and has admin access
        if (!req.session.user || req.session.user.role !== 'Admin') {
            return res.status(401).json({
                success: false,
                message: 'Authentication required - Admin access only'
            });
        }

        const { orderId } = req.params;

        const stripeInstance = getStripe();
        if (!stripeInstance) {
            return res.status(500).json({
                success: false,
                message: 'Stripe is not configured'
            });
        }

        await poolConnect;

        // Get order details including StripeSessionID
        const orderResult = await pool.request()
            .input('orderId', sql.Int, orderId)
            .query(`
                SELECT OrderID, TotalAmount, StripeSessionID
                FROM Orders 
                WHERE OrderID = @orderId
            `);

        if (orderResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = orderResult.recordset[0];
        const currentTotal = parseFloat(order.TotalAmount) || 0;

        // If no StripeSessionID, cannot sync
        if (!order.StripeSessionID) {
            return res.status(400).json({
                success: false,
                message: 'Order does not have a Stripe session ID. Cannot sync from Stripe.'
            });
        }

        // Fetch session from Stripe
        const session = await stripeInstance.checkout.sessions.retrieve(order.StripeSessionID);
        const stripeTotal = session.amount_total / 100; // Convert from cents to PHP

        console.log(`[SYNC ORDER TOTAL] Order ${orderId}: Current Total=${currentTotal}, Stripe Total=${stripeTotal}`);

        // Update order TotalAmount if different
        if (Math.abs(currentTotal - stripeTotal) > 0.01) { // Allow 0.01 PHP rounding difference
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('totalAmount', sql.Decimal(10, 2), stripeTotal)
                .query(`
                    UPDATE Orders 
                    SET TotalAmount = @totalAmount 
                    WHERE OrderID = @orderId
                `);

            console.log(`[SYNC ORDER TOTAL] ✅ Updated Order ${orderId} TotalAmount from ₱${currentTotal} to ₱${stripeTotal}`);

            res.json({
                success: true,
                message: `Order total synced successfully from Stripe`,
                oldTotal: currentTotal,
                newTotal: stripeTotal,
                updated: true
            });
        } else {
            console.log(`[SYNC ORDER TOTAL] ✅ Order ${orderId} TotalAmount already matches Stripe (${currentTotal})`);
            res.json({
                success: true,
                message: 'Order total already matches Stripe',
                total: currentTotal,
                updated: false
            });
        }
    } catch (error) {
        console.error('Error syncing order total from Stripe:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync order total from Stripe',
            message: error.message
        });
    }
});