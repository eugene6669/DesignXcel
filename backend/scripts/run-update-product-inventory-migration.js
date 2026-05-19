/**
 * Script to update ProductInventory table to support InventoryProductID
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
        console.log('🔄 Starting ProductInventory table update migration...\n');
        
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
        
        const migrationScriptPath = path.join(__dirname, '..', 'database', 'update_product_inventory_table.sql');
        const migrationScript = fs.readFileSync(migrationScriptPath, 'utf8');
        
        // Split the script into individual batches using GO
        const batches = migrationScript.split(/GO\s*(\n|$)/i).filter(batch => batch.trim() !== '' && batch.toLowerCase() !== 'go');
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (batch) {
                console.log(`Step ${i + 1}: Executing batch...`);
                await pool.request().query(batch);
                console.log(`✅ Step ${i + 1} completed`);
            }
        }
        
        console.log('\n✅ Migration completed successfully!\n');
        
        // Verify the column was added
        const verifyResult = await pool.request().query(`
            SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ProductInventory' 
            AND COLUMN_NAME IN ('ProductID', 'InventoryProductID')
            ORDER BY COLUMN_NAME
        `);
        
        if (verifyResult.recordset.length > 0) {
            console.log('✅ Verification: ProductInventory table columns:');
            verifyResult.recordset.forEach(col => {
                console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (Nullable: ${col.IS_NULLABLE})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.originalError) {
            console.error('Original error:', error.originalError.message);
        }
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
        console.log('\n✨ Script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });

