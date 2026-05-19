/**
 * Check Orders table structure
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'DesignXcellDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true,
        enableArithAbort: true
    }
};

sql.connect(dbConfig).then(pool => {
    return pool.request().query(`
        SELECT 
            COLUMN_NAME,
            DATA_TYPE,
            CHARACTER_MAXIMUM_LENGTH,
            IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Orders'
        AND COLUMN_NAME LIKE '%Delivery%' OR COLUMN_NAME LIKE '%Service%'
        ORDER BY ORDINAL_POSITION
    `);
}).then(result => {
    console.log('Orders table columns related to Delivery/Service:');
    result.recordset.forEach(col => {
        console.log(`   ${col.COLUMN_NAME}: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? '(' + col.CHARACTER_MAXIMUM_LENGTH + ')' : ''} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

