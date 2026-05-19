/**
 * Migration Script: Rename ProductName to Name in OrderItems
 * 
 * This script runs the migration to rename the ProductName column to Name
 * in the OrderItems table for consistency with the Products table.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');

// Database configuration from environment variables
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

async function checkColumnExists(pool, tableName, columnName) {
    const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .input('columnName', sql.NVarChar, columnName)
        .query(`
            SELECT COUNT(*) as count
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = @tableName 
            AND COLUMN_NAME = @columnName
        `);
    return result.recordset[0].count > 0;
}

async function runMigration() {
    let pool;
    
    try {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Migration: Rename ProductName to Name in OrderItems');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Database: ${dbConfig.database}`);
        console.log(`Server: ${dbConfig.server}`);
        console.log('');
        
        // Connect to database
        console.log('🔌 Connecting to database...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected successfully');
        console.log('');
        
        // Check current column status
        console.log('🔍 Checking column status...');
        const hasProductName = await checkColumnExists(pool, 'OrderItems', 'ProductName');
        const hasName = await checkColumnExists(pool, 'OrderItems', 'Name');
        
        console.log(`   ProductName column exists: ${hasProductName ? 'Yes' : 'No'}`);
        console.log(`   Name column exists: ${hasName ? 'Yes' : 'No'}`);
        console.log('');
        
        // Execute migration logic
        if (hasProductName && !hasName) {
            // Case 1: ProductName exists, Name does not - rename it
            console.log('📝 Renaming ProductName to Name...');
            try {
                await pool.request().query(`
                    EXEC sp_rename 'OrderItems.ProductName', 'Name', 'COLUMN'
                `);
                console.log('✅ ProductName column renamed to Name');
            } catch (err) {
                if (err.message.includes('does not exist') || err.message.includes('not found')) {
                    console.log('⚠️  Column may have already been renamed, checking again...');
                } else {
                    throw err;
                }
            }
        } else if (hasProductName && hasName) {
            // Case 2: Both columns exist - copy data and drop ProductName
            console.log('⚠️  Both ProductName and Name columns exist.');
            console.log('📝 Copying data from ProductName to Name...');
            
            await pool.request().query(`
                UPDATE OrderItems
                SET Name = ProductName
                WHERE Name IS NULL OR Name = ''
            `);
            
            console.log('📝 Dropping ProductName column...');
            await pool.request().query(`
                ALTER TABLE OrderItems
                DROP COLUMN ProductName
            `);
            
            console.log('✅ Data copied and ProductName column dropped');
        } else if (!hasProductName && hasName) {
            // Case 3: Name already exists, ProductName does not
            console.log('✅ Name column already exists. No migration needed.');
        } else {
            // Case 4: Neither exists - add Name column
            console.log('⚠️  Neither ProductName nor Name column exists.');
            console.log('📝 Adding Name column...');
            
            await pool.request().query(`
                ALTER TABLE OrderItems
                ADD Name NVARCHAR(255) NULL
            `);
            
            console.log('✅ Name column added');
            
            // Try to populate from Products table
            console.log('📝 Populating Name from Products table...');
            try {
                await pool.request().query(`
                    UPDATE oi
                    SET oi.Name = p.Name
                    FROM OrderItems oi
                    INNER JOIN Products p ON oi.ProductID = p.ProductID
                    WHERE oi.Name IS NULL OR oi.Name = ''
                `);
                console.log('✅ Name column populated from Products');
            } catch (err) {
                console.log('⚠️  Could not populate from Products (may be expected if no orders exist)');
            }
        }
        
        // Verify the migration
        console.log('');
        console.log('🔍 Verifying migration...');
        const verifyResult = await pool.request().query(`
            SELECT 
                COLUMN_NAME as ColumnName,
                DATA_TYPE as DataType,
                CHARACTER_MAXIMUM_LENGTH as MaxLength,
                IS_NULLABLE as IsNullable
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'OrderItems'
            AND (COLUMN_NAME = 'Name' OR COLUMN_NAME = 'ProductName')
            ORDER BY COLUMN_NAME
        `);
        
        console.log('');
        console.log('📋 OrderItems Column Status:');
        if (verifyResult.recordset.length === 0) {
            console.log('   ⚠️  No Name or ProductName column found');
        } else {
            verifyResult.recordset.forEach(col => {
                console.log(`   ${col.ColumnName}: ${col.DataType}(${col.MaxLength || 'N/A'}) - ${col.IsNullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
            });
        }
        
        const finalHasName = await checkColumnExists(pool, 'OrderItems', 'Name');
        const finalHasProductName = await checkColumnExists(pool, 'OrderItems', 'ProductName');
        
        if (finalHasName && !finalHasProductName) {
            console.log('');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('  ✅ Migration Completed Successfully!');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('   ✓ Name column exists');
            console.log('   ✓ ProductName column removed');
            console.log('');
        } else if (finalHasName && finalHasProductName) {
            console.log('');
            console.log('⚠️  Warning: Both Name and ProductName columns still exist.');
            console.log('   Please review and manually drop ProductName if needed.');
            console.log('');
        } else if (!finalHasName) {
            console.log('');
            console.log('❌ Error: Name column not found after migration.');
            throw new Error('Migration failed. Name column not created.');
        }
        
    } catch (err) {
        console.error('');
        console.error('❌ Migration failed:', err.message);
        console.error('');
        if (err.stack) {
            console.error('Stack trace:', err.stack);
        }
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the migration
runMigration();
