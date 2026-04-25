/**
 * Script to delete all products from the database
 * WARNING: This will permanently delete all products and related data
 */

require('dotenv').config();
const sql = require('mssql');
const readline = require('readline');

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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function deleteAllProducts() {
    let pool;
    
    try {
        console.log('⚠️  WARNING: This script will DELETE ALL PRODUCTS from the database!');
        console.log('This action cannot be undone.\n');
        
        const confirm1 = await askQuestion('Type "DELETE ALL PRODUCTS" to confirm: ');
        if (confirm1 !== 'DELETE ALL PRODUCTS') {
            console.log('❌ Confirmation failed. Aborting.');
            process.exit(0);
        }
        
        const confirm2 = await askQuestion('Are you absolutely sure? Type "YES" to continue: ');
        if (confirm2 !== 'YES') {
            console.log('❌ Second confirmation failed. Aborting.');
            process.exit(0);
        }
        
        console.log('\n🔄 Starting product deletion...\n');
        
        // Get database configuration
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
        
        console.log('📊 Connecting to database:', dbConfig.database);
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected successfully!\n');
        
        // Get count of products before deletion
        const countResult = await pool.request().query('SELECT COUNT(*) as count FROM Products WHERE IsActive = 1');
        const productCount = countResult.recordset[0].count;
        console.log(`📊 Found ${productCount} active products to delete.\n`);
        
        if (productCount === 0) {
            console.log('✅ No products to delete. Database is already empty.');
            process.exit(0);
        }
        
        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            // Delete related data first (in reverse order of dependencies)
            console.log('Step 1: Deleting ProductInventory items...');
            await transaction.request().query('DELETE FROM ProductInventory');
            console.log('✅ ProductInventory items deleted');
            
            console.log('Step 2: Deleting ProductVariations...');
            await transaction.request().query('DELETE FROM ProductVariations');
            console.log('✅ ProductVariations deleted');
            
            console.log('Step 3: Deleting ProductMaterials...');
            await transaction.request().query('DELETE FROM ProductMaterials');
            console.log('✅ ProductMaterials deleted');
            
            console.log('Step 4: Deleting ProductDiscounts...');
            await transaction.request().query('DELETE FROM ProductDiscounts');
            console.log('✅ ProductDiscounts deleted');
            
            console.log('Step 5: Deleting ProductReviews...');
            await transaction.request().query('DELETE FROM ProductReviews');
            console.log('✅ ProductReviews deleted');
            
            console.log('Step 6: Deleting OrderItems...');
            await transaction.request().query('DELETE FROM OrderItems');
            console.log('✅ OrderItems deleted');
            
            console.log('Step 7: Deleting Products...');
            await transaction.request().query('DELETE FROM Products');
            console.log('✅ Products deleted');
            
            await transaction.commit();
            console.log('\n✅ All products and related data deleted successfully!');
            
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
        
    } catch (error) {
        console.error('❌ Deletion failed:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Database connection closed.');
        }
        rl.close();
    }
}

// Run the deletion
deleteAllProducts()
    .then(() => {
        console.log('\n✨ Script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });

