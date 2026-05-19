/**
 * Delete all products (Products + InventoryProducts) and related rows.
 * WARNING: Also deletes OrderItems and BulkOrderItems that reference products.
 *
 * Usage: node backend/scripts/delete-all-products.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');
const readline = require('readline');

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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function tableExists(transaction, tableName) {
    const r = await transaction.request()
        .input('tableName', sql.NVarChar, tableName)
        .query(`
            SELECT COUNT(*) AS c
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
        `);
    return r.recordset[0].c > 0;
}

async function deleteFrom(transaction, tableName) {
    if (!(await tableExists(transaction, tableName))) {
        console.log(`  (skip) ${tableName} — table not found`);
        return 0;
    }
    const r = await transaction.request().query(`DELETE FROM [dbo].[${tableName}]`);
    return r.rowsAffected[0] || 0;
}

async function main() {
    console.log('WARNING: Deletes ALL products, inventory products, variations, and order line items.\n');
    const c1 = await ask('Type DELETE ALL PRODUCTS to confirm: ');
    if (c1 !== 'DELETE ALL PRODUCTS') {
        console.log('Aborted.');
        process.exit(0);
    }

    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('Connected to', dbConfig.database, '\n');

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        const steps = [
            'CartItems',
            'WishlistItems',
            'ProductDiscounts',
            'ProductReviews',
            'BulkOrderItems',
            'OrderItems',
            'InventoryProductMaterials',
            'InventoryProductVariations',
            'ProductInventory',
            'ProductMaterials',
            'ProductVariations',
            'InventoryProducts',
            'Products'
        ];

        try {
            for (const table of steps) {
                console.log(`Deleting ${table}...`);
                const n = await deleteFrom(transaction, table);
                console.log(`  deleted ${n} row(s)`);
            }
            await transaction.commit();
            console.log('\nDone. All product-related data removed.');
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Failed:', err.message);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
        rl.close();
    }
}

main();
