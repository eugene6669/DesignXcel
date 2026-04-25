-- Performance Optimization: Add Indexes for Common Queries
-- This script adds indexes to improve query performance for frequently accessed columns

-- Products table indexes
-- Index for IsActive filter (used in most product queries)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Products_IsActive' AND object_id = OBJECT_ID('Products'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Products_IsActive ON Products(IsActive)
    INCLUDE (PublicId, Slug, Name, Price, Category, ImageURL, DateAdded, IsFeatured);
    PRINT 'Created index IX_Products_IsActive';
END
ELSE
    PRINT 'Index IX_Products_IsActive already exists';

-- Index for PublicId lookups (very common)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Products_PublicId' AND object_id = OBJECT_ID('Products'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Products_PublicId ON Products(PublicId)
    INCLUDE (ProductID, Name, IsActive, Slug);
    PRINT 'Created index IX_Products_PublicId';
END
ELSE
    PRINT 'Index IX_Products_PublicId already exists';

-- Index for Slug lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Products_Slug' AND object_id = OBJECT_ID('Products'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Products_Slug ON Products(Slug)
    INCLUDE (ProductID, PublicId, Name, IsActive);
    PRINT 'Created index IX_Products_Slug';
END
ELSE
    PRINT 'Index IX_Products_Slug already exists';

-- Index for Category filtering
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Products_Category' AND object_id = OBJECT_ID('Products'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Products_Category ON Products(Category, IsActive)
    INCLUDE (PublicId, Name, Price, ImageURL);
    PRINT 'Created index IX_Products_Category';
END
ELSE
    PRINT 'Index IX_Products_Category already exists';

-- Orders table indexes
-- Index for CustomerID lookups (very common)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_CustomerID' AND object_id = OBJECT_ID('Orders'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Orders_CustomerID ON Orders(CustomerID)
    INCLUDE (OrderID, Status, TotalAmount, OrderDate, ReferenceNumber);
    PRINT 'Created index IX_Orders_CustomerID';
END
ELSE
    PRINT 'Index IX_Orders_CustomerID already exists';

-- Index for Status filtering
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_Status' AND object_id = OBJECT_ID('Orders'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Orders_Status ON Orders(Status)
    INCLUDE (OrderID, CustomerID, OrderDate, TotalAmount);
    PRINT 'Created index IX_Orders_Status';
END
ELSE
    PRINT 'Index IX_Orders_Status already exists';

-- Index for StripeSessionID lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_StripeSessionID' AND object_id = OBJECT_ID('Orders'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Orders_StripeSessionID ON Orders(StripeSessionID)
    WHERE StripeSessionID IS NOT NULL;
    PRINT 'Created index IX_Orders_StripeSessionID';
END
ELSE
    PRINT 'Index IX_Orders_StripeSessionID already exists';

-- Index for OrderDate sorting
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_OrderDate' AND object_id = OBJECT_ID('Orders'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Orders_OrderDate ON Orders(OrderDate DESC)
    INCLUDE (OrderID, CustomerID, Status, TotalAmount);
    PRINT 'Created index IX_Orders_OrderDate';
END
ELSE
    PRINT 'Index IX_Orders_OrderDate already exists';

-- OrderItems table indexes
-- Index for OrderID lookups (very common)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderItems_OrderID' AND object_id = OBJECT_ID('OrderItems'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_OrderItems_OrderID ON OrderItems(OrderID)
    INCLUDE (ProductID, Quantity, PriceAtPurchase, VariationID);
    PRINT 'Created index IX_OrderItems_OrderID';
END
ELSE
    PRINT 'Index IX_OrderItems_OrderID already exists';

-- Customers table indexes
-- Index for Email lookups (very common, case-insensitive)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Customers_Email' AND object_id = OBJECT_ID('Customers'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Customers_Email ON Customers(Email)
    INCLUDE (CustomerID, FullName, IsActive);
    PRINT 'Created index IX_Customers_Email';
END
ELSE
    PRINT 'Index IX_Customers_Email already exists';

-- ProductReviews table indexes
-- Index for ProductID lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ProductReviews_ProductID' AND object_id = OBJECT_ID('ProductReviews'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ProductReviews_ProductID ON ProductReviews(ProductID, IsActive)
    INCLUDE (ReviewID, Rating, CreatedAt);
    PRINT 'Created index IX_ProductReviews_ProductID';
END
ELSE
    PRINT 'Index IX_ProductReviews_ProductID already exists';

-- Index for CustomerID lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ProductReviews_CustomerID' AND object_id = OBJECT_ID('ProductReviews'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ProductReviews_CustomerID ON ProductReviews(CustomerID)
    INCLUDE (ReviewID, ProductID, Rating);
    PRINT 'Created index IX_ProductReviews_CustomerID';
END
ELSE
    PRINT 'Index IX_ProductReviews_CustomerID already exists';

PRINT 'Performance indexes creation completed!';
PRINT 'Note: Run UPDATE STATISTICS on affected tables after creating indexes for optimal performance.';

