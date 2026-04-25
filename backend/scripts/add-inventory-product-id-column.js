const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dbConfig = {
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

async function addInventoryProductIDColumn() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Check if InventoryProductID column exists
        const checkResult = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ProductInventory' 
            AND COLUMN_NAME = 'InventoryProductID'
        `);

        if (checkResult.recordset.length === 0) {
            console.log('Adding InventoryProductID column...');
            
            // Add the column
            await pool.request().query(`
                ALTER TABLE [dbo].[ProductInventory]
                ADD InventoryProductID INT NULL
            `);
            console.log('✅ Added InventoryProductID column');
            
            // Add foreign key constraint
            await pool.request().query(`
                ALTER TABLE [dbo].[ProductInventory]
                ADD CONSTRAINT FK_ProductInventory_InventoryProductID 
                FOREIGN KEY (InventoryProductID) REFERENCES InventoryProducts(InventoryProductID)
            `);
            console.log('✅ Added foreign key constraint');
            
            // Add index
            await pool.request().query(`
                CREATE INDEX IX_ProductInventory_InventoryProductID ON ProductInventory(InventoryProductID)
            `);
            console.log('✅ Added index');
            
            // Make ProductID nullable if needed
            await pool.request().query(`
                ALTER TABLE [dbo].[ProductInventory]
                ALTER COLUMN ProductID INT NULL
            `);
            console.log('✅ Made ProductID nullable');
            
            // Add check constraint
            await pool.request().query(`
                ALTER TABLE [dbo].[ProductInventory]
                ADD CONSTRAINT CK_ProductInventory_ProductReference CHECK (
                    (ProductID IS NOT NULL AND InventoryProductID IS NULL) OR 
                    (ProductID IS NULL AND InventoryProductID IS NOT NULL)
                )
            `);
            console.log('✅ Added check constraint');
        } else {
            console.log('ℹ️  InventoryProductID column already exists');
        }
        
        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

addInventoryProductIDColumn();

