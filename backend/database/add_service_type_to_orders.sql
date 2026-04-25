-- Migration: Add ServiceType column to Orders and connect to RegionDeliveryRates
-- This migration:
-- 1. Adds ServiceType column to Orders table
-- 2. Populates ServiceType from RegionDeliveryRates based on DeliveryType
-- 3. Optionally can rename DeliveryType to ServiceType later

PRINT 'Starting ServiceType migration...';
PRINT '';

-- Step 1: Add ServiceType column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'ServiceType'
)
BEGIN
    ALTER TABLE Orders
    ADD ServiceType NVARCHAR(150) NULL;
    
    PRINT '✅ ServiceType column added to Orders table';
END
ELSE
BEGIN
    PRINT '⚠️  ServiceType column already exists';
END

PRINT '';

-- Step 2: Populate ServiceType from RegionDeliveryRates based on DeliveryType
PRINT 'Updating ServiceType from RegionDeliveryRates...';

UPDATE o
SET ServiceType = 
    CASE 
        WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
        WHEN o.DeliveryType LIKE 'rate_%' THEN 
            COALESCE(rdr.ServiceType, dr.ServiceType, 'Standard Delivery')
        ELSE o.DeliveryType
    END
FROM Orders o
LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
WHERE o.ServiceType IS NULL OR o.ServiceType = '';

DECLARE @UpdatedCount INT = @@ROWCOUNT;
PRINT CONCAT('✅ Updated ', @UpdatedCount, ' orders with ServiceType from RegionDeliveryRates');

PRINT '';
PRINT '========================================';
PRINT 'ServiceType Migration Complete!';
PRINT '========================================';
PRINT '';
PRINT 'Summary:';
PRINT '- ServiceType column added to Orders table';
PRINT CONCAT('- ', @UpdatedCount, ' orders updated with ServiceType');
PRINT '';
PRINT 'Note: DeliveryType column is kept for backward compatibility';
PRINT '      You can update queries to use ServiceType instead';
PRINT '========================================';

