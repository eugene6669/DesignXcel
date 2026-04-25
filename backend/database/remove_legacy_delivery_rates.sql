-- Migration: Remove Legacy Delivery Rates System
-- This script removes the old DeliveryRates table after migrating to region-based system

PRINT 'Starting Legacy Delivery Rates Removal...';
PRINT '';

-- Step 1: Backup legacy data before deletion (optional - for safety)
IF OBJECT_ID('dbo.DeliveryRates', 'U') IS NOT NULL
BEGIN
    -- Create backup table if it doesn't exist
    IF OBJECT_ID('dbo.DeliveryRates_BACKUP', 'U') IS NULL
    BEGIN
        SELECT * 
        INTO DeliveryRates_BACKUP
        FROM DeliveryRates;
        
        PRINT 'Legacy DeliveryRates table backed up to DeliveryRates_BACKUP';
    END
    ELSE
    BEGIN
        PRINT 'Backup table DeliveryRates_BACKUP already exists, skipping backup';
    END
END

-- Step 2: Drop the legacy DeliveryRates table
IF OBJECT_ID('dbo.DeliveryRates', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.DeliveryRates;
    PRINT 'Legacy DeliveryRates table dropped successfully';
END
ELSE
BEGIN
    PRINT 'Legacy DeliveryRates table does not exist';
END

-- Step 3: Remove legacy delivery rate setting (if any)
IF EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'USE_LEGACY_DELIVERY')
BEGIN
    DELETE FROM dbo.SystemSettings WHERE SettingKey = 'USE_LEGACY_DELIVERY';
    PRINT 'Legacy delivery setting removed';
END

-- Step 4: Verify region-based delivery is enabled
IF EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'USE_REGION_BASED_DELIVERY')
BEGIN
    UPDATE dbo.SystemSettings 
    SET SettingValue = '1' 
    WHERE SettingKey = 'USE_REGION_BASED_DELIVERY';
    PRINT 'Region-based delivery confirmed as enabled';
END

PRINT '';
PRINT '========================================';
PRINT 'Legacy Delivery Rates Removal Complete!';
PRINT '========================================';
PRINT 'Summary:';
PRINT '- Legacy DeliveryRates table backed up to DeliveryRates_BACKUP';
PRINT '- Legacy DeliveryRates table removed';
PRINT '- Region-based delivery system is now the only system';
PRINT '';
PRINT 'Note: To restore legacy rates, you can query DeliveryRates_BACKUP table';
PRINT '========================================';

