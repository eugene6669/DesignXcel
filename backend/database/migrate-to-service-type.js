/**
 * Migrate Orders table to use ServiceType from RegionDeliveryRates
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

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

async function migrate() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Migrating Orders to ServiceType');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Step 1: Check if ServiceType column exists
        console.log('Step 1: Checking if ServiceType column exists...');
        const columnCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'ServiceType'
        `);
        
        if (columnCheck.recordset.length === 0) {
            console.log('   ⚠️  ServiceType column does not exist. Adding it...');
            await pool.request().query(`
                ALTER TABLE Orders
                ADD ServiceType NVARCHAR(150) NULL
            `);
            console.log('   ✅ ServiceType column added\n');
        } else {
            console.log('   ✅ ServiceType column already exists\n');
        }
        
        // Step 2: Count orders before update
        const beforeCount = await pool.request().query(`
            SELECT COUNT(*) as total FROM Orders
        `);
        console.log(`📊 Total orders in database: ${beforeCount.recordset[0].total}\n`);
        
        // Step 3: Update ServiceType from RegionDeliveryRates
        console.log('Step 2: Updating ServiceType from RegionDeliveryRates...');
        const updateResult = await pool.request().query(`
            UPDATE o
            SET ServiceType = 
                CASE 
                    WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                    WHEN o.DeliveryType LIKE 'rate_%' THEN 
                        CASE 
                            WHEN COALESCE(rdr.ServiceType, dr.ServiceType, 'Standard Delivery') LIKE '%Delivery%' 
                            THEN COALESCE(rdr.ServiceType, dr.ServiceType, 'Standard Delivery')
                            ELSE COALESCE(rdr.ServiceType, dr.ServiceType, 'Standard Delivery') + ' Delivery'
                        END
                    ELSE o.DeliveryType
                END
            FROM Orders o
            LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
            LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
            WHERE o.ServiceType IS NULL OR o.ServiceType = ''
        `);
        
        console.log(`   ✅ Updated ${updateResult.rowsAffected[0]} orders\n`);
        
        // Step 4: Verify the update
        console.log('Step 3: Verifying updates...');
        const verifyResult = await pool.request().query(`
            SELECT 
                o.OrderID,
                o.ReferenceNumber,
                o.DeliveryType,
                o.ServiceType,
                rdr.ServiceType AS RegionRateServiceType,
                dr.ServiceType AS DeliveryRateServiceType
            FROM Orders o
            LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
            LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
            ORDER BY o.OrderDate DESC
        `);
        
        console.log(`\n📋 Sample of updated orders:`);
        verifyResult.recordset.slice(0, 5).forEach(order => {
            console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
            console.log(`      DeliveryType: ${order.DeliveryType}`);
            console.log(`      ServiceType: ${order.ServiceType || 'NULL'}`);
            if (order.RegionRateServiceType || order.DeliveryRateServiceType) {
                console.log(`      Source: ${order.RegionRateServiceType || order.DeliveryRateServiceType}`);
            }
        });
        
        // Step 5: Check for any NULL ServiceType
        const nullCheck = await pool.request().query(`
            SELECT COUNT(*) as count 
            FROM Orders 
            WHERE ServiceType IS NULL OR ServiceType = ''
        `);
        
        if (nullCheck.recordset[0].count > 0) {
            console.log(`\n⚠️  Warning: ${nullCheck.recordset[0].count} orders still have NULL ServiceType`);
        } else {
            console.log(`\n✅ All orders have ServiceType populated`);
        }
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  Migration Complete!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ ServiceType column added/verified');
        console.log(`✅ ${updateResult.rowsAffected[0]} orders updated`);
        console.log('\n💡 Next steps:');
        console.log('   1. Update backend queries to use ServiceType instead of DeliveryType');
        console.log('   2. DeliveryType can be kept for backward compatibility');
        console.log('   3. All new orders should populate ServiceType directly\n');
        
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

migrate();

