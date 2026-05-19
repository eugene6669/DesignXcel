/**
 * Test the OrderItems query used in the API
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

async function test() {
    let pool;
    
    try {
        pool = await sql.connect(dbConfig);
        
        // Get a customer with orders
        const customerResult = await pool.request().query(`
            SELECT TOP 1 CustomerID 
            FROM Customers 
            WHERE CustomerID IN (SELECT DISTINCT CustomerID FROM Orders)
        `);
        
        if (customerResult.recordset.length === 0) {
            console.log('No customers with orders found');
            return;
        }
        
        const customerId = customerResult.recordset[0].CustomerID;
        console.log(`Testing with CustomerID: ${customerId}\n`);
        
        // Simulate the orders query
        const ordersResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query(`
                SELECT 
                    o.OrderID, o.ReferenceNumber, o.Status, o.TotalAmount, o.OrderDate, o.PaymentMethod,
                    o.DeliveryType, o.ServiceType, o.DeliveryCost, o.ShippingAddressID
                FROM Orders o
                WHERE o.CustomerID = @customerId
                ORDER BY o.OrderDate DESC
            `);
        
        console.log(`Found ${ordersResult.recordset.length} orders\n`);
        
        const orderIds = ordersResult.recordset.map(o => o.OrderID);
        console.log(`OrderIDs: ${orderIds.join(', ')}\n`);
        
        // Test single order query
        if (orderIds.length > 0) {
            const testOrderId = orderIds[0];
            console.log(`Testing OrderItems query for OrderID ${testOrderId}:`);
            
            const itemsResult = await pool.request()
                .input('orderId', sql.Int, testOrderId)
                .query(`
                    SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, oi.VariationID,
                           COALESCE(p.Name, oi.Name) AS Name, 
                           COALESCE(pv.VariationImageURL, p.ImageURL) AS ImageURL,
                           pv.VariationName, pv.Color
                    FROM OrderItems oi 
                    LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                    WHERE oi.OrderID = @orderId
                `);
            
            console.log(`   Found ${itemsResult.recordset.length} items`);
            itemsResult.recordset.forEach(item => {
                console.log(`   - ${item.Name} (Qty: ${item.Quantity}, Price: ₱${item.PriceAtPurchase})`);
            });
        }
        
        // Test multiple orders query
        if (orderIds.length > 1) {
            const orderItemParams = orderIds.map((id, idx) => `@orderId${idx}`).join(',');
            const orderItemsRequest = pool.request();
            orderIds.forEach((id, idx) => {
                orderItemsRequest.input(`orderId${idx}`, sql.Int, id);
            });
            
            console.log(`\nTesting multiple orders query with ${orderIds.length} orders:`);
            const itemsResult = await orderItemsRequest.query(`
                SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, oi.VariationID,
                       COALESCE(p.Name, oi.Name) AS Name, 
                       COALESCE(pv.VariationImageURL, p.ImageURL) AS ImageURL,
                       pv.VariationName, pv.Color
                FROM OrderItems oi 
                LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                WHERE oi.OrderID IN (${orderItemParams})
            `);
            
            console.log(`   Found ${itemsResult.recordset.length} total items`);
            
            // Group by order
            const itemsByOrder = {};
            for (const item of itemsResult.recordset) {
                if (!itemsByOrder[item.OrderID]) itemsByOrder[item.OrderID] = [];
                itemsByOrder[item.OrderID].push(item);
            }
            
            orderIds.forEach(orderId => {
                const items = itemsByOrder[orderId] || [];
                console.log(`   OrderID ${orderId}: ${items.length} items`);
            });
        }
        
    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        if (pool) await pool.close();
    }
}

test();

