/**
 * Script to delete ALL orders and bulk orders from the database
 * WARNING: This will permanently delete all order and bulk order data!
 * 
 * This script:
 * 1. Clears OrderID references in BulkOrders (if they exist)
 * 2. Deletes all OrderItems (child of Orders)
 * 3. Deletes all Orders
 * 4. Deletes all BulkOrderItems (child of BulkOrders)
 * 5. Deletes all BulkOrders
 * 6. Optionally resets identity seeds
 */

require('dotenv').config();
const sql = require('mssql');
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

async function deleteAllOrdersAndBulkOrders(resetIdentity = false) {
    let pool;
    let transaction;
    
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
                requestTimeout: 60000,
                connectionTimeout: 30000
            };
        } else {
            console.log('Using individual database variables...');
            dbConfig = {
                server: process.env.DB_SERVER || process.env.DB_HOST,
                user: process.env.DB_USERNAME || process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_DATABASE || process.env.DB_NAME || 'DesignXcellDB',
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
                    enableArithAbort: true
                },
                requestTimeout: 60000,
                connectionTimeout: 30000
            };
        }

        console.log('🔌 Connecting to database...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Get initial counts
        console.log('📊 Getting current record counts...');
        const orderItemsCount = await pool.request().query('SELECT COUNT(*) as count FROM OrderItems');
        const ordersCount = await pool.request().query('SELECT COUNT(*) as count FROM Orders');
        const bulkOrderItemsCount = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrderItems');
        const bulkOrdersCount = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrders');

        const initialCounts = {
            orderItems: orderItemsCount.recordset[0].count,
            orders: ordersCount.recordset[0].count,
            bulkOrderItems: bulkOrderItemsCount.recordset[0].count,
            bulkOrders: bulkOrdersCount.recordset[0].count
        };

        console.log('Current data:');
        console.log(`  - OrderItems: ${initialCounts.orderItems}`);
        console.log(`  - Orders: ${initialCounts.orders}`);
        console.log(`  - BulkOrderItems: ${initialCounts.bulkOrderItems}`);
        console.log(`  - BulkOrders: ${initialCounts.bulkOrders}\n`);

        if (initialCounts.orderItems === 0 && initialCounts.orders === 0 && 
            initialCounts.bulkOrderItems === 0 && initialCounts.bulkOrders === 0) {
            console.log('✅ Database is already empty. Nothing to delete.');
            return;
        }

        // Begin transaction
        console.log('🔄 Starting transaction...');
        transaction = new sql.Transaction(pool);
        await transaction.begin();
        console.log('✅ Transaction started\n');

        const request = transaction.request();

        // Step 1: Check if BulkOrders has OrderID column and clear references
        console.log('Step 1: Checking for OrderID references in BulkOrders...');
        try {
            // Check for column outside transaction first
            const columnCheck = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'BulkOrders' AND COLUMN_NAME = 'OrderID'
            `);

            if (columnCheck.recordset.length > 0) {
                console.log('  → OrderID column exists in BulkOrders');
                const updateResult = await request.query('UPDATE BulkOrders SET OrderID = NULL WHERE OrderID IS NOT NULL');
                console.log(`  ✅ Cleared OrderID references (${updateResult.rowsAffected[0]} rows affected)\n`);
            } else {
                console.log('  ✅ OrderID column does not exist in BulkOrders\n');
            }
        } catch (err) {
            console.log(`  ⚠️  Could not check/clear OrderID: ${err.message}\n`);
        }

        // Step 2: Delete OrderItems
        console.log('Step 2: Deleting OrderItems...');
        const deleteOrderItemsResult = await request.query('DELETE FROM OrderItems');
        console.log(`  ✅ Deleted ${deleteOrderItemsResult.rowsAffected[0]} OrderItems\n`);

        // Step 3: Delete Orders
        console.log('Step 3: Deleting Orders...');
        const deleteOrdersResult = await request.query('DELETE FROM Orders');
        console.log(`  ✅ Deleted ${deleteOrdersResult.rowsAffected[0]} Orders\n`);

        // Step 4: Delete BulkOrderItems
        console.log('Step 4: Deleting BulkOrderItems...');
        const deleteBulkOrderItemsResult = await request.query('DELETE FROM BulkOrderItems');
        console.log(`  ✅ Deleted ${deleteBulkOrderItemsResult.rowsAffected[0]} BulkOrderItems\n`);

        // Step 5: Delete BulkOrders
        console.log('Step 5: Deleting BulkOrders...');
        const deleteBulkOrdersResult = await request.query('DELETE FROM BulkOrders');
        console.log(`  ✅ Deleted ${deleteBulkOrdersResult.rowsAffected[0]} BulkOrders\n`);

        // Step 6: Reset identity seeds if requested
        if (resetIdentity) {
            console.log('Step 6: Resetting identity seeds...');
            try {
                await request.query('DBCC CHECKIDENT (\'OrderItems\', RESEED, 0)');
                console.log('  ✅ Reset OrderItems identity seed to 0');
                await request.query('DBCC CHECKIDENT (\'Orders\', RESEED, 0)');
                console.log('  ✅ Reset Orders identity seed to 0');
                await request.query('DBCC CHECKIDENT (\'BulkOrderItems\', RESEED, 0)');
                console.log('  ✅ Reset BulkOrderItems identity seed to 0');
                await request.query('DBCC CHECKIDENT (\'BulkOrders\', RESEED, 0)');
                console.log('  ✅ Reset BulkOrders identity seed to 0\n');
            } catch (err) {
                console.log(`  ⚠️  Could not reset identity seeds: ${err.message}\n`);
            }
        }

        // Commit transaction
        await transaction.commit();
        console.log('✅ Transaction committed successfully\n');

        // Verify deletion
        console.log('🔍 Verifying deletion...');
        const verifyOrderItems = await pool.request().query('SELECT COUNT(*) as count FROM OrderItems');
        const verifyOrders = await pool.request().query('SELECT COUNT(*) as count FROM Orders');
        const verifyBulkOrderItems = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrderItems');
        const verifyBulkOrders = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrders');

        const finalCounts = {
            orderItems: verifyOrderItems.recordset[0].count,
            orders: verifyOrders.recordset[0].count,
            bulkOrderItems: verifyBulkOrderItems.recordset[0].count,
            bulkOrders: verifyBulkOrders.recordset[0].count
        };

        console.log('Final counts:');
        console.log(`  - OrderItems: ${finalCounts.orderItems}`);
        console.log(`  - Orders: ${finalCounts.orders}`);
        console.log(`  - BulkOrderItems: ${finalCounts.bulkOrderItems}`);
        console.log(`  - BulkOrders: ${finalCounts.bulkOrders}\n`);

        if (finalCounts.orderItems === 0 && finalCounts.orders === 0 && 
            finalCounts.bulkOrderItems === 0 && finalCounts.bulkOrders === 0) {
            console.log('✅ SUCCESS: All orders and bulk orders have been deleted!');
            if (resetIdentity) {
                console.log('✅ Identity seeds have been reset. Next IDs will start from 1.');
            }
        } else {
            console.log('⚠️  WARNING: Some records may still exist. Please check manually.');
        }

    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
                console.log('❌ Transaction rolled back due to error\n');
            } catch (rollbackErr) {
                console.error('Error during transaction rollback:', rollbackErr.message);
            }
        }
        console.error('\n❌ Error:', err.message);
        if (err.originalError) {
            console.error('Original error:', err.originalError.message);
        }
        console.error('Stack:', err.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed.');
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const resetIdentity = args.includes('--reset-identity') || args.includes('-r');

// Run the script
console.log('🗑️  Delete All Orders and Bulk Orders Script');
console.log('═'.repeat(80));
console.log('⚠️  WARNING: This will permanently delete ALL orders and bulk orders!');
if (resetIdentity) {
    console.log('⚠️  Identity seeds will be reset to start from 1.');
}
console.log('═'.repeat(80));
console.log('');

deleteAllOrdersAndBulkOrders(resetIdentity);

