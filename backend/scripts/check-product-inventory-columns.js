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
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'ProductInventory'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('ProductInventory table columns:');
        console.table(result.recordset);
        
        const hasDisposedQuantity = result.recordset.some(col => col.COLUMN_NAME === 'DisposedQuantity');
        const hasAvailableQuantity = result.recordset.some(col => col.COLUMN_NAME === 'AvailableQuantity');
        const hasDamagedQuantity = result.recordset.some(col => col.COLUMN_NAME === 'DamagedQuantity');
        const hasReturnedQuantity = result.recordset.some(col => col.COLUMN_NAME === 'ReturnedQuantity');
        const hasRepairedQuantity = result.recordset.some(col => col.COLUMN_NAME === 'RepairedQuantity');
        
        console.log('\nStatus quantity columns check:');
        console.log('AvailableQuantity:', hasAvailableQuantity ? '✅' : '❌');
        console.log('DamagedQuantity:', hasDamagedQuantity ? '✅' : '❌');
        console.log('ReturnedQuantity:', hasReturnedQuantity ? '✅' : '❌');
        console.log('RepairedQuantity:', hasRepairedQuantity ? '✅' : '❌');
        console.log('DisposedQuantity:', hasDisposedQuantity ? '✅' : '❌');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkColumns();

