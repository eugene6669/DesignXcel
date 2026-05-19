/**
 * Test the orders-with-items API response structure
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

async function testAPI() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Testing Orders-with-Items API Response');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Get a customer with orders
        const customerResult = await pool.request().query(`
            SELECT TOP 1 CustomerID, FullName, Email
            FROM Customers
            WHERE CustomerID IN (SELECT DISTINCT CustomerID FROM Orders)
        `);
        
        if (customerResult.recordset.length === 0) {
            console.log('⚠️  No customers with orders found');
            return;
        }
        
        const customerId = customerResult.recordset[0].CustomerID;
        console.log(`Testing with CustomerID: ${customerId}\n`);
        
        // Simulate the API query
        const ordersResult = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query(`
                SELECT 
                    o.OrderID, o.ReferenceNumber, o.Status, o.TotalAmount, o.OrderDate, o.PaymentMethod,
                    o.DeliveryType, o.ServiceType, o.DeliveryCost, o.ShippingAddressID,
                    COALESCE(o.ServiceType, 
                        CASE 
                            WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                            WHEN o.DeliveryType LIKE 'rate_%' THEN 
                                CASE 
                                    WHEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') LIKE '%Delivery%' 
                                    THEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard')
                                    ELSE COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') + ' Delivery'
                                END
                            ELSE o.DeliveryType
                        END
                    ) AS DeliveryTypeName,
                    a.Label AS AddressLabel, a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.PostalCode, a.Country
                FROM Orders o
                LEFT JOIN CustomerAddresses a ON o.ShippingAddressID = a.AddressID
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
                WHERE o.CustomerID = @customerId
                ORDER BY o.OrderDate DESC
            `);
        
        const orders = ordersResult.recordset;
        console.log(`Found ${orders.length} orders\n`);
        
        if (orders.length === 0) {
            console.log('⚠️  No orders found');
            return;
        }
        
        const orderIds = orders.map(o => o.OrderID);
        console.log(`OrderIDs: ${orderIds.join(', ')}\n`);
        
        // Get order items
        const orderItemsResult = await pool.request()
            .query(`SELECT oi.OrderID, oi.ProductID, oi.Quantity, oi.PriceAtPurchase, 
                           COALESCE(p.Name, oi.Name) AS Name, 
                           p.ImageURL 
                    FROM OrderItems oi 
                    LEFT JOIN Products p ON oi.ProductID = p.ProductID 
                    WHERE oi.OrderID IN (${orderIds.join(',')})`);
        
        console.log(`Found ${orderItemsResult.recordset.length} order items\n`);
        
        // Group items by order
        const itemsByOrder = {};
        for (const item of orderItemsResult.recordset) {
            if (!itemsByOrder[item.OrderID]) itemsByOrder[item.OrderID] = [];
            itemsByOrder[item.OrderID].push({
                ProductID: item.ProductID,
                name: item.Name,
                quantity: item.Quantity,
                price: item.PriceAtPurchase,
                image: item.ImageURL || null
            });
        }
        
        console.log('📦 Order Items Breakdown:');
        orders.forEach(order => {
            const items = itemsByOrder[order.OrderID] || [];
            console.log(`\n   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      Items: ${items.length}`);
            if (items.length > 0) {
                items.forEach(item => {
                    console.log(`         - ${item.name} (Qty: ${item.quantity}, Price: ₱${item.price})`);
                });
            } else {
                console.log(`         ⚠️  No items found!`);
            }
        });
        
        // Simulate the API response structure
        const ordersWithItems = orders.map(order => ({
            OrderID: order.OrderID,
            ReferenceNumber: order.ReferenceNumber,
            Status: order.Status,
            TotalAmount: order.TotalAmount,
            OrderDate: order.OrderDate,
            PaymentMethod: order.PaymentMethod,
            DeliveryType: order.DeliveryType,
            ServiceType: order.ServiceType,
            DeliveryTypeName: order.DeliveryTypeName,
            DeliveryCost: order.DeliveryCost,
            ShippingAddressID: order.ShippingAddressID,
            items: itemsByOrder[order.OrderID] || [],
        }));
        
        console.log('\n\n📋 API Response Structure:');
        console.log(JSON.stringify(ordersWithItems[0], null, 2));
        
        console.log('\n✅ Test complete!');
        
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

testAPI();

