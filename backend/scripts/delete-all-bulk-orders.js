require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Parse connection string helper
function parseConnectionString(connectionString) {
    const config = {};
    const parts = connectionString.split(';');
    
    parts.forEach(part => {
        const [key, value] = part.split('=').map(s => s.trim());
        if (key && value) {
            switch(key.toLowerCase()) {
                case 'server':
                    config.server = value;
                    break;
                case 'database':
                    config.database = value;
                    break;
                case 'user id':
                case 'uid':
                    config.user = value;
                    break;
                case 'password':
                case 'pwd':
                    config.password = value;
                    break;
                case 'encrypt':
                    config.options = config.options || {};
                    config.options.encrypt = value.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options = config.options || {};
                    config.options.trustServerCertificate = value.toLowerCase() === 'true';
                    break;
            }
        }
    });
    
    return config;
}

async function deleteAllBulkOrders() {
    let pool;
    try {
        const connectionString = process.env.DB_CONNECTION_STRING;
        let dbConfig;

        if (connectionString) {
            console.log('Using connection string from environment...');
            const parsedConfig = parseConnectionString(connectionString);
            dbConfig = {
                ...parsedConfig,
                options: {
                    encrypt: parsedConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'),
                    trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
                    enableArithAbort: true
                },
                requestTimeout: 30000,
                connectionTimeout: 30000
            };
        } else {
            console.log('Using individual database variables...');
            dbConfig = {
                server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
                user: process.env.DB_USERNAME || 'DesignXcel',
                password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
                database: process.env.DB_DATABASE || 'DesignXcellDB',
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
                    enableArithAbort: true
                },
                requestTimeout: 30000,
                connectionTimeout: 30000
            };
        }

        console.log('Connecting to database...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database');

        // Read the SQL script
        const scriptPath = path.join(__dirname, '../database/delete_all_bulk_orders.sql');
        const script = fs.readFileSync(scriptPath, 'utf8');

        console.log('\n⚠️  WARNING: This will delete ALL bulk orders and their items!');
        console.log('Executing deletion script...\n');

        // Execute the script
        const result = await pool.request().query(script);

        // Check remaining counts
        const bulkOrderCount = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrders');
        const bulkOrderItemCount = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrderItems');

        console.log('\n✅ Deletion completed!');
        console.log(`Remaining BulkOrders: ${bulkOrderCount.recordset[0].count}`);
        console.log(`Remaining BulkOrderItems: ${bulkOrderItemCount.recordset[0].count}`);

        if (bulkOrderCount.recordset[0].count === 0 && bulkOrderItemCount.recordset[0].count === 0) {
            console.log('\n✅ SUCCESS: All bulk orders have been deleted.');
        } else {
            console.log('\n⚠️  WARNING: Some records may still exist.');
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.originalError) {
            console.error('Original error:', err.originalError.message);
        }
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\nDatabase connection closed.');
        }
    }
}

// Run the script
deleteAllBulkOrders();

