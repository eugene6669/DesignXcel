# Railway Environment Variables Configuration

This document lists all required and optional environment variables for deploying the DesignXcel backend to Railway.

## Required Environment Variables

### Database Configuration
```bash
DB_SERVER=your-sql-server.database.windows.net
DB_DATABASE=your-database-name
DB_USER=your-db-username
DB_PASSWORD=your-db-password
DB_PORT=1433
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

### Application Configuration
```bash
NODE_ENV=production
PORT=5000
SESSION_SECRET=your-session-secret-key-min-32-chars
JWT_SECRET=your-jwt-secret-key-min-32-chars
```

### Stripe Payment Configuration
```bash
STRIPE_SECRET_KEY=YOUR_STRIPE_LIVE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_LIVE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_LIVE_WEBHOOK_SECRET
```

### Email Service Configuration (SendGrid)
```bash
SENDGRID_API_KEY=SG.your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=DesignXcel
```

### Frontend URL (for CORS and redirects)
```bash
FRONTEND_URL=https://your-frontend-domain.com
```

## Optional Environment Variables

### Performance Optimization
```bash
# Enable compression (default: true)
ENABLE_COMPRESSION=true

# Database connection pool settings
DB_POOL_MAX=10
DB_POOL_MIN=0
DB_POOL_IDLE_TIMEOUT=30000

# Cache settings
ENABLE_CACHE=true
CACHE_TTL=3600
```

### Logging
```bash
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

### Security
```bash
# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS origins (comma-separated)
CORS_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com
```

### File Upload
```bash
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./public/uploads
```

## Railway Setup Instructions

### 1. Create a New Project
- Go to [Railway](https://railway.app)
- Create a new project
- Select "Deploy from GitHub repo" or "Empty Project"

### 2. Add Environment Variables
1. Go to your project settings
2. Navigate to "Variables" tab
3. Add each required variable listed above
4. Click "Deploy" to apply changes

### 3. Database Setup
If using Azure SQL Database:
1. Ensure your Azure SQL firewall allows Railway IPs
2. Use the connection string format:
   ```
   Server=tcp:your-server.database.windows.net,1433;Initial Catalog=your-db;Persist Security Info=False;User ID=your-user;Password=your-password;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
   ```

### 4. Build Configuration
Railway will automatically detect Node.js projects. Ensure your `package.json` has:
```json
{
  "engines": {
    "node": "18.17.0",
    "npm": "9.0.0"
  }
}
```

### 5. Health Check
Railway will use the `/api/health` endpoint for health checks. Ensure it's accessible.

## Quick Setup Script

You can use this script to set all variables at once (replace values):

```bash
railway variables set DB_SERVER=your-server.database.windows.net
railway variables set DB_DATABASE=your-database
railway variables set DB_USER=your-username
railway variables set DB_PASSWORD=your-password
railway variables set NODE_ENV=production
railway variables set PORT=5000
railway variables set SESSION_SECRET=$(openssl rand -base64 32)
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set STRIPE_SECRET_KEY=YOUR_STRIPE_LIVE_SECRET_KEY
railway variables set STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_LIVE_PUBLISHABLE_KEY
railway variables set STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_LIVE_WEBHOOK_SECRET
railway variables set SENDGRID_API_KEY=SG.your_key
railway variables set SENDGRID_FROM_EMAIL=noreply@yourdomain.com
railway variables set FRONTEND_URL=https://your-frontend-domain.com
```

## Verification

After deployment, verify:
1. Health check endpoint: `https://your-railway-app.railway.app/api/health`
2. Database connection is working
3. Stripe webhooks are configured
4. Email service is sending emails correctly

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check firewall rules allow Railway IPs
   - Verify credentials are correct
   - Ensure `DB_ENCRYPT=true` for Azure SQL

2. **Stripe Webhook Not Working**
   - Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
   - Check webhook URL in Stripe dashboard matches Railway URL

3. **Email Not Sending**
   - Verify `SENDGRID_API_KEY` is valid
   - Check SendGrid account has verified sender
   - Ensure `SENDGRID_FROM_EMAIL` is verified in SendGrid

4. **CORS Errors**
   - Add frontend URL to `CORS_ORIGINS`
   - Verify `FRONTEND_URL` is set correctly

## Performance Optimization Variables

For production optimization, consider setting:

```bash
# Enable all optimizations
ENABLE_COMPRESSION=true
ENABLE_CACHE=true
DB_POOL_MAX=20
DB_POOL_MIN=5
CACHE_TTL=7200

# Lazy loading (already implemented in code)
# No additional variables needed
```

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong secrets** (minimum 32 characters)
3. **Rotate secrets regularly**
4. **Use different secrets** for development and production
5. **Enable HTTPS** (Railway provides this automatically)
6. **Set appropriate CORS origins** (don't use `*`)

## Notes

- All secrets should be at least 32 characters long
- Railway automatically provides HTTPS
- Database connections are pooled for better performance
- Lazy loading is implemented for heavy dependencies (ExcelJS)
- Compression middleware is enabled by default
- Response caching is enabled for static API endpoints

