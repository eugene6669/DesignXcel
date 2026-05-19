/**
 * Test query for a specific order to see what DeliveryTypeName is resolved
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

sql.connect(dbConfig).then(pool => {
    // Find order with rate_49
    return pool.request().query(`
        SELECT TOP 1 OrderID, ReferenceNumber, DeliveryType
        FROM Orders
        WHERE DeliveryType = 'rate_49'
        ORDER BY OrderDate DESC
    `);
}).then(result => {
    if (result.recordset.length === 0) {
        console.log('No order with rate_49 found');
        process.exit(0);
    }
    
    const order = result.recordset[0];
    console.log(`Testing Order ${order.ReferenceNumber || order.OrderID} with DeliveryType: ${order.DeliveryType}`);
    
    return sql.connect(dbConfig).then(pool => {
        return pool.request()
            .input('orderId', sql.Int, order.OrderID)
            .query(`
                SELECT 
                    o.OrderID,
                    o.DeliveryType,
                    dr.RateID AS DeliveryRateID,
                    dr.ServiceType AS DeliveryRateServiceType,
                    rdr.RegionRateID AS RegionRateID,
                    rdr.ServiceType AS RegionRateServiceType,
                    CASE 
                        WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                        WHEN o.DeliveryType LIKE 'rate_%' THEN 
                            CASE 
                                WHEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') LIKE '%Delivery%' 
                                THEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard')
                                ELSE COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') + ' Delivery'
                            END
                        ELSE o.DeliveryType
                    END AS DeliveryTypeName
                FROM Orders o
                LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
                LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
                WHERE o.OrderID = @orderId
            `);
    });
}).then(result => {
    if (result.recordset.length > 0) {
        const order = result.recordset[0];
        console.log('\n📊 Query Results:');
        console.log(`   DeliveryType: ${order.DeliveryType}`);
        console.log(`   DeliveryRates match: ${order.DeliveryRateID ? 'RateID ' + order.DeliveryRateID + ' (' + (order.DeliveryRateServiceType || 'NULL') + ')' : 'None'}`);
        console.log(`   RegionDeliveryRates match: ${order.RegionRateID ? 'RegionRateID ' + order.RegionRateID + ' (' + (order.RegionRateServiceType || 'NULL') + ')' : 'None'}`);
        console.log(`   Final DeliveryTypeName: ${order.DeliveryTypeName}`);
        console.log(`\n✅ Expected: Express Delivery`);
        console.log(`   Actual: ${order.DeliveryTypeName}`);
        if (order.DeliveryTypeName !== 'Express Delivery') {
            console.log(`\n❌ MISMATCH DETECTED!`);
        } else {
            console.log(`\n✅ Match correct!`);
        }
    }
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});

