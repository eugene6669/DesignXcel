/**
 * Database Connection Test Script
 * Tests SQL Server connection and provides diagnostic information
 */

require('dotenv').config();
const sql = require('mssql');

// Parse connection string helper
function parseConnectionString(connectionString) {
    const config = {};
    const parts = connectionString.split(';');
    
    parts.forEach(part => {
        const [key, value] = part.split('=').map(s => s.trim());
        if (key && value) {
            switch(key.toLowerCase()) {
                case 'server':
                    config.server = value;
                    break;
                case 'database':
                    config.database = value;
                    break;
                case 'user id':
                case 'uid':
                    config.user = value;
                    break;
                case 'password':
                case 'pwd':
                    config.password = value;
                    break;
                case 'encrypt':
                    config.options = config.options || {};
                    config.options.encrypt = value.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options = config.options || {};
                    config.options.trustServerCertificate = value.toLowerCase() === 'true';
                    break;
            }
        }
    });
    
    return config;
}

async function testConnection() {
    console.log('🔍 Testing SQL Server Connection...\n');
    
    const connectionString = process.env.DB_CONNECTION_STRING;
    let dbConfig;

    if (connectionString) {
        console.log('Using connection string from environment...');
        const parsedConfig = parseConnectionString(connectionString);
        dbConfig = {
            ...parsedConfig,
            options: {
                encrypt: parsedConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'),
                trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
                enableArithAbort: true
            },
            requestTimeout: 30000,
            connectionTimeout: 30000
        };
    } else {
        console.log('Using individual database variables...');
        dbConfig = {
            server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
            user: process.env.DB_USERNAME || 'DesignXcel',
            password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
            database: process.env.DB_DATABASE || 'DesignXcellDB',
            options: {
                encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
                trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
                enableArithAbort: true
            },
            requestTimeout: 30000,
            connectionTimeout: 30000
        };
    }

    console.log('\n📋 Connection Configuration:');
    console.log('  Server:', dbConfig.server);
    console.log('  Database:', dbConfig.database);
    console.log('  User:', dbConfig.user);
    console.log('  Password:', dbConfig.password ? '***' + dbConfig.password.slice(-3) : 'NOT SET');
    console.log('  Encrypt:', dbConfig.options?.encrypt || false);
    console.log('  Trust Certificate:', dbConfig.options?.trustServerCertificate || false);
    console.log('');

    try {
        console.log('⏳ Attempting to connect...');
        const pool = new sql.ConnectionPool(dbConfig);
        await pool.connect();
        
        console.log('✅ SUCCESS: Connected to database!\n');
        
        // Test a simple query
        console.log('⏳ Testing query...');
        const result = await pool.request().query('SELECT @@VERSION as Version, DB_NAME() as CurrentDatabase');
        
        console.log('✅ Query executed successfully!');
        console.log('\n📊 Database Information:');
        console.log('  Current Database:', result.recordset[0].CurrentDatabase);
        console.log('  SQL Server Version:', result.recordset[0].Version.split('\n')[0]);
        
        await pool.close();
        console.log('\n✅ Connection closed successfully.');
        process.exit(0);
        
    } catch (err) {
        console.error('\n❌ CONNECTION FAILED!\n');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.originalError) {
            console.error('\nOriginal Error:', err.originalError.message);
        }
        
        // Provide specific guidance based on error type
        if (err.code === 'ELOGIN') {
            const errorMessage = err.message || '';
            const originalError = err.originalError?.message || '';
            
            if (errorMessage.includes('password') && errorMessage.includes('expired') || 
                originalError.includes('password') && originalError.includes('expired')) {
                console.log('\n🔴 PASSWORD EXPIRED!');
                console.log('\n📋 TO FIX:');
                console.log('1. Open SQL Server Management Studio');
                console.log('2. Connect using Windows Authentication');
                console.log(`3. Run: ALTER LOGIN [${dbConfig.user}] WITH PASSWORD = 'NewPassword123!', CHECK_EXPIRATION = OFF;`);
                console.log('4. Update DB_PASSWORD in your .env file');
                console.log('5. Run this test again');
            } else {
                console.log('\n🔧 LOGIN ERROR - Possible causes:');
                console.log('  - Incorrect username or password');
                console.log('  - User does not exist');
                console.log('  - SQL Server authentication not enabled');
                console.log('  - Password expired');
            }
        } else if (err.code === 'ETIMEOUT') {
            console.log('\n🔧 TIMEOUT ERROR - Possible causes:');
            console.log('  - SQL Server service not running');
            console.log('  - Firewall blocking connection');
            console.log('  - Network connectivity issues');
            console.log('  - Wrong server name or port');
        } else if (err.code === 'ECONNREFUSED') {
            console.log('\n🔧 CONNECTION REFUSED - Possible causes:');
            console.log('  - SQL Server service not running');
            console.log('  - SQL Server not listening on expected port');
            console.log('  - Firewall blocking connection');
        } else if (err.code === 'ENOTFOUND') {
            console.log('\n🔧 SERVER NOT FOUND - Possible causes:');
            console.log('  - Incorrect server name:', dbConfig.server);
            console.log('  - DNS resolution failure');
            console.log('  - Server name should be: DESKTOP-F4OI6BT\\SQLEXPRESS');
        }
        
        console.log('\n💡 For detailed troubleshooting, see: docs/fixes/SQL_SERVER_PASSWORD_EXPIRED_FIX.md');
        process.exit(1);
    }
}

// Run the test
testConnection().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});

