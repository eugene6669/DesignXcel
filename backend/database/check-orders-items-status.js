/**
 * Check orders and their items status
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
        console.log('  Checking Orders and OrderItems Status');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check all orders and their item counts
        const ordersResult = await pool.request().query(`
            SELECT 
                o.OrderID,
                o.ReferenceNumber,
                o.OrderDate,
                o.Status,
                o.TotalAmount,
                COUNT(oi.OrderItemID) as ItemCount,
                STRING_AGG(CAST(oi.Name AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY oi.OrderItemID) AS ItemNames
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
            GROUP BY o.OrderID, o.ReferenceNumber, o.OrderDate, o.Status, o.TotalAmount
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`📦 Total Orders: ${ordersResult.recordset.length}\n`);
        
        const ordersWithItems = ordersResult.recordset.filter(o => o.ItemCount > 0);
        const ordersWithoutItems = ordersResult.recordset.filter(o => o.ItemCount === 0);
        
        console.log(`✅ Orders with items: ${ordersWithItems.length}`);
        ordersWithItems.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}: ${order.ItemCount} items - ${order.ItemNames || 'N/A'}`);
        });
        
        console.log(`\n❌ Orders without items: ${ordersWithoutItems.length}`);
        ordersWithoutItems.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}: No items - Status: ${order.Status}`);
        });
        
        // Check OrderItems table
        console.log('\n📋 Checking OrderItems table...');
        const itemsResult = await pool.request().query(`
            SELECT 
                COUNT(*) as TotalItems,
                COUNT(DISTINCT OrderID) as OrdersWithItems
            FROM OrderItems
        `);
        
        console.log(`   Total OrderItems: ${itemsResult.recordset[0].TotalItems}`);
        console.log(`   Orders with OrderItems: ${itemsResult.recordset[0].OrdersWithItems}`);
        
        // Sample OrderItems
        const sampleItems = await pool.request().query(`
            SELECT TOP 5
                oi.OrderItemID,
                oi.OrderID,
                oi.ProductID,
                oi.Name,
                oi.Quantity,
                oi.PriceAtPurchase,
                o.ReferenceNumber
            FROM OrderItems oi
            INNER JOIN Orders o ON oi.OrderID = o.OrderID
            ORDER BY oi.OrderItemID DESC
        `);
        
        console.log('\n📦 Sample OrderItems:');
        sampleItems.recordset.forEach(item => {
            console.log(`   Order ${item.ReferenceNumber}: ${item.Name} (Qty: ${item.Quantity}, Price: ₱${item.PriceAtPurchase})`);
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

