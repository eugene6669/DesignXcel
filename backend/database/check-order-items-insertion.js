/**
 * Check why OrderItems are not being inserted
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

async function check() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Checking OrderItems Insertion');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check orders without OrderItems
        const missingItems = await pool.request().query(`
            SELECT 
                o.OrderID,
                o.ReferenceNumber,
                o.OrderDate,
                o.Status,
                o.StripeSessionID,
                COUNT(oi.OrderItemID) as ItemCount
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
            GROUP BY o.OrderID, o.ReferenceNumber, o.OrderDate, o.Status, o.StripeSessionID
            HAVING COUNT(oi.OrderItemID) = 0
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`📦 Orders without OrderItems: ${missingItems.recordset.length}`);
        missingItems.recordset.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      Date: ${order.OrderDate}`);
            console.log(`      Status: ${order.Status}`);
            console.log(`      StripeSessionID: ${order.StripeSessionID || 'N/A'}`);
        });
        
        // Check OrderItems table structure
        console.log('\n📋 Checking OrderItems table structure...');
        const structure = await pool.request().query(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'OrderItems'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('OrderItems columns:');
        structure.recordset.forEach(col => {
            console.log(`   ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check recent orders with items
        console.log('\n📦 Recent orders with OrderItems:');
        const withItems = await pool.request().query(`
            SELECT TOP 5
                o.OrderID,
                o.ReferenceNumber,
                COUNT(oi.OrderItemID) as ItemCount
            FROM Orders o
            INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
            GROUP BY o.OrderID, o.ReferenceNumber
            ORDER BY o.OrderDate DESC
        `);
        
        withItems.recordset.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}: ${order.ItemCount} items`);
        });
        
        console.log('\n✅ Check complete!');
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

check();

