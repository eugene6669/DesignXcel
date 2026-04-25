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

async function dropProductInventoryTable() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        const migrationScriptPath = path.join(__dirname, '..', 'database', 'drop_product_inventory_table.sql');
        const migrationScript = fs.readFileSync(migrationScriptPath, 'utf8');
        const batches = migrationScript.split(/GO\s*(\n|$)/i).filter(batch => batch.trim() !== '' && batch.toLowerCase() !== 'go');

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (batch) {
                console.log(`Step ${i + 1}: Executing batch...`);
                try {
                    await pool.request().query(batch);
                    console.log(`✅ Step ${i + 1} completed`);
                } catch (err) {
                    if (err.message.includes('does not exist') || err.message.includes('already')) {
                        console.log(`⚠️  Step ${i + 1}: ${err.message}`);
                    } else {
                        throw err;
                    }
                }
            }
        }
        console.log('\n✅ ProductInventory table dropped successfully!');

    } catch (error) {
        console.error('❌ Failed to drop ProductInventory table:', error.message);
        console.error(error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

dropProductInventoryTable();

