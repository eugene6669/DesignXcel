-- =============================================
-- Script: Reset Orders and Order Items
-- Description: Removes all orders and order items, resets identity to 1
-- WARNING: This will permanently delete all order data!
-- =============================================

USE DesignXcellDB;
GO

PRINT '================================================';
PRINT 'Starting Order Data Reset...';
PRINT '================================================';

BEGIN TRANSACTION;

BEGIN TRY
    -- Step 1: Get counts before deletion
    DECLARE @OrderItemCount INT;
    DECLARE @OrderCount INT;
    
    SELECT @OrderItemCount = COUNT(*) FROM OrderItems;
    SELECT @OrderCount = COUNT(*) FROM Orders;
    
    PRINT '';
    PRINT 'Current Data:';
    PRINT '  - Order Items: ' + CAST(@OrderItemCount AS VARCHAR);
    PRINT '  - Orders: ' + CAST(@OrderCount AS VARCHAR);
    PRINT '';
    
    -- Step 2: Delete all order items first (foreign key constraint)
    DELETE FROM OrderItems;
    PRINT '✓ Deleted all Order Items';
    
    -- Step 3: Delete all orders
    DELETE FROM Orders;
    PRINT '✓ Deleted all Orders';
    
    -- Step 4: Reset identity seed for OrderItems
    IF EXISTS (SELECT 1 FROM OrderItems)
    BEGIN
        PRINT '⚠ Warning: OrderItems table is not empty, cannot reset identity';
    END
    ELSE
    BEGIN
        DBCC CHECKIDENT ('OrderItems', RESEED, 0);
        PRINT '✓ Reset OrderItems identity seed to 1';
    END
    
    -- Step 5: Reset identity seed for Orders
    IF EXISTS (SELECT 1 FROM Orders)
    BEGIN
        PRINT '⚠ Warning: Orders table is not empty, cannot reset identity';
    END
    ELSE
    BEGIN
        DBCC CHECKIDENT ('Orders', RESEED, 0);
        PRINT '✓ Reset Orders identity seed to 1';
    END
    
    -- Step 6: Verify the reset
    DECLARE @NewOrderItemCount INT;
    DECLARE @NewOrderCount INT;
    
    SELECT @NewOrderItemCount = COUNT(*) FROM OrderItems;
    SELECT @NewOrderCount = COUNT(*) FROM Orders;
    
    PRINT '';
    PRINT 'After Reset:';
    PRINT '  - Order Items: ' + CAST(@NewOrderItemCount AS VARCHAR);
    PRINT '  - Orders: ' + CAST(@NewOrderCount AS VARCHAR);
    PRINT '';
    
    -- Commit the transaction
    COMMIT TRANSACTION;
    
    PRINT '================================================';
    PRINT '✅ Order Reset Completed Successfully!';
    PRINT 'Next OrderID will be: 1';
    PRINT 'Next OrderItemID will be: 1';
    PRINT '================================================';
    
END TRY
BEGIN CATCH
    -- Rollback on error
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    PRINT '';
    PRINT '================================================';
    PRINT '❌ ERROR: Order Reset Failed!';
    PRINT 'Error Message: ' + ERROR_MESSAGE();
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
    'Orders' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('Orders') AS CurrentIdentity,
    IDENT_SEED('Orders') AS IdentitySeed
FROM Orders
UNION ALL
SELECT 
    'OrderItems' AS TableName,
    COUNT(*) AS RecordCount,
    IDENT_CURRENT('OrderItems') AS CurrentIdentity,
    IDENT_SEED('OrderItems') AS IdentitySeed
FROM OrderItems;

