/**
 * Script to run the Product Inventory migration
 * This creates the ProductInventory table and adds InventoryStatus column to Products table
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
        console.log('🔄 Starting Product Inventory migration...\n');
        
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
        
        // Execute migration in separate batches to avoid SQL Server batch validation issues
        console.log('🚀 Executing migration...\n');
        
        // Step 1: Add InventoryStatus column if it doesn't exist
        console.log('Step 1: Adding InventoryStatus column to Products table...');
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Products' 
                AND COLUMN_NAME = 'InventoryStatus'
            )
            BEGIN
                ALTER TABLE [dbo].[Products]
                ADD InventoryStatus NVARCHAR(50) NULL DEFAULT 'available';
            END
        `);
        console.log('✅ Step 1 completed');
        
        // Step 2: Create index for InventoryStatus if it doesn't exist
        console.log('Step 2: Creating index for InventoryStatus...');
        await pool.request().query(`
            IF EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Products' 
                AND COLUMN_NAME = 'InventoryStatus'
            )
            AND NOT EXISTS (
                SELECT * FROM sys.indexes 
                WHERE name = 'IX_Products_InventoryStatus' 
                AND object_id = OBJECT_ID('dbo.Products')
            )
            BEGIN
                CREATE INDEX IX_Products_InventoryStatus ON Products(InventoryStatus);
            END
        `);
        console.log('✅ Step 2 completed');
        
        // Step 3: Create ProductInventory table if it doesn't exist
        console.log('Step 3: Creating ProductInventory table...');
        
        // Check if Users table exists to determine foreign key reference
        const usersTableCheck = await pool.request().query(`
            SELECT COUNT(*) as tableExists
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'Users'
        `);
        
        const hasUsersTable = usersTableCheck.recordset[0].tableExists > 0;
        
        if (hasUsersTable) {
            // Create table with Users foreign key
            await pool.request().query(`
                IF OBJECT_ID('dbo.ProductInventory', 'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[ProductInventory] (
                        InventoryID INT IDENTITY(1,1) PRIMARY KEY,
                        ProductID INT NOT NULL,
                        InventoryStatus NVARCHAR(50) NOT NULL DEFAULT 'available',
                        Quantity INT NOT NULL DEFAULT 1,
                        ImageURL NVARCHAR(500) NULL,
                        Dimensions NVARCHAR(MAX) NULL,
                        Notes NVARCHAR(MAX) NULL,
                        Location NVARCHAR(200) NULL,
                        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                        DateUpdated DATETIME2(0) NULL,
                        IsActive BIT NOT NULL DEFAULT 1,
                        CreatedBy INT NULL,
                        UpdatedBy INT NULL,
                        FOREIGN KEY (ProductID) REFERENCES Products(ProductID),
                        FOREIGN KEY (CreatedBy) REFERENCES Users(UserID),
                        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserID)
                    );
                    
                    CREATE INDEX IX_ProductInventory_ProductID ON ProductInventory(ProductID);
                    CREATE INDEX IX_ProductInventory_InventoryStatus ON ProductInventory(InventoryStatus);
                    CREATE INDEX IX_ProductInventory_IsActive ON ProductInventory(IsActive);
                END
            `);
        } else {
            // Create table without foreign keys for CreatedBy/UpdatedBy
            await pool.request().query(`
                IF OBJECT_ID('dbo.ProductInventory', 'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[ProductInventory] (
                        InventoryID INT IDENTITY(1,1) PRIMARY KEY,
                        ProductID INT NOT NULL,
                        InventoryStatus NVARCHAR(50) NOT NULL DEFAULT 'available',
                        Quantity INT NOT NULL DEFAULT 1,
                        ImageURL NVARCHAR(500) NULL,
                        Dimensions NVARCHAR(MAX) NULL,
                        Notes NVARCHAR(MAX) NULL,
                        Location NVARCHAR(200) NULL,
                        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                        DateUpdated DATETIME2(0) NULL,
                        IsActive BIT NOT NULL DEFAULT 1,
                        CreatedBy INT NULL,
                        UpdatedBy INT NULL,
                        FOREIGN KEY (ProductID) REFERENCES Products(ProductID)
                    );
                    
                    CREATE INDEX IX_ProductInventory_ProductID ON ProductInventory(ProductID);
                    CREATE INDEX IX_ProductInventory_InventoryStatus ON ProductInventory(InventoryStatus);
                    CREATE INDEX IX_ProductInventory_IsActive ON ProductInventory(IsActive);
                END
            `);
        }
        console.log('✅ Step 3 completed');
        
        // Step 4: Update existing products to have 'available' status if NULL
        console.log('Step 4: Updating existing products with NULL InventoryStatus...');
        await pool.request().query(`
            IF EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Products' 
                AND COLUMN_NAME = 'InventoryStatus'
            )
            BEGIN
                UPDATE Products 
                SET InventoryStatus = 'available' 
                WHERE InventoryStatus IS NULL;
            END
        `);
        console.log('✅ Step 4 completed');
        
        console.log('✅ Migration completed successfully!\n');
        
        // Verify the InventoryStatus column was added
        console.log('🔍 Verifying InventoryStatus column exists...');
        const columnResult = await pool.request().query(`
            SELECT COUNT(*) as columnExists
            FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
            AND name = 'InventoryStatus'
        `);
        
        if (columnResult.recordset[0].columnExists > 0) {
            console.log('✅ InventoryStatus column verified in Products table!');
        } else {
            console.log('⚠️  Warning: InventoryStatus column not found. It may have already existed.');
        }
        
        // Verify the ProductInventory table was created
        console.log('🔍 Verifying ProductInventory table exists...');
        const tableResult = await pool.request().query(`
            SELECT COUNT(*) as tableExists
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = 'dbo' 
            AND TABLE_NAME = 'ProductInventory'
        `);
        
        if (tableResult.recordset[0].tableExists > 0) {
            console.log('✅ ProductInventory table verified!');
            
            // Get table statistics
            const statsResult = await pool.request().query(`
                SELECT 
                    COUNT(*) as totalItems,
                    SUM(CASE WHEN InventoryStatus = 'available' THEN Quantity ELSE 0 END) as availableItems,
                    SUM(CASE WHEN InventoryStatus = 'damaged' THEN Quantity ELSE 0 END) as damagedItems,
                    SUM(CASE WHEN InventoryStatus = 'returned' THEN Quantity ELSE 0 END) as returnedItems
                FROM ProductInventory
                WHERE IsActive = 1
            `);
            
            const stats = statsResult.recordset[0];
            console.log('\n📊 ProductInventory Statistics:');
            console.log(`   Total Items: ${stats.totalItems}`);
            console.log(`   Available: ${stats.availableItems}`);
            console.log(`   Damaged: ${stats.damagedItems}`);
            console.log(`   Returned: ${stats.returnedItems}`);
        } else {
            console.log('⚠️  Warning: ProductInventory table not found. Please check the migration script.');
        }
        
        // Check products with InventoryStatus
        const productsResult = await pool.request().query(`
            SELECT 
                COUNT(*) as totalProducts,
                SUM(CASE WHEN InventoryStatus = 'available' THEN 1 ELSE 0 END) as availableProducts,
                SUM(CASE WHEN InventoryStatus IS NULL THEN 1 ELSE 0 END) as nullStatusProducts
            FROM Products
            WHERE IsActive = 1
        `);
        
        const productStats = productsResult.recordset[0];
        console.log('\n📊 Products Statistics:');
        console.log(`   Total Products: ${productStats.totalProducts}`);
        console.log(`   Products with 'available' status: ${productStats.availableProducts}`);
        console.log(`   Products with NULL status: ${productStats.nullStatusProducts}`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Error details:', error);
        if (error.number) {
            console.error(`SQL Error Number: ${error.number}`);
        }
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

