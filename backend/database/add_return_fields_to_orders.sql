-- Add ReturnType and ReturnReason columns to Orders table
-- This script adds columns to track order return information

USE [DesignXcelDB]
GO

-- Check if ReturnType column exists, if not add it
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') AND name = 'ReturnType')
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ReturnType NVARCHAR(50) NULL;
    PRINT 'ReturnType column added to Orders table.';
END
ELSE
BEGIN
    PRINT 'ReturnType column already exists in Orders table.';
END
GO

-- Check if ReturnReason column exists, if not add it
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') AND name = 'ReturnReason')
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ReturnReason NVARCHAR(MAX) NULL;
    PRINT 'ReturnReason column added to Orders table.';
END
ELSE
BEGIN
    PRINT 'ReturnReason column already exists in Orders table.';
END
GO

PRINT 'Script completed successfully.';
GO

