/**
 * Verify ServiceType connection to RegionDeliveryRates
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

async function verify() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Verifying ServiceType Connection to RegionDeliveryRates');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check RegionDeliveryRates table structure
        console.log('Step 1: Checking RegionDeliveryRates table...');
        const regionRatesResult = await pool.request().query(`
            SELECT TOP 5 
                RegionRateID,
                Region,
                Province,
                City,
                ServiceType,
                Price,
                IsActive
            FROM RegionDeliveryRates
            ORDER BY RegionRateID DESC
        `);
        
        console.log(`Found ${regionRatesResult.recordset.length} region rates (showing latest 5):`);
        regionRatesResult.recordset.forEach(rate => {
            console.log(`   RateID ${rate.RegionRateID}: ${rate.ServiceType || 'NULL'} - ${rate.City || rate.Province || rate.Region || 'N/A'} (₱${rate.Price})`);
        });
        
        // Check DeliveryRates table structure
        console.log('\nStep 2: Checking DeliveryRates table...');
        const deliveryRatesResult = await pool.request().query(`
            SELECT TOP 5 
                RateID,
                ServiceType,
                Price,
                IsActive
            FROM DeliveryRates
            ORDER BY RateID DESC
        `);
        
        console.log(`Found ${deliveryRatesResult.recordset.length} delivery rates (showing latest 5):`);
        deliveryRatesResult.recordset.forEach(rate => {
            console.log(`   RateID ${rate.RateID}: ${rate.ServiceType || 'NULL'} (₱${rate.Price})`);
        });
        
        // Check Orders table
        console.log('\nStep 3: Checking Orders ServiceType connection...');
        const ordersResult = await pool.request().query(`
            SELECT TOP 10
                o.OrderID,
                o.ReferenceNumber,
                o.DeliveryType,
                o.ServiceType,
                CASE 
                    WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                    WHEN o.DeliveryType LIKE 'rate_%' THEN 
                        SUBSTRING(o.DeliveryType, 6, LEN(o.DeliveryType))
                    ELSE o.DeliveryType
                END AS RateID,
                rdr.RegionRateID AS RegionRateID,
                rdr.ServiceType AS RegionServiceType,
                dr.RateID AS DeliveryRateID,
                dr.ServiceType AS DeliveryServiceType
            FROM Orders o
            LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
            LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`\nChecking ${ordersResult.recordset.length} orders for ServiceType connection:\n`);
        ordersResult.recordset.forEach(order => {
            const rateId = order.RateID;
            const storedServiceType = order.ServiceType;
            const regionServiceType = order.RegionServiceType;
            const deliveryServiceType = order.DeliveryServiceType;
            
            let status = '❌ MISMATCH';
            if (order.DeliveryType === 'pickup') {
                if (storedServiceType === 'Pick up') {
                    status = '✅ OK';
                } else {
                    status = `⚠️  Expected 'Pick up', got '${storedServiceType}'`;
                }
            } else if (order.DeliveryType && order.DeliveryType.startsWith('rate_')) {
                const expectedServiceType = regionServiceType || deliveryServiceType || 'Standard Delivery';
                if (storedServiceType === expectedServiceType || 
                    (storedServiceType && expectedServiceType && storedServiceType.includes(expectedServiceType))) {
                    status = '✅ OK';
                } else {
                    status = `⚠️  Expected '${expectedServiceType}', got '${storedServiceType}'`;
                }
            } else {
                status = '⚠️  Unknown DeliveryType format';
            }
            
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      DeliveryType: ${order.DeliveryType}`);
            console.log(`      Stored ServiceType: ${storedServiceType || 'NULL'}`);
            if (order.RegionRateID) {
                console.log(`      Region Rate ${order.RegionRateID} ServiceType: ${regionServiceType || 'NULL'}`);
            }
            if (order.DeliveryRateID) {
                console.log(`      Delivery Rate ${order.DeliveryRateID} ServiceType: ${deliveryServiceType || 'NULL'}`);
            }
            console.log(`      Status: ${status}\n`);
        });
        
        // Check if ServiceType matches source
        console.log('\nStep 4: Summary of connections...');
        const connectionCheck = await pool.request().query(`
            SELECT 
                COUNT(*) as TotalOrders,
                SUM(CASE WHEN o.ServiceType IS NOT NULL THEN 1 ELSE 0 END) as OrdersWithServiceType,
                SUM(CASE WHEN o.DeliveryType = 'pickup' AND o.ServiceType = 'Pick up' THEN 1 ELSE 0 END) as CorrectPickup,
                SUM(CASE WHEN o.DeliveryType LIKE 'rate_%' AND (
                    o.ServiceType = rdr.ServiceType OR 
                    o.ServiceType = dr.ServiceType OR
                    o.ServiceType = rdr.ServiceType + ' Delivery' OR
                    o.ServiceType = dr.ServiceType + ' Delivery'
                ) THEN 1 ELSE 0 END) as CorrectRate
            FROM Orders o
            LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
            LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
        `);
        
        const stats = connectionCheck.recordset[0];
        console.log(`   Total Orders: ${stats.TotalOrders}`);
        console.log(`   Orders with ServiceType: ${stats.OrdersWithServiceType}`);
        console.log(`   Correct Pickup connections: ${stats.CorrectPickup}`);
        console.log(`   Correct Rate connections: ${stats.CorrectRate}`);
        
        if (stats.OrdersWithServiceType === stats.TotalOrders) {
            console.log('\n✅ All orders have ServiceType populated');
        } else {
            console.log(`\n⚠️  ${stats.TotalOrders - stats.OrdersWithServiceType} orders missing ServiceType`);
        }
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  Verification Complete!');
        console.log('═══════════════════════════════════════════════════════════');
        
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

verify();

