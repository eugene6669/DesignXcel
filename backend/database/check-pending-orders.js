/**
 * Script to check why pending orders aren't appearing in backend
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

async function checkOrders() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Checking Backend Orders Query');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Test 1: Check all orders
        console.log('Test 1: Checking all orders in database...');
        const allOrders = await pool.request().query(`
            SELECT OrderID, ReferenceNumber, Status, TotalAmount, OrderDate, CustomerID
            FROM Orders
            ORDER BY OrderDate DESC
        `);
        console.log(`Total orders in database: ${allOrders.recordset.length}\n`);
        
        if (allOrders.recordset.length > 0) {
            console.log('Order breakdown by status:');
            const statusCount = {};
            allOrders.recordset.forEach(order => {
                statusCount[order.Status] = (statusCount[order.Status] || 0) + 1;
            });
            Object.keys(statusCount).forEach(status => {
                console.log(`   ${status}: ${statusCount[status]}`);
            });
            console.log('');
        }
        
        // Test 2: Test the exact query used in backend routes
        console.log('Test 2: Testing backend pending orders query...');
        const pendingResult = await pool.request()
            .input('status', sql.NVarChar, 'Pending')
            .query(`
                SELECT o.OrderID, o.ReferenceNumber, o.OrderDate, 
                       FORMAT(o.OrderDate, 'MMM dd, yyyy hh:mm tt') AS FormattedOrderDate,
                       o.Status, o.TotalAmount, o.PaymentMethod, o.Currency, o.PaymentDate,
                       o.DeliveryType, o.DeliveryCost, o.StripeSessionID, o.PaymentStatus,
                       CASE 
                           WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                           WHEN o.DeliveryType LIKE 'rate_%' THEN dr.ServiceType
                           ELSE o.DeliveryType
                       END as DeliveryTypeName,
                       c.FullName AS CustomerName, c.Email AS CustomerEmail, c.PhoneNumber AS CustomerPhone,
                       a.Label AS AddressLabel, a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.Region, a.PostalCode, a.Country
                FROM Orders o
                JOIN Customers c ON o.CustomerID = c.CustomerID
                OUTER APPLY (
                    SELECT TOP 1 ca.*
                    FROM CustomerAddresses ca
                    WHERE ca.CustomerID = c.CustomerID
                      AND (ca.AddressID = o.ShippingAddressID OR (o.ShippingAddressID IS NULL AND ca.IsDefault = 1))
                    ORDER BY CASE WHEN ca.AddressID = o.ShippingAddressID THEN 0 WHEN ca.IsDefault = 1 THEN 1 ELSE 2 END, ca.AddressID DESC
                ) a
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                WHERE o.Status = @status
                ORDER BY o.OrderDate DESC
            `);
        
        console.log(`Pending orders found by query: ${pendingResult.recordset.length}\n`);
        
        if (pendingResult.recordset.length > 0) {
            console.log('Pending orders details:');
            pendingResult.recordset.forEach((order, idx) => {
                console.log(`\n${idx + 1}. OrderID: ${order.OrderID}`);
                console.log(`   Reference: ${order.ReferenceNumber || 'N/A'}`);
                console.log(`   Customer: ${order.CustomerName || order.CustomerEmail}`);
                console.log(`   Total: ₱${parseFloat(order.TotalAmount || 0).toFixed(2)}`);
                console.log(`   Date: ${order.FormattedOrderDate || order.OrderDate}`);
                console.log(`   DeliveryType: ${order.DeliveryTypeName || order.DeliveryType}`);
                
                // Check if order has items
                pool.request()
                    .input('orderId', sql.Int, order.OrderID)
                    .query(`
                        SELECT COUNT(*) as itemCount
                        FROM OrderItems
                        WHERE OrderID = @orderId
                    `)
                    .then(result => {
                        console.log(`   OrderItems: ${result.recordset[0].itemCount}`);
                    })
                    .catch(err => {
                        console.log(`   OrderItems: Error checking - ${err.message}`);
                    });
            });
        } else {
            console.log('⚠️  No pending orders found by the backend query!\n');
            console.log('Checking why...');
            
            // Check if there are orders with Pending status
            const pendingCheck = await pool.request()
                .query(`SELECT COUNT(*) as count FROM Orders WHERE Status = 'Pending'`);
            console.log(`Orders with Status='Pending' in database: ${pendingCheck.recordset[0].count}`);
            
            // Check if JOIN is failing
            const orderStatusCheck = await pool.request().query(`
                SELECT o.OrderID, o.Status, o.CustomerID, c.CustomerID as CustomerExists
                FROM Orders o
                LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
                WHERE o.Status = 'Pending'
            `);
            
            console.log(`\nChecking Customer JOIN...`);
            const missingCustomers = orderStatusCheck.recordset.filter(o => !o.CustomerExists);
            if (missingCustomers.length > 0) {
                console.log(`⚠️  Found ${missingCustomers.length} orders with missing customers!`);
                missingCustomers.forEach(o => {
                    console.log(`   OrderID ${o.OrderID} has CustomerID ${o.CustomerID} but customer doesn't exist`);
                });
            } else {
                console.log(`✅ All pending orders have valid customers`);
            }
        }
        
        // Test 3: Check OrderItems for pending orders
        console.log('\nTest 3: Checking OrderItems for pending orders...');
        const itemsCheck = await pool.request()
            .input('status', sql.NVarChar, 'Pending')
            .query(`
                SELECT o.OrderID, COUNT(oi.OrderItemID) as ItemCount
                FROM Orders o
                LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
                WHERE o.Status = @status
                GROUP BY o.OrderID
            `);
        
        console.log(`OrderItems breakdown:`);
        itemsCheck.recordset.forEach(row => {
            console.log(`   OrderID ${row.OrderID}: ${row.ItemCount} items`);
        });
        
        console.log('\n✅ Check complete!');
        
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

checkOrders();

