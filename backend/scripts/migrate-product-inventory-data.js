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

async function migrateData() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Check if ProductInventory table exists
        const tableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'ProductInventory'
        `);

        if (tableCheck.recordset.length === 0) {
            console.log('ℹ️  ProductInventory table does not exist. Nothing to migrate.');
            return;
        }

        // Check if ProductInventory has status quantity columns
        const columnCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ProductInventory' 
            AND COLUMN_NAME = 'AvailableQuantity'
        `);

        const hasStatusColumns = columnCheck.recordset.length > 0;

        console.log('📊 Migrating data from ProductInventory to InventoryProducts...\n');

        if (hasStatusColumns) {
            // Use status quantity columns
            const result = await pool.request().query(`
                UPDATE ip
                SET 
                    ip.AvailableQuantity = COALESCE(agg.AvailableQty, 0),
                    ip.DamagedQuantity = COALESCE(agg.DamagedQty, 0),
                    ip.ReturnedQuantity = COALESCE(agg.ReturnedQty, 0),
                    ip.RepairedQuantity = COALESCE(agg.RepairedQty, 0),
                    ip.DisposedQuantity = COALESCE(agg.DisposedQty, 0),
                    ip.InventoryStatus = CASE 
                        WHEN COALESCE(agg.AvailableQty, 0) > 0 THEN 'available'
                        WHEN COALESCE(agg.RepairedQty, 0) > 0 THEN 'repaired'
                        WHEN COALESCE(agg.DamagedQty, 0) > 0 THEN 'damaged'
                        WHEN COALESCE(agg.ReturnedQty, 0) > 0 THEN 'returned'
                        WHEN COALESCE(agg.DisposedQty, 0) > 0 THEN 'disposed'
                        ELSE 'available'
                    END,
                    ip.InventoryNotes = agg.Notes
                FROM InventoryProducts ip
                INNER JOIN (
                    SELECT 
                        InventoryProductID,
                        SUM(COALESCE(AvailableQuantity, 0)) as AvailableQty,
                        SUM(COALESCE(DamagedQuantity, 0)) as DamagedQty,
                        SUM(COALESCE(ReturnedQuantity, 0)) as ReturnedQty,
                        SUM(COALESCE(RepairedQuantity, 0)) as RepairedQty,
                        SUM(COALESCE(DisposedQuantity, 0)) as DisposedQty,
                        MAX(Notes) as Notes
                    FROM ProductInventory
                    WHERE InventoryProductID IS NOT NULL AND IsActive = 1
                    GROUP BY InventoryProductID
                ) agg ON ip.InventoryProductID = agg.InventoryProductID
            `);
            console.log(`✅ Migrated ${result.rowsAffected[0]} inventory products`);
        } else {
            // Use InventoryStatus and Quantity
            const result = await pool.request().query(`
                UPDATE ip
                SET 
                    ip.AvailableQuantity = COALESCE(agg.AvailableQty, 0),
                    ip.DamagedQuantity = COALESCE(agg.DamagedQty, 0),
                    ip.ReturnedQuantity = COALESCE(agg.ReturnedQty, 0),
                    ip.RepairedQuantity = COALESCE(agg.RepairedQty, 0),
                    ip.DisposedQuantity = COALESCE(agg.DisposedQty, 0),
                    ip.InventoryStatus = CASE 
                        WHEN COALESCE(agg.AvailableQty, 0) > 0 THEN 'available'
                        WHEN COALESCE(agg.RepairedQty, 0) > 0 THEN 'repaired'
                        WHEN COALESCE(agg.DamagedQty, 0) > 0 THEN 'damaged'
                        WHEN COALESCE(agg.ReturnedQty, 0) > 0 THEN 'returned'
                        WHEN COALESCE(agg.DisposedQty, 0) > 0 THEN 'disposed'
                        ELSE 'available'
                    END,
                    ip.InventoryNotes = agg.Notes
                FROM InventoryProducts ip
                INNER JOIN (
                    SELECT 
                        InventoryProductID,
                        SUM(CASE WHEN InventoryStatus = 'available' THEN Quantity ELSE 0 END) as AvailableQty,
                        SUM(CASE WHEN InventoryStatus = 'damaged' THEN Quantity ELSE 0 END) as DamagedQty,
                        SUM(CASE WHEN InventoryStatus = 'returned' THEN Quantity ELSE 0 END) as ReturnedQty,
                        SUM(CASE WHEN InventoryStatus = 'repaired' THEN Quantity ELSE 0 END) as RepairedQty,
                        SUM(CASE WHEN InventoryStatus = 'disposed' THEN Quantity ELSE 0 END) as DisposedQty,
                        MAX(Notes) as Notes
                    FROM ProductInventory
                    WHERE InventoryProductID IS NOT NULL AND IsActive = 1
                    GROUP BY InventoryProductID
                ) agg ON ip.InventoryProductID = agg.InventoryProductID
            `);
            console.log(`✅ Migrated ${result.rowsAffected[0]} inventory products`);
        }

        console.log('\n✅ Data migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

migrateData();

