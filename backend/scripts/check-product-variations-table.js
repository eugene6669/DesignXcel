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

async function checkTable() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        const result = await pool.request().query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'ProductVariations'
        `);
        
        if (result.recordset.length > 0) {
            console.log('✅ ProductVariations table exists');
            
            // Get columns
            const columns = await pool.request().query(`
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'ProductVariations'
                ORDER BY ORDINAL_POSITION
            `);
            console.log('\nProductVariations table columns:');
            console.table(columns.recordset);
        } else {
            console.log('❌ ProductVariations table does NOT exist');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkTable();

