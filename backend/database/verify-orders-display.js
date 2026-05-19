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
    console.log('✅ Checking DeliveryRates...');
    return pool.request().query('SELECT RateID, ServiceType, Price FROM DeliveryRates').then(r => {
        console.log('DeliveryRates:', JSON.stringify(r.recordset, null, 2));
        console.log('\n✅ Testing DeliveryTypeName query...');
        return pool.request().query(`
            SELECT o.OrderID, o.DeliveryType, 
                   CASE 
                       WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                       WHEN o.DeliveryType LIKE 'rate_%' THEN dr.ServiceType
                       ELSE o.DeliveryType
                   END as DeliveryTypeName,
                   dr.ServiceType as JoinedServiceType
            FROM Orders o
            LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
            WHERE o.Status = 'Pending'
        `);
    });
}).then(r => {
    console.log('\nOrder DeliveryTypeName results:');
    console.log(JSON.stringify(r.recordset, null, 2));
    console.log('\n✅ All checks complete!');
    process.exit(0);
}).catch(e => {
    console.log('Error:', e.message);
    process.exit(1);
});

