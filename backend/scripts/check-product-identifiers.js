require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

// Use the same config as server.js
const connectionString = process.env.DB_CONNECTION_STRING;
let dbConfig;

if (connectionString) {
    // Parse connection string if available
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
    // Use individual database variables for local development
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

async function checkProductIdentifiers() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Connected to database\n');

        // Query to get all products with their SKU, Slug, and PublicId, ordered by ProductID
        const result = await pool.request().query(`
            SELECT TOP 20
                ProductID,
                Name,
                SKU,
                Slug,
                PublicId,
                DateAdded,
                CreatedAt
            FROM Products
            ORDER BY ProductID DESC
        `);

        console.log('=== Product Identifiers Comparison ===\n');
        console.log(`Total products found: ${result.recordset.length}\n`);

        if (result.recordset.length === 0) {
            console.log('No products found in database.');
            return;
        }

        // Group by format type
        const skuFormats = {
            'SKU-XXXXXX': [],
            'TEMP-SKU': [],
            'Other': [],
            'NULL': []
        };

        const slugFormats = {
            'product-name-XXXXXX': [],
            'temp-': [],
            'Other': [],
            'NULL': []
        };

        result.recordset.forEach(product => {
            const sku = product.SKU;
            const slug = product.Slug;
            const publicId = product.PublicId;

            // Categorize SKU
            if (!sku) {
                skuFormats['NULL'].push(product);
            } else if (sku.startsWith('SKU-') && /^SKU-\d{6}$/.test(sku)) {
                skuFormats['SKU-XXXXXX'].push(product);
            } else if (sku.startsWith('TEMP-SKU-')) {
                skuFormats['TEMP-SKU'].push(product);
            } else {
                skuFormats['Other'].push(product);
            }

            // Categorize Slug
            if (!slug) {
                slugFormats['NULL'].push(product);
            } else if (slug.startsWith('temp-')) {
                slugFormats['temp-'].push(product);
            } else if (slug.includes('-') && /-\d{6}$/.test(slug)) {
                slugFormats['product-name-XXXXXX'].push(product);
            } else {
                slugFormats['Other'].push(product);
            }
        });

        // Display SKU format analysis
        console.log('=== SKU Format Analysis ===');
        Object.keys(skuFormats).forEach(format => {
            if (skuFormats[format].length > 0) {
                console.log(`\n${format} (${skuFormats[format].length} products):`);
                skuFormats[format].slice(0, 5).forEach(p => {
                    console.log(`  ProductID: ${p.ProductID}, Name: ${p.Name?.substring(0, 30)}..., SKU: ${p.SKU || 'NULL'}`);
                });
                if (skuFormats[format].length > 5) {
                    console.log(`  ... and ${skuFormats[format].length - 5} more`);
                }
            }
        });

        // Display Slug format analysis
        console.log('\n\n=== Slug Format Analysis ===');
        Object.keys(slugFormats).forEach(format => {
            if (slugFormats[format].length > 0) {
                console.log(`\n${format} (${slugFormats[format].length} products):`);
                slugFormats[format].slice(0, 5).forEach(p => {
                    console.log(`  ProductID: ${p.ProductID}, Name: ${p.Name?.substring(0, 30)}..., Slug: ${p.Slug || 'NULL'}`);
                });
                if (slugFormats[format].length > 5) {
                    console.log(`  ... and ${slugFormats[format].length - 5} more`);
                }
            }
        });

        // Show recent vs old products
        console.log('\n\n=== Recent Products (Last 5) ===');
        result.recordset.slice(0, 5).forEach(product => {
            console.log(`ProductID: ${product.ProductID}`);
            console.log(`  Name: ${product.Name}`);
            console.log(`  SKU: ${product.SKU || 'NULL'}`);
            console.log(`  Slug: ${product.Slug || 'NULL'}`);
            console.log(`  PublicId: ${product.PublicId || 'NULL'}`);
            console.log(`  DateAdded: ${product.DateAdded || product.CreatedAt || 'NULL'}`);
            console.log('');
        });

        // Show oldest products
        const oldestResult = await pool.request().query(`
            SELECT TOP 5
                ProductID,
                Name,
                SKU,
                Slug,
                PublicId,
                DateAdded,
                CreatedAt
            FROM Products
            ORDER BY ProductID ASC
        `);

        console.log('\n=== Oldest Products (First 5) ===');
        oldestResult.recordset.forEach(product => {
            console.log(`ProductID: ${product.ProductID}`);
            console.log(`  Name: ${product.Name}`);
            console.log(`  SKU: ${product.SKU || 'NULL'}`);
            console.log(`  Slug: ${product.Slug || 'NULL'}`);
            console.log(`  PublicId: ${product.PublicId || 'NULL'}`);
            console.log(`  DateAdded: ${product.DateAdded || product.CreatedAt || 'NULL'}`);
            console.log('');
        });

        await pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkProductIdentifiers();

