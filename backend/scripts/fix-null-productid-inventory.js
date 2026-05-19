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

async function fixNullProductIDs() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Find ProductInventory entries with null ProductID but valid InventoryProductID
        console.log('📊 Checking for ProductInventory entries with null ProductID...\n');
        
        const checkResult = await pool.request().query(`
            SELECT 
                pi.InventoryID,
                pi.ProductID,
                pi.InventoryProductID,
                pi.Quantity,
                pi.AvailableQuantity,
                pi.InventoryStatus,
                ip.Name as InventoryProductName
            FROM ProductInventory pi
            LEFT JOIN InventoryProducts ip ON pi.InventoryProductID = ip.InventoryProductID
            WHERE pi.ProductID IS NULL 
                AND pi.InventoryProductID IS NOT NULL
                AND pi.IsActive = 1
            ORDER BY pi.InventoryID
        `);

        const nullEntries = checkResult.recordset;
        console.log(`Found ${nullEntries.length} ProductInventory entries with null ProductID\n`);

        if (nullEntries.length === 0) {
            console.log('✅ No entries to fix. All ProductInventory entries have valid ProductID or InventoryProductID.\n');
            return;
        }

        // Check if there are matching products in Products table by name
        console.log('🔍 Checking for matching products in Products table...\n');
        
        let fixedCount = 0;
        let skippedCount = 0;

        for (const entry of nullEntries) {
            if (!entry.InventoryProductName) {
                console.log(`⚠️  Skipping InventoryID ${entry.InventoryID}: No matching InventoryProduct found`);
                skippedCount++;
                continue;
            }

            // Try to find matching product in Products table by name
            const productMatch = await pool.request()
                .input('productName', sql.NVarChar, entry.InventoryProductName)
                .query(`
                    SELECT ProductID, Name, StockQuantity
                    FROM Products
                    WHERE Name = @productName AND IsActive = 1
                `);

            if (productMatch.recordset.length > 0) {
                const product = productMatch.recordset[0];
                console.log(`📝 Found matching product: "${product.Name}" (ProductID: ${product.ProductID})`);
                
                // Update ProductInventory entry with ProductID
                // Need to set both InventoryProductID to NULL and ProductID in a single UPDATE due to CHECK constraint
                try {
                    await pool.request()
                        .input('inventoryId', sql.Int, entry.InventoryID)
                        .input('productId', sql.Int, product.ProductID)
                        .query(`
                            UPDATE ProductInventory
                            SET InventoryProductID = NULL,
                                ProductID = @productId
                            WHERE InventoryID = @inventoryId
                        `);
                    
                    console.log(`   ✅ Updated InventoryID ${entry.InventoryID} with ProductID ${product.ProductID} (removed InventoryProductID)\n`);
                    fixedCount++;
                } catch (updateErr) {
                    console.error(`   ❌ Error updating InventoryID ${entry.InventoryID}:`, updateErr.message);
                    skippedCount++;
                }
            } else {
                console.log(`⚠️  No matching product found for "${entry.InventoryProductName}" (InventoryID: ${entry.InventoryID})`);
                console.log(`   This entry is correctly linked to InventoryProducts table only.\n`);
                skippedCount++;
            }
        }

        console.log('\n📊 Summary:');
        console.log(`   ✅ Fixed: ${fixedCount} entries`);
        console.log(`   ⚠️  Skipped: ${skippedCount} entries`);
        console.log(`   📦 Total checked: ${nullEntries.length} entries\n`);

        // Verify fix
        console.log('🔍 Verifying fix...\n');
        const verifyResult = await pool.request().query(`
            SELECT COUNT(*) as NullCount
            FROM ProductInventory
            WHERE ProductID IS NULL 
                AND InventoryProductID IS NOT NULL
                AND IsActive = 1
        `);

        const remainingNulls = verifyResult.recordset[0].NullCount;
        if (remainingNulls === 0) {
            console.log('✅ All ProductInventory entries now have valid ProductID or InventoryProductID!\n');
        } else {
            console.log(`⚠️  ${remainingNulls} entries still have null ProductID (these are correctly linked to InventoryProducts only)\n`);
        }

    } catch (error) {
        console.error('❌ Error fixing null ProductIDs:', error.message);
        console.error(error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

fixNullProductIDs();

