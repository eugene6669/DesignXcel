# Quick Testing Steps for Refactored Backend

## Step 1: Start the Backend Server

Open a terminal and run:

```bash
cd backend
npm start
```

**✅ Success indicators you should see:**
- `🚀 Server is running on port 5000`
- `✅ Connected to MSSQL database successfully`
- `[ROUTES] Modular routes loaded in XXXms` (if you see this, refactoring works!)

Keep this terminal open!

---

## Step 2: Test in Your Browser

Open your browser and test these URLs:

### Test 1: Health Check
```
http://localhost:5000/api/health
```
**Expected:** JSON response with `"status": "healthy"`

### Test 2: API Test
```
http://localhost:5000/api/test
```
**Expected:** JSON response with `"message": "API is working!"`

### Test 3: Products API
```
http://localhost:5000/api/products
```
**Expected:** Array of products from your database

### Test 4: Debug Routes (New Modular Route)
```
http://localhost:5000/api/debug/env-check
```
**Expected:** JSON with environment variables status

---

## Step 3: Test with PowerShell (Alternative)

Open a **NEW** PowerShell terminal (keep the server running in the first one):

```powershell
# Test 1: Health Check
Invoke-RestMethod -Uri http://localhost:5000/api/health

# Test 2: API Test
Invoke-RestMethod -Uri http://localhost:5000/api/test

# Test 3: Products API
Invoke-RestMethod -Uri http://localhost:5000/api/products | Select-Object -First 3

# Test 4: Debug Routes (Modular)
Invoke-RestMethod -Uri http://localhost:5000/api/debug/env-check

# Test 5: OTP Route (Auth Module - should respond even without email)
$body = @{ email = "test@example.com" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:5000/api/auth/send-otp -Method POST -Body $body -ContentType "application/json"
```

---

## Step 4: Test Full Application

### Start Frontend (in a new terminal):
```bash
cd frontend
npm start
```

### Test Complete Flow:
1. **Open browser:** http://localhost:3000
2. **Test customer features:**
   - Browse products
   - Add to cart
   - Register/login

3. **Test employee features:**
   - Go to: http://localhost:3000/login
   - Login with employee credentials
   - Access employee dashboards:
     - Inventory Manager
     - Transaction Manager
     - User Manager
     - Order Support

---

## What to Look For

### ✅ Success Indicators:
- All API endpoints return data (not 404)
- No error messages in server console
- Employee routes redirect to login (protected)
- Database operations work
- No "Cannot find module" errors

### ❌ Failure Indicators:
- 404 errors on routes that worked before
- "Cannot find module './routes/index'" error
- Routes not loading
- Server crashes on startup

---

## Common Issues

### Issue: "Cannot find module"
**Solution:** The routes/index.js file might not be in the right location
```bash
# Check if file exists
ls backend/routes/index.js
```

### Issue: Old routes still being used
**Solution:** Clear node cache and restart
```bash
# Stop server (Ctrl+C)
# Delete node cache
Remove-Item -Recurse -Force backend/node_modules/.cache
# Restart
cd backend
npm start
```

---

## Quick Validation Checklist

Run through this checklist:

- [ ] Server starts without errors
- [ ] See "Modular routes loaded" message in console
- [ ] `/api/health` returns healthy status
- [ ] `/api/products` returns products
- [ ] `/api/debug/env-check` works (new modular route)
- [ ] Frontend can connect to backend
- [ ] Can register new user
- [ ] Can login as employee
- [ ] Employee dashboards load

**If all checked:** ✅ Refactoring is successful!

**If any fail:** ⚠️ Review the error messages and check:
1. All files were committed properly (`git status`)
2. No syntax errors (`node -c backend/routes/index.js`)
3. Database connection is working

---

## Visual Test Results

When you test the routes, you should see output like this:

```json
// http://localhost:5000/api/health
{
  "status": "healthy",
  "timestamp": "2026-09-20T15:40:50.137Z",
  "uptime": 42.5,
  "environment": "development"
}
```

```json
// http://localhost:5000/api/test
{
  "message": "API is working!",
  "timestamp": "2026-09-20T15:40:50.137Z",
  "origin": "no-origin",
  "cors": "configured"
}
```

```json
// http://localhost:5000/api/debug/env-check
{
  "success": true,
  "message": "Environment variables check",
  "environment": {
    "nodeEnv": "development",
    "otpEmailUser": "Set",
    "dbServer": "Set",
    ...
  }
}
```

---

## Need Help?

If you see errors:
1. Copy the exact error message from the server console
2. Check `docs/REFACTORING_SUMMARY.md` for details
3. Verify all new files exist in `backend/routes/`
4. Check that `backend/server.js` was updated correctly

The refactoring is designed to be **non-breaking**, so everything should work exactly as before!
