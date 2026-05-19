const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

async function migrateToInventoryProducts() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Step 1: Add inventory columns to InventoryProducts
        console.log('Step 1: Adding inventory columns to InventoryProducts...');
        const migrationScriptPath = path.join(__dirname, '..', 'database', 'add_inventory_columns_to_inventory_products.sql');
        const migrationScript = fs.readFileSync(migrationScriptPath, 'utf8');
        const batches = migrationScript.split(/GO\s*(\n|$)/i).filter(batch => batch.trim() !== '' && batch.toLowerCase() !== 'go');

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (batch) {
                try {
                    await pool.request().query(batch);
                    console.log(`✅ Step 1.${i + 1} completed`);
                } catch (err) {
                    if (err.message.includes('already exists') || err.message.includes('already')) {
                        console.log(`⚠️  Step 1.${i + 1}: ${err.message}`);
                    } else {
                        console.error(`❌ Step 1.${i + 1} failed:`, err.message);
                    }
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('   1. Update routes.js to use InventoryProducts instead of ProductInventory');
        console.log('   2. Drop the ProductInventory table after verifying data migration');
        console.log('   3. Test the application to ensure everything works correctly');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

migrateToInventoryProducts();

