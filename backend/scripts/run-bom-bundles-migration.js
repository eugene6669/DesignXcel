/**
 * Ensures BOM bundle tables and RawMaterials SKU/Supplier columns exist.
 * Run from repo root: node backend/scripts/run-bom-bundles-migration.js
 */
'use strict';

const path = require('path');
const sql = require('mssql');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
    server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
    user: process.env.DB_USERNAME || process.env.DB_USER || 'DesignXcel',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'DesignXcellDB',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false'
    }
};

async function run() {
    console.log('Connecting to', config.server, '/', config.database);
    const pool = await sql.connect(config);
    const { ensureBomBundleSchema } = require('../utils/bomBundleSchema');
    await ensureBomBundleSchema(pool);
    console.log('Done — RawMaterials.SKU, Supplier, and BOM tables are ready.');
    await pool.close();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
