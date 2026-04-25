/**
 * Script to add status quantity columns to ProductInventory table
 * and consolidate to 1 row per product
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

async function addStatusQuantityColumns() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Check and add columns
            const columns = [
                { name: 'AvailableQuantity', defaultValue: 0 },
                { name: 'DamagedQuantity', defaultValue: 0 },
                { name: 'ReturnedQuantity', defaultValue: 0 },
                { name: 'RepairedQuantity', defaultValue: 0 },
                { name: 'DisposedQuantity', defaultValue: 0 }
            ];

            for (const col of columns) {
                const checkResult = await transaction.request().query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'ProductInventory' 
                    AND COLUMN_NAME = '${col.name}'
                `);

                if (checkResult.recordset.length === 0) {
                    await transaction.request().query(`
                        ALTER TABLE [dbo].[ProductInventory]
                        ADD ${col.name} INT NOT NULL DEFAULT ${col.defaultValue}
                    `);
                    console.log(`✅ Added ${col.name} column`);
                } else {
                    console.log(`ℹ️  ${col.name} column already exists`);
                }
            }

            // Consolidate existing rows into 1 row per product
            console.log('\n📊 Consolidating inventory rows...');
            
            // Get consolidated data
            const consolidatedResult = await transaction.request().query(`
                SELECT 
                    CASE 
                        WHEN ProductID IS NOT NULL THEN ProductID
                        ELSE InventoryProductID
                    END as ProductIdentifier,
                    MAX(ProductID) as ProductID,
                    MAX(InventoryProductID) as InventoryProductID,
                    SUM(CASE WHEN InventoryStatus = 'available' THEN Quantity ELSE 0 END) as AvailableQty,
                    SUM(CASE WHEN InventoryStatus = 'damaged' THEN Quantity ELSE 0 END) as DamagedQty,
                    SUM(CASE WHEN InventoryStatus = 'returned' THEN Quantity ELSE 0 END) as ReturnedQty,
                    SUM(CASE WHEN InventoryStatus = 'repaired' THEN Quantity ELSE 0 END) as RepairedQty,
                    SUM(CASE WHEN InventoryStatus = 'disposed' THEN Quantity ELSE 0 END) as DisposedQty,
                    MAX(ImageURL) as ImageURL,
                    MAX(Dimensions) as Dimensions,
                    MAX(Location) as Location,
                    MAX(Notes) as Notes,
                    MAX(DateAdded) as DateAdded,
                    MAX(CreatedBy) as CreatedBy,
                    MAX(UpdatedBy) as UpdatedBy
                FROM ProductInventory
                WHERE IsActive = 1
                GROUP BY 
                    CASE 
                        WHEN ProductID IS NOT NULL THEN ProductID
                        ELSE InventoryProductID
                    END
            `);

            console.log(`   Found ${consolidatedResult.recordset.length} products to consolidate`);

            if (consolidatedResult.recordset.length > 0) {
                // Delete all existing rows
                await transaction.request().query('DELETE FROM ProductInventory WHERE IsActive = 1');
                console.log('   Deleted existing rows');

                // Insert consolidated rows
                for (const row of consolidatedResult.recordset) {
                    const totalQty = (row.AvailableQty || 0) + (row.RepairedQty || 0);
                    const primaryStatus = (row.AvailableQty || 0) > 0 ? 'available' :
                                         (row.RepairedQty || 0) > 0 ? 'repaired' :
                                         (row.DamagedQty || 0) > 0 ? 'damaged' :
                                         (row.ReturnedQty || 0) > 0 ? 'returned' :
                                         (row.DisposedQty || 0) > 0 ? 'disposed' : 'available';

                    await transaction.request()
                        .input('productId', sql.Int, row.ProductID)
                        .input('inventoryProductId', sql.Int, row.InventoryProductID)
                        .input('status', sql.NVarChar, primaryStatus)
                        .input('quantity', sql.Int, totalQty)
                        .input('availableQty', sql.Int, row.AvailableQty || 0)
                        .input('damagedQty', sql.Int, row.DamagedQty || 0)
                        .input('returnedQty', sql.Int, row.ReturnedQty || 0)
                        .input('repairedQty', sql.Int, row.RepairedQty || 0)
                        .input('disposedQty', sql.Int, row.DisposedQty || 0)
                        .input('imageUrl', sql.NVarChar, row.ImageURL)
                        .input('dimensions', sql.NVarChar, row.Dimensions)
                        .input('location', sql.NVarChar, row.Location)
                        .input('notes', sql.NVarChar, row.Notes)
                        .input('dateAdded', sql.DateTime2, row.DateAdded)
                        .input('createdBy', sql.Int, row.CreatedBy)
                        .input('updatedBy', sql.Int, row.UpdatedBy)
                        .query(`
                            INSERT INTO ProductInventory 
                            (ProductID, InventoryProductID, InventoryStatus, Quantity, 
                             AvailableQuantity, DamagedQuantity, ReturnedQuantity, RepairedQuantity, DisposedQuantity,
                             ImageURL, Dimensions, Location, Notes, DateAdded, CreatedBy, UpdatedBy, IsActive)
                            VALUES 
                            (@productId, @inventoryProductId, @status, @quantity,
                             @availableQty, @damagedQty, @returnedQty, @repairedQty, @disposedQty,
                             @imageUrl, @dimensions, @location, @notes, @dateAdded, @createdBy, @updatedBy, 1)
                        `);
                }

                console.log(`✅ Inserted ${consolidatedResult.recordset.length} consolidated rows`);
            }

            // Verify
            const verifyResult = await transaction.request().query(`
                SELECT 
                    CASE 
                        WHEN ProductID IS NOT NULL THEN ProductID
                        ELSE InventoryProductID
                    END as ProductIdentifier,
                    COUNT(*) as [RowCount]
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
                console.log('\n⚠️  Warning: Some products still have multiple rows:');
                verifyResult.recordset.forEach(row => {
                    console.log(`   Product ${row.ProductIdentifier}: ${row['RowCount']} rows`);
                });
            } else {
                console.log('\n✅ Verification: All products now have exactly 1 row each');
            }

            await transaction.commit();
            console.log('\n✅ Migration completed successfully!');

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
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

addStatusQuantityColumns();

