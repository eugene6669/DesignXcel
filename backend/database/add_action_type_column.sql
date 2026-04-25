-- Add ActionType column to Orders table
-- This column stores whether the return action is 'refund' or 'replacement'

-- Check if ActionType column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'ActionType'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ActionType NVARCHAR(50) NULL;
    PRINT 'ActionType column added to Orders table';
END
ELSE
BEGIN
    PRINT 'ActionType column already exists in Orders table';
END
GO

