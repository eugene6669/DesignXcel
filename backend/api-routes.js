// API Routes for Frontend
const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendBulkOrderConfirmationEmail } = require('./utils/sendgridHelper');
const { mapProductRecordAssetUrls } = require('./utils/productAssetUrls');

module.exports = function(sql, pool) {
    const router = express.Router();
    
    // Authentication middleware for API routes
    function requireAuth(req, res, next) {
        // Check session-based authentication
        if (req.session && req.session.user) {
            return next();
        }
        
        // If no session, require login
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please log in to continue.',
            requiresLogin: true
        });
    }

    // Configure multer for review image uploads
    const reviewUploadsDir = path.join(__dirname, 'public', 'uploads', 'reviews');
    if (!fs.existsSync(reviewUploadsDir)) {
        fs.mkdirSync(reviewUploadsDir, { recursive: true });
    }

    const reviewStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, reviewUploadsDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'review-' + uniqueSuffix + path.extname(file.originalname));
        }
    });

    const reviewUpload = multer({
        storage: reviewStorage,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB limit
            files: 5 // Maximum 5 files per review
        },
        fileFilter: function (req, file, cb) {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed!'), false);
            }
        }
    });

    // Theme settings helpers
    const themeUploadsDir = path.join(__dirname, 'public', 'uploads', 'themes');
    if (!fs.existsSync(themeUploadsDir)) {
        fs.mkdirSync(themeUploadsDir, { recursive: true });
    }

    const themeDataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(themeDataDir)) {
        fs.mkdirSync(themeDataDir, { recursive: true });
    }

    const THEME_SETTINGS_PATH = path.join(themeDataDir, 'theme-settings.json');
    const ALLOWED_THEMES = ['default', 'dark', 'christmas'];
    const defaultThemeSettings = {
        activeTheme: 'default',
        backgroundImage: null,
        backgroundImageFile: null,
        theme: {
            mainBgColor: '#ffffff',
            mainTextColor: '#333333',
            contactTextColor: '#6c757d',
            contactIconColor: '#f0b21b',
            navBgColor: '#343a40',
            navTextColor: '#ffffff',
            navHoverColor: '#007bff',
            searchBorderColor: '#ffc107',
            searchBtnColor: '#ffc107',
            iconColor: '#f0b21b'
        },
        updatedAt: new Date().toISOString()
    };

    const themeStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, themeUploadsDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `theme-background-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    });

    const themeUpload = multer({
        storage: themeStorage,
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB limit
        },
        fileFilter: function (req, file, cb) {
            if (file.mimetype && file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed!'), false);
            }
        }
    });

    function ensureThemeSettingsFile() {
        if (!fs.existsSync(THEME_SETTINGS_PATH)) {
            fs.writeFileSync(THEME_SETTINGS_PATH, JSON.stringify(defaultThemeSettings, null, 2), 'utf8');
        }
    }

    function loadThemeSettings() {
        try {
            ensureThemeSettingsFile();
            const raw = fs.readFileSync(THEME_SETTINGS_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            return {
                ...defaultThemeSettings,
                ...parsed,
                theme: {
                    ...defaultThemeSettings.theme,
                    ...(parsed.theme || {})
                }
            };
        } catch (error) {
            console.error('Failed to load theme settings, using defaults:', error.message);
            return { ...defaultThemeSettings };
        }
    }

    function saveThemeSettings(settings) {
        const payload = {
            ...defaultThemeSettings,
            ...settings,
            theme: {
                ...defaultThemeSettings.theme,
                ...(settings.theme || {})
            },
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(THEME_SETTINGS_PATH, JSON.stringify(payload, null, 2), 'utf8');
        return payload;
    }

    function deleteExistingThemeBackground(settings) {
        if (settings.backgroundImageFile) {
            const existingPath = path.join(themeUploadsDir, settings.backgroundImageFile);
            if (fs.existsSync(existingPath)) {
                try {
                    fs.unlinkSync(existingPath);
                } catch (unlinkError) {
                    console.warn('Failed to delete existing theme background image:', unlinkError.message);
                }
            }
        }
    }

    // --- Health Check API Endpoint ---
    router.get('/api/health', (req, res) => {
        res.json({ 
            status: 'OK', 
            message: 'Backend is running',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    });

    // --- Theme API Endpoints ---
    router.get('/api/theme/public', (req, res) => {
        try {
            const settings = loadThemeSettings();
            res.json({
                success: true,
                activeTheme: ALLOWED_THEMES.includes(settings.activeTheme) ? settings.activeTheme : 'default',
                backgroundImage: settings.backgroundImage || null,
                theme: settings.theme,
                updatedAt: settings.updatedAt
            });
        } catch (error) {
            console.error('Error fetching theme settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load theme settings',
                error: error.message
            });
        }
    });

    router.post('/api/theme/public', (req, res) => {
        try {
            const { activeTheme, backgroundImage, theme } = req.body || {};
            const settings = loadThemeSettings();

            if (activeTheme) {
                if (!ALLOWED_THEMES.includes(activeTheme)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid theme selected. Allowed themes: ${ALLOWED_THEMES.join(', ')}`
                    });
                }
                settings.activeTheme = activeTheme;
            }

            if (typeof backgroundImage !== 'undefined') {
                if (!backgroundImage) {
                    deleteExistingThemeBackground(settings);
                }
                settings.backgroundImage = backgroundImage || null;
                settings.backgroundImageFile = null;
            }

            if (theme && typeof theme === 'object') {
                settings.theme = {
                    ...settings.theme,
                    ...theme
                };
            }

            const saved = saveThemeSettings(settings);

            res.json({
                success: true,
                activeTheme: saved.activeTheme,
                backgroundImage: saved.backgroundImage,
                theme: saved.theme,
                updatedAt: saved.updatedAt
            });
        } catch (error) {
            console.error('Error updating theme settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update theme settings',
                error: error.message
            });
        }
    });

    router.post('/api/theme/background-image', themeUpload.single('backgroundImage'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No image file provided'
                });
            }

            const settings = loadThemeSettings();

            // Delete previous background if exists
            deleteExistingThemeBackground(settings);

            settings.backgroundImageFile = req.file.filename;
            settings.backgroundImage = `/uploads/themes/${req.file.filename}`;

            const saved = saveThemeSettings(settings);

            res.json({
                success: true,
                backgroundImage: saved.backgroundImage,
                updatedAt: saved.updatedAt
            });
        } catch (error) {
            console.error('Error uploading theme background image:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload background image',
                error: error.message
            });
        }
    });

    // GET /api/theme/active - Get the active theme
    router.get('/api/theme/active', (req, res) => {
        try {
            const settings = loadThemeSettings();
            res.json({
                success: true,
                activeTheme: ALLOWED_THEMES.includes(settings.activeTheme) ? settings.activeTheme : 'default'
            });
        } catch (error) {
            console.error('Error fetching active theme:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load active theme',
                error: error.message
            });
        }
    });

    // POST /api/theme/active - Update the active theme
    router.post('/api/theme/active', (req, res) => {
        try {
            const { activeTheme } = req.body || {};
            const settings = loadThemeSettings();

            if (!activeTheme) {
                return res.status(400).json({
                    success: false,
                    message: 'activeTheme is required'
                });
            }

            if (!ALLOWED_THEMES.includes(activeTheme)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid theme selected. Allowed themes: ${ALLOWED_THEMES.join(', ')}`
                });
            }

            settings.activeTheme = activeTheme;
            const saved = saveThemeSettings(settings);

            res.json({
                success: true,
                activeTheme: saved.activeTheme,
                updatedAt: saved.updatedAt
            });
        } catch (error) {
            console.error('Error updating active theme:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update active theme',
                error: error.message
            });
        }
    });

    // --- Bulk Order API Endpoints ---
    // Test endpoint to verify bulk order setup
    router.get('/api/bulk-orders/test', async (req, res) => {
        try {
            await pool.connect();
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME IN ('BulkOrders', 'BulkOrderItems')
                ORDER BY TABLE_NAME
            `);
            
            res.json({
                success: true,
                message: 'Bulk order tables check',
                tables: tableCheck.recordset.map(r => r.TABLE_NAME),
                allTablesExist: tableCheck.recordset.length === 4
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error checking tables',
                error: error.message
            });
        }
    });
    
    // Create bulk order
    router.post('/api/bulk-orders', requireAuth, async (req, res) => {
        console.log('\n=== BULK ORDER REQUEST RECEIVED ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Request method:', req.method);
        console.log('Request URL:', req.originalUrl);
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Request body items:', req.body.items);
        console.log('Request body totals:', req.body.totals);
        
        try {
            if (!pool) {
                console.error('❌ Database pool is not initialized!');
                throw new Error('Database pool is not initialized');
            }
            
            console.log('✓ Database pool exists, connecting...');
            await pool.connect();
            console.log('✓ Database connected');
            const { items, totals, volumeDiscounts, pickupDate } = req.body;
            
            console.log('Bulk order request:', { 
                itemsCount: items?.length, 
                totals, 
                hasVolumeDiscounts: !!volumeDiscounts,
                pickupDate: pickupDate
            });
            
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No items provided for bulk order'
                });
            }

            if (!totals || typeof totals !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid totals provided'
                });
            }

            // Get customer ID from session if available
            const customerId = req.session?.user?.id || null;
            const customerEmail = req.session?.user?.email || req.body.email || null;
            
            // Validate totals
            const totalQuantity = parseInt(totals.totalQuantity) || 0;
            const subtotal = parseFloat(totals.subtotal) || 0;
            const discount = parseFloat(totals.discount) || 0;
            const grandTotal = parseFloat(totals.total) || 0;
            
            if (totalQuantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Total quantity must be greater than 0'
                });
            }

            // Start transaction
            console.log('Starting database transaction...');
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            console.log('✓ Transaction started');

            try {
                // Create bulk order record
                // Build query and parameters dynamically based on whether customerId exists
                let insertQuery;
                const request = transaction.request();
                
                // Parse and validate pickup date
                let pickupDateValue = null;
                if (pickupDate) {
                    const pickupDateObj = new Date(pickupDate);
                    if (!isNaN(pickupDateObj.getTime())) {
                        pickupDateValue = pickupDateObj;
                    }
                }
                
                if (customerId) {
                    request.input('customerId', sql.Int, customerId)
                        .input('customerEmail', sql.NVarChar(255), customerEmail || null)
                        .input('totalQuantity', sql.Int, totalQuantity)
                        .input('subtotal', sql.Decimal(10, 2), subtotal)
                        .input('discount', sql.Decimal(10, 2), discount)
                        .input('grandTotal', sql.Decimal(10, 2), grandTotal)
                        .input('status', sql.NVarChar(50), 'Pending')
                        .input('pickupDate', sql.DateTime2, pickupDateValue);
                    
                    insertQuery = `
                        INSERT INTO BulkOrders (
                            CustomerID, CustomerEmail, TotalQuantity, 
                            Subtotal, DiscountAmount, GrandTotal, 
                            Status, PickupDate, CreatedAt
                        )
                        OUTPUT INSERTED.BulkOrderID
                        VALUES (
                            @customerId, @customerEmail, @totalQuantity,
                            @subtotal, @discount, @grandTotal,
                            @status, @pickupDate, GETDATE()
                        )
                    `;
                } else {
                    request.input('customerEmail', sql.NVarChar(255), customerEmail || null)
                        .input('totalQuantity', sql.Int, totalQuantity)
                        .input('subtotal', sql.Decimal(10, 2), subtotal)
                        .input('discount', sql.Decimal(10, 2), discount)
                        .input('grandTotal', sql.Decimal(10, 2), grandTotal)
                        .input('status', sql.NVarChar(50), 'Pending')
                        .input('pickupDate', sql.DateTime2, pickupDateValue);
                    
                    insertQuery = `
                        INSERT INTO BulkOrders (
                            CustomerEmail, TotalQuantity, 
                            Subtotal, DiscountAmount, GrandTotal, 
                            Status, PickupDate, CreatedAt
                        )
                        OUTPUT INSERTED.BulkOrderID
                        VALUES (
                            @customerEmail, @totalQuantity,
                            @subtotal, @discount, @grandTotal,
                            @status, @pickupDate, GETDATE()
                        )
                    `;
                }
                
                console.log('Executing bulk order insert query...');
                const bulkOrderResult = await request.query(insertQuery);
                console.log('✓ Bulk order inserted, result:', bulkOrderResult.recordset);

                if (!bulkOrderResult.recordset || bulkOrderResult.recordset.length === 0) {
                    throw new Error('Failed to get bulk order ID from insert result');
                }
                
                const bulkOrderId = bulkOrderResult.recordset[0].BulkOrderID;
                console.log(`✓ Bulk order created with ID: ${bulkOrderId}`);

                // Insert bulk order items
                console.log(`\nProcessing ${items.length} item(s)...`);
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    console.log(`\n--- Processing item ${i + 1}/${items.length} ---`);
                    
                    // Validate item data
                    if (!item.productId) {
                        console.error('Item missing productId:', JSON.stringify(item, null, 2));
                        throw new Error(`Missing productId for item: ${JSON.stringify(item)}`);
                    }
                    
                    console.log(`Item productId: ${item.productId} (type: ${typeof item.productId})`);
                    console.log(`Item data:`, { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice });
                    
                    let productIdInt = parseInt(item.productId);
                    
                    // If productId is a UUID (PublicID), we need to look up the actual ProductID
                    if (isNaN(productIdInt) || productIdInt <= 0) {
                        console.log(`ProductId appears to be UUID/PublicID. Looking up ProductID...`);
                        // UUID pattern (case-insensitive)
                        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        const productIdStr = String(item.productId).trim();
                        
                        if (uuidPattern.test(productIdStr)) {
                            // It's a UUID, look up the ProductID
                            try {
                                // Normalize UUID format (SQL Server UniqueIdentifier is case-insensitive but we'll use the exact format)
                                let lookupResult;
                                
                                // Try using UniqueIdentifier type
                                try {
                                    lookupResult = await transaction.request()
                                        .input('publicId', sql.UniqueIdentifier, productIdStr)
                                        .query('SELECT ProductID FROM Products WHERE PublicId = @publicId AND IsActive = 1');
                                    
                                    if (lookupResult.recordset.length === 0) {
                                        // Try case-insensitive lookup
                                        console.log('Direct lookup failed, trying case-insensitive...');
                                        lookupResult = await transaction.request()
                                            .input('publicId', sql.NVarChar(255), productIdStr)
                                            .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                                    }
                                } catch (uuidError) {
                                    // If UniqueIdentifier fails, try as NVARCHAR with case-insensitive comparison
                                    console.log('UniqueIdentifier type failed, trying as NVARCHAR...', uuidError.message);
                                    lookupResult = await transaction.request()
                                        .input('publicId', sql.NVarChar(255), productIdStr)
                                        .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                                }
                                
                                if (!lookupResult || lookupResult.recordset.length === 0) {
                                    console.error(`❌ Product with PublicID ${productIdStr} not found!`);
                                    // Show available products for debugging
                                    const availableProducts = await transaction.request()
                                        .query('SELECT TOP 5 ProductID, PublicId, Name FROM Products WHERE IsActive = 1');
                                    console.error('Available products:', availableProducts.recordset);
                                    throw new Error(`Product with ID ${productIdStr} not found in database.`);
                                }
                                
                                productIdInt = lookupResult.recordset[0].ProductID;
                                console.log(`✓ Mapped PublicID ${productIdStr} to ProductID ${productIdInt}`);
                            } catch (lookupError) {
                                console.error(`Error looking up product by PublicID:`, lookupError);
                                console.error('Lookup error details:', {
                                    message: lookupError.message,
                                    code: lookupError.code,
                                    number: lookupError.number
                                });
                                throw new Error(`Failed to look up product: ${lookupError.message}`);
                            }
                        } else {
                            console.error(`Invalid productId: ${item.productId} (not a valid integer or UUID)`);
                            throw new Error(`Invalid productId: ${item.productId}. Product ID must be a valid integer or UUID.`);
                        }
                    }
                    
                    // Verify product exists (for foreign key constraint)
                    try {
                        console.log(`Checking if product ${productIdInt} exists in database...`);
                        const productCheck = await transaction.request()
                            .input('productId', sql.Int, productIdInt)
                            .query('SELECT ProductID, Name FROM Products WHERE ProductID = @productId');
                        
                        if (productCheck.recordset.length === 0) {
                            console.error(`❌ Product ID ${productIdInt} does not exist in database!`);
                            console.error('Available products (first 5):');
                            const availableProducts = await transaction.request()
                                .query('SELECT TOP 5 ProductID, Name FROM Products WHERE IsActive = 1');
                            console.error(availableProducts.recordset);
                            throw new Error(`Product ID ${productIdInt} not found in database. Please ensure the product exists.`);
                        }
                        
                        console.log(`✓ Product ID ${productIdInt} verified: ${productCheck.recordset[0].Name} (ID: ${productCheck.recordset[0].ProductID})`);
                    } catch (checkError) {
                        console.error(`Error checking product ${productIdInt}:`, checkError);
                        console.error('Error details:', {
                            message: checkError.message,
                            code: checkError.code,
                            number: checkError.number
                        });
                        throw checkError;
                    }
                    
                    const discount = volumeDiscounts?.find(d => d.productId === item.productId || d.productId === productIdInt)?.discount || 0;
                    const unitPrice = parseFloat(item.unitPrice) || 0;
                    const quantity = parseInt(item.quantity) || 1;
                    const discountedPrice = unitPrice * (1 - discount);
                    const itemTotal = discountedPrice * quantity;

                    const itemRequest = transaction.request()
                        .input('bulkOrderId', sql.Int, bulkOrderId)
                        .input('productId', sql.Int, productIdInt)
                        .input('productName', sql.NVarChar(255), item.name || 'Unknown Product')
                        .input('sku', sql.NVarChar(100), item.sku || null)
                        .input('quantity', sql.Int, quantity)
                        .input('unitPrice', sql.Decimal(10, 2), unitPrice)
                        .input('discountPercent', sql.Decimal(5, 2), (discount * 100) || 0)
                        .input('discountedPrice', sql.Decimal(10, 2), discountedPrice)
                        .input('itemTotal', sql.Decimal(10, 2), itemTotal);
                    
                    console.log(`Inserting item with ProductID: ${productIdInt}`);
                    await itemRequest.query(`
                        INSERT INTO BulkOrderItems (
                            BulkOrderID, ProductID, ProductName, SKU,
                            Quantity, UnitPrice, DiscountPercent,
                            DiscountedPrice, ItemTotal, CreatedAt
                        )
                        VALUES (
                            @bulkOrderId, @productId, @productName, @sku,
                            @quantity, @unitPrice, @discountPercent,
                            @discountedPrice, @itemTotal, GETDATE()
                        )
                    `);
                    console.log(`✓ Item ${i + 1} inserted successfully`);
                }

                console.log('\nCommitting transaction...');
                await transaction.commit();
                console.log('✓ Transaction committed successfully');

                // Send confirmation email (non-blocking)
                try {
                    const emailToSend = customerEmail || req.session?.user?.email;
                    const customerName = req.session?.user?.name || req.session?.user?.fullName || 'Valued Customer';
                    
                    if (emailToSend) {
                        await sendBulkOrderConfirmationEmail(emailToSend, customerName, {
                            bulkOrderId: bulkOrderId,
                            items: items.map(item => ({
                                name: item.name,
                                quantity: item.quantity,
                                unitPrice: item.unitPrice
                            })),
                            totalQuantity: totalQuantity,
                            subtotal: subtotal,
                            discount: discount,
                            grandTotal: grandTotal
                        });
                    }
                } catch (emailError) {
                    console.error('Error sending bulk order confirmation email:', emailError);
                    // Don't fail the request if email fails
                }

                res.json({
                    success: true,
                    message: 'Bulk order created successfully',
                    bulkOrderId: bulkOrderId
                });
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            console.error('=== ❌ ERROR CREATING BULK ORDER ===');
            console.error('Error:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                number: error.number,
                lineNumber: error.lineNumber,
                state: error.state,
                class: error.class,
                originalError: error.originalError?.message,
                originalStack: error.originalError?.stack
            });
            console.error('Request body:', JSON.stringify(req.body, null, 2));
            console.error('Request items:', req.body.items?.map(item => ({
                productId: item.productId,
                productIdType: typeof item.productId,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice
            })));
            console.error('=====================================');
            
            // Provide more specific error messages
            let errorMessage = 'Failed to create bulk order';
            let errorDetails = error.message;
            
            if (error.message.includes('foreign key')) {
                errorMessage = 'One or more products do not exist in the database';
            } else if (error.message.includes('cannot insert')) {
                errorMessage = 'Database insertion failed. Please check the data and try again.';
            } else if (error.message.includes('Invalid object name')) {
                errorMessage = 'Database table not found. Please contact support.';
            } else if (error.message.includes('transaction')) {
                errorMessage = 'Database transaction failed. Please try again.';
            }
            
            res.status(500).json({
                success: false,
                message: errorMessage,
                error: errorDetails,
                details: process.env.NODE_ENV === 'development' ? {
                    message: error.message,
                    code: error.code,
                    number: error.number,
                    stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack
                } : undefined
            });
        }
    });


    // =============================================================================
    // ADMIN API ENDPOINTS - BULK ORDERS MANAGEMENT
    // =============================================================================

    // Get all bulk orders (Admin)
    router.get('/api/admin/bulk-orders', requireAuth, async (req, res) => {
        try {
            await pool.connect();
            const { status, limit = 50, offset = 0 } = req.query;
            
            let query = `
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
                    bo.CreatedAt,
                    bo.UpdatedAt,
                    c.FullName as CustomerName
                FROM BulkOrders bo
                LEFT JOIN Customers c ON bo.CustomerID = c.CustomerID
            `;
            
            const request = pool.request();
            
            if (status) {
                query += ' WHERE bo.Status = @status';
                request.input('status', sql.NVarChar(50), status);
            }
            
            query += ' ORDER BY bo.CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));
            
            const result = await request.query(query);
            
            // Get total count
            let countQuery = 'SELECT COUNT(*) as total FROM BulkOrders';
            const countRequest = pool.request();
            if (status) {
                countQuery += ' WHERE Status = @status';
                countRequest.input('status', sql.NVarChar(50), status);
            }
            const countResult = await countRequest.query(countQuery);
            
            res.json({
                success: true,
                bulkOrders: result.recordset,
                total: countResult.recordset[0].total
            });
        } catch (error) {
            console.error('Error fetching bulk orders:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch bulk orders',
                error: error.message
            });
        }
    });

    // Get bulk order details (Admin)
    router.get('/api/admin/bulk-orders/:orderId', requireAuth, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            
            // Get bulk order
            const orderResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        bo.*,
                        c.FullName as CustomerName,
                        c.Email as CustomerEmailAddress
                    FROM BulkOrders bo
                    LEFT JOIN Customers c ON bo.CustomerID = c.CustomerID
                    WHERE bo.BulkOrderID = @orderId
                `);
            
            if (orderResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Bulk order not found'
                });
            }
            
            // Get bulk order items
            const itemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        boi.*,
                        p.ImageURL as ProductImage
                    FROM BulkOrderItems boi
                    LEFT JOIN Products p ON boi.ProductID = p.ProductID
                    WHERE boi.BulkOrderID = @orderId
                    ORDER BY boi.BulkOrderItemID
                `);
            
            res.json({
                success: true,
                order: orderResult.recordset[0],
                items: itemsResult.recordset
            });
        } catch (error) {
            console.error('Error fetching bulk order details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch bulk order details',
                error: error.message
            });
        }
    });

    // Update bulk order status (Admin)
    router.put('/api/admin/bulk-orders/:orderId/status', requireAuth, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);
            const { status, notes } = req.body;
            
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }
            
            const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }
            
            const request = pool.request()
                .input('orderId', sql.Int, orderId)
                .input('status', sql.NVarChar(50), status)
                .input('updatedAt', sql.DateTime2, new Date());
            
            let query = 'UPDATE BulkOrders SET Status = @status, UpdatedAt = @updatedAt';
            
            if (notes !== undefined) {
                query += ', Notes = @notes';
                request.input('notes', sql.NVarChar(1000), notes);
            }
            
            query += ' WHERE BulkOrderID = @orderId';
            
            await request.query(query);
            
            res.json({
                success: true,
                message: 'Bulk order status updated successfully'
            });
        } catch (error) {
            console.error('Error updating bulk order status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update bulk order status',
                error: error.message
            });
        }
    });

    // =============================================================================
    // CUSTOMER API ENDPOINTS - BULK ORDERS
    // =============================================================================

    // Get customer's bulk orders
    router.get('/api/customer/bulk-orders', requireAuth, async (req, res) => {
        try {
            await pool.connect();
            const customerId = req.session?.user?.id;
            
            if (!customerId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const result = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query(`
                    SELECT 
                        BulkOrderID,
                        CustomerID,
                        CustomerEmail,
                        TotalQuantity,
                        Subtotal,
                        DiscountAmount,
                        GrandTotal,
                        Status,
                        Notes,
                        CreatedAt,
                        UpdatedAt
                    FROM BulkOrders
                    WHERE CustomerID = @customerId
                    ORDER BY CreatedAt DESC
                `);

            res.json({
                success: true,
                bulkOrders: result.recordset
            });
        } catch (error) {
            console.error('Error fetching customer bulk orders:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch bulk orders',
                error: error.message
            });
        }
    });

    // Get customer's bulk order details
    router.get('/api/customer/bulk-orders/:orderId', requireAuth, async (req, res) => {
        try {
            await pool.connect();
            const customerId = req.session?.user?.id;
            const orderId = parseInt(req.params.orderId);

            if (!customerId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Get bulk order (verify it belongs to customer)
            const orderResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('customerId', sql.Int, customerId)
                .query(`
                    SELECT *
                    FROM BulkOrders
                    WHERE BulkOrderID = @orderId AND CustomerID = @customerId
                `);

            if (orderResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Bulk order not found'
                });
            }

            // Get bulk order items
            const itemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT 
                        boi.*,
                        p.ImageURL as ProductImage
                    FROM BulkOrderItems boi
                    LEFT JOIN Products p ON boi.ProductID = p.ProductID
                    WHERE boi.BulkOrderID = @orderId
                    ORDER BY boi.BulkOrderItemID
                `);

            res.json({
                success: true,
                order: orderResult.recordset[0],
                items: itemsResult.recordset
            });
        } catch (error) {
            console.error('Error fetching customer bulk order details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch bulk order details',
                error: error.message
            });
        }
    });


    // --- Order Management API Endpoints ---
    // Cash on Delivery Order Creation
    // router.post('/api/orders/cash-on-delivery', async (req, res) => { ... });

    // --- Product Reviews API Endpoints ---
    // Get reviews for a specific product
    router.get('/api/products/:productId/reviews', async (req, res) => {
        try {
                const productIdStr = String(req.params.productId).trim();
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let productId;
                
            // Check if it's a UUID first (BEFORE parsing as integer)
            // This prevents UUIDs starting with numbers from being parsed incorrectly
                if (uuidPattern.test(productIdStr)) {
                    // It's a UUID, look up the actual ProductID
                console.log(`[GET Reviews] Detected UUID format: ${productIdStr}`);
                // Note: We don't filter by IsActive here because we want to fetch reviews even if product is inactive
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.UniqueIdentifier, productIdStr)
                        .query('SELECT ProductID FROM Products WHERE PublicId = @publicId');
                        
                        if (lookupResult.recordset.length === 0) {
                            // Try case-insensitive lookup
                            const lookupResult2 = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                            .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                            
                            if (lookupResult2.recordset.length > 0) {
                                productId = lookupResult2.recordset[0].ProductID;
                            console.log(`[GET Reviews] Found ProductID ${productId} from UUID ${productIdStr} via NVARCHAR lookup`);
                            } else {
                            console.log(`[GET Reviews] Product not found with UUID ${productIdStr}`);
                                return res.json({
                                    success: true,
                                    reviews: []
                                });
                            }
                        } else {
                            productId = lookupResult.recordset[0].ProductID;
                        console.log(`[GET Reviews] Found ProductID ${productId} from UUID ${productIdStr} via UniqueIdentifier lookup`);
                        }
                    } catch (uuidError) {
                        // If UniqueIdentifier fails, try as NVARCHAR
                        const lookupResult = await pool.request()
                            .input('publicId', sql.NVarChar(255), productIdStr)
                        .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                        
                        if (lookupResult.recordset.length > 0) {
                            productId = lookupResult.recordset[0].ProductID;
                        console.log(`[GET Reviews] Found ProductID ${productId} from UUID ${productIdStr} via NVARCHAR fallback`);
                        } else {
                        console.log(`[GET Reviews] Product not found with UUID ${productIdStr} (fallback)`);
                            return res.json({
                                success: true,
                                reviews: []
                            });
                        }
                    }
                } else {
                // Not a UUID, try to parse as integer
                productId = parseInt(productIdStr);
                
                if (isNaN(productId) || productId <= 0) {
                    console.log(`[GET Reviews] Invalid product ID format: ${productIdStr}`);
                    return res.json({
                        success: true,
                        reviews: []
                    });
                }
                
                console.log(`[GET Reviews] Using numeric ProductID: ${productId}`);
            }
            
            const sortBy = req.query.sort || 'newest';
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 4;
            const offset = (page - 1) * limit;
            
            
            // Check if table has extended columns
            const columnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ProductReviews' 
                AND COLUMN_NAME IN ('ReviewerName', 'ReviewerEmail', 'Title', 'ImageURL', 'ImageURLs')
            `);
            
            const hasExtendedColumns = columnCheck.recordset.some(col => ['ReviewerName', 'ReviewerEmail', 'Title'].includes(col.COLUMN_NAME));
            const hasImageURL = columnCheck.recordset.some(col => col.COLUMN_NAME === 'ImageURL');
            const hasImageURLs = columnCheck.recordset.some(col => col.COLUMN_NAME === 'ImageURLs');
            
            let orderClause = 'ORDER BY pr.CreatedAt DESC';
            switch (sortBy) {
                case 'oldest':
                    orderClause = 'ORDER BY pr.CreatedAt ASC';
                    break;
                case 'highest':
                    orderClause = 'ORDER BY pr.Rating DESC, pr.CreatedAt DESC';
                    break;
                case 'lowest':
                    orderClause = 'ORDER BY pr.Rating ASC, pr.CreatedAt DESC';
                    break;
                default: // newest
                    orderClause = 'ORDER BY pr.CreatedAt DESC';
            }
            
            let query;
            if (hasExtendedColumns) {
                // Extended table with additional columns
                if (hasImageURLs) {
                query = `
                    SELECT
                        pr.ReviewID as id,
                        pr.ProductID,
                        pr.CustomerID,
                        COALESCE(pr.ReviewerName, c.FullName, 'Anonymous') AS customerName,
                        COALESCE(pr.ReviewerEmail, c.Email) AS customerEmail,
                        pr.Rating as rating,
                        COALESCE(pr.Title, 'Review') AS title,
                        pr.Comment as comment,
                        pr.HelpfulCount,
                        pr.CreatedAt as createdAt,
                        pr.UpdatedAt,
                            pr.IsActive,
                            CASE 
                                WHEN pr.ImageURLs IS NOT NULL AND pr.ImageURLs != '' 
                                THEN pr.ImageURLs 
                                WHEN pr.ImageURL IS NOT NULL AND pr.ImageURL != '' 
                                THEN pr.ImageURL 
                                ELSE NULL 
                            END as images
                        FROM ProductReviews pr
                            LEFT JOIN Customers c ON pr.CustomerID = c.CustomerID
                        WHERE pr.ProductID = @productId
                            AND pr.IsActive = 1
                        ${orderClause}
                        OFFSET @offset ROWS
                        FETCH NEXT @limit ROWS ONLY
                    `;
                } else if (hasImageURL) {
                    query = `
                        SELECT
                            pr.ReviewID as id,
                            pr.ProductID,
                            pr.CustomerID,
                            COALESCE(pr.ReviewerName, c.FullName, 'Anonymous') AS customerName,
                            COALESCE(pr.ReviewerEmail, c.Email) AS customerEmail,
                            pr.Rating as rating,
                            COALESCE(pr.Title, 'Review') AS title,
                            pr.Comment as comment,
                            pr.HelpfulCount,
                            pr.CreatedAt as createdAt,
                            pr.UpdatedAt,
                            pr.IsActive,
                            CASE 
                                WHEN pr.ImageURL IS NOT NULL AND pr.ImageURL != '' 
                                THEN pr.ImageURL 
                                ELSE NULL 
                            END as images
                    FROM ProductReviews pr
                        LEFT JOIN Customers c ON pr.CustomerID = c.CustomerID
                    WHERE pr.ProductID = @productId
                        AND pr.IsActive = 1
                    ${orderClause}
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `;
                } else {
                    query = `
                        SELECT
                            pr.ReviewID as id,
                            pr.ProductID,
                            pr.CustomerID,
                            COALESCE(pr.ReviewerName, c.FullName, 'Anonymous') AS customerName,
                            COALESCE(pr.ReviewerEmail, c.Email) AS customerEmail,
                            pr.Rating as rating,
                            COALESCE(pr.Title, 'Review') AS title,
                            pr.Comment as comment,
                            pr.HelpfulCount,
                            pr.CreatedAt as createdAt,
                            pr.UpdatedAt,
                            pr.IsActive,
                            NULL as images
                        FROM ProductReviews pr
                            LEFT JOIN Customers c ON pr.CustomerID = c.CustomerID
                        WHERE pr.ProductID = @productId
                            AND pr.IsActive = 1
                        ${orderClause}
                        OFFSET @offset ROWS
                        FETCH NEXT @limit ROWS ONLY
                    `;
                }
            } else {
                // Basic table structure
                query = `
                    SELECT
                        pr.ReviewID as id,
                        pr.ProductID,
                        pr.CustomerID,
                        COALESCE(c.FullName, 'Anonymous') AS customerName,
                        c.Email AS customerEmail,
                        pr.Rating as rating,
                        'Review' AS title,
                        pr.Comment as comment,
                        pr.HelpfulCount,
                        pr.CreatedAt as createdAt,
                        pr.UpdatedAt,
                        pr.IsActive,
                        NULL as images
                    FROM ProductReviews pr
                        LEFT JOIN Customers c ON pr.CustomerID = c.CustomerID
                    WHERE pr.ProductID = @productId
                        AND pr.IsActive = 1
                    ${orderClause}
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `;
            }
            
            console.log(`[GET Reviews] Fetching reviews for ProductID: ${productId} (from ${req.params.productId}), page: ${page}, limit: ${limit}, sort: ${sortBy}`);
            
            // Debug: Check all reviews for this ProductID regardless of IsActive
            const debugAllReviews = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT ReviewID, ProductID, CustomerID, Rating, IsActive, CreatedAt FROM ProductReviews WHERE ProductID = @productId');
            console.log(`[GET Reviews] DEBUG: Total reviews in DB for ProductID ${productId}: ${debugAllReviews.recordset.length}`);
            if (debugAllReviews.recordset.length > 0) {
                debugAllReviews.recordset.forEach((review, idx) => {
                    console.log(`[GET Reviews] DEBUG Review ${idx + 1}: ReviewID=${review.ReviewID}, CustomerID=${review.CustomerID}, Rating=${review.Rating}, IsActive=${review.IsActive}, CreatedAt=${review.CreatedAt}`);
                });
            }
            
            const result = await pool.request()
                .input('productId', sql.Int, productId)
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, limit)
                .query(query);
            
            console.log(`[GET Reviews] Found ${result.recordset.length} active review(s) for ProductID ${productId} (after filtering IsActive=1 and pagination)`);
            
            // Process reviews to format images array
            const processedReviews = result.recordset.map(review => {
                const reviewData = {
                    ...review,
                    isVerified: true, // Mark as verified if they have a review (means they purchased)
                    profileImage: null
                };
                
                // Process images - convert comma-separated string to array
                if (review.images) {
                    try {
                        const imageArray = review.images.split(',').map(img => img.trim()).filter(img => img);
                        reviewData.images = imageArray.map(url => ({ url, type: 'image' }));
                    } catch (e) {
                        reviewData.images = [];
                    }
                } else {
                    reviewData.images = [];
                }
                
                return reviewData;
            });
            
            if (processedReviews.length > 0) {
                console.log(`[GET Reviews] First review: ReviewID=${processedReviews[0].id}, CustomerID=${processedReviews[0].CustomerID}, Rating=${processedReviews[0].rating}, Images: ${processedReviews[0].images?.length || 0}`);
            } else if (debugAllReviews.recordset.length > 0) {
                console.log(`[GET Reviews] WARNING: There are ${debugAllReviews.recordset.length} review(s) in DB but none are being returned. Possible reasons:`);
                console.log(`  - All reviews have IsActive = 0`);
                console.log(`  - Pagination issue (page ${page} with limit ${limit} and offset ${offset})`);
                console.log(`  - Review date sorting issue`);
            }
            
            res.json({
                success: true,
                reviews: processedReviews
            });
        } catch (err) {
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch reviews', 
                details: err.message 
            });
        }
    });

    // Helper function to check if customer has completed purchase of a product
    async function hasCompletedPurchase(customerId, productId) {
        try {
            console.log(`[hasCompletedPurchase] Called with customerId=${customerId}, productId=${productId} (type: ${typeof productId})`);
            
            if (!customerId || !productId) {
                console.log(`[hasCompletedPurchase] Missing parameters: customerId=${customerId}, productId=${productId}`);
                return false;
            }
            
            // Handle product ID conversion if it's a UUID/PublicID
            let actualProductId = productId;
            if (isNaN(productId) || productId <= 0) {
                const productIdStr = String(productId).trim();
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                
                if (uuidPattern.test(productIdStr)) {
                    // It's a UUID, look up the actual ProductID
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.UniqueIdentifier, productIdStr)
                            .query('SELECT ProductID FROM Products WHERE PublicId = @publicId AND IsActive = 1');
                        
                        if (lookupResult.recordset.length === 0) {
                            // Try case-insensitive lookup as NVARCHAR
                            const lookupResult2 = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                                .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                            
                            if (lookupResult2.recordset.length > 0) {
                                actualProductId = lookupResult2.recordset[0].ProductID;
                            } else {
                                console.log(`Product not found for PublicId: ${productIdStr}`);
                                return false;
                            }
                        } else {
                            actualProductId = lookupResult.recordset[0].ProductID;
                        }
                    } catch (uuidError) {
                        // If UniqueIdentifier fails, try as NVARCHAR
                        try {
                            const lookupResult = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                                .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                            
                            if (lookupResult.recordset.length > 0) {
                                actualProductId = lookupResult.recordset[0].ProductID;
                            } else {
                                console.log(`Product not found for PublicId (NVARCHAR): ${productIdStr}`);
                                return false;
                            }
                        } catch (error) {
                            console.error('Error looking up product by PublicId:', error);
                            return false;
                        }
                    }
                } else {
                    console.log(`Invalid product ID format: ${productIdStr}`);
                    return false;
                }
            }
            
            if (!actualProductId || isNaN(actualProductId)) {
                return false;
            }
            
            // First, get the PublicId for this product to check by both ProductID and PublicId
            const productInfoResult = await pool.request()
                .input('productId', sql.Int, actualProductId)
                .query(`
                    SELECT ProductID, PublicId, Name
                    FROM Products
                    WHERE ProductID = @productId AND IsActive = 1
                `);
            
            let publicId = null;
            if (productInfoResult.recordset.length > 0) {
                publicId = productInfoResult.recordset[0].PublicId;
                console.log(`[Purchase Check] Product ${actualProductId} has PublicId: ${publicId}`);
            }
            
            // STRICT: Only allow reviews for orders with statuses that indicate COMPLETED purchase:
            // Only allow: 'Completed', 'Delivered', 'Received'
            // This ensures customers can only review products they have actually received
            // Check BOTH regular orders (OrderItems) AND bulk orders (BulkOrderItems)
            
            // Check regular orders - STRICT: Only Completed, Delivered, Received
            const regularOrdersResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('productId', sql.Int, actualProductId)
                .query(`
                    SELECT COUNT(*) as purchaseCount
                    FROM OrderItems oi
                    INNER JOIN Orders o ON oi.OrderID = o.OrderID
                    WHERE o.CustomerID = @customerId 
                    AND oi.ProductID = @productId 
                    AND o.Status IN ('Completed', 'Delivered', 'Received')
                    AND o.Status IS NOT NULL
                `);
            
            let regularOrdersCount = regularOrdersResult.recordset[0].purchaseCount;
            
            // Get customer email for matching bulk orders (in case CustomerID is NULL)
            let customerEmail = null;
            try {
                const customerResult = await pool.request()
                    .input('customerId', sql.Int, customerId)
                    .query('SELECT Email FROM Customers WHERE CustomerID = @customerId');
                if (customerResult.recordset.length > 0) {
                    customerEmail = customerResult.recordset[0].Email;
                }
            } catch (err) {
                // Continue without email if we can't fetch it
            }
            
            // Check bulk orders - STRICT: Only Completed, Delivered, Received
            // Check both by CustomerID and CustomerEmail (since BulkOrders can have either)
            let bulkOrdersResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('customerEmail', sql.NVarChar(255), customerEmail)
                .input('productId', sql.Int, actualProductId)
                .query(`
                    SELECT COUNT(*) as purchaseCount
                    FROM BulkOrderItems boi
                    INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                    WHERE (bo.CustomerID = @customerId OR (@customerEmail IS NOT NULL AND bo.CustomerEmail = @customerEmail))
                    AND boi.ProductID = @productId 
                    AND bo.Status IN ('Completed', 'Delivered', 'Received')
                    AND bo.Status IS NOT NULL
                `);
            
            let bulkOrdersCount = bulkOrdersResult.recordset[0].purchaseCount;
            
            // If no match by ProductID, try matching by product name (in case ProductID doesn't match)
            if (bulkOrdersCount === 0 && productInfoResult.recordset.length > 0) {
                const productName = productInfoResult.recordset[0].Name;
                if (productName) {
                    const bulkByNameResult = await pool.request()
                        .input('customerId', sql.Int, customerId)
                        .input('customerEmail', sql.NVarChar(255), customerEmail)
                        .input('productName', sql.NVarChar(255), productName)
                        .query(`
                            SELECT COUNT(*) as purchaseCount
                            FROM BulkOrderItems boi
                            INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                            WHERE (bo.CustomerID = @customerId OR (@customerEmail IS NOT NULL AND bo.CustomerEmail = @customerEmail))
                            AND LOWER(boi.ProductName) = LOWER(@productName)
                            AND bo.Status IN ('Completed', 'Delivered', 'Received')
                            AND bo.Status IS NOT NULL
                        `);
                    
                    bulkOrdersCount = bulkByNameResult.recordset[0].purchaseCount;
                    if (bulkOrdersCount > 0) {
                        console.log(`[Purchase Check] Found bulk order match by product name: "${productName}" with completed status`);
                    }
                }
            }
            
            const totalPurchaseCount = regularOrdersCount + bulkOrdersCount;
            const hasPurchase = totalPurchaseCount > 0;
            
            console.log(`[Purchase Check] Regular orders (Completed/Delivered/Received): ${regularOrdersCount}, Bulk orders (Completed/Delivered/Received): ${bulkOrdersCount}, Total: ${totalPurchaseCount}`);
            
            if (!hasPurchase) {
                console.log(`[Purchase Check] Customer ${customerId}, Product ${actualProductId}: No completed orders found (only Completed/Delivered/Received statuses allowed)`);
            }
            
            return hasPurchase;
        } catch (error) {
            console.error('Error checking purchase verification:', error);
            console.error('Error details:', error.message);
            console.error('Stack:', error.stack);
            return false;
        }
    }

    // Add a new review for a product
    router.post('/api/products/:productId/reviews', (req, res, next) => {
        reviewUpload.array('images', 5)(req, res, (err) => {
            if (err) {
                // Multer error occurred
                
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'File too large. Maximum size is 5MB per file.' 
                    });
                }
                
                if (err.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Too many files. Maximum 5 files allowed.' 
                    });
                }
                
                if (err.message && err.message.includes('Only image files are allowed')) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Only image files are allowed.' 
                    });
                }
                
                return res.status(400).json({ 
                    success: false, 
                    error: 'File upload error: ' + err.message 
                });
            }
            next();
        });
    }, async (req, res) => {
        try {
            // Check if it's a UUID first (BEFORE parsing as integer)
            // This prevents UUIDs starting with numbers from being parsed incorrectly
                const productIdStr = String(req.params.productId).trim();
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let productId;
                
                if (uuidPattern.test(productIdStr)) {
                    // It's a UUID, look up the actual ProductID
                console.log(`[Review Submit] Detected UUID format: ${productIdStr}`);
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.UniqueIdentifier, productIdStr)
                            .query('SELECT ProductID, Name, IsActive FROM Products WHERE PublicId = @publicId');
                        
                        if (lookupResult.recordset.length === 0) {
                        console.log(`[Review Submit] Product not found with UniqueIdentifier, trying NVARCHAR...`);
                        // Try case-insensitive lookup as NVARCHAR
                            const lookupResult2 = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                            .query('SELECT ProductID, Name, IsActive FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                            
                            if (lookupResult2.recordset.length > 0) {
                                productId = lookupResult2.recordset[0].ProductID;
                            console.log(`[Review Submit] Found product with NVARCHAR lookup: ProductID=${productId}, Name=${lookupResult2.recordset[0].Name}, IsActive=${lookupResult2.recordset[0].IsActive}`);
                            
                            // Check if product is active
                            if (!lookupResult2.recordset[0].IsActive) {
                                return res.status(404).json({
                                    success: false,
                                    error: 'Product is no longer available'
                                });
                            }
                            } else {
                            console.error(`[Review Submit] Product not found with PublicId: ${productIdStr}`);
                                return res.status(404).json({
                                    success: false,
                                    error: 'Product not found'
                                });
                            }
                        } else {
                            productId = lookupResult.recordset[0].ProductID;
                        console.log(`[Review Submit] Found product with UniqueIdentifier lookup: ProductID=${productId}, Name=${lookupResult.recordset[0].Name}, IsActive=${lookupResult.recordset[0].IsActive}`);
                        
                        // Check if product is active
                        if (!lookupResult.recordset[0].IsActive) {
                            return res.status(404).json({
                                success: false,
                                error: 'Product is no longer available'
                            });
                        }
                        }
                    } catch (uuidError) {
                    console.error(`[Review Submit] Error with UniqueIdentifier lookup:`, uuidError.message);
                        // If UniqueIdentifier fails, try as NVARCHAR
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.NVarChar(255), productIdStr)
                            .query('SELECT ProductID, Name, IsActive FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                        
                        if (lookupResult.recordset.length > 0) {
                            productId = lookupResult.recordset[0].ProductID;
                            console.log(`[Review Submit] Found product with NVARCHAR fallback: ProductID=${productId}, Name=${lookupResult.recordset[0].Name}, IsActive=${lookupResult.recordset[0].IsActive}`);
                            
                            // Check if product is active
                            if (!lookupResult.recordset[0].IsActive) {
                                return res.status(404).json({
                                    success: false,
                                    error: 'Product is no longer available'
                                });
                            }
                        } else {
                            console.error(`[Review Submit] Product not found with PublicId (NVARCHAR fallback): ${productIdStr}`);
                            return res.status(404).json({
                                success: false,
                                error: 'Product not found'
                            });
                        }
                    } catch (fallbackError) {
                        console.error(`[Review Submit] Error with NVARCHAR fallback:`, fallbackError.message);
                            return res.status(404).json({
                                success: false,
                                error: 'Product not found'
                            });
                        }
                    }
                } else {
                // Not a UUID, try to parse as integer
                productId = parseInt(productIdStr);
                
                if (isNaN(productId) || productId <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid product ID format'
                    });
                }
                
                console.log(`[Review Submit] Using numeric ProductID: ${productId}`);
            }
            
            // Extract data from request body (handles both FormData and JSON)
            const rawRating = req.body.rating;
            let parsedRating;
            
            // Try multiple parsing methods
            if (typeof rawRating === 'number') {
                parsedRating = Math.round(rawRating); // Ensure it's an integer
            } else if (typeof rawRating === 'string') {
                const numRating = Number(rawRating);
                parsedRating = isNaN(numRating) ? NaN : Math.round(numRating);
            } else {
                parsedRating = NaN;
            }
            
            // Handle customerId - it might be an array, so take the first value
            let customerIdValue = req.body.customerId;
            if (Array.isArray(customerIdValue)) {
                customerIdValue = customerIdValue[0];
                console.log(`[Review Submit] customerId was an array, using first value: ${customerIdValue}`);
            }
            const parsedCustomerId = customerIdValue ? parseInt(customerIdValue) : null;
            
            // Verify productId is valid after conversion
            if (!productId || isNaN(productId)) {
                console.error(`[Review Submit] Invalid ProductID after conversion: ${productId}`);
                return res.status(404).json({
                    success: false,
                    error: 'Product not found. Invalid product ID.'
                });
            }
            
            console.log(`[Review Submit] Using ProductID: ${productId} (converted from: ${req.params.productId})`);
            
            // Final verification - make sure the ProductID exists (double check)
            const finalProductCheck = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT ProductID, Name, IsActive FROM Products WHERE ProductID = @productId');
            
            if (finalProductCheck.recordset.length === 0) {
                console.error(`[Review Submit] ERROR: ProductID ${productId} does not exist in Products table after UUID conversion`);
                console.error(`[Review Submit] Original UUID: ${req.params.productId}`);
                // Try to find what ProductID this UUID actually maps to
                const debugLookup = await pool.request()
                    .input('publicId', sql.NVarChar(255), req.params.productId)
                    .query('SELECT ProductID, Name, PublicId FROM Products WHERE CAST(PublicId AS NVARCHAR(255)) = @publicId');
                if (debugLookup.recordset.length > 0) {
                    console.error(`[Review Submit] Found product with different lookup:`, debugLookup.recordset[0]);
                    productId = debugLookup.recordset[0].ProductID; // Use the correct ProductID
                    console.log(`[Review Submit] Corrected ProductID to: ${productId}`);
                } else {
                    return res.status(404).json({
                        success: false,
                        error: 'Product not found. The product may have been deleted or does not exist.'
                    });
                }
            } else {
                console.log(`[Review Submit] ProductID ${productId} verified: ${finalProductCheck.recordset[0].Name}`);
            }
            
            const reviewData = {
                name: req.body.name,
                email: req.body.email,
                rating: parsedRating,
                title: req.body.title,
                comment: req.body.comment,
                customerId: parsedCustomerId || null
            };
            
            const { name, email, rating, title, comment, customerId } = reviewData;
            
            
            // STRICT: Check if customer has completed purchase of this product
            // Only allow reviews for products with Completed/Delivered/Received status
            // Note: productId is already converted to numeric ID at this point
            if (customerId) {
                try {
                const hasPurchase = await hasCompletedPurchase(customerId, productId);
                if (!hasPurchase) {
                        console.error(`[Review Submit] Purchase verification failed - Customer ${customerId} has not completed purchase of Product ${productId}`);
                    return res.status(403).json({
                        success: false,
                            error: 'You can only review products you have purchased and received. Please complete a purchase and wait for delivery before leaving a review.',
                        code: 'PURCHASE_REQUIRED'
                    });
                }
                    console.log(`[Review Submit] Purchase verification passed - Customer ${customerId} has completed purchase of Product ${productId}`);
                } catch (purchaseCheckError) {
                    console.error('[Review Submit] Error checking purchase in review submission:', purchaseCheckError);
                    // STRICT: Block review submission if purchase check fails
                    return res.status(500).json({
                        success: false,
                        error: 'Unable to verify purchase. Please try again later.',
                        code: 'PURCHASE_VERIFICATION_ERROR'
                    });
                }
            } else {
                // No customer ID - require login
                return res.status(401).json({
                    success: false,
                    error: 'You must be logged in to leave a review.',
                    code: 'LOGIN_REQUIRED'
                });
            }
            
            // Validate input - be more specific about validation
            if (isNaN(rating) || rating < 1 || rating > 5) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Rating must be between 1 and 5' 
                });
            }
            
            if (!comment || comment.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Review content is required' 
                });
            }
            
            if (!title || title.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Review title is required' 
                });
            }
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Name is required' 
                });
            }
            
            if (!email || email.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email is required' 
                });
            }
            
            if (!customerId || isNaN(parseInt(customerId))) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Valid Customer ID is required' 
                });
            }
            
            // Handle uploaded images
            let imageUrls = [];
            let imageUrlString = '';
            if (req.files && req.files.length > 0) {
                imageUrls = req.files.map(file => {
                    // Return relative path from public directory
                    return '/uploads/reviews/' + file.filename;
                });
                imageUrlString = imageUrls.join(',');
                // Review images uploaded successfully
            }
            
            // Get or find OrderID for this review (one review per order per product)
            // First, try to get OrderID from request body
            let orderId = req.body.orderId || req.body.orderID || null;
            
            // If OrderID not provided, find the most recent completed order containing this product
            if (!orderId) {
                try {
                    const orderResult = await pool.request()
                        .input('customerId', sql.Int, parseInt(customerId))
                        .input('productId', sql.Int, productId)
                        .query(`
                            SELECT TOP 1 o.OrderID
                            FROM Orders o
                            INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
                            WHERE o.CustomerID = @customerId
                            AND oi.ProductID = @productId
                            AND o.Status IN ('Completed', 'Delivered', 'Received')
                            ORDER BY o.OrderDate DESC
                        `);
                    
                    if (orderResult.recordset.length > 0) {
                        orderId = orderResult.recordset[0].OrderID;
                        console.log(`[Review Submit] Found OrderID ${orderId} for customer ${customerId} and product ${productId}`);
                    } else {
                        console.log(`[Review Submit] No completed order found for customer ${customerId} and product ${productId}`);
                        // Try bulk orders
                        const bulkOrderResult = await pool.request()
                            .input('customerId', sql.Int, parseInt(customerId))
                            .input('productId', sql.Int, productId)
                            .query(`
                                SELECT TOP 1 bo.BulkOrderID
                                FROM BulkOrders bo
                                INNER JOIN BulkOrderItems boi ON bo.BulkOrderID = boi.BulkOrderID
                                WHERE bo.CustomerID = @customerId
                                AND boi.ProductID = @productId
                                AND bo.Status IN ('Completed', 'Delivered', 'Received')
                                ORDER BY bo.CreatedAt DESC
                            `);
                        
                        if (bulkOrderResult.recordset.length > 0) {
                            // Use BulkOrderID as negative value to distinguish from regular orders
                            orderId = -bulkOrderResult.recordset[0].BulkOrderID;
                            console.log(`[Review Submit] Found BulkOrderID ${Math.abs(orderId)} for customer ${customerId} and product ${productId}`);
                        }
                    }
                } catch (orderError) {
                    console.error('[Review Submit] Error finding order:', orderError);
                    // Continue without orderId - we'll allow review but track it differently
                }
            }
            
            // Check if ProductReviews table has OrderID column
            const orderIdColumnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ProductReviews' 
                AND COLUMN_NAME = 'OrderID'
            `);
            const hasOrderIdColumnInTable = orderIdColumnCheck.recordset.length > 0;
            
            // Check if a review already exists for this order and product
            // NEW RULE: One review per order per product (allows multiple reviews for same product from different orders)
            let existingReviewCheck;
            if (orderId) {
                // If orderId is available, ALWAYS check by OrderID + ProductID (allows same product from different orders)
                if (hasOrderIdColumnInTable) {
                    // OrderID column exists - check directly
                    existingReviewCheck = await pool.request()
                        .input('productId', sql.Int, productId)
                        .input('orderId', sql.Int, orderId)
                        .query(`
                            SELECT ReviewID, ProductID, CustomerID, OrderID, Rating, IsActive, CreatedAt, UpdatedAt
                            FROM ProductReviews
                            WHERE ProductID = @productId AND OrderID = @orderId
                        `);
                } else {
                    // OrderID column doesn't exist - check by joining with Orders to verify this specific order
                    // For now, if OrderID column doesn't exist and orderId is available, allow the review
                    // This ensures reviews from different orders are allowed
                    // We'll create an empty result set to indicate no existing review for this order
                    existingReviewCheck = { recordset: [] };
                    console.log(`[Review Submit] OrderID column doesn't exist but orderId is available. Allowing review to proceed (different orders can review same product).`);
                }
            } else {
                // No orderId available - fallback to CustomerID + ProductID (only when orderId cannot be found)
                // This should rarely happen as we try to find orderId above
                console.warn(`[Review Submit] No orderId found - falling back to CustomerID + ProductID check. This may prevent reviews from different orders.`);
                existingReviewCheck = await pool.request()
                    .input('productId', sql.Int, productId)
                    .input('customerId', sql.Int, parseInt(customerId))
                    .query(`
                        SELECT ReviewID, ProductID, CustomerID, Rating, IsActive, CreatedAt, UpdatedAt
                        FROM ProductReviews
                        WHERE ProductID = @productId AND CustomerID = @customerId
                    `);
            }
            
            // If review already exists, return error (NO UPDATES ALLOWED)
            if (existingReviewCheck.recordset.length > 0) {
                const existingReview = existingReviewCheck.recordset[0];
                console.log(`[Review Submit] Review already exists (ReviewID: ${existingReview.ReviewID}) for OrderID: ${orderId || 'N/A'}, ProductID: ${productId}`);
                console.log(`[Review Submit] Cannot update review - one review per order per product only`);
                
                return res.status(400).json({
                    success: false,
                    error: 'You have already submitted a review for this product in this order. You can add a new review for a different order, but cannot update existing reviews.',
                    code: 'REVIEW_ALREADY_EXISTS',
                    existingReviewId: existingReview.ReviewID
                });
            }
            
            // No existing review - proceed to insert new one
            // NEW RULE: One review per order per product (no updates allowed)
            console.log(`[Review Submit] No existing review found - creating new review for OrderID: ${orderId || 'N/A'}, ProductID: ${productId}`);
            
            // Check if ProductReviews table has the required columns
            const columnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ProductReviews' 
                AND COLUMN_NAME IN ('ReviewerName', 'ReviewerEmail', 'Title', 'ImageURL', 'OrderID')
            `);
            
            let result;
            
            // Build INSERT query based on available columns
            // Always insert new review (never update) - one review per order per product
            const hasImageSupport = columnCheck.recordset.some(col => col.COLUMN_NAME === 'ImageURL');
            const hasExtendedColumns = columnCheck.recordset.length >= 3;
            const hasOrderIdColumn = hasOrderIdColumnInTable; // Use the already checked variable
            
            if (hasExtendedColumns) {
                // Table has extended columns (ReviewerName, ReviewerEmail, Title, etc.)
                if (hasImageSupport && imageUrls.length > 0) {
                    // Has image support - include image columns
                    const insertColumns = hasOrderIdColumn && orderId 
                        ? '(ProductID, CustomerID, OrderID, ReviewerName, ReviewerEmail, Rating, Title, Comment, ImageURL, ImageURLs, CreatedAt, UpdatedAt, IsActive, HelpfulCount)'
                        : '(ProductID, CustomerID, ReviewerName, ReviewerEmail, Rating, Title, Comment, ImageURL, ImageURLs, CreatedAt, UpdatedAt, IsActive, HelpfulCount)';
                    
                    const insertValues = hasOrderIdColumn && orderId
                        ? '(@productId, @customerId, @orderId, @reviewerName, @reviewerEmail, @rating, @title, @comment, @imageUrl, @imageUrls, GETDATE(), GETDATE(), 1, 0)'
                        : '(@productId, @customerId, @reviewerName, @reviewerEmail, @rating, @title, @comment, @imageUrl, @imageUrls, GETDATE(), GETDATE(), 1, 0)';
                    
                    const request = pool.request()
                        .input('productId', sql.Int, productId)
                        .input('customerId', sql.Int, parseInt(customerId))
                        .input('rating', sql.Int, rating)
                        .input('comment', sql.NVarChar, comment.trim())
                        .input('reviewerName', sql.NVarChar, name.trim())
                        .input('reviewerEmail', sql.NVarChar, email.trim())
                        .input('title', sql.NVarChar, title.trim())
                        .input('imageUrl', sql.NVarChar, imageUrls.length > 0 ? imageUrls[0] : null)
                        .input('imageUrls', sql.NVarChar, imageUrlString);
                    
                    if (hasOrderIdColumn && orderId) {
                        request.input('orderId', sql.Int, orderId);
                    }
                    
                    result = await request.query(`
                        INSERT INTO ProductReviews ${insertColumns}
                        OUTPUT INSERTED.*
                        VALUES ${insertValues}
                    `);
                } else {
                    // No image support - exclude image columns
                    const insertColumns = hasOrderIdColumn && orderId
                        ? '(ProductID, CustomerID, OrderID, ReviewerName, ReviewerEmail, Rating, Title, Comment, CreatedAt, UpdatedAt, IsActive, HelpfulCount)'
                        : '(ProductID, CustomerID, ReviewerName, ReviewerEmail, Rating, Title, Comment, CreatedAt, UpdatedAt, IsActive, HelpfulCount)';
                    
                    const insertValues = hasOrderIdColumn && orderId
                        ? '(@productId, @customerId, @orderId, @reviewerName, @reviewerEmail, @rating, @title, @comment, GETDATE(), GETDATE(), 1, 0)'
                        : '(@productId, @customerId, @reviewerName, @reviewerEmail, @rating, @title, @comment, GETDATE(), GETDATE(), 1, 0)';
                    
                    const request = pool.request()
                        .input('productId', sql.Int, productId)
                        .input('customerId', sql.Int, parseInt(customerId))
                        .input('reviewerName', sql.NVarChar, name.trim())
                        .input('reviewerEmail', sql.NVarChar, email.trim())
                        .input('rating', sql.Int, rating)
                        .input('title', sql.NVarChar, title.trim())
                        .input('comment', sql.NVarChar, comment.trim());
                    
                    if (hasOrderIdColumn && orderId) {
                        request.input('orderId', sql.Int, orderId);
                    }
                    
                    result = await request.query(`
                        INSERT INTO ProductReviews ${insertColumns}
                        OUTPUT INSERTED.*
                        VALUES ${insertValues}
                    `);
                }
            } else {
                // Use basic columns only (no ReviewerName, ReviewerEmail, Title)
                const insertColumns = hasOrderIdColumn && orderId
                    ? '(ProductID, CustomerID, OrderID, Rating, Comment, CreatedAt, UpdatedAt, IsActive, HelpfulCount)'
                    : '(ProductID, CustomerID, Rating, Comment, CreatedAt, UpdatedAt, IsActive, HelpfulCount)';
                
                const insertValues = hasOrderIdColumn && orderId
                    ? '(@productId, @customerId, @orderId, @rating, @comment, GETDATE(), GETDATE(), 1, 0)'
                    : '(@productId, @customerId, @rating, @comment, GETDATE(), GETDATE(), 1, 0)';
                
                const request = pool.request()
                    .input('productId', sql.Int, productId)
                    .input('customerId', sql.Int, parseInt(customerId))
                    .input('rating', sql.Int, rating)
                    .input('comment', sql.NVarChar, `${title.trim()}\n\n${comment.trim()}`);
                
                if (hasOrderIdColumn && orderId) {
                    request.input('orderId', sql.Int, orderId);
                }
                
                result = await request.query(`
                    INSERT INTO ProductReviews ${insertColumns}
                    OUTPUT INSERTED.*
                    VALUES ${insertValues}
                `);
            }
            
            // Review inserted successfully (never updated - one review per order per product)
            const savedReview = result.recordset[0];
            const savedReviewID = savedReview.ReviewID || savedReview.id;
            const savedProductID = savedReview.ProductID || productId;
            const savedIsActive = savedReview.IsActive !== undefined ? savedReview.IsActive : (savedReview.isActive !== undefined ? savedReview.isActive : null);
            
            const action = 'inserted';
            console.log(`[POST Review] ========== REVIEW ${action.toUpperCase()} SUCCESSFULLY ==========`);
            console.log(`  ReviewID: ${savedReviewID || 'N/A'}`);
            console.log(`  ProductID: ${savedProductID}`);
            console.log(`  CustomerID: ${savedReview.CustomerID}`);
            console.log(`  Rating: ${savedReview.Rating || savedReview.rating || 'N/A'}`);
            console.log(`  IsActive: ${savedIsActive} (from OUTPUT INSERTED)`);
            console.log(`  CreatedAt: ${savedReview.CreatedAt || savedReview.createdAt || 'N/A'}`);
            console.log(`  UpdatedAt: ${savedReview.UpdatedAt || savedReview.updatedAt || 'N/A'}`);
            
            // CRITICAL: Ensure IsActive is 1 - fix immediately if not
            // Double-check by querying the database directly
            const immediateCheck = await pool.request()
                .input('reviewId', sql.Int, savedReviewID)
                .query(`SELECT ReviewID, IsActive FROM ProductReviews WHERE ReviewID = @reviewId`);
            
            if (immediateCheck.recordset.length > 0) {
                const actualIsActive = immediateCheck.recordset[0].IsActive;
                // Convert boolean to number for comparison (SQL Server returns boolean as 1/0 or true/false)
                const isActiveValue = actualIsActive === true || actualIsActive === 1 || actualIsActive === '1' || actualIsActive === 'true';
                console.log(`[POST Review] Immediate DB check - ReviewID ${savedReviewID} has IsActive=${actualIsActive} (type: ${typeof actualIsActive}, converted: ${isActiveValue})`);
                
                if (!isActiveValue) {
                    console.error(`[POST Review] ⚠️ CRITICAL - Review ${action} but IsActive=${actualIsActive} in DB! Fixing immediately...`);
                    try {
                        await pool.request()
                            .input('reviewId', sql.Int, savedReviewID)
                            .query(`UPDATE ProductReviews SET IsActive = 1 WHERE ReviewID = @reviewId`);
                        console.log(`[POST Review] ✓ Fixed IsActive to 1 for ReviewID=${savedReviewID}`);
                        
                        // Verify fix worked
                        const verifyFix = await pool.request()
                            .input('reviewId', sql.Int, savedReviewID)
                            .query(`SELECT IsActive FROM ProductReviews WHERE ReviewID = @reviewId`);
                        if (verifyFix.recordset.length > 0) {
                            const fixedValue = verifyFix.recordset[0].IsActive;
                            const fixedValueConverted = fixedValue === true || fixedValue === 1 || fixedValue === '1' || fixedValue === 'true';
                            console.log(`[POST Review] ✓ Verified fix - IsActive is now ${fixedValue} (active: ${fixedValueConverted})`);
                        }
                    } catch (fixError) {
                        console.error(`[POST Review] ✗ Failed to fix IsActive:`, fixError.message);
                    }
                } else {
                    console.log(`[POST Review] ✓ IsActive is already 1/true in database`);
                }
            }
            
            // Wait a moment for the transaction to commit
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify the review can be retrieved immediately with IsActive = 1
            try {
                // First, check all reviews for this product to see what's in the database
                const allReviewsCheck = await pool.request()
                    .input('productId', sql.Int, savedProductID)
                    .query(`
                        SELECT ReviewID, ProductID, CustomerID, Rating, IsActive, CreatedAt, UpdatedAt
                        FROM ProductReviews
                        WHERE ProductID = @productId
                        ORDER BY CreatedAt DESC
                    `);
                
                console.log(`[POST Review] Total reviews in DB for ProductID ${savedProductID}: ${allReviewsCheck.recordset.length}`);
                allReviewsCheck.recordset.forEach((r, idx) => {
                    console.log(`[POST Review] Review ${idx + 1}: ReviewID=${r.ReviewID}, CustomerID=${r.CustomerID}, IsActive=${r.IsActive}, CreatedAt=${r.CreatedAt}`);
                });
                
                // Now check if our review can be retrieved with IsActive = 1
                const verificationQuery = await pool.request()
                    .input('productId', sql.Int, savedProductID)
                    .input('reviewId', sql.Int, savedReviewID)
                    .query(`
                        SELECT pr.ReviewID, pr.ProductID, pr.CustomerID, pr.Rating, pr.IsActive, pr.CreatedAt, pr.UpdatedAt,
                            COALESCE(pr.ReviewerName, c.FullName, 'Anonymous') AS customerName
                        FROM ProductReviews pr
                        LEFT JOIN Customers c ON pr.CustomerID = c.CustomerID
                        WHERE pr.ProductID = @productId AND pr.ReviewID = @reviewId AND pr.IsActive = 1
                    `);
                
                if (verificationQuery.recordset.length > 0) {
                    console.log(`[POST Review] ✓✓✓ VERIFICATION SUCCESSFUL - review can be retrieved with IsActive=1`);
                    console.log(`[POST Review] Verified review: ReviewID=${verificationQuery.recordset[0].ReviewID}, IsActive=${verificationQuery.recordset[0].IsActive}, CustomerName=${verificationQuery.recordset[0].customerName}`);
                } else {
                    console.error(`[POST Review] ✗✗✗ VERIFICATION FAILED - Review was ${action} but cannot be retrieved with IsActive=1!`);
                    
                    // Check if review exists but IsActive is 0 or NULL
                    const checkInactiveQuery = await pool.request()
                        .input('productId', sql.Int, savedProductID)
                        .input('reviewId', sql.Int, savedReviewID)
                        .query(`
                            SELECT pr.ReviewID, pr.ProductID, pr.CustomerID, pr.Rating, pr.IsActive, pr.CreatedAt, pr.UpdatedAt
                            FROM ProductReviews pr
                            WHERE pr.ProductID = @productId AND pr.ReviewID = @reviewId
                        `);
                    
                    if (checkInactiveQuery.recordset.length > 0) {
                        const review = checkInactiveQuery.recordset[0];
                        const isActiveValue = review.IsActive === true || review.IsActive === 1 || review.IsActive === '1' || review.IsActive === 'true';
                        console.error(`[POST Review] Review exists in DB but IsActive=${review.IsActive} (type: ${typeof review.IsActive}, active: ${isActiveValue})`);
                        
                        if (!isActiveValue) {
                            // Force fix IsActive to 1
                            console.error(`[POST Review] Attempting to force fix IsActive to 1...`);
                            try {
                                const fixResult = await pool.request()
                                    .input('reviewId', sql.Int, savedReviewID)
                                    .query(`UPDATE ProductReviews SET IsActive = 1 WHERE ReviewID = @reviewId`);
                                
                                console.log(`[POST Review] ✓ Force fix completed for ReviewID=${savedReviewID}`);
                                
                                // Verify again after fix
                                await new Promise(resolve => setTimeout(resolve, 200));
                                const recheckQuery = await pool.request()
                                    .input('productId', sql.Int, savedProductID)
                                    .input('reviewId', sql.Int, savedReviewID)
                                    .query(`
                                        SELECT pr.ReviewID, pr.ProductID, pr.CustomerID, pr.Rating, pr.IsActive, pr.CreatedAt, pr.UpdatedAt
                                        FROM ProductReviews pr
                                        WHERE pr.ProductID = @productId AND pr.ReviewID = @reviewId AND pr.IsActive = 1
                                    `);
                                
                                if (recheckQuery.recordset.length > 0) {
                                    console.log(`[POST Review] ✓✓✓ After fix: Review can now be retrieved with IsActive=1`);
                                } else {
                                    console.error(`[POST Review] ✗✗✗ After fix: Review STILL cannot be retrieved with IsActive=1!`);
                                }
                            } catch (fixError) {
                                console.error(`[POST Review] Error fixing IsActive:`, fixError.message);
                            }
                        } else {
                            console.log(`[POST Review] Review IsActive is already true/1, but query didn't find it. Checking query logic...`);
                        }
                    } else {
                        console.error(`[POST Review] ✗✗✗ CRITICAL - Review was ${action} but cannot be found in database at all!`);
                    }
                }
                
                console.log(`[POST Review] ===================================================`);
            } catch (verifyError) {
                console.error(`[POST Review] Error verifying review:`, verifyError.message);
                console.error(`[POST Review] Verify error stack:`, verifyError.stack);
            }
            
            res.json({
                success: true,
                review: savedReview,
                message: 'Review submitted successfully!' // All reviews are new submissions (no updates allowed)
            });
        } catch (err) {
            // Error adding product review
            console.error('========== REVIEW SUBMISSION ERROR ==========');
            console.error('Main review submission error:', err);
            console.error('Error message:', err.message);
            console.error('Error code:', err.code);
            console.error('Error number:', err.number);
            console.error('Error stack:', err.stack);
            console.error('Product ID:', req.params.productId);
            console.error('Customer ID:', req.body.customerId);
            console.error('Request body:', JSON.stringify(req.body, null, 2));
            console.error('===========================================');
            
            // Handle multer errors specifically
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'File too large. Maximum size is 5MB per file.' 
                });
            }
            
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Too many files. Maximum 5 files allowed.' 
                });
            }
            
            if (err.message && err.message.includes('Only image files are allowed')) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Only image files are allowed.' 
                });
            }
            
            // Handle SQL errors specifically
            if (err.number) {
                console.error('SQL Error Number:', err.number);
                console.error('SQL Error State:', err.state);
            }
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to add review', 
                details: err.message || 'Unknown error',
                ...(process.env.NODE_ENV === 'development' && { 
                    stack: err.stack,
                    code: err.code,
                    number: err.number
                })
            });
        }
    });

    // Check if user can review a product (has completed purchase)
    router.get('/api/products/:productId/reviews/can-review', async (req, res) => {
        try {
            // Check if it's a UUID first (BEFORE parsing as integer)
            // This prevents UUIDs starting with numbers from being parsed incorrectly
                const productIdStr = String(req.params.productId).trim();
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let productId;
            const customerId = parseInt(req.query.customerId);
                
                if (uuidPattern.test(productIdStr)) {
                    // It's a UUID, look up the actual ProductID
                console.log(`[Can Review] Detected UUID format: ${productIdStr}`);
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.UniqueIdentifier, productIdStr)
                            .query('SELECT ProductID FROM Products WHERE PublicId = @publicId AND IsActive = 1');
                        
                        if (lookupResult.recordset.length === 0) {
                            // Try case-insensitive lookup
                            const lookupResult2 = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                                .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                            
                            if (lookupResult2.recordset.length > 0) {
                                productId = lookupResult2.recordset[0].ProductID;
                            } else {
                                return res.json({
                                    success: true,
                                    canReview: false,
                                    reason: 'Product not found'
                                });
                            }
                        } else {
                            productId = lookupResult.recordset[0].ProductID;
                        }
                    } catch (uuidError) {
                        // If UniqueIdentifier fails, try as NVARCHAR
                        const lookupResult = await pool.request()
                            .input('publicId', sql.NVarChar(255), productIdStr)
                            .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId) AND IsActive = 1');
                        
                        if (lookupResult.recordset.length > 0) {
                            productId = lookupResult.recordset[0].ProductID;
                        } else {
                            return res.json({
                                success: true,
                                canReview: false,
                                reason: 'Product not found'
                            });
                        }
                    }
                } else {
                // Not a UUID, try to parse as integer
                productId = parseInt(productIdStr);
                
                if (isNaN(productId) || productId <= 0) {
                    return res.json({
                        success: true,
                        canReview: false,
                        reason: 'Invalid product ID format'
                    });
                }
                
                console.log(`[Can Review] Using numeric ProductID: ${productId}`);
            }
            
            if (!customerId || isNaN(customerId)) {
                console.log(`[Can Review] Invalid customerId: ${req.query.customerId}`);
                return res.json({
                    success: true,
                    canReview: false,
                    reason: 'Customer ID is required'
                });
            }
            
            // Get orderId from query parameters (if user came from order history)
            const orderId = req.query.orderId ? parseInt(req.query.orderId) : null;
            
            console.log(`[Can Review] Checking: customerId=${customerId}, productId=${productId}, orderId=${orderId || 'N/A'} (original: ${req.params.productId})`);
            
            const hasPurchase = await hasCompletedPurchase(customerId, productId);
            console.log(`[Can Review] Purchase check result: canReview=${hasPurchase}`);
            
            // Check if review already exists for this specific order (if orderId provided)
            let hasReview = false;
            if (hasPurchase && orderId) {
                try {
                    // Check if ProductReviews table has OrderID column
                    const orderIdColumnCheck = await pool.request().query(`
                        SELECT COLUMN_NAME 
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = 'ProductReviews' 
                        AND COLUMN_NAME = 'OrderID'
                    `);
                    const hasOrderIdColumn = orderIdColumnCheck.recordset.length > 0;
                    
                    if (hasOrderIdColumn) {
                        // Check by OrderID + ProductID + CustomerID
                        const reviewCheck = await pool.request()
                            .input('productId', sql.Int, productId)
                            .input('orderId', sql.Int, orderId)
                            .input('customerId', sql.Int, parseInt(customerId))
                            .query(`
                                SELECT ReviewID 
                                FROM ProductReviews
                                WHERE ProductID = @productId 
                                AND OrderID = @orderId 
                                AND CustomerID = @customerId
                            `);
                        
                        hasReview = reviewCheck.recordset.length > 0;
                        console.log(`[Can Review] Review check for OrderID ${orderId}: hasReview=${hasReview}`);
                    } else {
                        // OrderID column doesn't exist - check by CustomerID + ProductID
                        const reviewCheck = await pool.request()
                            .input('productId', sql.Int, productId)
                            .input('customerId', sql.Int, parseInt(customerId))
                            .query(`
                                SELECT ReviewID 
                                FROM ProductReviews
                                WHERE ProductID = @productId 
                                AND CustomerID = @customerId
                            `);
                        
                        hasReview = reviewCheck.recordset.length > 0;
                        console.log(`[Can Review] Review check (no OrderID column): hasReview=${hasReview}`);
                    }
                } catch (reviewCheckError) {
                    console.error('[Can Review] Error checking existing review:', reviewCheckError);
                    // Continue - assume no review exists if check fails
                }
            } else if (hasPurchase && !orderId) {
                // No orderId provided - check if any review exists (backward compatibility)
                try {
                    const reviewCheck = await pool.request()
                        .input('productId', sql.Int, productId)
                        .input('customerId', sql.Int, parseInt(customerId))
                        .query(`
                            SELECT ReviewID 
                            FROM ProductReviews
                            WHERE ProductID = @productId 
                            AND CustomerID = @customerId
                        `);
                    
                    hasReview = reviewCheck.recordset.length > 0;
                    console.log(`[Can Review] Review check (no orderId provided): hasReview=${hasReview}`);
                } catch (reviewCheckError) {
                    console.error('[Can Review] Error checking existing review:', reviewCheckError);
                }
            }
            
            console.log(`[Can Review] Final result: canReview=${hasPurchase}, hasReview=${hasReview}`);
            
            res.json({
                success: true,
                canReview: hasPurchase && !hasReview, // Can review if has purchase AND no review for this order
                hasReview: hasReview,
                reason: !hasPurchase 
                    ? 'Customer has not completed purchase of this product'
                    : hasReview && orderId
                    ? 'You have already reviewed this product for this order'
                    : hasReview
                    ? 'You have already reviewed this product'
                    : 'Customer has completed purchase'
            });
        } catch (error) {
            console.error('Error checking review eligibility:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check review eligibility',
                details: error.message
            });
        }
    });

    // Get review statistics for a product
    router.get('/api/products/:productId/reviews/stats', async (req, res) => {
        try {
                const productIdStr = String(req.params.productId).trim();
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let productId;
                
            // Check if it's a UUID first (BEFORE parsing as integer)
            // This prevents UUIDs starting with numbers from being parsed incorrectly
                if (uuidPattern.test(productIdStr)) {
                    // It's a UUID, look up the actual ProductID
                console.log(`[Review Stats] Detected UUID format: ${productIdStr}`);
                // Note: We don't filter by IsActive here because we want to fetch review stats even if product is inactive
                    try {
                        const lookupResult = await pool.request()
                            .input('publicId', sql.UniqueIdentifier, productIdStr)
                        .query('SELECT ProductID FROM Products WHERE PublicId = @publicId');
                        
                        if (lookupResult.recordset.length === 0) {
                            // Try case-insensitive lookup
                            const lookupResult2 = await pool.request()
                                .input('publicId', sql.NVarChar(255), productIdStr)
                            .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                            
                            if (lookupResult2.recordset.length > 0) {
                                productId = lookupResult2.recordset[0].ProductID;
                            } else {
                            console.log(`[Review Stats] Product not found with UUID ${productIdStr}`);
                                return res.json({
                                    success: true,
                                    stats: {
                                        averageRating: 0,
                                        totalReviews: 0,
                                        ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
                                    }
                                });
                            }
                        } else {
                            productId = lookupResult.recordset[0].ProductID;
                        }
                    } catch (uuidError) {
                        // If UniqueIdentifier fails, try as NVARCHAR
                        const lookupResult = await pool.request()
                            .input('publicId', sql.NVarChar(255), productIdStr)
                        .query('SELECT ProductID FROM Products WHERE LOWER(CAST(PublicId AS NVARCHAR(255))) = LOWER(@publicId)');
                        
                        if (lookupResult.recordset.length > 0) {
                            productId = lookupResult.recordset[0].ProductID;
                        } else {
                        console.log(`[Review Stats] Product not found with UUID ${productIdStr} (fallback)`);
                            return res.json({
                                success: true,
                                stats: {
                                    averageRating: 0,
                                    totalReviews: 0,
                                    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
                                }
                            });
                        }
                    }
                } else {
                // Not a UUID, try to parse as integer
                productId = parseInt(productIdStr);
                
                if (isNaN(productId) || productId <= 0) {
                    console.log(`[Review Stats] Invalid product ID format: ${productIdStr}`);
                    return res.json({
                        success: true,
                        stats: {
                            averageRating: 0,
                            totalReviews: 0,
                            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
                        }
                    });
                }
                
                console.log(`[Review Stats] Using numeric ProductID: ${productId}`);
            }
            
            console.log(`[Review Stats] Fetching stats for ProductID: ${productId} (from ${req.params.productId})`);
            
            // Get review statistics using regular SQL query
            // Only filter reviews by IsActive = 1, not products
            const result = await pool.request()
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT 
                        AVG(CAST(Rating AS FLOAT)) as AverageRating,
                        COUNT(*) as TotalReviews,
                        SUM(CASE WHEN Rating = 5 THEN 1 ELSE 0 END) as FiveStarCount,
                        SUM(CASE WHEN Rating = 4 THEN 1 ELSE 0 END) as FourStarCount,
                        SUM(CASE WHEN Rating = 3 THEN 1 ELSE 0 END) as ThreeStarCount,
                        SUM(CASE WHEN Rating = 2 THEN 1 ELSE 0 END) as TwoStarCount,
                        SUM(CASE WHEN Rating = 1 THEN 1 ELSE 0 END) as OneStarCount
                    FROM ProductReviews 
                    WHERE ProductID = @productId AND IsActive = 1
                `);
            
            console.log(`[Review Stats] Found ${result.recordset[0]?.TotalReviews || 0} active review(s) for ProductID ${productId}`);
            
            const stats = result.recordset[0];
            
            // Format the response
            const response = {
                success: true,
                stats: {
                    averageRating: stats.AverageRating ? Math.round(stats.AverageRating * 10) / 10 : 0,
                    totalReviews: stats.TotalReviews || 0,
                    ratingDistribution: {
                        5: stats.FiveStarCount || 0,
                        4: stats.FourStarCount || 0,
                        3: stats.ThreeStarCount || 0,
                        2: stats.TwoStarCount || 0,
                        1: stats.OneStarCount || 0
                    }
                }
            };
            
            res.json(response);
        } catch (err) {
            console.error('Error fetching review statistics:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch review statistics', 
                details: err.message
            });
        }
    });

    // --- Admin Review Management Endpoints ---
    // Get all reviews for admin management
    router.get('/api/admin/reviews', async (req, res) => {
        try {
            // First check if ProductReviews table exists
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductReviews'
            `);
            
            if (tableCheck.recordset.length === 0) {
                return res.json({
                    success: true,
                    reviews: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalItems: 0,
                        itemsPerPage: 10
                    }
                });
            }
            
            const filter = req.query.filter || 'all';
            const rating = req.query.rating || 'all';
            const search = req.query.search || '';
            const showRejected = req.query.showRejected === 'true';
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;
            
            let whereConditions = [];
            
            // Status filter
            switch (filter) {
                case 'pending':
                    whereConditions.push('pr.IsActive = 0');
                    break;
                case 'approved':
                    whereConditions.push('pr.IsActive = 1');
                    break;
                case 'rejected':
                    whereConditions.push('pr.IsActive = 0');
                    break;
                case 'all':
                default:
                    if (!showRejected) {
                        whereConditions.push('pr.IsActive = 1');
                    }
                    break;
            }
            
            // Rating filter
            if (rating !== 'all') {
                whereConditions.push(`pr.Rating = ${parseInt(rating)}`);
            }
            
            // Search filter
            if (search) {
                whereConditions.push(`(pr.ReviewerName LIKE '%${search}%' OR p.Name LIKE '%${search}%' OR pr.Comment LIKE '%${search}%')`);
            }
            
            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
            
            // Check if ProductReviews table has extended columns
            const columnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ProductReviews' 
                AND COLUMN_NAME IN ('ReviewerName', 'ReviewerEmail', 'Title')
            `);
            
            // First get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM ProductReviews pr
                LEFT JOIN Products p ON pr.ProductID = p.ProductID
                ${whereClause}
            `;
            
            const countResult = await pool.request().query(countQuery);
            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / limit);
            
            let query;
            if (columnCheck.recordset.length >= 3) {
                // Extended table with additional columns
                query = `
                    SELECT 
                        pr.ReviewID,
                        pr.ProductID,
                        pr.CustomerID,
                        pr.ReviewerName,
                        pr.ReviewerEmail,
                        pr.Rating,
                        pr.Title,
                        pr.Comment,
                        pr.CreatedAt as ReviewDate,
                        pr.IsActive,
                        0 as IsFlagged,
                        p.Name as ProductName
                    FROM ProductReviews pr
                    LEFT JOIN Products p ON pr.ProductID = p.ProductID
                    ${whereClause}
                    ORDER BY pr.CreatedAt DESC
                    OFFSET ${offset} ROWS
                    FETCH NEXT ${limit} ROWS ONLY
                `;
            } else {
                // Basic table structure
                query = `
                    SELECT 
                        pr.ReviewID,
                        pr.ProductID,
                        pr.CustomerID,
                        'Anonymous' as ReviewerName,
                        '' as ReviewerEmail,
                        pr.Rating,
                        'Review' as Title,
                        pr.Comment,
                        pr.CreatedAt as ReviewDate,
                        pr.IsActive,
                        0 as IsFlagged,
                        p.Name as ProductName
                    FROM ProductReviews pr
                    LEFT JOIN Products p ON pr.ProductID = p.ProductID
                    ${whereClause}
                    ORDER BY pr.CreatedAt DESC
                    OFFSET ${offset} ROWS
                    FETCH NEXT ${limit} ROWS ONLY
                `;
            }
            
            const result = await pool.request().query(query);
            
            res.json({
                success: true,
                reviews: result.recordset,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: total,
                    itemsPerPage: limit
                }
            });
        } catch (error) {
            console.error('Error fetching admin reviews:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch reviews',
                details: error.message
            });
        }
    });
    
    // Toggle review status (approve/reject)
    router.post('/api/admin/reviews/:reviewId/toggle', async (req, res) => {
        try {
            const reviewId = parseInt(req.params.reviewId);
            const { isActive } = req.body;
            
            await pool.request()
                .input('reviewId', sql.Int, reviewId)
                .input('isActive', sql.Bit, isActive)
                .query(`
                    UPDATE ProductReviews 
                    SET IsActive = @isActive 
                    WHERE ReviewID = @reviewId
                `);
            
            res.json({
                success: true,
                message: `Review ${isActive ? 'approved' : 'rejected'} successfully`
            });
        } catch (error) {
            console.error('Error toggling review status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update review status',
                details: error.message
            });
        }
    });
    
    // Delete review
    router.delete('/api/admin/reviews/:reviewId', async (req, res) => {
        try {
            const reviewId = parseInt(req.params.reviewId);
            
            await pool.request()
                .input('reviewId', sql.Int, reviewId)
                .query(`
                    DELETE FROM ProductReviews 
                    WHERE ReviewID = @reviewId
                `);
            
            res.json({
                success: true,
                message: 'Review deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting review:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete review',
                details: error.message
            });
        }
    });

    // --- Test endpoint to verify sold quantities ---
    router.get('/api/test/sold-quantities', async (req, res) => {
        try {
            await pool.connect();
            
            // Test query to check sold quantities calculation
            const testQuery = `
                SELECT 
                    p.ProductID,
                    p.Name,
                    p.StockQuantity,
                    COALESCE(sold.soldQuantity, 0) as soldQuantity,
                    sold.orderCount
                FROM Products p
                LEFT JOIN (
                    SELECT 
                        cat.CatalogProductID AS ProductID,
                        SUM(oi.Quantity) AS soldQuantity,
                        COUNT(DISTINCT oi.OrderID) AS orderCount
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
                ORDER BY sold.soldQuantity DESC, p.Name
            `;
            
            const result = await pool.request().query(testQuery);
            
            // Also get completed orders count
            const completedOrdersQuery = `
                SELECT COUNT(*) as completedOrdersCount
                FROM Orders 
                WHERE Status IN (N'Completed', N'Delivered', N'Received')
            `;
            const completedOrdersResult = await pool.request().query(completedOrdersQuery);
            
            res.json({
                success: true,
                soldQuantities: result.recordset,
                completedOrdersCount: completedOrdersResult.recordset[0].completedOrdersCount,
                message: 'Sold quantities test data retrieved successfully'
            });
        } catch (err) {
            console.error('Error testing sold quantities:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to test sold quantities', 
                details: err.message 
            });
        }
    });

    // --- Products API for Frontend ---
    // Get all products
    router.get('/api/products', async (req, res) => {
        try {
            // First check if ProductReviews table exists
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductReviews'
            `);
            
            // Also check if ProductDiscounts table exists
            const discountTableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductDiscounts'
            `);
            
            // Check if IsFeatured column exists
            const featuredColumnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'IsFeatured'
            `);
            
            console.log('ProductReviews table exists:', tableCheck.recordset.length > 0);
            console.log('ProductDiscounts table exists:', discountTableCheck.recordset.length > 0);
            console.log('IsFeatured column exists:', featuredColumnCheck.recordset.length > 0);
            
            let query;
            const hasIsFeatured = featuredColumnCheck.recordset.length > 0;
            
            if (tableCheck.recordset.length > 0) {
                // ProductReviews table exists, use the full query with ratings and discounts
                query = `
                    SELECT 
                        p.ProductID as id,
                        p.PublicId as publicId,
                        p.Slug as slug,
                        p.SKU as sku,
                        p.Name as name,
                        p.Description as description,
                        p.Price as price,
                        p.StockQuantity as stockQuantity,
                        -- Calculate available stock (actual - pending orders)
                        p.StockQuantity - ISNULL((
                            SELECT SUM(oi.Quantity)
                            FROM OrderItems oi
                            INNER JOIN Orders o ON oi.OrderID = o.OrderID
                            WHERE oi.ProductID = p.ProductID
                            AND o.Status = 'Pending'
                        ), 0) as availableStock,
                        p.Category as categoryName,
                        p.ImageURL as images,
                        ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                        p.DateAdded as dateAdded,
                        p.IsActive as isActive,
                        p.Dimensions as specifications,
                        p.IsFeatured as featured,
                        p.Model3DURL as model3d,
                        p.Has3DModel as has3dModel,
                        COALESCE(AVG(CAST(pr.Rating AS FLOAT)), 0) as averageRating,
                        COUNT(pr.ReviewID) as reviewCount,
                        pd.DiscountID,
                        pd.DiscountType,
                        pd.DiscountValue,
                        pd.StartDate as discountStartDate,
                        pd.EndDate as discountEndDate,
                        COALESCE(sold.soldQuantity, 0) as soldQuantity,
                        CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price - (p.Price * pd.DiscountValue / 100)
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                            ELSE p.Price
                        END as discountedPrice,
                        CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price * pd.DiscountValue / 100
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                            ELSE 0
                        END as discountAmount
                    FROM Products p
                    LEFT JOIN ProductReviews pr ON p.ProductID = pr.ProductID AND pr.IsActive = 1
                    LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                        AND pd.IsActive = 1 
                        AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
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
                    GROUP BY 
                        p.ProductID, p.PublicId, p.Slug, p.SKU, p.Name, p.Description, p.Price, p.StockQuantity, 
                        p.Category, p.ImageURL, ISNULL(p.ThumbnailURLs, '[]'), p.DateAdded, p.IsActive, p.Dimensions, p.IsFeatured,
                        p.Model3DURL, p.Has3DModel,
                        pd.DiscountID, pd.DiscountType, pd.DiscountValue, pd.StartDate, pd.EndDate,
                        sold.soldQuantity
                    ORDER BY p.IsFeatured DESC, p.DateAdded DESC
                `;
            } else {
                // ProductReviews table doesn't exist, use basic query with discounts
                query = `
                    SELECT 
                        p.ProductID as id,
                        p.PublicId as publicId,
                        p.Slug as slug,
                        p.SKU as sku,
                        p.Name as name,
                        p.Description as description,
                        p.Price as price,
                        p.StockQuantity as stockQuantity,
                        -- Calculate available stock (actual - pending orders)
                        p.StockQuantity - ISNULL((
                            SELECT SUM(oi.Quantity)
                            FROM OrderItems oi
                            INNER JOIN Orders o ON oi.OrderID = o.OrderID
                            WHERE oi.ProductID = p.ProductID
                            AND o.Status = 'Pending'
                        ), 0) as availableStock,
                        p.Category as categoryName,
                        p.ImageURL as images,
                        ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                        p.DateAdded as dateAdded,
                        p.IsActive as isActive,
                        p.Dimensions as specifications,
                        p.IsFeatured as featured,
                        p.Model3DURL as model3d,
                        p.Has3DModel as has3dModel,
                        0 as averageRating,
                        0 as reviewCount,
                        pd.DiscountID,
                        pd.DiscountType,
                        pd.DiscountValue,
                        pd.StartDate as discountStartDate,
                        pd.EndDate as discountEndDate,
                        COALESCE(sold.soldQuantity, 0) as soldQuantity,
                        CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price - (p.Price * pd.DiscountValue / 100)
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                            ELSE p.Price
                        END as discountedPrice,
                        CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price * pd.DiscountValue / 100
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                            ELSE 0
                        END as discountAmount
                    FROM Products p
                    LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                        AND pd.IsActive = 1 
                        AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
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
                    ORDER BY p.IsFeatured DESC, p.DateAdded DESC
                `;
            }
            
            console.log('Executing query:', query.substring(0, 100) + '...');
            console.log('Query includes soldQuantity:', query.includes('soldQuantity'));
            console.log('Full query:', query);
            
            let result;
            try {
                result = await pool.request().query(query);
                console.log('Query executed successfully. Records returned:', result.recordset.length);
                console.log('First product sample:', result.recordset[0]);
                console.log('First product keys:', Object.keys(result.recordset[0] || {}));
            } catch (queryError) {
                console.error('Complex query failed, trying simple fallback:', queryError.message);
                
                // Fallback to simple query without discounts
                const fallbackQuery = `
                    SELECT 
                        p.ProductID as id,
                        p.PublicId as publicId,
                        p.Slug as slug,
                        p.SKU as sku,
                        p.Name as name,
                        p.Description as description,
                        p.Price as price,
                        p.StockQuantity as stockQuantity,
                        -- Calculate available stock (actual - pending orders)
                        p.StockQuantity - ISNULL((
                            SELECT SUM(oi.Quantity)
                            FROM OrderItems oi
                            INNER JOIN Orders o ON oi.OrderID = o.OrderID
                            WHERE oi.ProductID = p.ProductID
                            AND o.Status = 'Pending'
                        ), 0) as availableStock,
                        p.Category as categoryName,
                        p.ImageURL as images,
                        p.DateAdded as dateAdded,
                        p.IsActive as isActive,
                        p.Dimensions as specifications,
                        p.IsFeatured as featured,
                        p.Model3DURL as model3d,
                        p.Has3DModel as has3dModel,
                        COALESCE(sold.soldQuantity, 0) as soldQuantity,
                        0 as averageRating,
                        0 as reviewCount,
                        NULL as DiscountID,
                        NULL as DiscountType,
                        NULL as DiscountValue,
                        NULL as discountStartDate,
                        NULL as discountEndDate,
                        p.Price as discountedPrice,
                        0 as discountAmount
                    FROM Products p
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
                    ORDER BY p.IsFeatured DESC, p.DateAdded DESC
                `;
                
                console.log('Executing fallback query...');
                result = await pool.request().query(fallbackQuery);
                console.log('Fallback query executed. Records returned:', result.recordset.length);
            }
            
            // Process images - convert single image URL to array
            console.log('First product before processing:', result.recordset[0]);
            console.log('First product soldQuantity:', result.recordset[0]?.soldQuantity);
            const products = result.recordset.map(product => {
                let specifications = {};
                
                // Safely parse specifications JSON
                if (product.specifications && product.specifications.trim()) {
                    try {
                        specifications = JSON.parse(product.specifications);
                    } catch (parseError) {
                        console.warn(`Failed to parse specifications for product ${product.id}:`, parseError.message);
                        // If JSON parsing fails, try to create a basic specification object
                        specifications = {
                            dimensions: product.specifications,
                            note: 'Specifications data may be incomplete'
                        };
                    }
                }
                
                // Process discount information
                const hasDiscount = product.DiscountID && product.DiscountType && product.DiscountValue;
                const discountInfo = hasDiscount ? {
                    discountId: product.DiscountID,
                    discountType: product.DiscountType,
                    discountValue: product.DiscountValue,
                    startDate: product.discountStartDate,
                    endDate: product.discountEndDate,
                    discountedPrice: product.discountedPrice,
                    discountAmount: product.discountAmount
                } : null;

                // Process thumbnails - support multiple formats (JSON array string, single string, comma-separated)
                console.log(`Processing thumbnails for product ${product.id}:`, product.thumbnails);
                let thumbnails = [];
                if (product.thumbnails && String(product.thumbnails).trim()) {
                    const raw = String(product.thumbnails).trim();
                    // If it's already an array (some drivers may return arrays), use it
                    if (Array.isArray(product.thumbnails)) {
                        thumbnails = product.thumbnails;
                    } else {
                        // Try JSON parse first (expected format)
                        try {
                            const parsed = JSON.parse(raw);
                            if (Array.isArray(parsed)) {
                                thumbnails = parsed;
                            } else if (typeof parsed === 'string' && parsed.trim()) {
                                thumbnails = [parsed];
                            }
                        } catch (parseError) {
                            // Fallbacks: comma-separated list or single path
                            try {
                                if (raw.includes(',')) {
                                    thumbnails = raw.split(',').map(s => s.trim()).filter(Boolean);
                                } else {
                                    thumbnails = [raw];
                                }
                            } catch (e) {
                                console.warn(`Failed to coerce thumbnails for product ${product.id}:`, e.message);
                                thumbnails = [];
                            }
                        }
                    }
                }

                return mapProductRecordAssetUrls({
                    ...product,
                    images: product.images ? [product.images] : [],
                    thumbnails: thumbnails,
                    specifications: specifications,
                    rating: Math.round(product.averageRating * 10) / 10,
                    reviews: product.reviewCount || 0,
                    soldQuantity: Number(product.soldQuantity ?? product.soldquantity ?? 0) || 0,
                    hasDiscount: !!hasDiscount,
                    discountInfo: discountInfo
                });
            });
            
            console.log('Products processed successfully. Final count:', products.length);
            
            res.json({
                success: true,
                products: products
            });
        } catch (err) {
            console.error('Error fetching products:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch products', 
                details: err.message 
            });
        }
    });

    // Simple test endpoint to check basic products
    router.get('/api/products/test', async (req, res) => {
        try {
            console.log('Testing basic products query...');
            
            // Simple query to check if Products table has data
            const result = await pool.request().query(`
                SELECT TOP 5
                    ProductID as id,
                    Name as name,
                    Price as price,
                    Category as categoryName,
                    IsActive as isActive
                FROM Products
            `);
            
            console.log('Basic test query returned:', result.recordset.length, 'records');
            
            res.json({
                success: true,
                message: 'Basic products test successful',
                count: result.recordset.length,
                sample: result.recordset[0] || null
            });
        } catch (err) {
            console.error('Basic products test failed:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Basic products test failed', 
                details: err.message 
            });
        }
    });

    // Setup thumbnails endpoint - adds ThumbnailURLs column and test data
    router.post('/api/setup-thumbnails', async (req, res) => {
        try {
            await pool.connect();
            
            // Add ThumbnailURLs column if it doesn't exist
            console.log('Adding ThumbnailURLs column...');
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'ThumbnailURLs')
                ALTER TABLE Products ADD ThumbnailURLs NVARCHAR(MAX) NULL;
            `);
            
            // Add test thumbnail data to the first product
            const testThumbnails = [
                '/uploads/test-thumbnail-1.jpg',
                '/uploads/test-thumbnail-2.jpg',
                '/uploads/test-thumbnail-3.jpg',
                '/uploads/test-thumbnail-4.jpg'
            ];
            
            console.log('Adding test thumbnail data...');
            await pool.request()
                .input('thumbnails', sql.NVarChar, JSON.stringify(testThumbnails))
                .query(`
                    UPDATE TOP (1) Products 
                    SET ThumbnailURLs = @thumbnails 
                    WHERE IsActive = 1
                `);
            
            res.json({
                success: true,
                message: 'ThumbnailURLs column added and test data inserted',
                testThumbnails: testThumbnails
            });
            
        } catch (err) {
            console.error('Error setting up thumbnails:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to setup thumbnails', 
                details: err.message 
            });
        }
    });

    // Search products
    router.get('/api/products/search', async (req, res) => {
        try {
            const { q: query, category, minPrice, maxPrice, featured } = req.query;
            
            if (!query || query.trim().length < 1) {
                return res.json({
                    success: true,
                    products: []
                });
            }
            
            await pool.connect();
            
            let sqlQuery = `
                SELECT 
                    ProductID as id,
                    Name as name,
                    Description as description,
                    Price as price,
                    StockQuantity as stockQuantity,
                    Category as categoryName,
                    ImageURL as images,
                    DateAdded as dateAdded,
                    IsActive as isActive,
                    Dimensions as specifications,
                    IsFeatured as featured,
                    Model3DURL as model3d,
                    Has3DModel as has3dModel
                FROM Products 
                WHERE IsActive = 1
            `;
            
            // Add search conditions - case-insensitive search
            const searchTerm = query.trim().toLowerCase();
            const searchPattern = `%${searchTerm}%`;
            const categoryStartPattern = `${searchTerm}%`;
            
            sqlQuery += ` AND (
                LOWER(Name) LIKE @searchPattern 
                OR LOWER(Description) LIKE @searchPattern 
                OR LOWER(Category) LIKE @searchPattern
                OR LOWER(Category) LIKE @categoryStartPattern
            )`;
            
            // Create request object early to add conditional parameters
            const request = pool.request();
            
            // Add category filter
            if (category) {
                sqlQuery += ` AND Category = @category`;
                request.input('category', sql.NVarChar, category);
            }
            
            // Add price range filter
            if (minPrice) {
                sqlQuery += ` AND Price >= @minPrice`;
                request.input('minPrice', sql.Decimal(18, 2), parseFloat(minPrice));
            }
            
            if (maxPrice) {
                sqlQuery += ` AND Price <= @maxPrice`;
                request.input('maxPrice', sql.Decimal(18, 2), parseFloat(maxPrice));
            }
            
            // Add featured filter
            if (featured === 'true') {
                sqlQuery += ` AND IsFeatured = 1`;
            }
            
            // Add ordering - prioritize exact matches and category matches
            sqlQuery += ` ORDER BY 
                CASE 
                    WHEN LOWER(Name) = @searchTerm THEN 1
                    WHEN LOWER(Name) LIKE @categoryStartPattern THEN 2
                    WHEN LOWER(Category) = @searchTerm THEN 3
                    WHEN LOWER(Category) LIKE @categoryStartPattern THEN 4
                    WHEN LOWER(Name) LIKE @searchPattern THEN 5
                    ELSE 6
                END,
                IsFeatured DESC,
                DateAdded DESC
            `;
            
            // Limit results for search suggestions
            sqlQuery += ` OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY`;
            
            // Set search parameters (always required)
            request.input('searchTerm', sql.NVarChar, searchTerm);
            request.input('searchPattern', sql.NVarChar, searchPattern);
            request.input('categoryStartPattern', sql.NVarChar, categoryStartPattern);
            
            console.log(`[Product Search] Searching for: "${searchTerm}"`);
            const result = await request.query(sqlQuery);
            console.log(`[Product Search] Found ${result.recordset.length} product(s)`);
            
            // Process images - convert single image URL to array
            const products = result.recordset.map(product => {
                let specifications = {};
                
                // Safely parse specifications JSON
                if (product.specifications && product.specifications.trim()) {
                    try {
                        specifications = JSON.parse(product.specifications);
                    } catch (parseError) {
                        console.warn(`Failed to parse specifications for product ${product.id}:`, parseError.message);
                        specifications = {
                            dimensions: product.specifications,
                            note: 'Specifications data may be incomplete'
                        };
                    }
                }
                
                return mapProductRecordAssetUrls({
                    ...product,
                    images: product.images ? [product.images] : [],
                    specifications: specifications,
                    thumbnails: []
                });
            });
            
            res.json({
                success: true,
                products: products,
                query: query,
                total: products.length
            });
            
        } catch (err) {
            console.error('Error searching products:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to search products', 
                details: err.message 
            });
        }
    });

    // Get product by ID (supports UUID, slug, and legacy numeric ID for backward compatibility)
    router.get('/api/products/:id', async (req, res) => {
        try {
            const identifier = req.params.id;
            
            // Determine if identifier is UUID, slug, SKU, or legacy numeric ID
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
            const isNumeric = /^\d+$/.test(identifier);
            const isSKU = /^DX-[A-F0-9]{8}-[0-9]{4}$/i.test(identifier);
            
            // First check if ProductReviews table exists
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductReviews'
            `);
            
            let query, inputParam;
            if (isUUID) {
                inputParam = sql.UniqueIdentifier;
                if (tableCheck.recordset.length > 0) {
                    // ProductReviews table exists, use the full query with ratings
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel,
                            COALESCE(AVG(CAST(pr.Rating AS FLOAT)), 0) as averageRating,
                            COUNT(pr.ReviewID) as reviewCount,
                            pd.DiscountID,
                            pd.DiscountType,
                            pd.DiscountValue,
                            pd.StartDate as discountStartDate,
                            pd.EndDate as discountEndDate,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price - (p.Price * pd.DiscountValue / 100)
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                                ELSE p.Price
                            END as discountedPrice,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price * pd.DiscountValue / 100
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                                ELSE 0
                            END as discountAmount
                        FROM Products p
                        LEFT JOIN ProductReviews pr ON p.ProductID = pr.ProductID AND pr.IsActive = 1
                        LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                            AND pd.IsActive = 1 
                            AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
                        WHERE p.PublicId = @identifier AND p.IsActive = 1
                        GROUP BY 
                            p.ProductID, p.PublicId, p.Slug, p.SKU, p.Name, p.Description, p.Price, p.StockQuantity, 
                            p.Category, p.ImageURL, ISNULL(p.ThumbnailURLs, '[]'), p.DateAdded, p.IsActive, p.Dimensions, p.IsFeatured,
                            p.Model3DURL, p.Has3DModel,
                            pd.DiscountID, pd.DiscountType, pd.DiscountValue, pd.StartDate, pd.EndDate
                    `;
                } else {
                    // ProductReviews table doesn't exist, use basic query
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel
                        FROM Products p
                        WHERE p.PublicId = @identifier AND p.IsActive = 1
                    `;
                }
            } else if (isNumeric) {
                // Legacy support for numeric IDs - map to ProductID
                inputParam = sql.Int;
                if (tableCheck.recordset.length > 0) {
                    // ProductReviews table exists, use the full query with ratings
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel,
                            COALESCE(AVG(CAST(pr.Rating AS FLOAT)), 0) as averageRating,
                            COUNT(pr.ReviewID) as reviewCount,
                            pd.DiscountID,
                            pd.DiscountType,
                            pd.DiscountValue,
                            pd.StartDate as discountStartDate,
                            pd.EndDate as discountEndDate,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price - (p.Price * pd.DiscountValue / 100)
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                                ELSE p.Price
                            END as discountedPrice,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price * pd.DiscountValue / 100
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                                ELSE 0
                            END as discountAmount
                        FROM Products p
                        LEFT JOIN ProductReviews pr ON p.ProductID = pr.ProductID AND pr.IsActive = 1
                        LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                            AND pd.IsActive = 1 
                            AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
                        WHERE p.ProductID = @identifier AND p.IsActive = 1
                        GROUP BY 
                            p.ProductID, p.PublicId, p.Slug, p.SKU, p.Name, p.Description, p.Price, p.StockQuantity, 
                            p.Category, p.ImageURL, ISNULL(p.ThumbnailURLs, '[]'), p.DateAdded, p.IsActive, p.Dimensions, p.IsFeatured,
                            p.Model3DURL, p.Has3DModel,
                            pd.DiscountID, pd.DiscountType, pd.DiscountValue, pd.StartDate, pd.EndDate
                    `;
                } else {
                    // ProductReviews table doesn't exist, use basic query
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel
                        FROM Products p
                        WHERE p.ProductID = @identifier AND p.IsActive = 1
                    `;
                }
            } else if (isSKU) {
                // SKU identifier
                inputParam = sql.NVarChar;
                if (tableCheck.recordset.length > 0) {
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel,
                            COALESCE(AVG(CAST(pr.Rating AS FLOAT)), 0) as averageRating,
                            COUNT(pr.ReviewID) as reviewCount,
                            pd.DiscountID,
                            pd.DiscountType,
                            pd.DiscountValue,
                            pd.StartDate as discountStartDate,
                            pd.EndDate as discountEndDate,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price - (p.Price * pd.DiscountValue / 100)
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                                ELSE p.Price
                            END as discountedPrice,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price * pd.DiscountValue / 100
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                                ELSE 0
                            END as discountAmount
                        FROM Products p
                        LEFT JOIN ProductReviews pr ON p.ProductID = pr.ProductID AND pr.IsActive = 1
                        LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                            AND pd.IsActive = 1 
                            AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
                        WHERE p.SKU = @identifier AND p.IsActive = 1
                        GROUP BY 
                            p.ProductID, p.PublicId, p.Slug, p.SKU, p.Name, p.Description, p.Price, p.StockQuantity, 
                            p.Category, p.ImageURL, ISNULL(p.ThumbnailURLs, '[]'), p.DateAdded, p.IsActive, p.Dimensions, p.IsFeatured,
                            p.Model3DURL, p.Has3DModel,
                            pd.DiscountID, pd.DiscountType, pd.DiscountValue, pd.StartDate, pd.EndDate
                    `;
                } else {
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel
                        FROM Products p
                        WHERE p.SKU = @identifier AND p.IsActive = 1
                    `;
                }
            } else {
                // Assume it's a slug
                inputParam = sql.NVarChar;
                if (tableCheck.recordset.length > 0) {
                    // ProductReviews table exists, use the full query with ratings
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel,
                            COALESCE(AVG(CAST(pr.Rating AS FLOAT)), 0) as averageRating,
                            COUNT(pr.ReviewID) as reviewCount,
                            pd.DiscountID,
                            pd.DiscountType,
                            pd.DiscountValue,
                            pd.StartDate as discountStartDate,
                            pd.EndDate as discountEndDate,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price - (p.Price * pd.DiscountValue / 100)
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                                ELSE p.Price
                            END as discountedPrice,
                            CASE 
                                WHEN pd.DiscountType = 'percentage' THEN 
                                    p.Price * pd.DiscountValue / 100
                                WHEN pd.DiscountType = 'fixed' THEN 
                                    CASE WHEN pd.DiscountValue > p.Price THEN p.Price ELSE pd.DiscountValue END
                                ELSE 0
                            END as discountAmount
                        FROM Products p
                        LEFT JOIN ProductReviews pr ON p.ProductID = pr.ProductID AND pr.IsActive = 1
                        LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                            AND pd.IsActive = 1 
                            AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
                        WHERE p.Slug = @identifier AND p.IsActive = 1
                        GROUP BY 
                            p.ProductID, p.PublicId, p.Slug, p.SKU, p.Name, p.Description, p.Price, p.StockQuantity, 
                            p.Category, p.ImageURL, ISNULL(p.ThumbnailURLs, '[]'), p.DateAdded, p.IsActive, p.Dimensions, p.IsFeatured,
                            p.Model3DURL, p.Has3DModel,
                            pd.DiscountID, pd.DiscountType, pd.DiscountValue, pd.StartDate, pd.EndDate
                    `;
                } else {
                    // ProductReviews table doesn't exist, use basic query
                    query = `
                        SELECT 
                            p.PublicId as id,
                            p.Slug as slug,
                            p.SKU as sku,
                            p.Name as name,
                            p.Description as description,
                            p.Price as price,
                            p.StockQuantity as stockQuantity,
                            -- Calculate available stock (actual - pending orders)
                            p.StockQuantity - ISNULL((
                                SELECT SUM(oi.Quantity)
                                FROM OrderItems oi
                                INNER JOIN Orders o ON oi.OrderID = o.OrderID
                                WHERE oi.ProductID = p.ProductID
                                AND o.Status = 'Pending'
                            ), 0) as availableStock,
                            p.Category as categoryName,
                            p.ImageURL as images,
                            ISNULL(p.ThumbnailURLs, '[]') as thumbnails,
                            p.DateAdded as dateAdded,
                            p.IsActive as isActive,
                            p.Dimensions as specifications,
                            p.IsFeatured as featured,
                            p.Model3DURL as model3d,
                            p.Has3DModel as has3dModel
                        FROM Products p
                        WHERE p.Slug = @identifier AND p.IsActive = 1
                    `;
                }
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
            
            // Process images - convert single image URL to array
            product.images = product.images ? [product.images] : [];
            
            // Process thumbnails - support multiple formats (JSON array string, single string, comma-separated)
            let thumbnails = [];
            if (product.thumbnails && String(product.thumbnails).trim()) {
                const raw = String(product.thumbnails).trim();
                // If it's already an array (some drivers may return arrays), use it
                if (Array.isArray(product.thumbnails)) {
                    thumbnails = product.thumbnails;
                } else {
                    // Try JSON parse first (expected format)
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            thumbnails = parsed;
                        } else if (typeof parsed === 'string' && parsed.trim()) {
                            thumbnails = [parsed];
                        }
                    } catch (parseError) {
                        // Fallbacks: comma-separated list or single path
                        try {
                            if (raw.includes(',')) {
                                thumbnails = raw.split(',').map(s => s.trim()).filter(Boolean);
                            } else {
                                thumbnails = [raw];
                            }
                        } catch (e) {
                            console.warn(`Failed to coerce thumbnails for product ${product.id}:`, e.message);
                            thumbnails = [];
                        }
                    }
                }
            }
            product.thumbnails = thumbnails;
            
            // Safely parse specifications JSON
            let specifications = {};
            if (product.specifications && product.specifications.trim()) {
                try {
                    specifications = JSON.parse(product.specifications);
                } catch (parseError) {
                    console.warn(`Failed to parse specifications for product ${product.id}:`, parseError.message);
                    // If JSON parsing fails, try to create a basic specification object
                    specifications = {
                        dimensions: product.specifications,
                        note: 'Specifications data may be incomplete'
                    };
                }
            }
            product.specifications = specifications;
            
            // Add rating and review data
            product.rating = Math.round(product.averageRating * 10) / 10;
            product.reviews = product.reviewCount || 0;
            
            // Add discount information
            product.hasDiscount = !!product.DiscountID;
            product.discountInfo = product.DiscountID ? {
                discountType: product.DiscountType,
                discountValue: product.DiscountValue,
                discountStartDate: product.discountStartDate,
                discountEndDate: product.discountEndDate,
                discountedPrice: product.discountedPrice,
                discountAmount: product.discountAmount
            } : null;
            
            res.json({
                success: true,
                product: mapProductRecordAssetUrls(product)
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

    // Get product variations by product ID
    router.get('/api/products/:productId/variations', async (req, res) => {
        try {
            const identifier = req.params.productId;
            
            // Check if ProductVariations table exists
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductVariations'
            `);
            
            if (tableCheck.recordset.length === 0) {
                console.log('ProductVariations table does not exist');
                return res.json({
                    success: true,
                    variations: []
                });
            }
            
            // Determine if identifier is UUID, slug, SKU, or legacy numeric ID
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
            const isNumeric = /^\d+$/.test(identifier);
            const isSKU = /^DX-[A-F0-9]{8}-[0-9]{4}$/i.test(identifier);
            
            let productQuery, productInputParam, productInputName;
            
            // First, get the ProductID from the identifier (slug, UUID, SKU, or numeric ID)
            if (isUUID) {
                productInputParam = sql.UniqueIdentifier;
                productInputName = 'identifier';
                productQuery = 'SELECT ProductID FROM Products WHERE PublicId = @identifier AND IsActive = 1';
            } else if (isSKU) {
                productInputParam = sql.NVarChar;
                productInputName = 'identifier';
                productQuery = 'SELECT ProductID FROM Products WHERE SKU = @identifier AND IsActive = 1';
            } else if (isNumeric) {
                productInputParam = sql.Int;
                productInputName = 'identifier';
                productQuery = 'SELECT ProductID FROM Products WHERE ProductID = @identifier AND IsActive = 1';
            } else {
                // Assume it's a slug
                productInputParam = sql.NVarChar;
                productInputName = 'identifier';
                productQuery = 'SELECT ProductID FROM Products WHERE Slug = @identifier AND IsActive = 1';
            }
            
            // Get ProductID from identifier
            const productResult = await pool.request()
                .input(productInputName, productInputParam, identifier)
                .query(productQuery);
            
            if (productResult.recordset.length === 0) {
                return res.json({
                    success: true,
                    variations: []
                });
            }
            
            const actualProductID = productResult.recordset[0].ProductID;
            
            // Now fetch variations using the ProductID
            const result = await pool.request()
                .input('productID', sql.Int, actualProductID)
                .query(`
                    SELECT 
                        pv.VariationID as id,
                        pv.ProductID as productId,
                        pv.VariationName as name,
                        pv.Color as color,
                        pv.Quantity as quantity,
                        ISNULL(pv.Price, 0) as price,
                        pv.VariationImageURL as imageUrl,
                        pv.CreatedAt as createdAt,
                        pv.UpdatedAt as updatedAt,
                        pv.IsActive as isActive
                    FROM ProductVariations pv
                    INNER JOIN Products p ON pv.ProductID = p.ProductID
                    WHERE pv.ProductID = @productID 
                    AND pv.IsActive = 1 
                    AND p.IsActive = 1
                    ORDER BY pv.CreatedAt DESC
                `);
            
            
            // Process variations data (keep imageUrl relative so frontend/proxy can resolve)
            const variations = result.recordset.map(variation => ({
                ...variation,
                imageUrl: variation.imageUrl || null
            }));
            
            res.json({
                success: true,
                variations: variations
            });
        } catch (err) {
            console.error('Error fetching product variations:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch variations', 
                details: err.message 
            });
        }
    });

    // --- Review Settings CMS API Endpoints ---
    
    // Get review settings
    router.get('/api/cms/review-settings', async (req, res) => {
        try {
            await pool.connect();
            
            // Check if ReviewSettings table exists, if not create it
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ReviewSettings'
            `);
            
            if (tableCheck.recordset.length === 0) {
                // Create ReviewSettings table
                await pool.request().query(`
                    CREATE TABLE ReviewSettings (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        SectionTitle NVARCHAR(255) DEFAULT 'Customer Reviews',
                        SectionSubtitle NVARCHAR(500) DEFAULT 'See what our customers are saying about this product',
                        EmptyMessage NVARCHAR(500) DEFAULT 'No reviews yet. Be the first to review this product!',
                        FormTitle NVARCHAR(255) DEFAULT 'Add your review',
                        FormNote NVARCHAR(500) DEFAULT 'Your email address will not be published. Required fields are marked*',
                        LoginPrompt NVARCHAR(500) DEFAULT 'Please login to leave a review.',
                        ReviewsPerPage INT DEFAULT 4,
                        DefaultSort NVARCHAR(50) DEFAULT 'newest',
                        EnableImageUploads BIT DEFAULT 1,
                        RequireVerification BIT DEFAULT 0,
                        AutoApproveReviews BIT DEFAULT 1,
                        EnableReviewFlagging BIT DEFAULT 1,
                        MinReviewLength INT DEFAULT 10,
                        DateCreated DATETIME DEFAULT GETDATE(),
                        DateUpdated DATETIME DEFAULT GETDATE()
                    )
                `);
                
                // Insert default settings
                await pool.request().query(`
                    INSERT INTO ReviewSettings DEFAULT VALUES
                `);
            }
            
            // Get current settings
            const result = await pool.request().query(`
                SELECT TOP 1 * FROM ReviewSettings ORDER BY DateUpdated DESC
            `);
            
            if (result.recordset.length > 0) {
                const settings = result.recordset[0];
                res.json({
                    success: true,
                    settings: {
                        sectionTitle: settings.SectionTitle,
                        sectionSubtitle: settings.SectionSubtitle,
                        emptyMessage: settings.EmptyMessage,
                        formTitle: settings.FormTitle,
                        formNote: settings.FormNote,
                        loginPrompt: settings.LoginPrompt,
                        reviewsPerPage: settings.ReviewsPerPage,
                        defaultSort: settings.DefaultSort,
                        enableImageUploads: settings.EnableImageUploads,
                        requireVerification: settings.RequireVerification,
                        autoApproveReviews: settings.AutoApproveReviews,
                        enableReviewFlagging: settings.EnableReviewFlagging,
                        minReviewLength: settings.MinReviewLength
                    }
                });
            } else {
                res.json({
                    success: true,
                    settings: {
                        sectionTitle: 'Customer Reviews',
                        sectionSubtitle: 'See what our customers are saying about this product',
                        emptyMessage: 'No reviews yet. Be the first to review this product!',
                        formTitle: 'Add your review',
                        formNote: 'Your email address will not be published. Required fields are marked*',
                        loginPrompt: 'Please login to leave a review.',
                        reviewsPerPage: 4,
                        defaultSort: 'newest',
                        enableImageUploads: true,
                        requireVerification: false,
                        autoApproveReviews: true,
                        enableReviewFlagging: true,
                        minReviewLength: 10
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching review settings:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch review settings',
                details: error.message
            });
        }
    });
    
    // Save review settings
    router.post('/api/cms/review-settings', async (req, res) => {
        try {
            const {
                sectionTitle,
                sectionSubtitle,
                emptyMessage,
                formTitle,
                formNote,
                loginPrompt,
                reviewsPerPage,
                defaultSort,
                enableImageUploads,
                requireVerification,
                autoApproveReviews,
                enableReviewFlagging,
                minReviewLength
            } = req.body;
            
            await pool.connect();
            
            // Check if ReviewSettings table exists, if not create it
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ReviewSettings'
            `);
            
            if (tableCheck.recordset.length === 0) {
                // Create ReviewSettings table
                await pool.request().query(`
                    CREATE TABLE ReviewSettings (
                        ID INT IDENTITY(1,1) PRIMARY KEY,
                        SectionTitle NVARCHAR(255) DEFAULT 'Customer Reviews',
                        SectionSubtitle NVARCHAR(500) DEFAULT 'See what our customers are saying about this product',
                        EmptyMessage NVARCHAR(500) DEFAULT 'No reviews yet. Be the first to review this product!',
                        FormTitle NVARCHAR(255) DEFAULT 'Add your review',
                        FormNote NVARCHAR(500) DEFAULT 'Your email address will not be published. Required fields are marked*',
                        LoginPrompt NVARCHAR(500) DEFAULT 'Please login to leave a review.',
                        ReviewsPerPage INT DEFAULT 4,
                        DefaultSort NVARCHAR(50) DEFAULT 'newest',
                        EnableImageUploads BIT DEFAULT 1,
                        RequireVerification BIT DEFAULT 0,
                        AutoApproveReviews BIT DEFAULT 1,
                        EnableReviewFlagging BIT DEFAULT 1,
                        MinReviewLength INT DEFAULT 10,
                        DateCreated DATETIME DEFAULT GETDATE(),
                        DateUpdated DATETIME DEFAULT GETDATE()
                    )
                `);
            }
            
            // Check if settings exist
            const existingSettings = await pool.request().query(`
                SELECT ID FROM ReviewSettings
            `);
            
            if (existingSettings.recordset.length > 0) {
                // Update existing settings
                await pool.request()
                    .input('sectionTitle', sql.NVarChar, sectionTitle)
                    .input('sectionSubtitle', sql.NVarChar, sectionSubtitle)
                    .input('emptyMessage', sql.NVarChar, emptyMessage)
                    .input('formTitle', sql.NVarChar, formTitle)
                    .input('formNote', sql.NVarChar, formNote)
                    .input('loginPrompt', sql.NVarChar, loginPrompt)
                    .input('reviewsPerPage', sql.Int, reviewsPerPage)
                    .input('defaultSort', sql.NVarChar, defaultSort)
                    .input('enableImageUploads', sql.Bit, enableImageUploads)
                    .input('requireVerification', sql.Bit, requireVerification)
                    .input('autoApproveReviews', sql.Bit, autoApproveReviews)
                    .input('enableReviewFlagging', sql.Bit, enableReviewFlagging)
                    .input('minReviewLength', sql.Int, minReviewLength)
                    .query(`
                        UPDATE ReviewSettings SET
                            SectionTitle = @sectionTitle,
                            SectionSubtitle = @sectionSubtitle,
                            EmptyMessage = @emptyMessage,
                            FormTitle = @formTitle,
                            FormNote = @formNote,
                            LoginPrompt = @loginPrompt,
                            ReviewsPerPage = @reviewsPerPage,
                            DefaultSort = @defaultSort,
                            EnableImageUploads = @enableImageUploads,
                            RequireVerification = @requireVerification,
                            AutoApproveReviews = @autoApproveReviews,
                            EnableReviewFlagging = @enableReviewFlagging,
                            MinReviewLength = @minReviewLength,
                            DateUpdated = GETDATE()
                    `);
            } else {
                // Insert new settings
                await pool.request()
                    .input('sectionTitle', sql.NVarChar, sectionTitle)
                    .input('sectionSubtitle', sql.NVarChar, sectionSubtitle)
                    .input('emptyMessage', sql.NVarChar, emptyMessage)
                    .input('formTitle', sql.NVarChar, formTitle)
                    .input('formNote', sql.NVarChar, formNote)
                    .input('loginPrompt', sql.NVarChar, loginPrompt)
                    .input('reviewsPerPage', sql.Int, reviewsPerPage)
                    .input('defaultSort', sql.NVarChar, defaultSort)
                    .input('enableImageUploads', sql.Bit, enableImageUploads)
                    .input('requireVerification', sql.Bit, requireVerification)
                    .input('autoApproveReviews', sql.Bit, autoApproveReviews)
                    .input('enableReviewFlagging', sql.Bit, enableReviewFlagging)
                    .input('minReviewLength', sql.Int, minReviewLength)
                    .query(`
                        INSERT INTO ReviewSettings (
                            SectionTitle, SectionSubtitle, EmptyMessage, FormTitle, FormNote,
                            LoginPrompt, ReviewsPerPage, DefaultSort, EnableImageUploads,
                            RequireVerification, AutoApproveReviews, EnableReviewFlagging, MinReviewLength
                        ) VALUES (
                            @sectionTitle, @sectionSubtitle, @emptyMessage, @formTitle, @formNote,
                            @loginPrompt, @reviewsPerPage, @defaultSort, @enableImageUploads,
                            @requireVerification, @autoApproveReviews, @enableReviewFlagging, @minReviewLength
                        )
                    `);
            }
            
            res.json({
                success: true,
                message: 'Review settings saved successfully'
            });
            
        } catch (error) {
            console.error('Error saving review settings:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to save review settings',
                details: error.message
            });
        }
    });

    // --- Filter Data API Endpoints ---
    
    // Get all distinct categories for filtering (public endpoint)
    router.get('/api/public/categories', async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT DISTINCT Category as name, COUNT(*) as count
                FROM Products 
                WHERE Category IS NOT NULL AND Category <> '' AND IsActive = 1
                GROUP BY Category
                ORDER BY Category
            `);
            
            const categories = result.recordset.map(row => ({
                name: row.name,
                count: row.count
            }));
            
            res.json({ 
                success: true, 
                categories: categories 
            });
        } catch (err) {
            console.error('Error fetching categories:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch categories',
                details: err.message 
            });
        }
    });

    // Get all distinct materials for filtering (public endpoint)
    router.get('/api/public/materials', async (req, res) => {
        try {
            await pool.connect();
            
            // Check required tables for product-assigned materials.
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'RawMaterials'
            `);
            
            let materials = [];
            const hiddenLegacyMaterials = new Set([
                'material',
                'laminate sheet',
                'plywood (3/4 inch)',
                'silicone sealant',
                'wood'
            ]);
            const productMaterialsTableCheck = await pool.request().query(`
                SELECT TABLE_NAME
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'ProductMaterials'
            `);

            if (tableCheck.recordset.length > 0 && productMaterialsTableCheck.recordset.length > 0) {
                // Return materials explicitly assigned in Admin > Products.
                // Product identifiers differ across some query contexts, so we avoid joining Products here.
                const result = await pool.request().query(`
                    SELECT rm.Name as name, COUNT(DISTINCT pm.ProductID) as count
                    FROM ProductMaterials pm
                    INNER JOIN RawMaterials rm ON rm.MaterialID = pm.MaterialID AND rm.IsActive = 1
                    GROUP BY rm.Name
                    HAVING COUNT(DISTINCT pm.ProductID) > 0
                    ORDER BY rm.Name
                `);
                
                materials = result.recordset
                    .map(row => ({
                        name: row.name,
                        count: row.count
                    }))
                    .filter(material =>
                        !hiddenLegacyMaterials.has(String(material.name || '').trim().toLowerCase())
                    );
            }
            
            // Keep empty until real materials are available from admin-managed data.
            
            res.json({ 
                success: true, 
                materials: materials 
            });
        } catch (err) {
            console.error('Error fetching materials:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch materials',
                details: err.message 
            });
        }
    });

    // Get price range data for filtering (public endpoint)
    router.get('/api/public/price-range', async (req, res) => {
        try {
            await pool.connect();
            
            // Check if ProductDiscounts table exists
            const discountTableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ProductDiscounts'
            `);
            
            let query;
            if (discountTableCheck.recordset.length > 0) {
                // Include discounted prices in calculation
                query = `
                    SELECT 
                        MIN(CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price - (p.Price * pd.DiscountValue / 100)
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                            ELSE p.Price
                        END) as minPrice,
                        MAX(CASE 
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'percentage' THEN 
                                p.Price - (p.Price * pd.DiscountValue / 100)
                            WHEN pd.DiscountID IS NOT NULL AND pd.DiscountType = 'fixed' THEN 
                                CASE WHEN p.Price - pd.DiscountValue < 0 THEN 0 ELSE p.Price - pd.DiscountValue END
                            ELSE p.Price
                        END) as maxPrice
                    FROM Products p
                    LEFT JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID 
                        AND pd.IsActive = 1 
                        AND GETDATE() BETWEEN pd.StartDate AND pd.EndDate
                    WHERE p.IsActive = 1
                `;
            } else {
                // Simple price range without discounts
                query = `
                    SELECT 
                        MIN(Price) as minPrice,
                        MAX(Price) as maxPrice
                    FROM Products 
                    WHERE IsActive = 1
                `;
            }
            
            const result = await pool.request().query(query);
            const priceData = result.recordset[0];
            
            // Round to nearest 100 for better UX
            const minPrice = Math.floor((priceData.minPrice || 0) / 100) * 100;
            const maxPrice = Math.ceil((priceData.maxPrice || 1000) / 100) * 100;
            
            res.json({ 
                success: true, 
                priceRange: {
                    min: minPrice,
                    max: maxPrice,
                    currency: 'PHP'
                }
            });
        } catch (err) {
            console.error('Error fetching price range:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch price range',
                details: err.message 
            });
        }
    });

    // Get stock status data for filtering (public endpoint)
    router.get('/api/public/stock-status', async (req, res) => {
        try {
            await pool.connect();
            
            const result = await pool.request().query(`
                SELECT 
                    SUM(CASE WHEN StockQuantity > 0 THEN 1 ELSE 0 END) as inStockCount,
                    SUM(CASE WHEN StockQuantity = 0 THEN 1 ELSE 0 END) as outOfStockCount,
                    COUNT(*) as totalProducts
                FROM Products 
                WHERE IsActive = 1
            `);
            
            const stockData = result.recordset[0];
            
            res.json({ 
                success: true, 
                stockStatus: {
                    inStock: stockData.inStockCount || 0,
                    outOfStock: stockData.outOfStockCount || 0,
                    total: stockData.totalProducts || 0
                }
            });
        } catch (err) {
            console.error('Error fetching stock status:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch stock status',
                details: err.message 
            });
        }
    });

    // --- Simple test endpoint for sold quantities ---
    router.get('/api/test/sold-simple', async (req, res) => {
        try {
            await pool.connect();
            
            const query = `
                SELECT 
                    p.ProductID as id,
                    p.Name as name,
                    COALESCE(sold.soldQuantity, 0) as soldQuantity
                FROM Products p
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
                ORDER BY p.ProductID
            `;
            
            const result = await pool.request().query(query);
            
            res.json({
                success: true,
                products: result.recordset,
                message: 'Simple sold quantities test'
            });
        } catch (err) {
            console.error('Error testing sold quantities:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to test sold quantities', 
                details: err.message 
            });
        }
    });

    // --- Contact Messages Management Endpoints ---
    // GET /api/admin/contact-messages - Fetch all contact messages
    router.get('/api/admin/contact-messages', async (req, res) => {
        try {
            const filter = req.query.filter || 'all';
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;
            
            let whereClause = '';
            // Since there's no Status column, we'll return all messages for now
            // TODO: Add Status column to ContactSubmissions table if needed
            whereClause = '';
            
            // First get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM ContactSubmissions
                ${whereClause}
            `;
            
            const countResult = await pool.request().query(countQuery);
            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / limit);
            
            // Get messages with pagination
            const query = `
                SELECT 
                    Id as id,
                    Name as name,
                    Email as email,
                    Message as message,
                    SubmittedAt as submissionDate,
                    'New' as status,
                    SubmittedAt as createdAt,
                    SubmittedAt as updatedAt
                FROM ContactSubmissions
                ${whereClause}
                ORDER BY SubmittedAt DESC
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
            `;
            
            const result = await pool.request().query(query);
            
            res.json({
                success: true,
                messages: result.recordset,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: total,
                    itemsPerPage: limit
                }
            });
        } catch (error) {
            console.error('Error fetching contact messages:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch contact messages',
                details: error.message
            });
        }
    });
    
    // PUT /api/admin/contact-messages/:id/status - Update message status
    router.put('/api/admin/contact-messages/:id/status', async (req, res) => {
        try {
            const messageId = parseInt(req.params.id);
            const { status } = req.body;
            
            // Since there's no Status column, we'll just return success for now
            // TODO: Add Status column to ContactSubmissions table if needed
            
            res.json({
                success: true,
                message: `Message status would be updated to ${status} (Status column not available)`
            });
        } catch (error) {
            console.error('Error updating message status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update message status',
                details: error.message
            });
        }
    });
    
    // DELETE /api/admin/contact-messages/:id - Delete message
    router.delete('/api/admin/contact-messages/:id', async (req, res) => {
        try {
            const messageId = parseInt(req.params.id);
            
            await pool.request()
                .input('messageId', sql.Int, messageId)
                .query(`
                    DELETE FROM ContactSubmissions 
                    WHERE Id = @messageId
                `);
            
            res.json({
                success: true,
                message: 'Message deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting message:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete message',
                details: error.message
            });
        }
    });

    // --- Contact Form Submission Endpoint ---
    // POST /api/contact/submit - Handle contact form submissions
    router.post('/api/contact/submit', async (req, res) => {
        try {
            const { name, email, message, captchaVerified } = req.body;
            
            // Validate captcha verification
            if (!captchaVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'Please complete the security verification'
                });
            }
            
            // Validate required fields
            if (!name || !email || !message) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required'
                });
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid email address'
                });
            }
            
            // Check if ContactSubmissions table exists
            const tableCheck = await pool.request().query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'ContactSubmissions'
            `);
            
            if (tableCheck.recordset.length === 0) {
                // Create the table if it doesn't exist
                await pool.request().query(`
                    CREATE TABLE ContactSubmissions (
                        Id INT IDENTITY(1,1) PRIMARY KEY,
                        Name NVARCHAR(100) NOT NULL,
                        Email NVARCHAR(255) NOT NULL,
                        Message NVARCHAR(MAX) NOT NULL,
                        SubmittedAt DATETIME NOT NULL DEFAULT GETDATE()
                    );
                `);
            }
            
            // Insert the contact submission
            const result = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .input('email', sql.NVarChar, email.trim())
                .input('message', sql.NVarChar, message.trim())
                .query(`
                    INSERT INTO ContactSubmissions (Name, Email, Message)
                    OUTPUT INSERTED.Id
                    VALUES (@name, @email, @message)
                `);
            
            const submissionId = result.recordset[0].Id;
            
            console.log(`New contact submission received: ID ${submissionId} from ${name} (${email})`);
            
            res.json({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                submissionId: submissionId
            });
            
        } catch (error) {
            console.error('Error processing contact submission:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit your message. Please try again later.'
            });
        }
    });

    // --- Admin Alerts API Endpoints ---
    
    // Get system alerts
    router.get('/api/admin/alerts/system', async (req, res) => {
        try {
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // Mock system alerts data for now
            const systemAlerts = [
                {
                    id: 1,
                    title: 'Database Connection Pool Low',
                    message: 'Database connection pool is running low on available connections.',
                    severity: 'warning',
                    source: 'Database Monitor',
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    title: 'High Memory Usage',
                    message: 'Server memory usage has exceeded 80% of available capacity.',
                    severity: 'critical',
                    source: 'System Monitor',
                    timestamp: new Date(Date.now() - 300000).toISOString()
                },
                {
                    id: 3,
                    title: 'Backup Completed Successfully',
                    message: 'Daily database backup completed successfully.',
                    severity: 'info',
                    source: 'Backup Service',
                    timestamp: new Date(Date.now() - 3600000).toISOString()
                }
            ];
            
            res.json({
                success: true,
                alerts: systemAlerts
            });
        } catch (error) {
            console.error('Error fetching system alerts:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch system alerts',
                details: error.message
            });
        }
    });
    
    // Get security alerts
    router.get('/api/admin/alerts/security', async (req, res) => {
        try {
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // Mock security alerts data for now
            const securityAlerts = [
                {
                    id: 1,
                    title: 'Multiple Failed Login Attempts',
                    message: 'Multiple failed login attempts detected from IP address.',
                    severity: 'high',
                    ipAddress: '192.168.1.100',
                    userName: 'Unknown',
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    title: 'Suspicious Activity Detected',
                    message: 'Unusual access pattern detected from user account.',
                    severity: 'medium',
                    ipAddress: '10.0.0.50',
                    userName: 'john.doe@example.com',
                    timestamp: new Date(Date.now() - 600000).toISOString()
                },
                {
                    id: 3,
                    title: 'Password Reset Request',
                    message: 'Password reset requested for user account.',
                    severity: 'info',
                    ipAddress: '203.0.113.45',
                    userName: 'jane.smith@example.com',
                    timestamp: new Date(Date.now() - 1200000).toISOString()
                }
            ];
            
            res.json({
                success: true,
                alerts: securityAlerts
            });
        } catch (error) {
            console.error('Error fetching security alerts:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch security alerts',
                details: error.message
            });
        }
    });
    
    // Get performance alerts
    router.get('/api/admin/alerts/performance', async (req, res) => {
        try {
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // Mock performance alerts data for now
            const performanceAlerts = [
                {
                    id: 1,
                    title: 'High CPU Usage',
                    message: 'CPU usage has exceeded 85% for the past 5 minutes.',
                    severity: 'warning',
                    metric: 'CPU Usage',
                    value: '87%',
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    title: 'Slow Database Queries',
                    message: 'Several database queries are taking longer than expected.',
                    severity: 'medium',
                    metric: 'Query Time',
                    value: '2.5s avg',
                    timestamp: new Date(Date.now() - 300000).toISOString()
                },
                {
                    id: 3,
                    title: 'Disk Space Warning',
                    message: 'Available disk space is running low.',
                    severity: 'high',
                    metric: 'Disk Space',
                    value: '15% free',
                    timestamp: new Date(Date.now() - 600000).toISOString()
                }
            ];
            
            res.json({
                success: true,
                alerts: performanceAlerts
            });
        } catch (error) {
            console.error('Error fetching performance alerts:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch performance alerts',
                details: error.message
            });
        }
    });
    
    // Get user activity alerts
    router.get('/api/admin/alerts/user-activity', async (req, res) => {
        try {
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // Mock user activity alerts data for now
            const userActivityAlerts = [
                {
                    id: 1,
                    title: 'Unusual Login Time',
                    message: 'User logged in at an unusual time (3:00 AM).',
                    severity: 'medium',
                    userName: 'alice.johnson@example.com',
                    userId: 123,
                    activity: 'Login',
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    title: 'Multiple Account Access',
                    message: 'User accessed account from multiple locations simultaneously.',
                    severity: 'high',
                    userName: 'bob.wilson@example.com',
                    userId: 456,
                    activity: 'Concurrent Sessions',
                    timestamp: new Date(Date.now() - 900000).toISOString()
                },
                {
                    id: 3,
                    title: 'Large Order Placed',
                    message: 'User placed an unusually large order.',
                    severity: 'info',
                    userName: 'charlie.brown@example.com',
                    userId: 789,
                    activity: 'Order Placement',
                    timestamp: new Date(Date.now() - 1800000).toISOString()
                }
            ];
            
            res.json({
                success: true,
                alerts: userActivityAlerts
            });
        } catch (error) {
            console.error('Error fetching user activity alerts:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user activity alerts',
                details: error.message
            });
        }
    });
    
    // Dismiss alert
    router.post('/api/admin/alerts/:alertId/dismiss', async (req, res) => {
        try {
            const alertId = parseInt(req.params.alertId);
            
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // For now, just return success (in a real implementation, you'd update the database)
            console.log(`Alert ${alertId} dismissed by admin ${req.session.user.id}`);
            
            res.json({
                success: true,
                message: 'Alert dismissed successfully'
            });
        } catch (error) {
            console.error('Error dismissing alert:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to dismiss alert',
                details: error.message
            });
        }
    });
    
    // Acknowledge alert
    router.post('/api/admin/alerts/:alertId/acknowledge', async (req, res) => {
        try {
            const alertId = parseInt(req.params.alertId);
            
            // Check if user is authenticated and has admin permissions
            if (!req.session.user || req.session.user.role !== 'Admin') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized - Admin access required' 
                });
            }
            
            // For now, just return success (in a real implementation, you'd update the database)
            console.log(`Alert ${alertId} acknowledged by admin ${req.session.user.id}`);
            
            res.json({
                success: true,
                message: 'Alert acknowledged successfully'
            });
        } catch (error) {
            console.error('Error acknowledging alert:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to acknowledge alert',
                details: error.message
            });
        }
    });

    // ============================================================================
    return router;
};
