'use strict';

/**
 * Login authentication routes for employees and customers
 */
module.exports = function registerLoginRoutes(router, deps) {
    const { pool, sql } = deps;
    const bcrypt = require('bcrypt');

    // GET /login - Display login page
    router.get('/login', (req, res) => {
        if (req.session && req.session.user) {
            const userRole = req.session.user.role;
            switch (userRole) {
                case 'Admin':
                    return res.redirect('/Employee/AdminManager');
                case 'InventoryManager':
                    return res.redirect('/Employee/InventoryManager');
                case 'TransactionManager':
                    return res.redirect('/Employee/TransactionManager');
                case 'UserManager':
                    return res.redirect('/Employee/UserManager');
                case 'OrderSupport':
                    return res.redirect('/Employee/OrderSupport');
                default:
                    return res.redirect('/');
            }
        }
        res.render('EmpLogin/EmpLogin', {
            title: 'Login',
            error: req.flash('error'),
            success: req.flash('success'),
            email: req.flash('email')[0] || ''
        });
    });

    // GET /employee-login - Alternative employee login route
    router.get('/employee-login', (req, res) => {
        if (req.session && req.session.user) {
            const userRole = req.session.user.role;
            switch (userRole) {
                case 'Admin':
                    return res.redirect('/Employee/AdminManager');
                case 'InventoryManager':
                    return res.redirect('/Employee/InventoryManager');
                case 'TransactionManager':
                    return res.redirect('/Employee/TransactionManager');
                case 'UserManager':
                    return res.redirect('/Employee/UserManager');
                case 'OrderSupport':
                    return res.redirect('/Employee/OrderSupport');
                default:
                    return res.redirect('/');
            }
        }
        res.render('EmpLogin/EmpLogin', {
            title: 'Employee Login',
            error: req.flash('error'),
            success: req.flash('success'),
            email: req.flash('email')[0] || ''
        });
    });

    // POST /auth/login - Handle login authentication
    router.post('/auth/login', async (req, res) => {
        try {
            const { email, password, rememberMe } = req.body;
            const loginIdentifier = typeof email === 'string' ? email.trim() : '';

            console.log('=== LOGIN ATTEMPT ===');
            console.log('Login identifier:', loginIdentifier);
            console.log('Password provided:', password ? 'Yes' : 'No');

            if (!loginIdentifier || !password) {
                console.log('Missing login identifier or password');
                req.flash('error', 'Email or username and password are required.');
                if (loginIdentifier) req.flash('email', loginIdentifier);
                return res.redirect('/login');
            }

            console.log('Connecting to database...');
            await pool.connect();
            console.log('Database connected successfully');

            // Find user by email or username (case-insensitive)
            const userResult = await pool.request()
                .input('loginId', sql.NVarChar, loginIdentifier)
                .query(`
                    SELECT TOP 1 *
                    FROM Users
                    WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(@loginId)
                       OR LOWER(LTRIM(RTRIM(Username))) = LOWER(@loginId)
                `);

            const user = userResult.recordset[0];

            console.log('Login attempt for:', loginIdentifier);
            console.log('User found:', user ? 'Yes' : 'No');
            if (user) {
                console.log('User details:', {
                    UserID: user.UserID,
                    Username: user.Username,
                    Email: user.Email,
                    FullName: user.FullName,
                    RoleID: user.RoleID,
                    IsActive: user.IsActive
                });
            }

            if (!user) {
                req.flash('error', 'Invalid email, username, or password.');
                req.flash('email', loginIdentifier);
                return res.redirect('/login');
            }

            // Get password hash for verification
            const passwordResult = await pool.request()
                .input('userId', sql.Int, user.UserID)
                .query('SELECT PasswordHash FROM Users WHERE UserID = @userId');

            if (passwordResult.recordset.length === 0) {
                console.log('No password hash found for user');
                req.flash('error', 'Invalid email, username, or password.');
                req.flash('email', loginIdentifier);
                return res.redirect('/login');
            }

            const passwordHash = passwordResult.recordset[0].PasswordHash;
            console.log('Password hash found:', passwordHash ? 'Yes' : 'No');

            // Get role name from Roles table
            const roleResult = await pool.request()
                .input('roleId', sql.Int, user.RoleID)
                .query('SELECT RoleName FROM Roles WHERE RoleID = @roleId');

            if (roleResult.recordset.length === 0) {
                console.log('No role found for user');
                req.flash('error', 'User role not found. Please contact administrator.');
                return res.redirect('/login');
            }

            const roleName = roleResult.recordset[0].RoleName;
            console.log('Role name found:', roleName);

            if (!user.IsActive) {
                req.flash('error', 'Your account has been deactivated. Please contact administrator.');
                return res.redirect('/login');
            }

            // Verify password (handle bcrypt variants and minor input whitespace)
            let passwordMatch = false;
            const hasPasswordHash = typeof passwordHash === 'string' && passwordHash.length > 0;
            let normalizedHash = passwordHash;

            // Normalize legacy bcrypt prefixes from other ecosystems (e.g., $2y$, $2x$)
            if (hasPasswordHash && (passwordHash.startsWith('$2y$') || passwordHash.startsWith('$2x$'))) {
                normalizedHash = '$2b$' + passwordHash.slice(4);
            }

            if (hasPasswordHash && (normalizedHash.startsWith('$2a$') || normalizedHash.startsWith('$2b$'))) {
                // Primary compare with provided password
                passwordMatch = await bcrypt.compare(password, normalizedHash);

                // If no match, try trimmed password (user may have accidentally added whitespace)
                if (!passwordMatch && password !== password.trim()) {
                    passwordMatch = await bcrypt.compare(password.trim(), normalizedHash);
                }

                console.log('Password match result:', passwordMatch);
            } else {
                console.log('Invalid password hash format or missing hash');
            }

            if (!passwordMatch) {
                req.flash('error', 'Invalid email, username, or password.');
                req.flash('email', loginIdentifier);
                return res.redirect('/login');
            }

            // Authentication successful - create session
            req.session.user = {
                id: user.UserID,
                fullName: user.FullName,
                email: user.Email,
                role: roleName,
                type: 'employee',
                username: user.Username
            };

            console.log('Session created successfully:', {
                id: req.session.user.id,
                role: req.session.user.role,
                sessionID: req.sessionID
            });

            // Set remember me cookie if requested
            if (rememberMe === 'on' || rememberMe === true || rememberMe === 'true') {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
                console.log('Remember me enabled - session will last 30 days');
            }

            // Redirect based on role
            let redirectUrl = '/';
            switch (roleName) {
                case 'Admin':
                    redirectUrl = '/Employee/AdminManager';
                    break;
                case 'InventoryManager':
                    redirectUrl = '/Employee/InventoryManager';
                    break;
                case 'TransactionManager':
                    redirectUrl = '/Employee/TransactionManager';
                    break;
                case 'UserManager':
                    redirectUrl = '/Employee/UserManager';
                    break;
                case 'OrderSupport':
                    redirectUrl = '/Employee/OrderSupport';
                    break;
                default:
                    redirectUrl = '/';
            }

            console.log('Login successful - redirecting to:', redirectUrl);
            req.flash('success', 'Login successful!');
            res.redirect(redirectUrl);

        } catch (err) {
            console.error('Login error:', err);
            console.error('Error stack:', err.stack);
            req.flash('error', 'An error occurred during login. Please try again.');
            res.redirect('/login');
        }
    });
};
