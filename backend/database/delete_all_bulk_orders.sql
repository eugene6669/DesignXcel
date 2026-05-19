-- Script to delete all bulk orders and related data
-- WARNING: This will permanently delete all bulk orders and their items
-- This will NOT delete the linked Orders records, only the BulkOrders references

BEGIN TRANSACTION;

BEGIN TRY
    -- First, check if OrderID column exists in BulkOrders
    IF EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
        AND name = 'OrderID'
    )
    BEGIN
        PRINT 'OrderID column exists in BulkOrders. Clearing OrderID references before deletion...';
        -- Clear OrderID references (this doesn't delete the Orders, just removes the link)
        UPDATE BulkOrders SET OrderID = NULL WHERE OrderID IS NOT NULL;
        PRINT 'OrderID references cleared.';
    END
    ELSE
    BEGIN
        PRINT 'OrderID column does not exist in BulkOrders. Proceeding with deletion...';
    END

    -- Delete all bulk order items (child records)
    -- Note: BulkOrderItems has ON DELETE CASCADE, but we'll delete explicitly for clarity
    PRINT 'Deleting bulk order items...';
    DELETE FROM BulkOrderItems;
    PRINT 'Bulk order items deleted.';

    -- Then, delete all bulk orders (parent records)
    PRINT 'Deleting bulk orders...';
    DELETE FROM BulkOrders;
    PRINT 'Bulk orders deleted.';

    -- Verify deletion
    DECLARE @bulkOrderCount INT;
    DECLARE @bulkOrderItemCount INT;
    
    SELECT @bulkOrderCount = COUNT(*) FROM BulkOrders;
    SELECT @bulkOrderItemCount = COUNT(*) FROM BulkOrderItems;
    
    IF @bulkOrderCount = 0 AND @bulkOrderItemCount = 0
    BEGIN
        PRINT '✅ SUCCESS: All bulk orders and items have been deleted.';
        PRINT 'Remaining BulkOrders: ' + CAST(@bulkOrderCount AS VARCHAR);
        PRINT 'Remaining BulkOrderItems: ' + CAST(@bulkOrderItemCount AS VARCHAR);
    END
    ELSE
    BEGIN
        PRINT '⚠️ WARNING: Some records may still exist.';
        PRINT 'Remaining BulkOrders: ' + CAST(@bulkOrderCount AS VARCHAR);
        PRINT 'Remaining BulkOrderItems: ' + CAST(@bulkOrderItemCount AS VARCHAR);
    END

    COMMIT TRANSACTION;
    PRINT 'Transaction committed successfully.';
END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT '❌ ERROR: Transaction rolled back.';
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT 'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);
END CATCH

