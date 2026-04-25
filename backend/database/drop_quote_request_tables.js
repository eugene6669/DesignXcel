/**
 * Drop Quote Request Tables Script
 * 
 * This script drops the BulkOrderQuotes and BulkOrderQuoteItems tables
 * from the database after removing quote request functionality.
 * 
 * Usage:
 *   node backend/database/drop_quote_request_tables.js
 */

require('dotenv').config();
const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// Parse connection string function (same as server.js)
function parseConnectionString(connectionString) {
    const config = {
        options: {}
    };
    
    const parts = connectionString.split(';').filter(part => part.trim().length > 0);
    
    for (const part of parts) {
        const [key, ...valueParts] = part.split('=');
        const cleanKey = key.trim().toLowerCase();
        const cleanValue = valueParts.join('=').trim();
        
        if (cleanValue) {
            switch (cleanKey) {
                case 'server':
                case 'data source':
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
                    config.options.encrypt = cleanValue.toLowerCase() === 'true';
                    break;
                case 'trustservercertificate':
                    config.options.trustServerCertificate = cleanValue.toLowerCase() === 'true';
                    break;
            }
        }
    }
    
    return config;
}

// Load database configuration (matching server.js configuration)
const connectionString = process.env.DB_CONNECTION_STRING;
let dbConfig;

if (connectionString) {
    console.log('Using DB_CONNECTION_STRING from environment');
    const parsedConfig = parseConnectionString(connectionString);
    
    dbConfig = {
        ...parsedConfig,
        options: {
            encrypt: parsedConfig.options?.encrypt ?? false,
            trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? true,
            enableArithAbort: true
        },
        requestTimeout: 30000,
        connectionTimeout: 30000
    };
    
    console.log('Parsed database config:');
    console.log('  Server:', dbConfig.server);
    console.log('  Database:', dbConfig.database);
    console.log('  User:', dbConfig.user || 'Windows Auth');
    console.log('  Encrypt:', dbConfig.options.encrypt);
    console.log('  Trust Certificate:', dbConfig.options.trustServerCertificate);
} else {
    console.log('Using individual database variables');
    const hasPassword = process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '';
    
    dbConfig = {
        server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
        database: process.env.DB_NAME || process.env.DB_DATABASE || 'DesignXcellDB',
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true' || false,
            trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
            enableArithAbort: true
        },
        requestTimeout: 30000,
        connectionTimeout: 30000
    };
    
    if (hasPassword) {
        dbConfig.user = process.env.DB_USERNAME || process.env.DB_USER || 'DesignXcel';
        dbConfig.password = process.env.DB_PASSWORD;
        console.log('Using SQL Server Authentication');
    } else {
        dbConfig.options.trustedConnection = true;
        console.log('Attempting Windows Authentication');
    }
    
    console.log('Database Configuration:');
    console.log('  Server:', dbConfig.server);
    console.log('  Database:', dbConfig.database);
    console.log('  User:', dbConfig.user || 'Windows Auth');
    console.log('  Encrypt:', dbConfig.options.encrypt);
    console.log('  Trust Certificate:', dbConfig.options.trustServerCertificate);
}
console.log('');

async function dropQuoteRequestTables() {
    let pool;
    
    try {
        console.log('Connecting to database...');
        pool = await sql.connect(dbConfig);
        console.log('Connected to database successfully!');
        
        console.log('\nDropping quote request tables...');
        console.log('=====================================\n');
        
        const request = pool.request();
        
        // Drop BulkOrderQuoteItems table first (due to foreign key constraints)
        console.log('Checking for BulkOrderQuoteItems table...');
        try {
            // Check if table exists
            const tableCheck = await request.query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'BulkOrderQuoteItems'
            `);
            
            if (tableCheck.recordset.length > 0) {
                console.log('  → BulkOrderQuoteItems table found. Dropping...');
                
                // Drop foreign key constraints first
                try {
                    await request.query(`
                        IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Quotes' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
                            ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Quotes;
                    `);
                    console.log('    ✓ Dropped FK_BulkOrderQuoteItems_Quotes constraint');
                } catch (fkError) {
                    console.log('    ℹ FK_BulkOrderQuoteItems_Quotes constraint not found or already dropped');
                }
                
                try {
                    await request.query(`
                        IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Products' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
                            ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Products;
                    `);
                    console.log('    ✓ Dropped FK_BulkOrderQuoteItems_Products constraint');
                } catch (fkError) {
                    console.log('    ℹ FK_BulkOrderQuoteItems_Products constraint not found or already dropped');
                }
                
                // Drop the table
                await request.query(`DROP TABLE [dbo].[BulkOrderQuoteItems];`);
                console.log('  ✓ BulkOrderQuoteItems table dropped successfully!');
            } else {
                console.log('  ℹ BulkOrderQuoteItems table does not exist.');
            }
        } catch (error) {
            console.error('  ✗ Error dropping BulkOrderQuoteItems:', error.message);
            throw error;
        }
        
        console.log('');
        
        // Drop BulkOrderQuotes table
        console.log('Checking for BulkOrderQuotes table...');
        try {
            // Check if table exists
            const tableCheck = await request.query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'BulkOrderQuotes'
            `);
            
            if (tableCheck.recordset.length > 0) {
                console.log('  → BulkOrderQuotes table found. Dropping...');
                
                // Drop any foreign key constraints
                try {
                    const fkCheck = await request.query(`
                        SELECT name FROM sys.foreign_keys 
                        WHERE parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuotes]')
                    `);
                    
                    for (const fk of fkCheck.recordset) {
                        try {
                            await request.query(`
                                ALTER TABLE [dbo].[BulkOrderQuotes] DROP CONSTRAINT ${fk.name};
                            `);
                            console.log(`    ✓ Dropped foreign key constraint: ${fk.name}`);
                        } catch (fkError) {
                            console.log(`    ℹ Could not drop constraint ${fk.name}: ${fkError.message}`);
                        }
                    }
                } catch (fkError) {
                    console.log('    ℹ No foreign key constraints found or error checking constraints');
                }
                
                // Drop the table
                await request.query(`DROP TABLE [dbo].[BulkOrderQuotes];`);
                console.log('  ✓ BulkOrderQuotes table dropped successfully!');
            } else {
                console.log('  ℹ BulkOrderQuotes table does not exist.');
            }
        } catch (error) {
            console.error('  ✗ Error dropping BulkOrderQuotes:', error.message);
            throw error;
        }
        
        console.log('\n=====================================');
        console.log('Quote request tables dropped successfully!');
        console.log('=====================================\n');
        
    } catch (error) {
        console.error('\n❌ Error dropping quote request tables:');
        console.error('Error Message:', error.message);
        console.error('Error Code:', error.code);
        if (error.originalError) {
            console.error('Original Error:', error.originalError.message);
        }
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('Database connection closed.');
        }
    }
}

// Run the script
if (require.main === module) {
    dropQuoteRequestTables()
        .then(() => {
            console.log('Script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
}

module.exports = { dropQuoteRequestTables };

