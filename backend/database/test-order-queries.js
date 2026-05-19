/**
 * Test script to verify OrderItems queries work after column rename
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');

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

async function testQueries() {
    let pool;
    
    try {
        console.log('Testing OrderItems queries after column rename...\n');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Test 1: Check if Name column exists
        console.log('Test 1: Checking OrderItems columns...');
        const colResult = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'OrderItems' 
            AND (COLUMN_NAME = 'Name' OR COLUMN_NAME = 'ProductName')
        `);
        console.log('Columns found:', colResult.recordset.map(r => r.COLUMN_NAME).join(', '));
        
        // Test 2: Try the customer orders query
        console.log('\nTest 2: Testing customer orders query...');
        const testOrderIds = await pool.request().query(`
            SELECT TOP 5 OrderID 
            FROM Orders 
            ORDER BY OrderDate DESC
        `);
        
        if (testOrderIds.recordset.length === 0) {
            console.log('⚠️  No orders found in database');
            return;
        }
        
        const orderIds = testOrderIds.recordset.map(o => o.OrderID);
        console.log(`Testing with OrderIDs: ${orderIds.join(', ')}`);
        
        try {
            const result = await pool.request()
                .query(`SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, 
                               COALESCE(p.Name, oi.Name) AS Name, 
                               p.ImageURL 
                        FROM OrderItems oi 
                        LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                        WHERE oi.OrderID IN (${orderIds.join(',')})`);
            
            console.log(`✅ Query successful! Found ${result.recordset.length} order items`);
            if (result.recordset.length > 0) {
                console.log('Sample item:', JSON.stringify(result.recordset[0], null, 2));
            }
        } catch (err) {
            console.error('❌ Query failed:', err.message);
            throw err;
        }
        
        // Test 3: Try the backend routes query
        console.log('\nTest 3: Testing backend routes query...');
        try {
            const result2 = await pool.request()
                .input('orderId', sql.Int, orderIds[0])
                .query(`
                    SELECT oi.OrderItemID, oi.Quantity, oi.PriceAtPurchase, oi.VariationID, oi.Name,
                           COALESCE(p.Name, oi.Name) AS Name,
                           p.ImageURL,
                           pv.VariationName, pv.Color, pv.VariationImageURL
                    FROM OrderItems oi
                    LEFT JOIN Products p ON oi.ProductID = p.ProductID
                    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                    WHERE oi.OrderID = @orderId
                `);
            
            console.log(`✅ Query successful! Found ${result2.recordset.length} items`);
        } catch (err) {
            console.error('❌ Query failed:', err.message);
            throw err;
        }
        
        // Test 4: Check pending orders
        console.log('\nTest 4: Checking pending orders...');
        const pendingResult = await pool.request()
            .input('status', sql.NVarChar, 'Pending')
            .query(`
                SELECT COUNT(*) as count 
                FROM Orders 
                WHERE Status = @status
            `);
        
        console.log(`Pending orders found: ${pendingResult.recordset[0].count}`);
        
        if (pendingResult.recordset[0].count > 0) {
            console.log('\n✅ Pending orders exist in database');
        } else {
            console.log('\n⚠️  No pending orders found. Checking all orders...');
            const allOrders = await pool.request().query(`
                SELECT Status, COUNT(*) as count 
                FROM Orders 
                GROUP BY Status
            `);
            allOrders.recordset.forEach(row => {
                console.log(`   ${row.Status}: ${row.count}`);
            });
        }
        
        console.log('\n✅ All tests passed!');
        
    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

testQueries();

