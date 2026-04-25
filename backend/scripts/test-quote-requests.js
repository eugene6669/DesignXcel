// Test script to check quote requests in database
require('dotenv').config();
const sql = require('mssql');

async function testQuoteRequests() {
    try {
        const pool = await sql.connect({
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            options: {
                encrypt: process.env.DB_ENCRYPT === 'true',
                trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
            }
        });

        console.log('✓ Connected to database');

        // Check if table exists
        const tableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'BulkOrderQuotes'
        `);

        if (tableCheck.recordset.length === 0) {
            console.log('❌ BulkOrderQuotes table does not exist');
            console.log('Creating table...');
            
            // Create table
            await pool.request().query(`
                CREATE TABLE [dbo].[BulkOrderQuotes] (
                    QuoteID INT IDENTITY(1,1) PRIMARY KEY,
                    CompanyName NVARCHAR(255) NOT NULL,
                    ContactName NVARCHAR(255) NOT NULL,
                    Email NVARCHAR(255) NOT NULL,
                    Phone NVARCHAR(50) NOT NULL,
                    Notes NVARCHAR(1000) NULL,
                    EstimatedTotal DECIMAL(10,2) NOT NULL,
                    TotalQuantity INT NOT NULL,
                    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
                    CreatedAt DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                    UpdatedAt DATETIME2(0) NULL,
                    RespondedAt DATETIME2(0) NULL,
                    RespondedBy INT NULL,
                    ResponseNotes NVARCHAR(1000) NULL
                );
                
                CREATE INDEX IX_BulkOrderQuotes_Status ON BulkOrderQuotes(Status);
                CREATE INDEX IX_BulkOrderQuotes_CreatedAt ON BulkOrderQuotes(CreatedAt);
                CREATE INDEX IX_BulkOrderQuotes_Email ON BulkOrderQuotes(Email);
            `);
            
            console.log('✓ BulkOrderQuotes table created');
        } else {
            console.log('✓ BulkOrderQuotes table exists');
        }

        // Check if BulkOrderQuoteItems table exists
        const itemsTableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'BulkOrderQuoteItems'
        `);

        if (itemsTableCheck.recordset.length === 0) {
            console.log('Creating BulkOrderQuoteItems table...');
            
            await pool.request().query(`
                CREATE TABLE [dbo].[BulkOrderQuoteItems] (
                    QuoteItemID INT IDENTITY(1,1) PRIMARY KEY,
                    QuoteID INT NOT NULL,
                    ProductID INT NOT NULL,
                    ProductName NVARCHAR(255) NOT NULL,
                    SKU NVARCHAR(100) NULL,
                    Quantity INT NOT NULL,
                    UnitPrice DECIMAL(10,2) NOT NULL,
                    CreatedAt DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT FK_BulkOrderQuoteItems_Quotes FOREIGN KEY (QuoteID) REFERENCES BulkOrderQuotes(QuoteID) ON DELETE CASCADE,
                    CONSTRAINT FK_BulkOrderQuoteItems_Products FOREIGN KEY (ProductID) REFERENCES Products(ProductID)
                );
                
                CREATE INDEX IX_BulkOrderQuoteItems_QuoteID ON BulkOrderQuoteItems(QuoteID);
                CREATE INDEX IX_BulkOrderQuoteItems_ProductID ON BulkOrderQuoteItems(ProductID);
            `);
            
            console.log('✓ BulkOrderQuoteItems table created');
        } else {
            console.log('✓ BulkOrderQuoteItems table exists');
        }

        // Count quote requests
        const countResult = await pool.request().query('SELECT COUNT(*) as count FROM BulkOrderQuotes');
        const count = countResult.recordset[0].count;
        console.log(`\n📊 Total quote requests in database: ${count}`);

        if (count > 0) {
            // Get all quote requests
            const quotesResult = await pool.request().query(`
                SELECT TOP 10 
                    QuoteID, CompanyName, ContactName, Email, Phone, 
                    EstimatedTotal, TotalQuantity, Status, CreatedAt
                FROM BulkOrderQuotes
                ORDER BY CreatedAt DESC
            `);
            
            console.log('\n📋 Recent quote requests:');
            quotesResult.recordset.forEach((quote, index) => {
                console.log(`  ${index + 1}. Quote #${quote.QuoteID} - ${quote.CompanyName} (${quote.Email}) - Status: ${quote.Status}`);
            });
        } else {
            console.log('\nℹ️  No quote requests found in database.');
            console.log('   This is normal if no customers have submitted quote requests yet.');
        }

        await pool.close();
        console.log('\n✓ Test completed successfully');
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Error details:', {
            code: error.code,
            number: error.number
        });
        process.exit(1);
    }
}

testQuoteRequests();

