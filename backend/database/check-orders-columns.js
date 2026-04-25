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
        SELECT TOP 5 OrderID, ReferenceNumber, DeliveryType, ServiceType
        FROM Orders
        ORDER BY OrderDate DESC
    `);
}).then(result => {
    console.log('Sample Orders with DeliveryType and ServiceType:');
    result.recordset.forEach(order => {
        console.log(`   Order ${order.ReferenceNumber || order.OrderID}:`);
        console.log(`      DeliveryType: ${order.DeliveryType || 'NULL'}`);
        console.log(`      ServiceType: ${order.ServiceType || 'NULL'}`);
    });
    
    return sql.connect(dbConfig).then(pool => {
        return pool.request().query(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                CHARACTER_MAXIMUM_LENGTH,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Orders'
            AND (COLUMN_NAME = 'DeliveryType' OR COLUMN_NAME = 'ServiceType')
            ORDER BY COLUMN_NAME
        `);
    });
}).then(result => {
    console.log('\nColumn Details:');
    result.recordset.forEach(col => {
        console.log(`   ${col.COLUMN_NAME}: ${col.DATA_TYPE}(${col.CHARACTER_MAXIMUM_LENGTH || 'N/A'}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_DEFAULT ? 'DEFAULT: ' + col.COLUMN_DEFAULT : ''}`);
    });
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

