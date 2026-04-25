/**
 * Script to reconstruct OrderItems from Stripe session metadata
 * 
 * This script attempts to retrieve cart data from Stripe sessions
 * and create OrderItems for orders that are missing them.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');
let stripe;

// Try to initialize Stripe
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        console.log('✅ Stripe initialized');
    } else {
        console.log('⚠️  Stripe not configured - will only work with stored metadata');
    }
} catch (e) {
    console.log('⚠️  Stripe module not available');
    stripe = null;
}

const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'DesignXcellDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true,
        enableArithAbort: true
    }
};

async function reconstructOrderItems() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Reconstructing OrderItems from Stripe Data');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Find orders without OrderItems that have StripeSessionID
        console.log('🔍 Finding orders with StripeSessionID but without OrderItems...');
        const ordersNeedingFix = await pool.request().query(`
            SELECT o.OrderID, o.ReferenceNumber, o.CustomerID, o.Status, 
                   o.TotalAmount, o.OrderDate, o.StripeSessionID, o.PaymentMethod
            FROM Orders o
            WHERE NOT EXISTS (
                SELECT 1 FROM OrderItems oi WHERE oi.OrderID = o.OrderID
            )
            AND o.StripeSessionID IS NOT NULL
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`Found ${ordersNeedingFix.recordset.length} orders with Stripe sessions but no OrderItems\n`);
        
        if (ordersNeedingFix.recordset.length === 0) {
            console.log('✅ No orders found that can be automatically fixed.');
            console.log('   Orders without StripeSessionID need manual intervention.\n');
            return;
        }
        
        let fixedCount = 0;
        let failedCount = 0;
        
        for (const order of ordersNeedingFix.recordset) {
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Processing OrderID: ${order.OrderID}`);
            console.log(`Reference: ${order.ReferenceNumber || 'N/A'}`);
            console.log(`StripeSessionID: ${order.StripeSessionID}`);
            
            try {
                let cart = [];
                
                // Try to get cart from Stripe session metadata
                if (stripe && order.StripeSessionID) {
                    try {
                        console.log('   📡 Fetching session from Stripe...');
                        const session = await stripe.checkout.sessions.retrieve(order.StripeSessionID);
                        
                        if (session.metadata && session.metadata.cart) {
                            cart = JSON.parse(session.metadata.cart);
                            console.log(`   ✅ Retrieved cart from Stripe metadata (${cart.length} items)`);
                        } else {
                            console.log('   ⚠️  No cart data in Stripe metadata');
                        }
                    } catch (stripeErr) {
                        console.log(`   ⚠️  Could not fetch from Stripe: ${stripeErr.message}`);
                    }
                }
                
                // If we have cart data, reconstruct OrderItems
                if (cart && cart.length > 0) {
                    console.log(`   📝 Reconstructing OrderItems for ${cart.length} items...`);
                    
                    for (const item of cart) {
                        if (!item.id || item.id === 'shipping') {
                            console.log(`   ⏭️  Skipping shipping item: ${item.name}`);
                            continue;
                        }
                        
                        // Find product
                        let product;
                        
                        // Try by ID first (if it's a valid integer)
                        if (item.id && !isNaN(parseInt(item.id)) && parseInt(item.id) > 0) {
                            try {
                                const productResult = await pool.request()
                                    .input('id', sql.Int, parseInt(item.id))
                                    .query('SELECT ProductID, Name FROM Products WHERE ProductID = @id');
                                
                                if (productResult.recordset.length > 0) {
                                    product = productResult.recordset[0];
                                    console.log(`   ✓ Found product by ID: ${product.Name}`);
                                }
                            } catch (err) {
                                // ID lookup failed, will try name
                            }
                        }
                        
                        // Try by name if ID lookup failed
                        if (!product && item.name && item.name !== 'Shipping') {
                            try {
                                const nameResult = await pool.request()
                                    .input('name', sql.NVarChar, item.name)
                                    .query('SELECT ProductID, Name FROM Products WHERE Name = @name');
                                
                                if (nameResult.recordset.length > 0) {
                                    product = nameResult.recordset[0];
                                    console.log(`   ✓ Found product by name: ${product.Name}`);
                                } else {
                                    // Try fuzzy match
                                    const fuzzyResult = await pool.request()
                                        .input('name', sql.NVarChar, '%' + item.name + '%')
                                        .query('SELECT TOP 1 ProductID, Name FROM Products WHERE Name LIKE @name');
                                    
                                    if (fuzzyResult.recordset.length > 0) {
                                        product = fuzzyResult.recordset[0];
                                        console.log(`   ✓ Found product by fuzzy match: ${product.Name}`);
                                    }
                                }
                            } catch (err) {
                                console.log(`   ⚠️  Name lookup failed: ${err.message}`);
                            }
                        }
                        
                        if (!product) {
                            console.log(`   ⚠️  Product not found for item: ${item.name || item.id}`);
                            continue;
                        }
                        
                        // Create OrderItem
                        await pool.request()
                            .input('orderId', sql.Int, order.OrderID)
                            .input('productId', sql.Int, product.ProductID)
                            .input('quantity', sql.Int, item.quantity || 1)
                            .input('priceAtPurchase', sql.Decimal(10,2), item.price || 0)
                            .input('variationId', sql.Int, item.variationId || null)
                            .input('productName', sql.NVarChar, product.Name)
                            .query(`
                                INSERT INTO OrderItems (OrderID, ProductID, Quantity, PriceAtPurchase, VariationID, Name)
                                VALUES (@orderId, @productId, @quantity, @priceAtPurchase, @variationId, @productName)
                            `);
                        
                        console.log(`   ✅ Created OrderItem for: ${product.Name}`);
                    }
                    
                    console.log(`   ✅ OrderID ${order.OrderID} fixed!`);
                    fixedCount++;
                } else {
                    console.log(`   ⚠️  No cart data available for OrderID ${order.OrderID}`);
                    console.log(`   ⚠️  Cannot automatically reconstruct OrderItems`);
                    failedCount++;
                }
                
            } catch (err) {
                console.error(`   ❌ Error processing OrderID ${order.OrderID}:`, err.message);
                failedCount++;
            }
        }
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  Summary');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`✅ Successfully fixed: ${fixedCount} orders`);
        console.log(`⚠️  Could not fix: ${failedCount} orders`);
        console.log('\n💡 Orders that could not be fixed need manual intervention.');
        console.log('   You can cancel them or manually create OrderItems.\n');
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('🔌 Database connection closed');
        }
    }
}

reconstructOrderItems();

