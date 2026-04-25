# Region-Based Delivery Rates System

## Overview

The Region-Based Delivery Rates system allows you to set fixed delivery prices for specific cities, provinces, and regions in the Philippines. This is perfect for office furniture e-commerce businesses that want to offer transparent, location-specific shipping costs.

## Key Features

- **Flexible Location Targeting**: Set rates by City only, Province + City, or Region + Province + City
- **Multiple Service Types**: Support for Standard Delivery, Express Delivery, Same Day Delivery, etc.
- **Automatic Rate Matching**: System automatically finds the best matching rate for customer's address
- **Admin Management UI**: Easy-to-use interface for managing all delivery rates
- **Backward Compatible**: Falls back to legacy delivery rates if region-based rates aren't found
- **Search & Filter**: Quickly find and manage rates with built-in search

## Database Setup

### 1. Run the Migration

Execute the migration script to create the necessary tables:

```bash
# PowerShell (Windows)
cd backend/database
sqlcmd -S your_server -d your_database -i add_region_based_delivery_rates.sql

# Or use SQL Server Management Studio
# Open and execute: backend/database/add_region_based_delivery_rates.sql
```

This creates:
- `RegionDeliveryRates` table with indexes
- `SystemSettings` table for configuration
- Default Philippine delivery rates

### 2. Verify Installation

Check that the tables exist:

```sql
SELECT * FROM RegionDeliveryRates;
SELECT * FROM SystemSettings WHERE SettingKey = 'USE_REGION_BASED_DELIVERY';
```

## Admin Management

### Accessing the Admin UI

1. Log in as Admin
2. Navigate to **Delivery Rates** in the sidebar (under Transactions section)
3. You'll see two tabs:
   - **Region-Based Rates** (Recommended) - New system
   - **Legacy Rates** - Old system for backward compatibility

### Adding a New Delivery Rate

**Example 1: Metro Manila (₱300)**
```
Region: NCR
Province: (leave empty)
City: Metro Manila
Price: 300.00
Service Type: Standard Delivery
Notes: Covers all cities in Metro Manila
```

**Example 2: Santa Rosa, Laguna (₱500)**
```
Region: Region IV-A
Province: Laguna
City: Santa Rosa
Price: 500.00
Service Type: Standard Delivery
Notes: Santa Rosa City, Laguna
```

**Example 3: Express Delivery for NCR (₱450)**
```
Region: NCR
Province: (leave empty)
City: Metro Manila
Price: 450.00
Service Type: Express Delivery
Notes: Same-day delivery for Metro Manila
```

**Example 4: Store Pickup (Free)**
```
Region: (leave empty)
Province: (leave empty)
City: Store Pickup
Price: 0.00
Service Type: Store Pickup
Notes: Customer picks up from store
```

### Pre-Loaded Delivery Rates

The system comes with default rates for major Philippine locations:

**NCR (National Capital Region)**
- Metro Manila, Manila, Quezon City, Makati, etc.: ₱300

**Region IV-A (CALABARZON)**
- **Laguna**: Santa Rosa, Biñan (₱500), Calamba (₱550), San Pablo (₱700)
- **Cavite**: Bacoor, Imus (₱400), Dasmariñas (₱450), Tagaytay (₱700)
- **Rizal**: Cainta, Taytay (₱350), Antipolo (₱400)
- **Batangas**: Batangas City (₱800), Lipa (₱850)
- **Quezon**: Lucena (₱1,200)

**Region III (Central Luzon)**
- **Bulacan**: San Jose del Monte (₱500), Malolos (₱600)
- **Pampanga**: Angeles, San Fernando (₱900)
- **Tarlac**: Tarlac City (₱1,100)

### Updating Rates

1. Find the rate in the table
2. Edit the fields directly (Region, Province, City, Price, Service Type)
3. Click **Update** button
4. Changes are saved immediately

### Deleting/Deactivating Rates

1. Find the rate in the table
2. Click **Delete** button
3. Confirm the action
4. Rate is deactivated (soft delete - not permanently removed)

### Searching Rates

Use the search box above the table to filter by:
- Region name
- Province name
- City name
- Service type

## How It Works (Technical)

### Rate Matching Algorithm

When a customer enters checkout with an address, the system:

1. **Tries exact match**: Region + Province + City + Service Type
2. **Falls back to**: Province + City + Service Type
3. **Falls back to**: City + Service Type
4. **Falls back to**: City only
5. **Final fallback**: Legacy delivery rates

### Example Scenarios

**Scenario 1: Customer from "Santa Rosa, Laguna, Region IV-A"**
- System finds: Region IV-A > Laguna > Santa Rosa = ₱500 ✅

**Scenario 2: Customer from "Manila, NCR"**
- System finds: NCR > Manila = ₱300 ✅

**Scenario 3: Customer from "Barangay Tagapo, Santa Rosa, Laguna"**
- System matches: Laguna > Santa Rosa = ₱500 ✅
- (Barangay is ignored, City is the key)

**Scenario 4: Customer from unlisted city**
- No match found → Falls back to legacy rates
- Admin should add the city to region-based rates

## API Endpoints

### For Admin (Authenticated)

```javascript
// Get all region-based rates
GET /api/admin/region-delivery-rates

// Add new rate
POST /api/admin/region-delivery-rates
Body: { region, province, city, price, serviceType, notes }

// Update rate
PUT /api/admin/region-delivery-rates/:id
Body: { region, province, city, price, serviceType, isActive, notes }

// Delete/Deactivate rate
DELETE /api/admin/region-delivery-rates/:id

// Get location suggestions (for dropdowns)
GET /api/admin/delivery-locations
```

### For Frontend (Public)

```javascript
// Calculate delivery rate for specific address
POST /api/delivery-rate/calculate
Body: { city, province, region, serviceType }

Response: {
  success: true,
  rate: { RegionRateID, Region, Province, City, Price, ServiceType, Notes },
  availableServiceTypes: [...],
  useRegionBased: true
}
```

## Frontend Integration

The checkout page automatically:
1. Gets customer's address from their profile
2. Calls `/api/delivery-rate/calculate` with city, province, region
3. Displays available delivery options with prices
4. Updates cart total when customer selects delivery method

### Example Frontend Code

```javascript
// In CheckoutPage.js
const address = user.address;
const rateRes = await apiClient.post('/api/delivery-rate/calculate', {
    city: address.City,
    province: address.Province,
    region: address.Region
});

if (rateRes.success && rateRes.availableServiceTypes) {
    // Display delivery options
    const rates = rateRes.availableServiceTypes.map(st => ({
        id: st.RegionRateID,
        name: st.ServiceType || 'Standard Delivery',
        price: st.Price
    }));
    setDeliveryRates(rates);
}
```

## Configuration

### Enable/Disable Region-Based Pricing

By default, region-based pricing is enabled. To toggle:

```sql
-- Enable region-based delivery
UPDATE SystemSettings 
SET SettingValue = '1' 
WHERE SettingKey = 'USE_REGION_BASED_DELIVERY';

-- Disable (use legacy rates)
UPDATE SystemSettings 
SET SettingValue = '0' 
WHERE SettingKey = 'USE_REGION_BASED_DELIVERY';
```

## Best Practices

### 1. Start with Major Cities
Focus on your most common delivery locations first:
- Metro Manila
- Nearby provinces (Laguna, Cavite, Rizal)
- Major cities where you have customers

### 2. Group Similar Areas
If multiple cities in a province have the same rate, you can:
- Create one rate for the province
- Add specific rates for exceptions

### 3. Use Service Types Wisely
- **Standard Delivery**: Regular delivery (3-7 days)
- **Express Delivery**: Faster delivery (1-2 days)
- **Same Day Delivery**: For NCR only
- **Store Pickup**: Always ₱0.00

### 4. Monitor Uncovered Areas
Check your admin logs/order system for cities that don't match any rate. Add them to ensure all customers can checkout.

### 5. Update Prices Seasonally
Review and adjust delivery rates:
- Before peak seasons (Christmas, Back to School)
- After fuel price changes
- When expanding coverage areas

## Troubleshooting

### Issue: Customer can't see delivery rates at checkout

**Solution:**
1. Check if customer has a complete address (City is required)
2. Verify the city name matches exactly in RegionDeliveryRates table
3. Check if rate is marked as IsActive = 1
4. Try adding a wildcard city rate as fallback

### Issue: Wrong rate is being calculated

**Solution:**
1. Check for duplicate entries with different prices
2. Review the Rate Matching Algorithm (most specific match wins)
3. Use the admin search to find conflicting rates

### Issue: Migration script fails

**Solution:**
1. Check database permissions (need CREATE TABLE rights)
2. Verify SQL Server version compatibility (2012+)
3. Run each section of the migration separately
4. Check for existing table conflicts

## Real-World Example Setup

Here's a complete setup for a Manila-based office furniture business:

```sql
-- Metro Manila (Main Market) - ₱300
INSERT INTO RegionDeliveryRates (Region, City, Price, ServiceType) 
VALUES ('NCR', 'Metro Manila', 300, 'Standard Delivery');

-- Near Metro Manila (1-2 hours) - ₱400-500
INSERT INTO RegionDeliveryRates (Region, Province, City, Price, ServiceType) 
VALUES 
    ('Region IV-A', 'Laguna', 'Santa Rosa', 500, 'Standard Delivery'),
    ('Region IV-A', 'Cavite', 'Bacoor', 400, 'Standard Delivery'),
    ('Region IV-A', 'Rizal', 'Antipolo', 400, 'Standard Delivery');

-- Far areas (3-5 hours) - ₱800-1200
INSERT INTO RegionDeliveryRates (Region, Province, City, Price, ServiceType) 
VALUES 
    ('Region IV-A', 'Batangas', 'Batangas City', 800, 'Standard Delivery'),
    ('Region III', 'Pampanga', 'Angeles', 900, 'Standard Delivery');

-- Express options (50% premium)
INSERT INTO RegionDeliveryRates (Region, City, Price, ServiceType) 
VALUES ('NCR', 'Metro Manila', 450, 'Express Delivery');

-- Free store pickup
INSERT INTO RegionDeliveryRates (City, Price, ServiceType) 
VALUES ('Store Pickup', 0, 'Store Pickup');
```

## Support

For issues or questions:
1. Check this documentation
2. Review the migration summary in `backend/database/add_region_based_delivery_rates.sql`
3. Check backend logs for API errors
4. Test the `/api/delivery-rate/calculate` endpoint directly

## Future Enhancements

Potential improvements:
- Weight-based pricing
- Distance calculation using Google Maps API
- Bulk import from CSV
- Delivery zone mapping visualization
- Historical rate changes tracking
- Customer delivery preferences

---

**Version:** 1.0  
**Last Updated:** November 2, 2025  
**Compatible With:** DesignXcel E-commerce Platform

