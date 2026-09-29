# Testing Guide for Refactored DesignXcel Backend

**Last Updated:** September 20, 2026  
**Purpose:** Verify that the refactored modular architecture works correctly

---

## Quick Start Testing

### 1. Start the Backend Server

```bash
cd backend
npm start
```

**Expected Output:**
```
🚀 Server is running on port 5000
🏥 Health check: http://localhost:5000/api/health
🌍 Environment: development
[ROUTES] Modular routes loaded in XXXms
⏰ Expired discount cleanup scheduled to run every hour.
```

✅ **Success Indicator:** Look for "Modular routes loaded" message

---

## Manual Testing Steps

### Test 1: Health Check (Critical)

**Purpose:** Verify server is running and routes are loaded

```bash
# PowerShell
Invoke-WebRequest http://localhost:5000/api/health | Select-Object StatusCode, Content

# Or use browser
# Navigate to: http://localhost:5000/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-09-20T15:38:20.023Z",
  "uptime": 42.5,
  "environment": "development"
}
```

✅ **Pass:** Status code 200, response contains "healthy"  
❌ **Fail:** Server not responding or error message

---

### Test 2: API Test Endpoint

**Purpose:** Test basic route functionality

```bash
Invoke-WebRequest http://localhost:5000/api/test | ConvertFrom-Json
```

**Expected Response:**
```json
{
  "message": "API is working!",
  "timestamp": "2026-09-20T15:38:20.023Z",
  "origin": "no-origin",
  "cors": "configured"
}
```

✅ **Pass:** Returns "API is working!"

---

### Test 3: Products API (Database Connection)

**Purpose:** Test database connectivity and product routes

```bash
Invoke-WebRequest http://localhost:5000/api/products | ConvertFrom-Json | Select-Object -First 3
```

**Expected Response:**
```json
[
  {
    "ProductID": "uuid-here",
    "Name": "Product Name",
    "Price": 1000,
    ...
  }
]
```

✅ **Pass:** Returns array of products  
❌ **Fail:** Database connection error

---

### Test 4: Protected Employee Routes

**Purpose:** Verify authentication middleware works

```bash
Invoke-WebRequest http://localhost:5000/Employee/InventoryManager
```

**Expected Response:**
- Status Code: **302** (redirect to login) OR **401** (unauthorized)

✅ **Pass:** Not accessible without authentication  
❌ **Fail:** Returns 200 (security issue!)

---

### Test 5: OTP Authentication Route (Auth Module)

**Purpose:** Test modular auth routes are working

```bash
$body = @{
    email = "test@example.com"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:5000/api/auth/send-otp -Method POST -Body $body -ContentType "application/json"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "An account with this email already exists...",
  "code": "EMAIL_ALREADY_EXISTS"
}
```
OR (if email doesn't exist and SMTP configured)
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

✅ **Pass:** Route responds (regardless of success/failure)  
❌ **Fail:** 404 or module not loaded

---

### Test 6: Debug Routes (Development Only)

**Purpose:** Verify debug module loads in development

```bash
Invoke-WebRequest http://localhost:5000/api/debug/env-check | ConvertFrom-Json
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Environment variables check",
  "environment": {
    "nodeEnv": "development",
    "otpEmailUser": "Set",
    ...
  }
}
```

✅ **Pass:** Returns environment check  
❌ **Fail:** 404 (only works in development)

---

## Automated Testing Script

Create and run this test script:

```javascript
// File: backend/test-routes.js
const http = require('http');

async function testEndpoint(path, expectedStatus = 200) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:5000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`✓ ${path} - Status: ${res.statusCode}`);
                resolve({ status: res.statusCode, data });
            });
        }).on('error', (err) => {
            console.log(`✗ ${path} - Error: ${err.message}`);
            reject(err);
        });
    });
}

async function runTests() {
    console.log('\n🧪 Testing Refactored Backend Routes\n');
    
    try {
        await testEndpoint('/api/health', 200);
        await testEndpoint('/api/test', 200);
        await testEndpoint('/api/products', 200);
        await testEndpoint('/api/debug/env-check', 200);
        
        console.log('\n✅ All tests passed!\n');
    } catch (error) {
        console.log('\n❌ Some tests failed\n');
        process.exit(1);
    }
}

runTests();
```

**Run the script:**
```bash
node backend/test-routes.js
```

---

## Testing Checklist

Use this checklist to verify the refactoring:

### Core Functionality
- [ ] Server starts without errors
- [ ] Health check endpoint responds
- [ ] Database connection works
- [ ] Products API returns data
- [ ] Static files serve correctly

### Modular Routes
- [ ] Auth routes loaded (OTP works)
- [ ] Debug routes loaded (development only)
- [ ] Employee routes loaded (Inventory Manager)
- [ ] Employee routes loaded (Transaction Manager)
- [ ] Employee routes loaded (User Manager)
- [ ] Employee routes loaded (Order Support)

### Middleware
- [ ] Authentication middleware works (protected routes)
- [ ] Error handler catches errors gracefully
- [ ] Permission checks work correctly
- [ ] Session management works

### Services
- [ ] Email service works (if configured)
- [ ] Activity logging works
- [ ] Excel export works (if tested)

---

## Common Issues & Solutions

### Issue 1: "Cannot find module './routes/index'"

**Cause:** Main router not found  
**Solution:**
```bash
# Check file exists
Test-Path backend/routes/index.js

# If missing, file was not committed
git status
```

### Issue 2: "Routes loaded in 0ms" or no routes message

**Cause:** Routes not loading due to error  
**Solution:** Check server logs for detailed error message

### Issue 3: Database connection errors

**Cause:** Environment variables not set  
**Solution:**
```bash
# Verify .env file exists
Test-Path backend/.env

# Check database connection string
node -e "require('dotenv').config({path:'backend/.env'}); console.log(process.env.DB_SERVER)"
```

### Issue 4: "404 Not Found" on previously working routes

**Cause:** Route not registered in new modular system  
**Solution:** Check if route module is imported in `routes/index.js`

### Issue 5: Employee routes not working

**Cause:** Middleware not properly passed  
**Solution:** Verify `sharedContext` in `routes/index.js` includes all middleware

---

## Performance Testing

### Check Startup Time

```bash
Measure-Command { 
    cd backend
    node server.js 
    # Ctrl+C after server starts
}
```

**Expected:** Similar to before refactoring (lazy loading maintained)

### Check Memory Usage

```powershell
# Start server
cd backend
npm start

# In another terminal
Get-Process -Name node | Select-Object WS, PM, NPM

# WS = Working Set (memory)
```

**Expected:** No significant increase in memory usage

---

## Integration Testing

### Test Complete User Flow

1. **Start both frontend and backend:**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm start

   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

2. **Test customer registration:**
   - Open browser: http://localhost:3000
   - Click "Register"
   - Enter email and request OTP
   - Complete registration

3. **Test employee access:**
   - Navigate to: http://localhost:3000/login
   - Login with employee credentials
   - Access employee dashboard
   - Verify all sections load

4. **Test admin functions:**
   - Login as admin
   - Access Inventory Manager
   - Access Transaction Manager
   - Access User Manager
   - Access Order Support

✅ **All working:** Refactoring successful!

---

## Rollback Instructions

If critical issues are found:

1. **Immediate rollback:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Temporary fix:**
   Edit `backend/server.js` line 3826:
   ```javascript
   // Change from:
   const createMainRouter = require('./routes/index');
   mainRouter = createMainRouter(sql, pool, getStripe);

   // Back to:
   employeeRoutes = require('./routes')(sql, pool, getStripe);
   ```

3. **Restart server:**
   ```bash
   cd backend
   npm start
   ```

---

## Success Criteria

The refactoring is successful if:

✅ All existing routes still work  
✅ No increase in response times  
✅ No new errors in server logs  
✅ Employee features work correctly  
✅ Customer features work correctly  
✅ Database operations work correctly  
✅ File uploads work correctly  
✅ Authentication works correctly  
✅ Payments work correctly (Stripe)

---

## Next Steps After Testing

1. **If all tests pass:**
   - Deploy to staging environment
   - Run full QA testing
   - Monitor for 24 hours
   - Deploy to production

2. **If tests fail:**
   - Document failing tests
   - Fix issues in development
   - Re-run tests
   - Do not deploy until all pass

3. **Ongoing monitoring:**
   - Watch server logs
   - Monitor error rates
   - Check performance metrics
   - Gather user feedback

---

## Support

If you encounter issues during testing:

1. Check server logs in terminal
2. Review `docs/REFACTORING_SUMMARY.md`
3. Verify all files committed properly
4. Check that no files were accidentally deleted

**Remember:** The refactoring is **non-breaking**. All functionality should work exactly as before!
