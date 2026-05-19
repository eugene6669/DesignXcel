# SQL Server Password Expired - Fix Guide

## Problem
Your application is showing errors like:
```
Login failed for user 'DesignXcel'. Reason: The password of the account has expired.
```

This happens when the SQL Server password policy requires password changes and the password has expired.

## Solution Steps

### Method 1: Reset Password Using SQL Server Management Studio (Recommended)

1. **Open SQL Server Management Studio (SSMS)**
   - If you don't have it, download from: https://docs.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms

2. **Connect to SQL Server**
   - Server name: `DESKTOP-F4OI6BT\SQLEXPRESS`
   - Authentication: **Windows Authentication** (use your Windows account)
   - If Windows Authentication doesn't work, try:
     - Authentication: **SQL Server Authentication**
     - Login: `sa` (or another admin account)
     - Password: (your admin password)

3. **Reset the Password**
   Once connected, open a new query window and run:
   ```sql
   ALTER LOGIN [DesignXcel] WITH PASSWORD = 'YourNewPassword123!', 
       CHECK_POLICY = OFF, 
       CHECK_EXPIRATION = OFF;
   ```

   **Important Notes:**
   - Replace `YourNewPassword123!` with your actual new password
   - `CHECK_POLICY = OFF` disables password complexity requirements (optional)
   - `CHECK_EXPIRATION = OFF` disables password expiration (recommended for application accounts)

4. **Update Your Application Configuration**
   - Update the `.env` file in the `backend` folder:
     ```
     DB_PASSWORD=YourNewPassword123!
     ```
   - Or update environment variables if deployed

5. **Restart Your Application**
   - Stop the Node.js server
   - Start it again to use the new password

### Method 2: Reset Password Using Command Line (Alternative)

If you have SQL Server command-line tools installed:

1. **Open Command Prompt as Administrator**

2. **Connect using sqlcmd:**
   ```cmd
   sqlcmd -S DESKTOP-F4OI6BT\SQLEXPRESS -E
   ```
   (The `-E` flag uses Windows Authentication)

3. **Run the password reset command:**
   ```sql
   ALTER LOGIN [DesignXcel] WITH PASSWORD = 'YourNewPassword123!', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
   GO
   ```

4. **Exit sqlcmd:**
   ```sql
   EXIT
   ```

### Method 3: Disable Password Expiration (For Development)

If this is a development environment and you want to prevent this issue:

1. **Connect to SQL Server as Administrator**

2. **Run this command:**
   ```sql
   ALTER LOGIN [DesignXcel] WITH CHECK_EXPIRATION = OFF, CHECK_POLICY = OFF;
   ```

   This will:
   - Disable password expiration for this account
   - Disable password complexity requirements

### Quick Fix Summary

**If you see "Password expired" error:**
1. Connect to SQL Server using SSMS with Windows Authentication
2. Run: `ALTER LOGIN [DesignXcel] WITH PASSWORD = 'NewPassword123!', CHECK_EXPIRATION = OFF;`
3. Update `.env` file with new password
4. Restart application

**Test your connection:**
```bash
cd backend
node scripts/test-db-connection.js
```

### Troubleshooting Connection Issues

If you're getting error 233 ("No process is on the other end of the pipe"):

1. **Check SQL Server Service Status:**
   - Open Services (Windows Key + R, type `services.msc`)
   - Find "SQL Server (SQLEXPRESS)"
   - Ensure it's **Running**
   - If not, right-click and select **Start**

2. **Enable SQL Server Authentication:**
   - Open SQL Server Management Studio
   - Right-click on server → Properties
   - Go to Security
   - Select "SQL Server and Windows Authentication mode"
   - Click OK and restart SQL Server service

3. **Enable TCP/IP Protocol:**
   - Open SQL Server Configuration Manager
   - Navigate to: SQL Server Network Configuration → Protocols for SQLEXPRESS
   - Enable TCP/IP
   - Restart SQL Server service

4. **Check Firewall:**
   - Ensure Windows Firewall allows SQL Server connections
   - Default port is 1433

### Verify the Fix

After resetting the password:

1. Test connection in SSMS:
   - Server: `DESKTOP-F4OI6BT\SQLEXPRESS`
   - Authentication: SQL Server Authentication
   - Login: `DesignXcel`
   - Password: (your new password)

2. Restart your Node.js application

3. Check the console for:
   ```
   ✅ Connected to MSSQL database successfully
   ```

### Prevention Tips

1. **For Production:**
   - Use a service account with a long, complex password
   - Set `CHECK_EXPIRATION = OFF` for service accounts
   - Document password changes in a secure location

2. **For Development:**
   - Consider disabling password expiration for dev accounts
   - Use a password manager to track credentials

3. **Monitor Password Expiration:**
   - Set up alerts for password expiration
   - Rotate passwords during maintenance windows

## Related Files

- `backend/server.js` - Database connection configuration
- `backend/config/configManager.js` - Configuration management
- `.env` - Environment variables (create if missing)

## Additional Resources

- [SQL Server ALTER LOGIN Documentation](https://docs.microsoft.com/sql/t-sql/statements/alter-login-transact-sql)
- [SQL Server Authentication Modes](https://docs.microsoft.com/sql/relational-databases/security/choose-an-authentication-mode)

