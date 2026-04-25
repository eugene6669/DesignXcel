/**
 * Delete orders that don't have OrderItems
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

async function deleteOrders() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Deleting Orders Without OrderItems');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Find orders without items
        const ordersWithoutItems = await pool.request().query(`
            SELECT 
                o.OrderID,
                o.ReferenceNumber,
                o.OrderDate,
                o.Status,
                o.TotalAmount,
                o.StripeSessionID
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
            WHERE oi.OrderItemID IS NULL
            ORDER BY o.OrderDate DESC
        `);
        
        const ordersToDelete = ordersWithoutItems.recordset;
        
        if (ordersToDelete.length === 0) {
            console.log('✅ No orders without items found. All orders have products.');
            return;
        }
        
        console.log(`📦 Found ${ordersToDelete.length} orders without OrderItems:\n`);
        ordersToDelete.forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      Date: ${order.OrderDate}`);
            console.log(`      Status: ${order.Status}`);
            console.log(`      Total: ₱${order.TotalAmount}`);
            console.log('');
        });
        
        // Confirm deletion
        const orderIds = ordersToDelete.map(o => o.OrderID);
        console.log(`\n🗑️  Deleting ${orderIds.length} orders...`);
        
        // Delete orders (OrderItems will be deleted automatically due to foreign key CASCADE)
        // But first, let's check if there are any OrderItems to be sure
        for (const orderId of orderIds) {
            const order = ordersToDelete.find(o => o.OrderID === orderId);
            try {
                await pool.request()
                    .input('orderId', sql.Int, orderId)
                    .query('DELETE FROM Orders WHERE OrderID = @orderId');
                console.log(`   ✅ Deleted Order ${order.ReferenceNumber || orderId}`);
            } catch (err) {
                console.error(`   ❌ Error deleting Order ${order.ReferenceNumber || orderId}:`, err.message);
            }
        }
        
        console.log(`\n✅ Deletion complete! Deleted ${orderIds.length} orders without items.`);
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed');
        }
    }
}

deleteOrders();

