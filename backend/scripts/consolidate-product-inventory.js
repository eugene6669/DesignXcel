/**
 * Script to consolidate ProductInventory table to 1 row per product
 * This merges multiple inventory items of the same product into a single row with total quantity
 */

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true
    }
};

async function consolidateInventory() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            console.log('Step 1: Getting current inventory items...');
            const currentItems = await transaction.request().query(`
                SELECT 
                    InventoryID,
                    ProductID,
                    InventoryProductID,
                    InventoryStatus,
                    Quantity,
                    ImageURL,
                    Dimensions,
                    Location,
                    Notes,
                    DateAdded,
                    IsActive
                FROM ProductInventory
                WHERE IsActive = 1
                ORDER BY 
                    CASE WHEN ProductID IS NOT NULL THEN ProductID ELSE InventoryProductID END,
                    DateAdded
            `);

            console.log(`   Found ${currentItems.recordset.length} active inventory items\n`);

            if (currentItems.recordset.length === 0) {
                console.log('No inventory items to consolidate.');
                await transaction.commit();
                return;
            }

            // Group items by product
            const productGroups = {};
            currentItems.recordset.forEach(item => {
                const productKey = item.ProductID 
                    ? `P_${item.ProductID}` 
                    : `IP_${item.InventoryProductID}`;
                
                if (!productGroups[productKey]) {
                    productGroups[productKey] = {
                        ProductID: item.ProductID,
                        InventoryProductID: item.InventoryProductID,
                        items: []
                    };
                }
                productGroups[productKey].items.push(item);
            });

            console.log(`Step 2: Grouped into ${Object.keys(productGroups).length} products\n`);

            // For each product group, consolidate into 1 row
            let consolidatedCount = 0;
            for (const [productKey, group] of Object.entries(productGroups)) {
                if (group.items.length <= 1) {
                    // Already 1 row, skip
                    continue;
                }

                console.log(`   Consolidating product ${productKey} (${group.items.length} items)...`);

                // Calculate totals
                const totalQuantity = group.items.reduce((sum, item) => sum + (item.Quantity || 1), 0);
                const availableQty = group.items
                    .filter(item => item.InventoryStatus === 'available')
                    .reduce((sum, item) => sum + (item.Quantity || 1), 0);
                const damagedQty = group.items
                    .filter(item => item.InventoryStatus === 'damaged')
                    .reduce((sum, item) => sum + (item.Quantity || 1), 0);
                const returnedQty = group.items
                    .filter(item => item.InventoryStatus === 'returned')
                    .reduce((sum, item) => sum + (item.Quantity || 1), 0);

                // Get the first item's details (most recent or first)
                const firstItem = group.items[0];
                const latestItem = group.items.reduce((latest, item) => 
                    new Date(item.DateAdded) > new Date(latest.DateAdded) ? item : latest
                );

                // Delete all existing rows for this product
                const inventoryIds = group.items.map(item => item.InventoryID);
                
                // Use parameterized query for deletion
                let deleteRequest = transaction.request();
                inventoryIds.forEach((id, index) => {
                    deleteRequest = deleteRequest.input(`id${index}`, sql.Int, id);
                });
                
                const placeholders = inventoryIds.map((_, i) => `@id${i}`).join(',');
                await deleteRequest.query(`
                    DELETE FROM ProductInventory 
                    WHERE InventoryID IN (${placeholders})
                `);

                // Insert new consolidated row using parameterized query
                const insertRequest = transaction.request()
                    .input('productId', sql.Int, group.ProductID)
                    .input('inventoryProductId', sql.Int, group.InventoryProductID)
                    .input('quantity', sql.Int, totalQuantity)
                    .input('imageUrl', sql.NVarChar, latestItem.ImageURL)
                    .input('dimensions', sql.NVarChar, latestItem.Dimensions)
                    .input('location', sql.NVarChar, latestItem.Location)
                    .input('notes', sql.NVarChar, latestItem.Notes);
                
                await insertRequest.query(`
                    INSERT INTO ProductInventory 
                    (ProductID, InventoryProductID, InventoryStatus, Quantity, ImageURL, Dimensions, Location, Notes, DateAdded, IsActive)
                    VALUES (
                        @productId,
                        @inventoryProductId,
                        'available',
                        @quantity,
                        @imageUrl,
                        @dimensions,
                        @location,
                        @notes,
                        GETDATE(),
                        1
                    )
                `);

                consolidatedCount++;
            }

            console.log(`\n✅ Consolidated ${consolidatedCount} products into 1 row each\n`);

            // Verify results
            const verifyResult = await transaction.request().query(`
                SELECT 
                    CASE 
                        WHEN ProductID IS NOT NULL THEN ProductID
                        ELSE InventoryProductID
                    END as ProductIdentifier,
                    COUNT(*) as [RowCount],
                    SUM(Quantity) as TotalQuantity
                FROM ProductInventory
                WHERE IsActive = 1
                GROUP BY 
                    CASE 
                        WHEN ProductID IS NOT NULL THEN ProductID
                        ELSE InventoryProductID
                    END
                HAVING COUNT(*) > 1
            `);

            if (verifyResult.recordset.length > 0) {
                console.log('⚠️  Warning: Some products still have multiple rows:');
                verifyResult.recordset.forEach(row => {
                    console.log(`   Product ${row.ProductIdentifier}: ${row['RowCount']} rows, Total Qty: ${row.TotalQuantity}`);
                });
            } else {
                console.log('✅ Verification: All products now have 1 row each');
            }

            await transaction.commit();
            console.log('\n✅ Consolidation completed successfully!');

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (error) {
        console.error('❌ Error consolidating inventory:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// Run the consolidation
consolidateInventory();

