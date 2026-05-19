'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
        }
    };
    const sqlText = fs.readFileSync(
        path.join(__dirname, '..', 'database', 'add_variation_media_columns.sql'),
        'utf8'
    );
    const batches = sqlText.split(/\r?\nGO\r?\n/i).map((b) => b.trim()).filter(Boolean);
    const pool = await sql.connect(config);
    for (const batch of batches) {
        await pool.request().query(batch);
    }
    await pool.close();
    console.log('Variation media columns migration completed.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
