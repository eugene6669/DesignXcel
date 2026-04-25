/**
 * Script to check delivery rates and see which rate IDs map to which service types
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

async function checkRates() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Checking Delivery Rates');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check DeliveryRates
        console.log('📋 DeliveryRates table:');
        const deliveryRates = await pool.request().query(`
            SELECT RateID, ServiceType, Price, IsActive
            FROM DeliveryRates
            ORDER BY RateID
        `);
        console.log(`Found ${deliveryRates.recordset.length} records:`);
        deliveryRates.recordset.forEach(r => {
            console.log(`   RateID ${r.RateID}: ${r.ServiceType} - ₱${r.Price} (Active: ${r.IsActive})`);
        });
        
        // Check RegionDeliveryRates
        console.log('\n📋 RegionDeliveryRates table:');
        const regionRates = await pool.request().query(`
            SELECT RegionRateID, ServiceType, City, Price, IsActive
            FROM RegionDeliveryRates
            ORDER BY RegionRateID
        `);
        console.log(`Found ${regionRates.recordset.length} records:`);
        regionRates.recordset.forEach(r => {
            console.log(`   RegionRateID ${r.RegionRateID}: ${r.ServiceType || 'NULL'} - ${r.City} - ₱${r.Price} (Active: ${r.IsActive})`);
        });
        
        // Check recent orders and their delivery types
        console.log('\n📦 Recent Orders with DeliveryType:');
        const orders = await pool.request().query(`
            SELECT TOP 5 OrderID, ReferenceNumber, DeliveryType, 
                   CASE 
                       WHEN DeliveryType = 'pickup' THEN 'Pick up'
                       WHEN DeliveryType LIKE 'rate_%' THEN SUBSTRING(DeliveryType, 6, 10)
                       ELSE DeliveryType
                   END AS RateID,
                   OrderDate
            FROM Orders
            ORDER BY OrderDate DESC
        `);
        console.log(`Found ${orders.recordset.length} recent orders:`);
        orders.recordset.forEach(o => {
            console.log(`   Order ${o.ReferenceNumber || o.OrderID}: ${o.DeliveryType} (Rate ID: ${o.RateID || 'N/A'})`);
        });
        
        // Test the JOIN logic
        console.log('\n🔍 Testing JOIN logic for rate_49:');
        const testJoin = await pool.request().query(`
            SELECT 
                'rate_49' AS DeliveryType,
                dr.RateID AS DeliveryRateID,
                dr.ServiceType AS DeliveryRateServiceType,
                rdr.RegionRateID AS RegionRateID,
                rdr.ServiceType AS RegionRateServiceType,
                CASE 
                    WHEN 'rate_49' = 'pickup' THEN 'Pick up'
                    WHEN 'rate_49' LIKE 'rate_%' THEN 
                        CASE 
                            WHEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') LIKE '%Delivery%' 
                            THEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard')
                            ELSE COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') + ' Delivery'
                        END
                    ELSE 'rate_49'
                END AS ResolvedServiceType
            FROM (SELECT 1 AS dummy) d
            LEFT JOIN DeliveryRates dr ON 'rate_49' = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
            LEFT JOIN RegionDeliveryRates rdr ON 'rate_49' = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
        `);
        
        if (testJoin.recordset.length > 0) {
            const result = testJoin.recordset[0];
            console.log(`   DeliveryRates match: ${result.DeliveryRateID ? 'RateID ' + result.DeliveryRateID + ' (' + result.DeliveryRateServiceType + ')' : 'None'}`);
            console.log(`   RegionDeliveryRates match: ${result.RegionRateID ? 'RegionRateID ' + result.RegionRateID + ' (' + result.RegionRateServiceType + ')' : 'None'}`);
            console.log(`   Final resolved: ${result.ResolvedServiceType}`);
        }
        
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

checkRates();

