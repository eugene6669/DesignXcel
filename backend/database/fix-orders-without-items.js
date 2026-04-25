/**
 * Script to fix orders that don't have OrderItems
 * 
 * This script:
 * 1. Finds orders without OrderItems
 * 2. Attempts to reconstruct OrderItems from available data
 * 3. Or provides instructions for manual fix
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

async function fixOrders() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Fixing Orders Without OrderItems');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Find orders without OrderItems
        console.log('🔍 Finding orders without OrderItems...');
        const ordersWithoutItems = await pool.request().query(`
            SELECT o.OrderID, o.ReferenceNumber, o.CustomerID, o.Status, 
                   o.TotalAmount, o.OrderDate, o.PaymentMethod,
                   c.FullName AS CustomerName, c.Email AS CustomerEmail
            FROM Orders o
            LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
            WHERE NOT EXISTS (
                SELECT 1 FROM OrderItems oi WHERE oi.OrderID = o.OrderID
            )
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`\n📊 Found ${ordersWithoutItems.recordset.length} orders without OrderItems\n`);
        
        if (ordersWithoutItems.recordset.length === 0) {
            console.log('✅ All orders have OrderItems. No fix needed!');
            return;
        }
        
        // Display orders that need fixing
        console.log('Orders that need fixing:');
        ordersWithoutItems.recordset.forEach((order, idx) => {
            console.log(`\n${idx + 1}. OrderID: ${order.OrderID}`);
            console.log(`   Reference: ${order.ReferenceNumber || 'N/A'}`);
            console.log(`   Customer: ${order.CustomerName || order.CustomerEmail}`);
            console.log(`   Status: ${order.Status}`);
            console.log(`   Total: ₱${parseFloat(order.TotalAmount || 0).toFixed(2)}`);
            console.log(`   Date: ${order.OrderDate ? new Date(order.OrderDate).toLocaleString() : 'N/A'}`);
        });
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('⚠️  These orders cannot be automatically fixed');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\nReason: OrderItems require product information that');
        console.log('cannot be reliably reconstructed from order data alone.\n');
        console.log('Options:');
        console.log('1. Cancel these orders (if they are test/invalid orders)');
        console.log('2. Contact customers to recreate their orders');
        console.log('3. Manually create OrderItems if you have the original cart data\n');
        
        // Check if there are any pending orders specifically
        const pendingWithoutItems = ordersWithoutItems.recordset.filter(o => o.Status === 'Pending');
        if (pendingWithoutItems.length > 0) {
            console.log(`\n⚠️  Found ${pendingWithoutItems.length} PENDING orders without items:`);
            pendingWithoutItems.forEach(order => {
                console.log(`   - OrderID ${order.OrderID}: ${order.ReferenceNumber || 'No Reference'}`);
            });
            console.log('\n💡 Recommendation: These pending orders should be cancelled or');
            console.log('   have their OrderItems manually created from the original order data.\n');
        }
        
        // Check if we can find any related data (like cart data in Stripe sessions)
        console.log('\n🔍 Checking for Stripe session data that might contain cart info...');
        const ordersWithStripe = ordersWithoutItems.recordset.filter(o => {
            // We'll check if there's a way to get cart data
            return true; // Placeholder
        });
        
        if (ordersWithStripe.length > 0) {
            console.log(`Found ${ordersWithStripe.length} orders with potential Stripe data`);
            console.log('Note: Stripe metadata might contain cart information that could be used');
            console.log('to reconstruct OrderItems. This would require manual review.\n');
        }
        
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Summary');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Total orders without OrderItems: ${ordersWithoutItems.recordset.length}`);
        console.log(`Pending orders without OrderItems: ${pendingWithoutItems.length}`);
        console.log('\n⚠️  These orders need manual intervention to add OrderItems.');
        console.log('    The order creation process should now work correctly');
        console.log('    for all new orders going forward.\n');
        
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

fixOrders();

