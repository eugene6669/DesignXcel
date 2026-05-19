require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sql = require('mssql');

async function testBulkOrder() {
    try {
        const config = {
            server: process.env.DB_SERVER || 'DESKTOP-F4OI6BT\\SQLEXPRESS',
            database: process.env.DB_NAME || 'DesignXcellDB',
            user: process.env.DB_USER || 'DesignXcel',
            password: process.env.DB_PASSWORD || 'Azwrath22@',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };

        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('✓ Connected to database');

        // Test UUID lookup
        const testUUID = 'f21efdd9-5d69-4a7a-9e5d-42c7a60a3ce3';
        console.log(`\nTesting UUID lookup for: ${testUUID}`);
        
        const lookupResult = await pool.request()
            .input('publicId', sql.UniqueIdentifier, testUUID)
            .query('SELECT ProductID, PublicId, Name FROM Products WHERE PublicId = @publicId AND IsActive = 1');
        
        if (lookupResult.recordset.length > 0) {
            console.log('✓ UUID lookup successful:', lookupResult.recordset[0]);
            const productId = lookupResult.recordset[0].ProductID;
            
            // Test transaction
            console.log('\nTesting transaction...');
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            console.log('✓ Transaction started');
            
            try {
                // Test bulk order insert
                const request = transaction.request();
                request.input('customerEmail', sql.NVarChar(255), 'test@example.com')
                    .input('totalQuantity', sql.Int, 1)
                    .input('subtotal', sql.Decimal(10, 2), 100.00)
                    .input('discount', sql.Decimal(10, 2), 0)
                    .input('grandTotal', sql.Decimal(10, 2), 100.00)
                    .input('status', sql.NVarChar(50), 'Pending');
                
                const insertQuery = `
                    INSERT INTO BulkOrders (
                        CustomerEmail, TotalQuantity, 
                        Subtotal, DiscountAmount, GrandTotal, 
                        Status, CreatedAt
                    )
                    OUTPUT INSERTED.BulkOrderID
                    VALUES (
                        @customerEmail, @totalQuantity,
                        @subtotal, @discount, @grandTotal,
                        @status, GETDATE()
                    )
                `;
                
                console.log('Executing bulk order insert...');
                const bulkOrderResult = await request.query(insertQuery);
                const bulkOrderId = bulkOrderResult.recordset[0].BulkOrderID;
                console.log(`✓ Bulk order created with ID: ${bulkOrderId}`);
                
                // Test item insert
                const itemRequest = transaction.request()
                    .input('bulkOrderId', sql.Int, bulkOrderId)
                    .input('productId', sql.Int, productId)
                    .input('productName', sql.NVarChar(255), 'Test Product')
                    .input('sku', sql.NVarChar(100), 'TEST-SKU')
                    .input('quantity', sql.Int, 1)
                    .input('unitPrice', sql.Decimal(10, 2), 100.00)
                    .input('discountPercent', sql.Decimal(5, 2), 0)
                    .input('discountedPrice', sql.Decimal(10, 2), 100.00)
                    .input('itemTotal', sql.Decimal(10, 2), 100.00);
                
                console.log('Executing item insert...');
                await itemRequest.query(`
                    INSERT INTO BulkOrderItems (
                        BulkOrderID, ProductID, ProductName, SKU,
                        Quantity, UnitPrice, DiscountPercent,
                        DiscountedPrice, ItemTotal, CreatedAt
                    )
                    VALUES (
                        @bulkOrderId, @productId, @productName, @sku,
                        @quantity, @unitPrice, @discountPercent,
                        @discountedPrice, @itemTotal, GETDATE()
                    )
                `);
                console.log('✓ Item inserted successfully');
                
                // Rollback test transaction
                await transaction.rollback();
                console.log('\n✓ Transaction rolled back (test complete)');
                
            } catch (txError) {
                await transaction.rollback();
                console.error('❌ Transaction error:', txError);
                throw txError;
            }
            
        } else {
            console.error('❌ UUID lookup failed - product not found');
        }
        
        await pool.close();
        console.log('\n✓ All tests passed!');
        
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            number: error.number,
            state: error.state,
            class: error.class
        });
        process.exit(1);
    }
}

testBulkOrder();

