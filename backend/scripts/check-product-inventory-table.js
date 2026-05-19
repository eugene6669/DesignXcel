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
            SELECT TABLE_NAME, TABLE_SCHEMA
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME LIKE '%Product%' OR TABLE_NAME LIKE '%Inventory%'
            ORDER BY TABLE_NAME
        `);
        
        console.log('Product/Inventory related tables:');
        console.table(result.recordset);
        
        // Check specifically for ProductInventory
        const productInventoryCheck = await pool.request().query(`
            SELECT TABLE_NAME, TABLE_SCHEMA
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'ProductInventory'
        `);
        
        if (productInventoryCheck.recordset.length > 0) {
            console.log('\n✅ ProductInventory table exists:');
            console.table(productInventoryCheck.recordset);
        } else {
            console.log('\n❌ ProductInventory table does NOT exist');
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

