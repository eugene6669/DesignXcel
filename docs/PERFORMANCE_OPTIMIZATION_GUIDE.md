# Performance Optimization Guide

This document outlines the performance optimizations implemented to improve both frontend and backend performance.

## Backend Optimizations

### 1. Response Compression (Gzip)
- **Added**: `compression` middleware to compress all HTTP responses
- **Impact**: Reduces response size by 60-80% for JSON/text responses
- **Location**: `backend/server.js` (after CORS setup)
- **Configuration**: 
  - Compression level: 6 (balanced)
  - Threshold: 1KB (only compress responses > 1KB)

### 2. Database Connection Pool Optimization
- **Increased**: Max connections from 10 to 20
- **Added**: Minimum pool size of 2 (keeps connections alive)
- **Added**: Connection timeout and retry configurations
- **Impact**: Better handling of concurrent requests, reduced connection overhead
- **Location**: `backend/server.js` (dbConfig)

### 3. Response Caching
- **Added**: Cache-Control headers for `/api/products` endpoint
- **Cache Duration**: 5 minutes (300 seconds)
- **Stale-While-Revalidate**: 10 minutes (allows serving stale content while revalidating)
- **Impact**: Reduces database load for frequently accessed data
- **Location**: `backend/server.js` (products endpoint)

### 4. Database Query Optimization
- **Added**: `WITH (NOLOCK)` hint for read queries (reduces locking contention)
- **Impact**: Faster read queries, especially under load
- **Note**: Use with caution in production - ensures eventual consistency

### 5. Database Indexes
- **Created**: Comprehensive index script for common queries
- **Location**: `backend/database/performance_indexes.sql`
- **Indexes Added**:
  - `IX_Products_IsActive` - For filtering active products
  - `IX_Products_PublicId` - For UUID lookups
  - `IX_Products_Slug` - For slug-based routing
  - `IX_Products_Category` - For category filtering
  - `IX_Orders_CustomerID` - For customer order lookups
  - `IX_Orders_Status` - For status filtering
  - `IX_Orders_StripeSessionID` - For payment lookups
  - `IX_OrderItems_OrderID` - For order items retrieval
  - `IX_Customers_Email` - For email lookups
  - `IX_ProductReviews_ProductID` - For review queries

## Frontend Optimizations (Recommended)

### 1. Code Splitting & Lazy Loading
**Status**: Not yet implemented (recommended next step)

To implement:
```javascript
// In routes/index.js
import { lazy, Suspense } from 'react';

const ProductCatalog = lazy(() => import('../../features/products/pages/ProductCatalogPage'));
const ProductDetail = lazy(() => import('../../features/products/pages/ProductDetailPage'));
// ... etc

// Wrap routes in Suspense
<Suspense fallback={<PageLoader />}>
  <Route path="/products" element={<ProductCatalog />} />
</Suspense>
```

### 2. Image Optimization
- Use WebP format for images
- Implement lazy loading for product images
- Use responsive images with srcset

### 3. API Request Optimization
- Implement request debouncing for search
- Batch multiple API calls where possible
- Use React Query or SWR for caching API responses

## Deployment Steps

### 1. Install Dependencies
```bash
cd backend
npm install compression
```

### 2. Run Database Index Script
```bash
# Connect to your SQL Server and run:
sqlcmd -S your-server -d your-database -i backend/database/performance_indexes.sql
```

Or use SQL Server Management Studio to execute the script.

### 3. Restart Backend
```bash
# On Railway or your deployment platform
# The changes will be picked up on next deployment
```

### 4. Monitor Performance
- Check response times in browser DevTools
- Monitor database query execution times
- Check Railway/cloud provider metrics

## Expected Performance Improvements

1. **Response Size**: 60-80% reduction due to compression
2. **Database Queries**: 30-50% faster with proper indexes
3. **Concurrent Requests**: Better handling with optimized connection pool
4. **Cache Hits**: Reduced database load for frequently accessed data

## Additional Recommendations

1. **CDN**: Use a CDN for static assets (images, CSS, JS)
2. **Redis Cache**: Implement Redis for session storage and API response caching
3. **Database Query Monitoring**: Use SQL Server Profiler to identify slow queries
4. **Frontend Bundle Analysis**: Use `webpack-bundle-analyzer` to identify large dependencies
5. **API Pagination**: Implement pagination for large data sets (products, orders)

## Monitoring

After deployment, monitor:
- Response times (should decrease by 30-50%)
- Database connection pool usage
- Memory usage
- Error rates

## Notes

- The `WITH (NOLOCK)` hint improves read performance but may return slightly stale data
- Compression adds minimal CPU overhead but significantly reduces bandwidth
- Indexes improve read performance but slightly slow down writes (usually acceptable)
- Cache headers help browsers cache responses, reducing server load

