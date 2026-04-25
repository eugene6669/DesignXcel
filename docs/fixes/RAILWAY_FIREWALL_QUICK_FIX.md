# Railway Azure SQL Firewall - Quick Action Required

## Current Issue
Railway IP `162.220.232.78` is blocked by Azure SQL Database firewall.

## ⚡ Immediate Action (Choose One)

### Option A: Add IP Range (Recommended - 2 minutes)

1. **Open Azure Portal**: https://portal.azure.com
2. **Navigate**: Search "SQL servers" → Click `designxcell-server` → Click **"Networking"**
3. **Add Rule**: Click **"+ Add firewall rule"**
   - **Rule name**: `Railway-Production-Range`
   - **Start IP**: `162.220.232.0`
   - **End IP**: `162.220.232.255`
   - Click **"Save"**
4. **Wait**: 2-5 minutes for propagation
5. **Restart**: Your Railway service

### Option B: Enable Azure Services (Fastest - 1 minute)

1. **Open Azure Portal**: https://portal.azure.com
2. **Navigate**: Search "SQL servers" → Click `designxcell-server` → Click **"Networking"**
3. **Toggle ON**: **"Allow Azure services and resources to access this server"**
4. **Save** and wait 2-5 minutes
5. **Restart**: Your Railway service

## Why IP Range?

Railway uses **dynamic IPs** that change. You've seen:
- `162.220.232.115` (previous)
- `162.220.232.78` (current)

Adding the range `162.220.232.0-255` covers all Railway IPs in this block.

## Verification

After adding the rule, check Railway logs for:
```
✅ Connected to MSSQL database successfully
```

## Full Documentation

See `docs/fixes/AZURE_SQL_FIREWALL_FIX.md` for detailed instructions and alternative methods.

