# Production Session Logout Fix

## Problem
Customers are being automatically logged out on production Railway deployment (`https://designxcelwebsite-production.up.railway.app`) but sessions work correctly on localhost (`http://localhost:3000`).

## Root Causes

### 1. Memory Session Store in Production
- **Issue**: Production was using memory session store, which loses all sessions on server restart
- **Impact**: Railway containers can restart, causing all users to be logged out
- **Fix**: Configured MSSQL session store for production to persist sessions across restarts

### 2. Incorrect Cookie Settings for Cross-Origin
- **Issue**: Session cookies weren't configured correctly for cross-origin requests
- **Impact**: Cookies weren't being sent/received properly between frontend and backend
- **Fix**: 
  - Set `secure: true` for HTTPS production
  - Set `sameSite: 'none'` for cross-origin requests (requires `secure: true`)
  - Ensured CORS allows credentials

### 3. Missing Session Persistence
- **Issue**: Sessions weren't explicitly saved, relying on automatic saving
- **Impact**: Cookie might not be set properly for cross-origin requests
- **Fix**: Added explicit `req.session.save()` in login endpoint

## Changes Made

### Backend (`backend/server.js`)

1. **Session Configuration**
   - Added environment-based cookie settings
   - Detect cross-origin scenario (different domains)
   - Set `secure: true` and `sameSite: 'none'` for cross-origin HTTPS
   - Set `sameSite: 'lax'` for same-origin

2. **MSSQL Session Store**
   - Configured MSSQL session store for production
   - Persists sessions across server restarts
   - Falls back to memory store if database unavailable

3. **CORS Configuration**
   - Ensured `credentials: true` for cookie support
   - Added `exposedHeaders: ['Set-Cookie']`
   - Increased preflight cache to 24 hours

4. **Session Logging**
   - Added detailed logging for session creation
   - Log session configuration on startup
   - Warn if production is using memory store

### Backend (`backend/routes.js`)

1. **Login Endpoint**
   - Added explicit session save with error handling
   - Log session ID and cookie settings
   - Set `Access-Control-Allow-Credentials` header

2. **Auth Status Endpoint**
   - Added detailed logging for debugging
   - Check for session and user separately
   - Log cookie presence in requests

## Configuration Required

### Environment Variables

Ensure these are set in Railway:

```bash
NODE_ENV=production
FORCE_HTTPS=true
SESSION_SECRET=<strong-secret-key>
DB_CONNECTION_STRING=<azure-sql-connection-string>
FRONTEND_URL=https://designxcelwebsite-production.up.railway.app
BACKEND_URL=https://designexcellinventory-production.up.railway.app
ALLOWED_ORIGINS=https://designxcelwebsite-production.up.railway.app,https://designxcellwebsite-production.up.railway.app,https://designxcellinventory-production.up.railway.app
```

### Database Session Table

The MSSQL session store requires a `Sessions` table. The `connect-mssql-v2` package should create this automatically, but you can verify with:

```sql
SELECT * FROM Sessions;
```

If the table doesn't exist, the session store will fall back to memory store (which will cause the logout issue).

## Frontend Configuration

### API Client (`frontend/src/shared/services/api/apiClient.js`)

Ensure `withCredentials: true` is set (already configured):

```javascript
this.client = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: 30000,
  withCredentials: true // ✅ Already set
});
```

### API URL Configuration

Ensure `REACT_APP_API_URL` is set correctly in Railway frontend environment:

```bash
REACT_APP_API_URL=https://designexcellinventory-production.up.railway.app
```

## Testing

### Verify Session Persistence

1. Log in on production
2. Check browser DevTools → Application → Cookies
3. Verify `connect.sid` cookie is present with:
   - `Secure: true`
   - `SameSite: None` (for cross-origin)
   - `HttpOnly: true`

### Verify Session Store

Check backend logs on Railway:

```
✅ MSSQL session store configured successfully
💡 Sessions will persist across server restarts and container deployments
```

If you see:
```
⚠️ PRODUCTION: Using memory session store
```

Then sessions will NOT persist and users will be logged out on restart.

### Verify CORS

Check Network tab in browser DevTools:
- Login request should include `Cookie` header
- Response should include `Set-Cookie` header
- CORS headers should include `Access-Control-Allow-Credentials: true`

## Troubleshooting

### Users Still Getting Logged Out

1. **Check Session Store**
   - Verify MSSQL session store is configured (check logs)
   - Verify `Sessions` table exists in database
   - Check database connection

2. **Check Cookie Settings**
   - Verify `secure: true` in production
   - Verify `sameSite: 'none'` for cross-origin
   - Check browser console for cookie warnings

3. **Check CORS**
   - Verify `credentials: true` in CORS config
   - Verify frontend `withCredentials: true`
   - Check CORS preflight requests

4. **Check Domain Configuration**
   - Verify frontend and backend URLs are correct
   - Check if domains are actually different (cross-origin)
   - Verify Railway proxy settings

### Session Not Persisting

1. **Database Connection**
   - Verify `DB_CONNECTION_STRING` is set
   - Check database connection logs
   - Verify `Sessions` table exists

2. **Session Store Initialization**
   - Check backend startup logs
   - Look for MSSQL session store errors
   - Verify fallback to memory store warnings

### Cookies Not Being Sent

1. **Browser Settings**
   - Check if cookies are blocked
   - Check SameSite cookie settings in browser
   - Try in incognito/private mode

2. **Network Issues**
   - Check if requests are going to correct backend URL
   - Verify SSL certificate is valid
   - Check for mixed content warnings

## Related Files

- `backend/server.js` - Session and CORS configuration
- `backend/routes.js` - Login and auth status endpoints
- `frontend/src/shared/services/api/apiClient.js` - API client configuration
- `backend/.env.railway` - Environment variables template

## References

- [Express Session Documentation](https://github.com/expressjs/session)
- [connect-mssql-v2 Documentation](https://www.npmjs.com/package/connect-mssql-v2)
- [CORS with Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#credentials)
- [SameSite Cookie Attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

