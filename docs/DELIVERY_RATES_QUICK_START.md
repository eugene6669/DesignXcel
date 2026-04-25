# Region-Based Delivery Rates - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Run the Database Migration

Open SQL Server Management Studio and run:
```
backend/database/add_region_based_delivery_rates.sql
```

This automatically creates the tables and adds default Philippine delivery rates.

### Step 2: Access Admin Panel

1. Log in as Admin
2. Go to **Transactions → Delivery Rates**
3. Click the **Region-Based Rates** tab

You'll see pre-loaded rates for:
- **Metro Manila**: ₱300
- **Laguna** (Santa Rosa, Biñan, Calamba): ₱500-600
- **Cavite** (Bacoor, Imus, Dasmariñas): ₱400-450
- **Rizal** (Cainta, Taytay, Antipolo): ₱350-400
- And more...

### Step 3: Add Your Custom Rates

**Example: Adding "Taguig, Metro Manila - ₱300"**

Fill in the form:
- **Region**: NCR
- **Province**: (leave empty)
- **City**: Taguig
- **Price**: 300.00
- **Service Type**: Standard Delivery
- **Notes**: BGC, Bonifacio Global City

Click **Add Rate**

### Step 4: Test It Out

1. As a customer, set your address to include the city you added
2. Go to checkout
3. You should see the correct delivery rate based on your city!

## 📍 Common Delivery Rates

Use these as reference for Philippine office furniture delivery:

### Metro Manila (NCR)
- All cities: **₱300** (Standard)
- All cities: **₱450** (Express)

### Near Metro Manila (30-60km)
- Laguna (Santa Rosa, Biñan): **₱500**
- Cavite (Bacoor, Imus): **₱400**
- Rizal (Cainta, Taytay): **₱350**

### Far From Metro Manila (100km+)
- Batangas City: **₱800**
- Pampanga (Angeles): **₱900**
- Bulacan (Malolos): **₱600**

### Special Options
- **Store Pickup**: ₱0 (Free)
- **Express Delivery**: +50% standard rate

## 🎯 Best Practices

### DO ✅
- Use official city names (e.g., "Quezon City" not "QC")
- Add notes describing coverage area
- Set Store Pickup to ₱0.00
- Test rates by checking out as a customer

### DON'T ❌
- Don't use abbreviations (NCR ✅, Metro Manila ✅, but "MM" ❌)
- Don't forget to set rates as "Active"
- Don't create duplicate city entries (use Update instead)

## 🔍 Quick Reference Table

| Location | Distance from Manila | Typical Rate |
|----------|---------------------|--------------|
| Metro Manila | 0km | ₱300 |
| Near South (Laguna, Cavite) | 30-50km | ₱400-600 |
| Far South (Batangas, Quezon) | 100-150km | ₱800-1,200 |
| North (Bulacan, Pampanga) | 50-100km | ₱600-900 |
| Store Pickup | N/A | ₱0 (Free) |

## 🛠️ Troubleshooting

**Q: Customer can't see delivery options at checkout**
- Check if their address has a City field
- Make sure the city name matches exactly in your rates table
- Verify the rate is marked as "Active"

**Q: How do I update a price?**
- Find the rate in the table
- Change the price field
- Click "Update"

**Q: Can I have multiple rates for the same city?**
- Yes! Use different Service Types (Standard, Express, Same Day)

**Q: What if a customer is from a city not in my list?**
- System falls back to legacy rates
- Or customer will be notified to contact you for a quote
- Add the city to your rates list for future orders

## 📞 Need Help?

- Full documentation: `docs/REGION_BASED_DELIVERY_RATES.md`
- Database migration: `backend/database/add_region_based_delivery_rates.sql`
- API endpoints: Check the full documentation

---

**Remember:** Start with your most common delivery locations and expand as needed!

