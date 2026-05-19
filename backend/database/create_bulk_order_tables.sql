-- Bulk Order Tables Migration
-- This script creates the necessary tables for bulk order functionality

-- Create BulkOrders table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[BulkOrders] (
        BulkOrderID INT IDENTITY(1,1) PRIMARY KEY,
        CustomerID INT NULL,
        CustomerEmail NVARCHAR(255) NULL,
        TotalQuantity INT NOT NULL,
        Subtotal DECIMAL(10,2) NOT NULL,
        DiscountAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        GrandTotal DECIMAL(10,2) NOT NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
        Notes NVARCHAR(1000) NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2(0) NULL,
        CONSTRAINT FK_BulkOrders_Customers FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
    );
    
    CREATE INDEX IX_BulkOrders_CustomerID ON BulkOrders(CustomerID);
    CREATE INDEX IX_BulkOrders_Status ON BulkOrders(Status);
    CREATE INDEX IX_BulkOrders_CreatedAt ON BulkOrders(CreatedAt);
END
GO

-- Create BulkOrderItems table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrderItems]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[BulkOrderItems] (
        BulkOrderItemID INT IDENTITY(1,1) PRIMARY KEY,
        BulkOrderID INT NOT NULL,
        ProductID INT NOT NULL,
        ProductName NVARCHAR(255) NOT NULL,
        SKU NVARCHAR(100) NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(10,2) NOT NULL,
        DiscountPercent DECIMAL(5,2) NOT NULL DEFAULT 0,
        DiscountedPrice DECIMAL(10,2) NOT NULL,
        ItemTotal DECIMAL(10,2) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_BulkOrderItems_BulkOrders FOREIGN KEY (BulkOrderID) REFERENCES BulkOrders(BulkOrderID) ON DELETE CASCADE,
        CONSTRAINT FK_BulkOrderItems_Products FOREIGN KEY (ProductID) REFERENCES Products(ProductID)
    );
    
    CREATE INDEX IX_BulkOrderItems_BulkOrderID ON BulkOrderItems(BulkOrderID);
    CREATE INDEX IX_BulkOrderItems_ProductID ON BulkOrderItems(ProductID);
END
GO

PRINT 'Bulk order tables created successfully!';

