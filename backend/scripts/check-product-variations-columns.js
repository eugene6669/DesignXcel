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

async function checkColumns() {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');

        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'ProductVariations'
            ORDER BY ORDINAL_POSITION
        `);

        console.log('ProductVariations table columns:');
        console.table(result.recordset);

        // Check if Price column exists
        const hasPrice = result.recordset.some(col => col.COLUMN_NAME === 'Price');
        if (!hasPrice) {
            console.log('\n⚠️  Price column is missing! Adding it now...');
            
            await pool.request().query(`
                ALTER TABLE ProductVariations
                ADD Price DECIMAL(10, 2) NULL
            `);
            
            console.log('✅ Price column added successfully!');
        } else {
            console.log('\n✅ Price column exists');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkColumns();

