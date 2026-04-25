const fs = require('fs');
const path = require('path');
const sql = require('mssql');
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

async function runMigration() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        const migrationScriptPath = path.join(__dirname, '..', 'database', 'create_inventory_product_variations_table.sql');
        const migrationScript = fs.readFileSync(migrationScriptPath, 'utf8');

        // Split by GO statements
        const batches = migrationScript.split(/GO\s*(\n|$)/i).filter(batch => batch.trim() !== '' && batch.toLowerCase() !== 'go');

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (batch) {
                console.log(`Step ${i + 1}: Executing batch...`);
                try {
                    await pool.request().query(batch);
                    console.log(`✅ Step ${i + 1} completed`);
                } catch (err) {
                    // Some errors are expected (like table already exists), so we'll continue
                    if (err.message.includes('already exists') || err.message.includes('already exists')) {
                        console.log(`⚠️  Step ${i + 1}: ${err.message}`);
                    } else {
                        throw err;
                    }
                }
            }
        }
        console.log('\n✅ Migration completed successfully!\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

runMigration();

