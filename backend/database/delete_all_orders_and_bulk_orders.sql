-- =============================================
-- Script: Delete All Orders and Bulk Orders
-- Description: Permanently deletes ALL orders, order items, bulk orders, and bulk order items
-- WARNING: This will permanently delete all order and bulk order data!
-- =============================================

USE DesignXcellDB;
GO

PRINT '================================================';
PRINT 'Starting Deletion of All Orders and Bulk Orders...';
PRINT '================================================';
PRINT '';

BEGIN TRANSACTION;

BEGIN TRY
    -- Step 1: Get initial counts
    DECLARE @InitialOrderItemCount INT;
    DECLARE @InitialOrderCount INT;
    DECLARE @InitialBulkOrderItemCount INT;
    DECLARE @InitialBulkOrderCount INT;
    
    SELECT @InitialOrderItemCount = COUNT(*) FROM OrderItems;
    SELECT @InitialOrderCount = COUNT(*) FROM Orders;
    SELECT @InitialBulkOrderItemCount = COUNT(*) FROM BulkOrderItems;
    SELECT @InitialBulkOrderCount = COUNT(*) FROM BulkOrders;
    
    PRINT 'Current Data:';
    PRINT '  - OrderItems: ' + CAST(@InitialOrderItemCount AS VARCHAR);
    PRINT '  - Orders: ' + CAST(@InitialOrderCount AS VARCHAR);
    PRINT '  - BulkOrderItems: ' + CAST(@InitialBulkOrderItemCount AS VARCHAR);
    PRINT '  - BulkOrders: ' + CAST(@InitialBulkOrderCount AS VARCHAR);
    PRINT '';
    
    IF @InitialOrderItemCount = 0 AND @InitialOrderCount = 0 AND 
       @InitialBulkOrderItemCount = 0 AND @InitialBulkOrderCount = 0
    BEGIN
        PRINT '✅ Database is already empty. Nothing to delete.';
        COMMIT TRANSACTION;
        RETURN;
    END
    
    -- Step 2: Check if BulkOrders has OrderID column and clear references
    PRINT 'Step 1: Checking for OrderID references in BulkOrders...';
    IF EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
        AND name = 'OrderID'
    )
    BEGIN
        DECLARE @ClearedCount INT;
        UPDATE BulkOrders SET OrderID = NULL WHERE OrderID IS NOT NULL;
        SET @ClearedCount = @@ROWCOUNT;
        PRINT '  ✅ Cleared OrderID references (' + CAST(@ClearedCount AS VARCHAR) + ' rows affected)';
    END
    ELSE
    BEGIN
        PRINT '  ✅ OrderID column does not exist in BulkOrders';
    END
    PRINT '';
    
    -- Step 3: Delete OrderItems (child of Orders)
    PRINT 'Step 2: Deleting OrderItems...';
    DELETE FROM OrderItems;
    DECLARE @DeletedOrderItems INT = @@ROWCOUNT;
    PRINT '  ✅ Deleted ' + CAST(@DeletedOrderItems AS VARCHAR) + ' OrderItems';
    PRINT '';
    
    -- Step 3.5: Delete ProductReviews that reference Orders (if table exists)
    PRINT 'Step 2.5: Deleting ProductReviews that reference Orders...';
    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductReviews' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductReviews]') AND name = 'OrderID')
        BEGIN
            DELETE FROM ProductReviews WHERE OrderID IS NOT NULL;
            DECLARE @DeletedProductReviews INT = @@ROWCOUNT;
            PRINT '  ✅ Deleted ' + CAST(@DeletedProductReviews AS VARCHAR) + ' ProductReviews';
        END
        ELSE
        BEGIN
            PRINT '  ✅ ProductReviews table does not have OrderID column';
        END
    END
    ELSE
    BEGIN
        PRINT '  ✅ ProductReviews table does not exist';
    END
    PRINT '';
    
    -- Step 4: Delete Orders
    PRINT 'Step 3: Deleting Orders...';
    DELETE FROM Orders;
    DECLARE @DeletedOrders INT = @@ROWCOUNT;
    PRINT '  ✅ Deleted ' + CAST(@DeletedOrders AS VARCHAR) + ' Orders';
    PRINT '';
    
    -- Step 5: Delete BulkOrderItems (child of BulkOrders)
    PRINT 'Step 4: Deleting BulkOrderItems...';
    DELETE FROM BulkOrderItems;
    DECLARE @DeletedBulkOrderItems INT = @@ROWCOUNT;
    PRINT '  ✅ Deleted ' + CAST(@DeletedBulkOrderItems AS VARCHAR) + ' BulkOrderItems';
    PRINT '';
    
    -- Step 6: Delete BulkOrders
    PRINT 'Step 5: Deleting BulkOrders...';
    DELETE FROM BulkOrders;
    DECLARE @DeletedBulkOrders INT = @@ROWCOUNT;
    PRINT '  ✅ Deleted ' + CAST(@DeletedBulkOrders AS VARCHAR) + ' BulkOrders';
    PRINT '';
    
    -- Step 7: Reset identity seeds
    PRINT 'Step 6: Resetting identity seeds...';
    IF NOT EXISTS (SELECT 1 FROM OrderItems)
    BEGIN
        DBCC CHECKIDENT ('OrderItems', RESEED, 0);
        PRINT '  ✅ Reset OrderItems identity seed to 0';
    END
    ELSE
    BEGIN
        PRINT '  ⚠️  Warning: OrderItems table is not empty, cannot reset identity';
    END
    
    IF NOT EXISTS (SELECT 1 FROM Orders)
    BEGIN
        DBCC CHECKIDENT ('Orders', RESEED, 0);
        PRINT '  ✅ Reset Orders identity seed to 0';
    END
    ELSE
    BEGIN
        PRINT '  ⚠️  Warning: Orders table is not empty, cannot reset identity';
    END
    
    IF NOT EXISTS (SELECT 1 FROM BulkOrderItems)
    BEGIN
        DBCC CHECKIDENT ('BulkOrderItems', RESEED, 0);
        PRINT '  ✅ Reset BulkOrderItems identity seed to 0';
    END
    ELSE
    BEGIN
        PRINT '  ⚠️  Warning: BulkOrderItems table is not empty, cannot reset identity';
    END
    
    IF NOT EXISTS (SELECT 1 FROM BulkOrders)
    BEGIN
        DBCC CHECKIDENT ('BulkOrders', RESEED, 0);
        PRINT '  ✅ Reset BulkOrders identity seed to 0';
    END
    ELSE
    BEGIN
        PRINT '  ⚠️  Warning: BulkOrders table is not empty, cannot reset identity';
    END
    PRINT '';
    
    -- Step 8: Verify deletion
    DECLARE @FinalOrderItemCount INT;
    DECLARE @FinalOrderCount INT;
    DECLARE @FinalBulkOrderItemCount INT;
    DECLARE @FinalBulkOrderCount INT;
    
    SELECT @FinalOrderItemCount = COUNT(*) FROM OrderItems;
    SELECT @FinalOrderCount = COUNT(*) FROM Orders;
    SELECT @FinalBulkOrderItemCount = COUNT(*) FROM BulkOrderItems;
    SELECT @FinalBulkOrderCount = COUNT(*) FROM BulkOrders;
    
    PRINT 'Verification - Final Counts:';
    PRINT '  - OrderItems: ' + CAST(@FinalOrderItemCount AS VARCHAR);
    PRINT '  - Orders: ' + CAST(@FinalOrderCount AS VARCHAR);
    PRINT '  - BulkOrderItems: ' + CAST(@FinalBulkOrderItemCount AS VARCHAR);
    PRINT '  - BulkOrders: ' + CAST(@FinalBulkOrderCount AS VARCHAR);
    PRINT '';
    
    -- Commit the transaction
    COMMIT TRANSACTION;
    
    IF @FinalOrderItemCount = 0 AND @FinalOrderCount = 0 AND 
       @FinalBulkOrderItemCount = 0 AND @FinalBulkOrderCount = 0
    BEGIN
        PRINT '================================================';
        PRINT '✅ SUCCESS: All orders and bulk orders deleted!';
        PRINT 'Next OrderID will be: 1';
        PRINT 'Next OrderItemID will be: 1';
        PRINT 'Next BulkOrderID will be: 1';
        PRINT 'Next BulkOrderItemID will be: 1';
        PRINT '================================================';
    END
    ELSE
    BEGIN
        PRINT '================================================';
        PRINT '⚠️  WARNING: Some records may still exist.';
        PRINT 'Please check manually.';
        PRINT '================================================';
    END
    
END TRY
BEGIN CATCH
    -- Rollback on error
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    PRINT '';
    PRINT '================================================';
    PRINT '❌ ERROR: Deletion Failed!';
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT 'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);
    PRINT '================================================';
    
    -- Re-throw the error
    THROW;
END CATCH;

GO

-- Optional: Show current state of tables
PRINT '';
PRINT 'Current Table State:';
SELECT 
    'OrderItems' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('OrderItems') AS CurrentIdentity,
    IDENT_SEED('OrderItems') AS IdentitySeed
FROM OrderItems
UNION ALL
SELECT 
    'Orders' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('Orders') AS CurrentIdentity,
    IDENT_SEED('Orders') AS IdentitySeed
FROM Orders
UNION ALL
SELECT 
    'BulkOrderItems' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('BulkOrderItems') AS CurrentIdentity,
    IDENT_SEED('BulkOrderItems') AS IdentitySeed
FROM BulkOrderItems
UNION ALL
SELECT 
    'BulkOrders' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('BulkOrders') AS CurrentIdentity,
    IDENT_SEED('BulkOrders') AS IdentitySeed
FROM BulkOrders;

GO

