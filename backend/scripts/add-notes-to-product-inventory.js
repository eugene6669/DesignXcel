/**
 * Script to add Notes column to ProductInventory table
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

async function addNotesColumn() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        // Check if column exists
        const checkResult = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ProductInventory' 
            AND COLUMN_NAME = 'Notes'
        `);

        if (checkResult.recordset.length > 0) {
            console.log('✅ Notes column already exists in ProductInventory table.');
            return;
        }

        // Add Notes column
        await pool.request().query(`
            ALTER TABLE [dbo].[ProductInventory]
            ADD Notes NVARCHAR(MAX) NULL
        `);

        console.log('✅ Notes column added to ProductInventory table successfully!');

    } catch (error) {
        console.error('❌ Error adding Notes column:', error.message);
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

addNotesColumn();

