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
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME LIKE '%Delivery%' OR TABLE_NAME LIKE '%Rate%'
    `);
}).then(r => {
    console.log('Delivery/Rate tables:', r.recordset.map(t => t.TABLE_NAME).join(', ') || 'None found');
    process.exit(0);
}).catch(e => {
    console.log('Error:', e.message);
    process.exit(1);
});

