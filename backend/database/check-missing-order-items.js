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

sql.connect(dbConfig).then(pool => {
    return pool.request().query(`
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
        ORDER BY o.OrderDate DESC
    `);
}).then(result => {
    console.log('Order Items Count:');
    result.recordset.forEach(order => {
        console.log(`   Order ${order.ReferenceNumber || order.OrderID}: ${order.ItemCount} items ${order.ItemCount === 0 ? '⚠️ MISSING ITEMS' : ''}`);
        if (order.ItemCount === 0) {
            console.log(`      SessionID: ${order.StripeSessionID || 'N/A'}`);
        }
    });
    
    const missingItems = result.recordset.filter(o => o.ItemCount === 0);
    if (missingItems.length > 0) {
        console.log(`\n⚠️  Found ${missingItems.length} orders without items`);
    } else {
        console.log(`\n✅ All orders have items`);
    }
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

