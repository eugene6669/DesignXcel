require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { generateProductIdentifiers } = require('../utils/generateProductIdentifiers');

// Use the same config as server.js
const connectionString = process.env.DB_CONNECTION_STRING;
let dbConfig;

if (connectionString) {
    const parsedConfig = {};
    connectionString.split(';').forEach(part => {
        const [key, value] = part.split('=');
        if (key && value) {
            const normalizedKey = key.trim().toLowerCase();
            if (normalizedKey === 'server' || normalizedKey === 'data source') {
                parsedConfig.server = value.trim();
            } else if (normalizedKey === 'database' || normalizedKey === 'initial catalog') {
                parsedConfig.database = value.trim();
            } else if (normalizedKey === 'user id' || normalizedKey === 'uid') {
                parsedConfig.user = value.trim();
            } else if (normalizedKey === 'password' || normalizedKey === 'pwd') {
                parsedConfig.password = value.trim();
            }
        }
    });
    
    dbConfig = {
        ...parsedConfig,
        options: {
            encrypt: process.env.NODE_ENV === 'production',
            trustServerCertificate: process.env.NODE_ENV !== 'production',
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

async function migrateProductIdentifiers() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Connected to database\n');

        // Get all products that need migration (old format or NULL)
        // Update: Also include products with SKU-XXXXXX format (without random component)
        const result = await pool.request().query(`
            SELECT 
                ProductID,
                Name,
                SKU,
                Slug,
                PublicId
            FROM Products
            WHERE 
                SKU IS NULL 
                OR SKU LIKE 'DX-%'
                OR SKU LIKE 'SKU-[0-9]%'  -- Old format: SKU-000001 (without random component)
                OR Slug IS NULL
                OR (Slug NOT LIKE '%-%' AND Slug NOT LIKE '%-000000')
            ORDER BY ProductID
        `);

        console.log(`Found ${result.recordset.length} products to migrate\n`);

        if (result.recordset.length === 0) {
            console.log('No products need migration.');
            await pool.close();
            return;
        }

        // Show what will be updated
        console.log('Products to be migrated:');
        result.recordset.forEach(product => {
            console.log(`  ProductID: ${product.ProductID}, Name: ${product.Name}`);
            console.log(`    Current SKU: ${product.SKU || 'NULL'}`);
            console.log(`    Current Slug: ${product.Slug || 'NULL'}`);
        });
        console.log('');

        // Ask for confirmation (in a real scenario, you'd use readline)
        console.log('This will update the above products to use the new format:');
        console.log('  SKU: SKU-XXXXXX (zero-padded ProductID)');
        console.log('  Slug: product-name-XXXXXX (product name + zero-padded ProductID)');
        console.log('  PublicId: Will be generated if NULL\n');

        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            let updated = 0;
            let skipped = 0;

            for (const product of result.recordset) {
                const { sku, slug } = generateProductIdentifiers(product.ProductID, product.Name);
                
                // Generate PublicId if NULL
                let publicId = product.PublicId;
                if (!publicId) {
                    const { generateGuid } = require('../utils/generateProductIdentifiers');
                    publicId = generateGuid();
                }

                // Update product
                await transaction.request()
                    .input('productId', sql.Int, product.ProductID)
                    .input('sku', sql.NVarChar, sku)
                    .input('slug', sql.NVarChar, slug)
                    .input('publicId', sql.NVarChar, publicId)
                    .query(`
                        UPDATE Products 
                        SET SKU = @sku, 
                            Slug = @slug,
                            PublicId = CAST(@publicId AS UNIQUEIDENTIFIER)
                        WHERE ProductID = @productId
                    `);

                console.log(`✓ Updated ProductID ${product.ProductID}: ${product.Name}`);
                console.log(`    SKU: ${product.SKU || 'NULL'} → ${sku}`);
                console.log(`    Slug: ${product.Slug || 'NULL'} → ${slug}`);
                if (!product.PublicId) {
                    console.log(`    PublicId: NULL → ${publicId}`);
                }
                console.log('');

                updated++;
            }

            await transaction.commit();
            console.log(`\n✅ Migration completed successfully!`);
            console.log(`   Updated: ${updated} products`);
            console.log(`   Skipped: ${skipped} products`);

        } catch (err) {
            await transaction.rollback();
            console.error('❌ Error during migration, transaction rolled back:', err);
            throw err;
        }

        await pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

migrateProductIdentifiers();

