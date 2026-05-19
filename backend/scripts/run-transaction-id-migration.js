/**
 * Script to run the TransactionID column migration
 * This adds the TransactionID column to the Orders table
 */

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Parse connection string helper
function parseConnectionString(connectionString) {
    const config = {};
    const pairs = connectionString.split(';');
    
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
            const cleanKey = key.trim().toLowerCase();
            const cleanValue = value.trim();
            
            switch (cleanKey) {
                case 'server':
                    let serverValue = cleanValue;
                    if (serverValue.startsWith('tcp:')) {
                        serverValue = serverValue.substring(4);
                    }
                    if (serverValue.includes(',')) {
                        serverValue = serverValue.split(',')[0];
                    }
                    serverValue = serverValue.replace(/\\\\/g, '\\');
                    config.server = serverValue;
                    break;
                case 'initial catalog':
                case 'database':
                    config.database = cleanValue;
                    break;
                case 'user id':
                    config.user = cleanValue;
                    break;
                case 'password':
                    config.password = cleanValue;
                    break;
                case 'encrypt':
                    config.options = config.options || {};
                    config.options.encrypt = cleanValue.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options = config.options || {};
                    config.options.trustServerCertificate = cleanValue.toLowerCase() === 'true';
                    break;
            }
        }
    }
    
    return config;
}

async function runMigration() {
    let pool;
    
    try {
        console.log('🔄 Starting TransactionID column migration...\n');
        
        // Get database configuration
        const connectionString = process.env.DB_CONNECTION_STRING;
        let dbConfig;
        
        if (connectionString) {
            const parsedConfig = parseConnectionString(connectionString);
            dbConfig = {
                ...parsedConfig,
                options: {
                    encrypt: parsedConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'),
                    trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
                    enableArithAbort: true
                }
            };
        } else {
            dbConfig = {
                server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
                user: process.env.DB_USERNAME || 'DesignXcel',
                password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
                database: process.env.DB_DATABASE || 'DesignXcellDB',
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
                    enableArithAbort: true
                }
            };
        }
        
        console.log('📊 Connecting to database:', dbConfig.database);
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected successfully!\n');
        
        // Read the migration script
        const migrationPath = path.join(__dirname, '..', 'database', 'add_transaction_id_column.sql');
        console.log('📄 Reading migration script:', migrationPath);
        const migrationScript = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute the migration
        console.log('🚀 Executing migration...\n');
        const result = await pool.request().query(migrationScript);
        
        console.log('✅ Migration completed successfully!\n');
        
        // Verify the column was added
        console.log('🔍 Verifying column exists...');
        const verifyResult = await pool.request().query(`
            SELECT COUNT(*) as columnExists
            FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
            AND name = 'TransactionID'
        `);
        
        if (verifyResult.recordset[0].columnExists > 0) {
            console.log('✅ TransactionID column verified in Orders table!\n');
            
            // Check how many orders need transaction IDs
            const ordersResult = await pool.request().query(`
                SELECT COUNT(*) as totalOrders,
                       SUM(CASE WHEN TransactionID IS NULL THEN 1 ELSE 0 END) as nullTransactionIds
                FROM Orders
            `);
            
            const stats = ordersResult.recordset[0];
            console.log('📊 Order Statistics:');
            console.log(`   Total Orders: ${stats.totalOrders}`);
            console.log(`   Orders without TransactionID: ${stats.nullTransactionIds}`);
            
            if (stats.nullTransactionIds > 0) {
                console.log('\n💡 Note: Existing orders will get TransactionIDs when they are updated or when new orders are created.');
            }
        } else {
            console.log('⚠️  Warning: Column verification failed. Please check the migration script.');
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed.');
        }
    }
}

// Run the migration
runMigration()
    .then(() => {
        console.log('\n✨ Migration script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });

