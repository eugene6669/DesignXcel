-- Drop RestockingFee column from Orders table
-- This removes the restocking fee column as it's no longer used

IF EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'RestockingFee'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    DROP COLUMN RestockingFee;
    PRINT 'RestockingFee column dropped from Orders table.';
END
ELSE
BEGIN
    PRINT 'RestockingFee column does not exist in Orders table.';
END
GO

