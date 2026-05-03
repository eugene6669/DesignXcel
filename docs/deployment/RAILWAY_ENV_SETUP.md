# Railway Environment Variables Setup

## Recommended File Structure

Keep these files in `backend/`:

- `.env.template` - canonical complete env reference
- `.env.example` - local dev quickstart
- `.env.railway.example` - Railway production template
- `.env.railway` - your real Railway values (do not commit)

## Required Environment Variables for Backend

You need to set these environment variables in your Railway backend project dashboard:

### Email Configuration (OTP)
```
OTP_EMAIL_USER=YOUR_EMAIL_USERNAME
OTP_EMAIL_PASS=YOUR_EMAIL_APP_PASSWORD
```

### Database Configuration
```
DB_CONNECTION_STRING=Server=tcp:YOUR_AZURE_SQL_SERVER.database.windows.net,1433;Initial Catalog=DesignXcellDB;Persist Security Info=False;User ID=YOUR_DB_USER;Password=YOUR_DB_PASSWORD;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=True;Connection Timeout=30;
```

### Security Configuration
```
SESSION_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=24h
```

### Stripe Configuration
```
STRIPE_SECRET_KEY=YOUR_STRIPE_TEST_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_TEST_WEBHOOK_SECRET
```

### Frontend URL Configuration
```
FRONTEND_URL=https://designxcellwebsite-production.up.railway.app
CORS_ORIGIN=https://designxcellwebsite-production.up.railway.app
ALLOWED_ORIGINS=https://designxcellwebsite-production.up.railway.app,http://localhost:3000
```

### Production Settings
```
NODE_ENV=production
PORT=5000
DEBUG=false
LOG_LEVEL=info
FORCE_HTTPS=true
HELMET_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_ROUNDS=12
```

## How to Set Environment Variables in Railway:

1. Go to your Railway dashboard
2. Select your backend project (designexcellinventory-production)
3. Go to the "Variables" tab
4. Add each environment variable listed above
5. Click "Deploy" to apply the changes

## Testing the Setup:

After setting the environment variables, test the OTP functionality:

1. **Test OTP Endpoint:**
   ```bash
   curl -X POST https://designexcellinventory-production.up.railway.app/api/auth/test-otp \
   -H "Content-Type: application/json" \
   -d '{"email":"your-test-email@gmail.com"}'
   ```

2. **Test Customer Login:**
   - Try logging in with an existing customer account
   - Check the Railway logs for detailed error messages

## Troubleshooting:

### If OTP emails are not being sent:
1. Verify Gmail App Password is correct
2. Check Railway logs for email sending errors
3. Ensure Gmail account has 2FA enabled and app password is generated

### If customer login fails:
1. Check if the customer exists in the database
2. Verify the password is correct
3. Check if the account is active (IsActive = 1)

### If you need to create a test customer:
You can use the registration endpoint or manually insert into the database.
