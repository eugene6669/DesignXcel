/**
 * Creates dbo.InventoryProductMaterials if missing.
 * Usage: node backend/scripts/create-inventory-product-materials-table.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'DesignXcellDB',
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
        enableArithAbort: true
    }
};

async function tableExists(pool, tableName) {
    const r = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .query(`
            SELECT COUNT(*) AS c
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
        `);
    return r.recordset[0].c > 0;
}

async function main() {
    console.log('Connecting to', dbConfig.server, '/', dbConfig.database);
    const pool = await sql.connect(dbConfig);

    if (await tableExists(pool, 'InventoryProductMaterials')) {
        console.log('InventoryProductMaterials already exists.');
        await pool.close();
        process.exit(0);
    }

    if (!(await tableExists(pool, 'InventoryProducts'))) {
        console.error('ERROR: InventoryProducts table is missing. Run backend/database/create_inventory_products_table.sql first.');
        await pool.close();
        process.exit(1);
    }

    if (!(await tableExists(pool, 'RawMaterials'))) {
        console.error('ERROR: RawMaterials table is missing.');
        await pool.close();
        process.exit(1);
    }

    const sqlPath = path.join(__dirname, '../database/create_inventory_product_materials_table.sql');
    const script = fs.readFileSync(sqlPath, 'utf8');
    const batches = script.split(/\bGO\b/i).map((b) => b.trim()).filter(Boolean);

    for (const batch of batches) {
        if (batch) {
            await pool.request().query(batch);
        }
    }

    if (await tableExists(pool, 'InventoryProductMaterials')) {
        console.log('SUCCESS: InventoryProductMaterials table created.');
    } else {
        console.error('ERROR: Table was not created. Check SQL errors above.');
        process.exit(1);
    }

    await pool.close();
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
