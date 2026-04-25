/**
 * Restore DeliveryRates table from backup if needed
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

async function restoreDeliveryRates() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Restoring DeliveryRates Table');
        console.log('═══════════════════════════════════════════════════════════');
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check if DeliveryRates exists
        const existsCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'DeliveryRates'
        `);
        
        if (existsCheck.recordset.length > 0) {
            console.log('✅ DeliveryRates table already exists');
            
            const countResult = await pool.request().query('SELECT COUNT(*) as count FROM DeliveryRates');
            console.log(`   Records in DeliveryRates: ${countResult.recordset[0].count}\n`);
            return;
        }
        
        // Check if backup exists
        const backupCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'DeliveryRates_BACKUP'
        `);
        
        if (backupCheck.recordset.length === 0) {
            console.log('⚠️  No DeliveryRates_BACKUP found');
            console.log('📝 Creating empty DeliveryRates table...');
            
            // Create empty DeliveryRates table
            await pool.request().query(`
                CREATE TABLE dbo.DeliveryRates (
                    RateID INT IDENTITY(1,1) PRIMARY KEY,
                    ServiceType NVARCHAR(150) NOT NULL,
                    Price DECIMAL(18,2) NOT NULL,
                    CreatedAt DATETIME2(0) NOT NULL DEFAULT (SYSUTCDATETIME()),
                    CreatedByUserID INT NULL,
                    CreatedByUsername NVARCHAR(150) NULL,
                    IsActive BIT NOT NULL DEFAULT (1)
                );
                
                CREATE UNIQUE INDEX UX_DeliveryRates_ServiceType_Active
                    ON dbo.DeliveryRates (ServiceType)
                    WHERE IsActive = 1;
            `);
            
            console.log('✅ Empty DeliveryRates table created');
        } else {
            console.log('📝 Restoring DeliveryRates from backup...');
            
            // Create table structure first
            await pool.request().query(`
                CREATE TABLE dbo.DeliveryRates (
                    RateID INT IDENTITY(1,1) PRIMARY KEY,
                    ServiceType NVARCHAR(150) NOT NULL,
                    Price DECIMAL(18,2) NOT NULL,
                    CreatedAt DATETIME2(0) NOT NULL DEFAULT (SYSUTCDATETIME()),
                    CreatedByUserID INT NULL,
                    CreatedByUsername NVARCHAR(150) NULL,
                    IsActive BIT NOT NULL DEFAULT (1)
                );
            `);
            
            // Restore data from backup
            await pool.request().query(`
                SET IDENTITY_INSERT DeliveryRates ON;
                
                INSERT INTO DeliveryRates (RateID, ServiceType, Price, CreatedAt, CreatedByUserID, CreatedByUsername, IsActive)
                SELECT RateID, ServiceType, Price, CreatedAt, CreatedByUserID, CreatedByUsername, IsActive
                FROM DeliveryRates_BACKUP;
                
                SET IDENTITY_INSERT DeliveryRates OFF;
            `);
            
            // Create index
            await pool.request().query(`
                CREATE UNIQUE INDEX UX_DeliveryRates_ServiceType_Active
                    ON dbo.DeliveryRates (ServiceType)
                    WHERE IsActive = 1;
            `);
            
            const countResult = await pool.request().query('SELECT COUNT(*) as count FROM DeliveryRates');
            console.log(`✅ Restored ${countResult.recordset[0].count} records from backup`);
        }
        
        console.log('\n✅ DeliveryRates table is now available');
        console.log('   Backend orders queries should now work correctly\n');
        
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

restoreDeliveryRates();

