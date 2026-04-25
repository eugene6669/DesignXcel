/**
 * Test script to verify OrderItems data for Sales Report
 * This script checks if orders have order items with product names and quantities
 */

const sql = require('mssql');
const path = require('path');

// Database configuration - adjust as needed
const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'DesignXcel',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true,
        enableArithAbort: true
    }
};

async function testOrderItems() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Testing OrderItems Data for Sales Report');
        console.log('═══════════════════════════════════════════════════════════\n');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Get sample completed orders
        console.log('📋 Fetching sample completed orders...');
        const ordersResult = await pool.request().query(`
            SELECT TOP 5
                o.OrderID,
                o.ReferenceNumber,
                o.Status,
                o.OrderDate,
                (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS ItemCount
            FROM Orders o
            WHERE (o.Status = 'Completed' OR o.Status = 'Returned')
            AND o.Status != 'Cancelled'
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`Found ${ordersResult.recordset.length} orders\n`);
        
        if (ordersResult.recordset.length === 0) {
            console.log('⚠️  No completed orders found in database');
            return;
        }
        
        // For each order, get its items
        for (const order of ordersResult.recordset) {
            console.log(`\n📦 Order ID: ${order.OrderID}`);
            console.log(`   Reference: ${order.ReferenceNumber}`);
            console.log(`   Status: ${order.Status}`);
            console.log(`   Date: ${order.OrderDate}`);
            console.log(`   Item Count: ${order.ItemCount}`);
            
            if (order.ItemCount === 0) {
                console.log('   ⚠️  No order items found for this order!');
                continue;
            }
            
            // Get order items with product names
            const itemsResult = await pool.request()
                .input('orderId', sql.Int, order.OrderID)
                .query(`
                    SELECT 
                        oi.OrderItemID,
                        oi.OrderID,
                        oi.ProductID,
                        oi.Quantity,
                        oi.PriceAtPurchase,
                        oi.VariationID,
                        ISNULL(p.Name, 'Unknown Product') AS ProductName,
                        ISNULL(pv.Name, '') AS VariationName
                    FROM OrderItems oi
                    LEFT JOIN Products p ON oi.ProductID = p.ProductID
                    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                    WHERE oi.OrderID = @orderId
                    ORDER BY oi.OrderItemID
                `);
            
            console.log(`   Items (${itemsResult.recordset.length}):`);
            itemsResult.recordset.forEach((item, idx) => {
                const productName = item.VariationName && item.VariationName.trim() !== ''
                    ? `${item.ProductName} (${item.VariationName})`
                    : item.ProductName;
                console.log(`     ${idx + 1}. ${productName} - Qty: ${item.Quantity}, Price: ₱${item.PriceAtPurchase}`);
            });
        }
        
        // Test the exact query used in the sales report
        console.log('\n\n═══════════════════════════════════════════════════════════');
        console.log('  Testing Sales Report Query');
        console.log('═══════════════════════════════════════════════════════════\n');
        
        const orderIds = ordersResult.recordset.map(o => o.OrderID);
        if (orderIds.length > 0) {
            const orderIdParams = orderIds.map((id, idx) => `@orderId${idx}`).join(',');
            const testQuery = `
                SELECT 
                    oi.OrderID,
                    oi.Quantity,
                    oi.PriceAtPurchase,
                    ISNULL(p.Name, 'Unknown Product') AS ProductName,
                    ISNULL(pv.Name, '') AS VariationName
                FROM OrderItems oi
                LEFT JOIN Products p ON oi.ProductID = p.ProductID
                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                WHERE oi.OrderID IN (${orderIdParams})
                ORDER BY oi.OrderID, oi.OrderItemID
            `;
            
            const testRequest = pool.request();
            orderIds.forEach((id, idx) => {
                testRequest.input(`orderId${idx}`, sql.Int, id);
            });
            
            const testResult = await testRequest.query(testQuery);
            console.log(`✅ Sales Report Query Test: Found ${testResult.recordset.length} order items`);
            
            if (testResult.recordset.length > 0) {
                console.log('\nSample results:');
                testResult.recordset.slice(0, 5).forEach(item => {
                    const productName = item.VariationName && item.VariationName.trim() !== ''
                        ? `${item.ProductName} (${item.VariationName})`
                        : item.ProductName;
                    console.log(`  Order ${item.OrderID}: ${productName} x${item.Quantity}`);
                });
            }
        }
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run the test
testOrderItems().catch(console.error);

