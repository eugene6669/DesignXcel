/**
 * Debug order creation and OrderItems insertion
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

async function debug() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Debugging Order Creation and OrderItems Insertion');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check most recent orders
        const recentOrders = await pool.request().query(`
            SELECT TOP 5
                o.OrderID,
                o.ReferenceNumber,
                o.OrderDate,
                o.Status,
                o.StripeSessionID,
                COUNT(oi.OrderItemID) as ItemCount
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
            GROUP BY o.OrderID, o.ReferenceNumber, o.OrderDate, o.Status, o.StripeSessionID
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`📦 Most Recent Orders:\n`);
        recentOrders.recordset.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      Date: ${order.OrderDate}`);
            console.log(`      Status: ${order.Status}`);
            console.log(`      Items: ${order.ItemCount} ${order.ItemCount === 0 ? '❌ MISSING' : '✅'}`);
            console.log(`      StripeSessionID: ${order.StripeSessionID || 'N/A'}`);
            console.log('');
        });
        
        // Check OrderItems table structure
        console.log('📋 OrderItems Table Structure:');
        const structure = await pool.request().query(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                CHARACTER_MAXIMUM_LENGTH,
                IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'OrderItems'
            ORDER BY ORDINAL_POSITION
        `);
        
        structure.recordset.forEach(col => {
            console.log(`   ${col.COLUMN_NAME}: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? '(' + col.CHARACTER_MAXIMUM_LENGTH + ')' : ''} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check if there are any constraints
        console.log('\n📋 Checking Constraints:');
        const constraints = await pool.request().query(`
            SELECT 
                CONSTRAINT_NAME,
                CONSTRAINT_TYPE
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_NAME = 'OrderItems'
        `);
        
        constraints.recordset.forEach(constraint => {
            console.log(`   ${constraint.CONSTRAINT_NAME}: ${constraint.CONSTRAINT_TYPE}`);
        });
        
        // Test inserting a sample OrderItem (dry run - will rollback)
        console.log('\n🧪 Testing OrderItems Insert Query Structure:');
        const testOrder = recentOrders.recordset.find(o => o.ItemCount > 0);
        if (testOrder) {
            const existingItems = await pool.request()
                .input('orderId', sql.Int, testOrder.OrderID)
                .query('SELECT TOP 1 * FROM OrderItems WHERE OrderID = @orderId');
            
            if (existingItems.recordset.length > 0) {
                const item = existingItems.recordset[0];
                console.log('   Sample OrderItem structure:');
                console.log(`      OrderItemID: ${item.OrderItemID}`);
                console.log(`      OrderID: ${item.OrderID}`);
                console.log(`      ProductID: ${item.ProductID}`);
                console.log(`      Name: ${item.Name}`);
                console.log(`      Quantity: ${item.Quantity}`);
                console.log(`      PriceAtPurchase: ${item.PriceAtPurchase}`);
                console.log(`      VariationID: ${item.VariationID || 'NULL'}`);
            }
        }
        
        // Check Products table to verify product lookup
        console.log('\n📦 Sample Products (for lookup testing):');
        const products = await pool.request().query(`
            SELECT TOP 3 ProductID, Name
            FROM Products
            WHERE IsActive = 1
        `);
        
        products.recordset.forEach(product => {
            console.log(`   ProductID ${product.ProductID}: ${product.Name}`);
        });
        
        console.log('\n✅ Debug complete!');
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        console.error(err.stack);
    } finally {
        if (pool) await pool.close();
    }
}

debug();

