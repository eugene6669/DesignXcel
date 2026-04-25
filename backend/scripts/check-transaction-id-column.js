/**
 * Script to check if TransactionID column exists and verify its properties
 */

require('dotenv').config();
const sql = require('mssql');

// Parse connection string helper
function parseConnectionString(connectionString) {
    const config = {};
    const pairs = connectionString.split(';');
    
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
            const cleanKey = key.trim().toLowerCase();
            const cleanValue = value.trim();
            
            switch (cleanKey) {
                case 'server':
                    let serverValue = cleanValue;
                    if (serverValue.startsWith('tcp:')) {
                        serverValue = serverValue.substring(4);
                    }
                    if (serverValue.includes(',')) {
                        serverValue = serverValue.split(',')[0];
                    }
                    serverValue = serverValue.replace(/\\\\/g, '\\');
                    config.server = serverValue;
                    break;
                case 'initial catalog':
                case 'database':
                    config.database = cleanValue;
                    break;
                case 'user id':
                    config.user = cleanValue;
                    break;
                case 'password':
                    config.password = cleanValue;
                    break;
                case 'encrypt':
                    config.options = config.options || {};
                    config.options.encrypt = cleanValue.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options = config.options || {};
                    config.options.trustServerCertificate = cleanValue.toLowerCase() === 'true';
                    break;
            }
        }
    }
    
    return config;
}

async function checkColumn() {
    let pool;
    
    try {
        console.log('🔍 Checking TransactionID column...\n');
        
        const connectionString = process.env.DB_CONNECTION_STRING;
        let dbConfig;
        
        if (connectionString) {
            const parsedConfig = parseConnectionString(connectionString);
            dbConfig = {
                ...parsedConfig,
                options: {
                    encrypt: parsedConfig.options?.encrypt ?? (process.env.NODE_ENV === 'production'),
                    trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
                    enableArithAbort: true
                }
            };
        } else {
            dbConfig = {
                server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
                user: process.env.DB_USERNAME || 'DesignXcel',
                password: process.env.DB_PASSWORD || 'Azwrathfrozen22@',
                database: process.env.DB_DATABASE || 'DesignXcellDB',
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || process.env.NODE_ENV !== 'production',
                    enableArithAbort: true
                }
            };
        }
        
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database\n');
        
        // Check column existence
        const columnCheck = await pool.request().query(`
            SELECT 
                c.name AS ColumnName,
                t.name AS DataType,
                c.max_length AS MaxLength,
                c.is_nullable AS IsNullable
            FROM sys.columns c
            INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
            WHERE c.object_id = OBJECT_ID(N'[dbo].[Orders]')
            AND c.name = 'TransactionID'
        `);
        
        if (columnCheck.recordset.length > 0) {
            const col = columnCheck.recordset[0];
            console.log('✅ TransactionID column found:');
            console.log(`   Name: ${col.ColumnName}`);
            console.log(`   Type: ${col.DataType}(${col.MaxLength})`);
            console.log(`   Nullable: ${col.IsNullable ? 'Yes' : 'No'}\n`);
        } else {
            console.log('❌ TransactionID column NOT found!\n');
        }
        
        // Check recent orders
        const ordersCheck = await pool.request().query(`
            SELECT TOP 5
                OrderID,
                ReferenceNumber,
                TransactionID,
                OrderDate,
                Status
            FROM Orders
            ORDER BY OrderDate DESC
        `);
        
        console.log('📊 Recent Orders:');
        ordersCheck.recordset.forEach(order => {
            console.log(`   OrderID: ${order.OrderID}, Ref: ${order.ReferenceNumber}, TransactionID: ${order.TransactionID || 'NULL'}, Status: ${order.Status}`);
        });
        
        // Test UPDATE
        console.log('\n🧪 Testing UPDATE statement...');
        const testTxnId = 'TXN20241113143052123456';
        const testOrderId = ordersCheck.recordset[0]?.OrderID;
        
        if (testOrderId) {
            try {
                const updateResult = await pool.request()
                    .input('orderId', sql.Int, testOrderId)
                    .input('transactionId', sql.NVarChar, testTxnId)
                    .query('UPDATE Orders SET TransactionID = @transactionId WHERE OrderID = @orderId');
                
                console.log(`✅ UPDATE test successful. Rows affected: ${updateResult.rowsAffected}`);
                
                // Verify
                const verifyResult = await pool.request()
                    .input('orderId', sql.Int, testOrderId)
                    .query('SELECT TransactionID FROM Orders WHERE OrderID = @orderId');
                
                console.log(`   Saved value: ${verifyResult.recordset[0]?.TransactionID || 'NULL'}`);
                
                // Reset it back
                await pool.request()
                    .input('orderId', sql.Int, testOrderId)
                    .query('UPDATE Orders SET TransactionID = NULL WHERE OrderID = @orderId');
                console.log('   Reset to NULL\n');
            } catch (err) {
                console.error('❌ UPDATE test failed:', err.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

checkColumn()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

