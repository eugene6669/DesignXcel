/**
 * Script to remove guest bulk orders from the database
 * Guest orders are identified by having NULL CustomerID
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sql = require('mssql');

// Try connection string first, then individual variables
const connectionString = process.env.DB_CONNECTION_STRING;
let config;

if (connectionString) {
    // Parse connection string (simplified - assumes standard format)
    const parts = connectionString.split(';').reduce((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) {
            acc[key.toLowerCase()] = value;
        }
        return acc;
    }, {});
    
    config = {
        server: parts.server,
        user: parts['user id'] || parts.userid,
        password: parts.password,
        database: parts.database,
        options: {
            encrypt: parts.encrypt === 'true' || parts.encrypt === 'True',
            trustServerCertificate: parts.trustservercertificate === 'true' || parts.trustservercertificate === 'True',
            enableArithAbort: true
        }
    };
} else {
    config = {
        user: process.env.DB_USERNAME || process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE || process.env.DB_NAME,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
            enableArithAbort: true
        }
    };
}

async function removeGuestBulkOrders() {
    let pool;
    
    try {
        console.log('🔌 Connecting to database...');
        pool = await sql.connect(config);
        console.log('✅ Connected to database successfully!\n');

        // Check if BulkOrders table exists
        const tableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'BulkOrders'
        `);

        if (tableCheck.recordset.length === 0) {
            console.log('ℹ️ BulkOrders table does not exist. Nothing to clean up.');
            return;
        }

        // Count guest orders (where CustomerID is NULL)
        const countResult = await pool.request().query(`
            SELECT COUNT(*) as count
            FROM BulkOrders
            WHERE CustomerID IS NULL
        `);

        const guestOrderCount = countResult.recordset[0].count;
        
        if (guestOrderCount === 0) {
            console.log('✅ No guest bulk orders found. Database is clean!');
            return;
        }

        console.log(`📊 Found ${guestOrderCount} guest bulk order(s) to remove.\n`);

        // Get details of guest orders before deletion
        const detailsResult = await pool.request().query(`
            SELECT 
                BulkOrderID,
                CustomerEmail,
                TotalQuantity,
                GrandTotal,
                Status,
                CreatedAt
            FROM BulkOrders
            WHERE CustomerID IS NULL
            ORDER BY CreatedAt DESC
        `);

        console.log('📋 Guest orders to be removed:');
        console.log('─'.repeat(80));
        detailsResult.recordset.forEach((order, index) => {
            console.log(`${index + 1}. Order ID: ${order.BulkOrderID}`);
            console.log(`   Email: ${order.CustomerEmail || 'N/A'}`);
            console.log(`   Quantity: ${order.TotalQuantity}`);
            console.log(`   Total: ₱${parseFloat(order.GrandTotal || 0).toFixed(2)}`);
            console.log(`   Status: ${order.Status}`);
            console.log(`   Created: ${order.CreatedAt}`);
            console.log('');
        });

        // Check if BulkOrderItems table exists and has related items
        const itemsTableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'BulkOrderItems'
        `);

        let itemsToDelete = 0;
        if (itemsTableCheck.recordset.length > 0) {
            const itemsCountResult = await pool.request().query(`
                SELECT COUNT(*) as count
                FROM BulkOrderItems boi
                INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                WHERE bo.CustomerID IS NULL
            `);
            itemsToDelete = itemsCountResult.recordset[0].count;
            
            if (itemsToDelete > 0) {
                console.log(`📦 Also found ${itemsToDelete} related order item(s) to remove.\n`);
            }
        }

        // Delete guest bulk orders (cascade should handle items if foreign key is set up correctly)
        // But we'll delete items first to be safe
        if (itemsToDelete > 0) {
            console.log('🗑️  Deleting guest bulk order items...');
            const deleteItemsResult = await pool.request().query(`
                DELETE boi
                FROM BulkOrderItems boi
                INNER JOIN BulkOrders bo ON boi.BulkOrderID = bo.BulkOrderID
                WHERE bo.CustomerID IS NULL
            `);
            console.log(`✅ Deleted ${deleteItemsResult.rowsAffected[0]} order item(s).\n`);
        }

        console.log('🗑️  Deleting guest bulk orders...');
        const deleteResult = await pool.request().query(`
            DELETE FROM BulkOrders
            WHERE CustomerID IS NULL
        `);

        const deletedCount = deleteResult.rowsAffected[0];
        console.log(`✅ Successfully deleted ${deletedCount} guest bulk order(s)!\n`);

        // Verify deletion
        const verifyResult = await pool.request().query(`
            SELECT COUNT(*) as count
            FROM BulkOrders
            WHERE CustomerID IS NULL
        `);

        const remainingCount = verifyResult.recordset[0].count;
        
        if (remainingCount === 0) {
            console.log('✅ Verification: All guest bulk orders have been removed successfully!');
        } else {
            console.log(`⚠️  Warning: ${remainingCount} guest order(s) still remain. Please check manually.`);
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Error details:', {
            code: err.code,
            number: err.number,
            originalError: err.originalError?.message
        });
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed.');
        }
    }
}

// Run the script
console.log('🧹 Guest Bulk Orders Cleanup Script');
console.log('═'.repeat(80));
console.log('This script will remove all bulk orders where CustomerID is NULL (guest orders).\n');
removeGuestBulkOrders();

