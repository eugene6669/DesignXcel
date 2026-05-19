-- Migration: Add Region-Based Delivery Rates System
-- This migration creates a new table for region-based delivery rates
-- and preserves existing DeliveryRates for backward compatibility

-- Step 1: Create RegionDeliveryRates table
IF OBJECT_ID('dbo.RegionDeliveryRates', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RegionDeliveryRates (
        RegionRateID INT IDENTITY(1,1) PRIMARY KEY,
        Region NVARCHAR(100) NULL,            -- e.g., 'NCR', 'Region IV-A', NULL for provinces not in specific region
        Province NVARCHAR(100) NULL,          -- e.g., 'Laguna', 'Cavite', NULL for city-specific rates
        City NVARCHAR(100) NOT NULL,          -- e.g., 'Metro Manila', 'Manila', 'Quezon City', 'Sta. Rosa'
        Price DECIMAL(18,2) NOT NULL,         -- Delivery price for this location
        ServiceType NVARCHAR(150) NULL,       -- Optional: 'Standard', 'Express', 'Same Day' (NULL means applies to all)
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        CreatedByUserID INT NULL,
        CreatedByUsername NVARCHAR(150) NULL,
        UpdatedByUserID INT NULL,
        UpdatedByUsername NVARCHAR(150) NULL,
        Notes NVARCHAR(500) NULL              -- Optional notes about coverage area
    );

    -- Create indexes for faster lookups
    CREATE INDEX IX_RegionDeliveryRates_City ON dbo.RegionDeliveryRates (City);
    CREATE INDEX IX_RegionDeliveryRates_Province ON dbo.RegionDeliveryRates (Province);
    CREATE INDEX IX_RegionDeliveryRates_Region ON dbo.RegionDeliveryRates (Region);
    
    -- Create unique filtered index for active records
    CREATE UNIQUE INDEX UX_RegionDeliveryRates_Location_ServiceType 
        ON dbo.RegionDeliveryRates (Region, Province, City, ServiceType)
        WHERE IsActive = 1;
    
    PRINT 'RegionDeliveryRates table created successfully.';
END
ELSE
BEGIN
    PRINT 'RegionDeliveryRates table already exists.';
END

-- Step 2: Insert default Philippine region-based delivery rates
-- Based on common office furniture delivery pricing in the Philippines

IF NOT EXISTS (SELECT 1 FROM dbo.RegionDeliveryRates)
BEGIN
    INSERT INTO dbo.RegionDeliveryRates (Region, Province, City, Price, ServiceType, CreatedByUsername, Notes)
    VALUES
    -- NCR (National Capital Region) - Metro Manila Cities
    ('NCR', NULL, 'Metro Manila', 300.00, 'Standard Delivery', 'System', 'Covers all cities in Metro Manila'),
    ('NCR', NULL, 'Manila', 300.00, 'Standard Delivery', 'System', 'Manila City'),
    ('NCR', NULL, 'Quezon City', 300.00, 'Standard Delivery', 'System', 'Quezon City'),
    ('NCR', NULL, 'Makati', 300.00, 'Standard Delivery', 'System', 'Makati City'),
    ('NCR', NULL, 'Pasig', 300.00, 'Standard Delivery', 'System', 'Pasig City'),
    ('NCR', NULL, 'Taguig', 300.00, 'Standard Delivery', 'System', 'Taguig City - BGC'),
    ('NCR', NULL, 'Mandaluyong', 300.00, 'Standard Delivery', 'System', 'Mandaluyong City'),
    ('NCR', NULL, 'Pasay', 300.00, 'Standard Delivery', 'System', 'Pasay City'),
    ('NCR', NULL, 'Caloocan', 300.00, 'Standard Delivery', 'System', 'Caloocan City'),
    ('NCR', NULL, 'Las Piñas', 300.00, 'Standard Delivery', 'System', 'Las Piñas City'),
    ('NCR', NULL, 'Malabon', 300.00, 'Standard Delivery', 'System', 'Malabon City'),
    ('NCR', NULL, 'Marikina', 300.00, 'Standard Delivery', 'System', 'Marikina City'),
    ('NCR', NULL, 'Muntinlupa', 300.00, 'Standard Delivery', 'System', 'Muntinlupa City'),
    ('NCR', NULL, 'Navotas', 300.00, 'Standard Delivery', 'System', 'Navotas City'),
    ('NCR', NULL, 'Parañaque', 300.00, 'Standard Delivery', 'System', 'Parañaque City'),
    ('NCR', NULL, 'San Juan', 300.00, 'Standard Delivery', 'System', 'San Juan City'),
    ('NCR', NULL, 'Valenzuela', 300.00, 'Standard Delivery', 'System', 'Valenzuela City'),
    
    -- Region IV-A (CALABARZON) - Nearby provinces
    ('Region IV-A', 'Laguna', 'Santa Rosa', 500.00, 'Standard Delivery', 'System', 'Santa Rosa, Laguna'),
    ('Region IV-A', 'Laguna', 'Biñan', 500.00, 'Standard Delivery', 'System', 'Biñan, Laguna'),
    ('Region IV-A', 'Laguna', 'Calamba', 550.00, 'Standard Delivery', 'System', 'Calamba, Laguna'),
    ('Region IV-A', 'Laguna', 'San Pedro', 500.00, 'Standard Delivery', 'System', 'San Pedro, Laguna'),
    ('Region IV-A', 'Laguna', 'Cabuyao', 500.00, 'Standard Delivery', 'System', 'Cabuyao, Laguna'),
    ('Region IV-A', 'Laguna', 'Los Baños', 600.00, 'Standard Delivery', 'System', 'Los Baños, Laguna'),
    ('Region IV-A', 'Laguna', 'San Pablo', 700.00, 'Standard Delivery', 'System', 'San Pablo City, Laguna'),
    
    ('Region IV-A', 'Cavite', 'Bacoor', 400.00, 'Standard Delivery', 'System', 'Bacoor, Cavite'),
    ('Region IV-A', 'Cavite', 'Imus', 400.00, 'Standard Delivery', 'System', 'Imus, Cavite'),
    ('Region IV-A', 'Cavite', 'Dasmariñas', 450.00, 'Standard Delivery', 'System', 'Dasmariñas, Cavite'),
    ('Region IV-A', 'Cavite', 'Cavite City', 500.00, 'Standard Delivery', 'System', 'Cavite City'),
    ('Region IV-A', 'Cavite', 'Tagaytay', 700.00, 'Standard Delivery', 'System', 'Tagaytay City, Cavite'),
    ('Region IV-A', 'Cavite', 'General Trias', 450.00, 'Standard Delivery', 'System', 'General Trias, Cavite'),
    
    ('Region IV-A', 'Rizal', 'Antipolo', 400.00, 'Standard Delivery', 'System', 'Antipolo City, Rizal'),
    ('Region IV-A', 'Rizal', 'Cainta', 350.00, 'Standard Delivery', 'System', 'Cainta, Rizal'),
    ('Region IV-A', 'Rizal', 'Taytay', 350.00, 'Standard Delivery', 'System', 'Taytay, Rizal'),
    ('Region IV-A', 'Rizal', 'Angono', 400.00, 'Standard Delivery', 'System', 'Angono, Rizal'),
    ('Region IV-A', 'Rizal', 'Binangonan', 450.00, 'Standard Delivery', 'System', 'Binangonan, Rizal'),
    
    ('Region IV-A', 'Batangas', 'Batangas City', 800.00, 'Standard Delivery', 'System', 'Batangas City'),
    ('Region IV-A', 'Batangas', 'Lipa', 850.00, 'Standard Delivery', 'System', 'Lipa City, Batangas'),
    ('Region IV-A', 'Batangas', 'Tanauan', 850.00, 'Standard Delivery', 'System', 'Tanauan City, Batangas'),
    
    ('Region IV-A', 'Quezon', 'Lucena', 1200.00, 'Standard Delivery', 'System', 'Lucena City, Quezon'),
    
    -- Region III (Central Luzon)
    ('Region III', 'Bulacan', 'Malolos', 600.00, 'Standard Delivery', 'System', 'Malolos, Bulacan'),
    ('Region III', 'Bulacan', 'Meycauayan', 550.00, 'Standard Delivery', 'System', 'Meycauayan, Bulacan'),
    ('Region III', 'Bulacan', 'San Jose del Monte', 500.00, 'Standard Delivery', 'System', 'San Jose del Monte, Bulacan'),
    ('Region III', 'Bulacan', 'Marilao', 550.00, 'Standard Delivery', 'System', 'Marilao, Bulacan'),
    
    ('Region III', 'Pampanga', 'Angeles', 900.00, 'Standard Delivery', 'System', 'Angeles City, Pampanga'),
    ('Region III', 'Pampanga', 'San Fernando', 900.00, 'Standard Delivery', 'System', 'San Fernando, Pampanga'),
    
    ('Region III', 'Tarlac', 'Tarlac City', 1100.00, 'Standard Delivery', 'System', 'Tarlac City'),
    
    -- Express Delivery (50% surcharge for NCR)
    ('NCR', NULL, 'Metro Manila', 450.00, 'Express Delivery', 'System', 'Same-day delivery for Metro Manila'),
    
    -- Pickup option (free)
    (NULL, NULL, 'Store Pickup', 0.00, 'Store Pickup', 'System', 'Customer picks up from store');
    
    PRINT 'Default region-based delivery rates inserted successfully.';
END
ELSE
BEGIN
    PRINT 'Region-based delivery rates already exist.';
END

-- Step 3: Add a configuration flag to enable/disable region-based pricing
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SystemSettings')
BEGIN
    CREATE TABLE dbo.SystemSettings (
        SettingID INT IDENTITY(1,1) PRIMARY KEY,
        SettingKey NVARCHAR(100) NOT NULL UNIQUE,
        SettingValue NVARCHAR(MAX) NULL,
        Description NVARCHAR(500) NULL,
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedByUsername NVARCHAR(150) NULL
    );
    
    PRINT 'SystemSettings table created.';
END

-- Insert setting to enable region-based delivery
IF NOT EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'USE_REGION_BASED_DELIVERY')
BEGIN
    INSERT INTO dbo.SystemSettings (SettingKey, SettingValue, Description, UpdatedByUsername)
    VALUES ('USE_REGION_BASED_DELIVERY', '1', 'Enable region-based delivery rates (1=enabled, 0=use legacy DeliveryRates)', 'System');
    
    PRINT 'Region-based delivery setting enabled.';
END

PRINT '';
PRINT '========================================';
PRINT 'Region-Based Delivery Rates Migration Complete!';
PRINT '========================================';
PRINT 'Summary:';
PRINT '- RegionDeliveryRates table created';
PRINT '- Default Philippine delivery rates added';
PRINT '- System setting enabled for region-based pricing';
PRINT '';
PRINT 'You can now manage delivery rates by:';
PRINT '- City (e.g., Metro Manila ₱300)';
PRINT '- Province + City (e.g., Laguna > Santa Rosa ₱500)';
PRINT '- Region + Province + City (e.g., Region IV-A > Cavite > Bacoor ₱400)';
PRINT '========================================';

