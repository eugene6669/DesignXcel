-- Add ReturnImageURL and ReturnVideoURL columns to Orders table
-- These columns store the file paths for return evidence (images and videos)

-- Check if ReturnImageURL column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'ReturnImageURL'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ReturnImageURL NVARCHAR(500) NULL;
    PRINT 'ReturnImageURL column added to Orders table';
END
ELSE
BEGIN
    PRINT 'ReturnImageURL column already exists in Orders table';
END
GO

-- Check if ReturnVideoURL column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'ReturnVideoURL'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ReturnVideoURL NVARCHAR(500) NULL;
    PRINT 'ReturnVideoURL column added to Orders table';
END
ELSE
BEGIN
    PRINT 'ReturnVideoURL column already exists in Orders table';
END
GO

