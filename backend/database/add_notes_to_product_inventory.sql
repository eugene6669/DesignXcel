-- Add Notes/Remarks column to ProductInventory table if it doesn't exist

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'Notes'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD Notes NVARCHAR(MAX) NULL;
    
    PRINT 'Notes column added to ProductInventory table.';
END
ELSE
BEGIN
    PRINT 'Notes column already exists in ProductInventory table.';
END
GO

