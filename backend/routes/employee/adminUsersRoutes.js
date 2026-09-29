'use strict';

/**
 * Admin User Management Routes
 * Handles user and customer management, permissions, and roles
 */

module.exports = function registerAdminUsersRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        checkPermission
    } = context;

    // =============================================================================
    // MANAGE USERS PAGE
    // =============================================================================

    router.get('/Employee/Admin/ManageUsers', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            
            const usersResult = await pool.request().query(`
                SELECT 
                    u.UserID, 
                    u.Username, 
                    u.FullName, 
                    u.Email, 
                    u.RoleID, 
                    r.RoleName, 
                    u.IsActive, 
                    u.CreatedAt
                FROM Users u
                LEFT JOIN Roles r ON u.RoleID = r.RoleID
                ORDER BY u.CreatedAt DESC
            `);

            res.render('Employee/Admin/AdminManageUsers', {
                user: req.session.user,
                users: usersResult.recordset || []
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            res.render('Employee/Admin/AdminManageUsers', {
                user: req.session.user,
                users: []
            });
        }
    });

    // =============================================================================
    // CUSTOMERS PAGE
    // =============================================================================

    router.get('/Employee/Admin/ManageUsers/Customers', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            
            const result = await pool.request().query(`
                SELECT 
                    CustomerID, FullName, Email, PhoneNumber, IsActive, CreatedAt
                FROM Customers
                ORDER BY CreatedAt DESC
            `);

            res.json({
                success: true,
                customers: result.recordset || []
            });
        } catch (err) {
            console.error('Error fetching customers:', err);
            res.status(500).json({ success: false, customers: [], error: err.message });
        }
    });

    // =============================================================================
    // PERMISSION CATALOG
    // =============================================================================

    router.get('/Employee/Admin/ManageUsers/PermissionCatalog', isAuthenticated, checkPermission('users_manage_users'), (req, res) => {
        const permissions = [
            { key: 'users_manage_users', name: 'Manage Users', description: 'Create, edit, and delete users' },
            { key: 'inventory_reports', name: 'View Reports', description: 'Access inventory and sales reports' },
            { key: 'orders_manage', name: 'Manage Orders', description: 'Process and manage orders' },
            { key: 'products_manage', name: 'Manage Products', description: 'Create and edit products' },
            { key: 'inventory_manage', name: 'Manage Inventory', description: 'Update inventory levels' }
        ];
        
        res.json({ success: true, permissions });
    });

    // =============================================================================
    // USER PERMISSIONS
    // =============================================================================

    router.get('/Employee/Admin/ManageUsers/Permissions/:userId', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const userId = parseInt(req.params.userId);

            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT PermissionKey, IsGranted
                    FROM UserPermissions
                    WHERE UserID = @userId
                `);

            res.json({ success: true, permissions: result.recordset || [] });
        } catch (err) {
            console.error('Error fetching user permissions:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/ManageUsers/Permissions/:userId/Update', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const userId = parseInt(req.params.userId);
            const { permissions } = req.body;

            // Delete existing permissions
            await pool.request()
                .input('userId', sql.Int, userId)
                .query('DELETE FROM UserPermissions WHERE UserID = @userId');

            // Insert new permissions
            for (const perm of permissions) {
                await pool.request()
                    .input('userId', sql.Int, userId)
                    .input('permissionKey', sql.NVarChar, perm.key)
                    .input('isGranted', sql.Bit, perm.granted ? 1 : 0)
                    .query(`
                        INSERT INTO UserPermissions (UserID, PermissionKey, IsGranted)
                        VALUES (@userId, @permissionKey, @isGranted)
                    `);
            }

            res.json({ success: true, message: 'Permissions updated successfully' });
        } catch (err) {
            console.error('Error updating permissions:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // =============================================================================
    // ROLES MANAGEMENT
    // =============================================================================

    router.get('/Employee/Admin/ManageUsers/Roles', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            
            const result = await pool.request().query(`
                SELECT RoleID, RoleName, Description, CreatedAt
                FROM Roles
                ORDER BY RoleName
            `);

            res.json({ success: true, roles: result.recordset || [] });
        } catch (err) {
            console.error('Error fetching roles:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/ManageUsers/Roles', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const { roleName, description } = req.body;

            const result = await pool.request()
                .input('roleName', sql.NVarChar, roleName)
                .input('description', sql.NVarChar, description || null)
                .query(`
                    INSERT INTO Roles (RoleName, Description, CreatedAt)
                    OUTPUT INSERTED.RoleID
                    VALUES (@roleName, @description, GETDATE())
                `);

            res.json({ success: true, roleId: result.recordset[0].RoleID });
        } catch (err) {
            console.error('Error creating role:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.put('/Employee/Admin/ManageUsers/Roles/:roleId', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const roleId = parseInt(req.params.roleId);
            const { roleName, description } = req.body;

            await pool.request()
                .input('roleId', sql.Int, roleId)
                .input('roleName', sql.NVarChar, roleName)
                .input('description', sql.NVarChar, description || null)
                .query(`
                    UPDATE Roles
                    SET RoleName = @roleName, Description = @description, UpdatedAt = GETDATE()
                    WHERE RoleID = @roleId
                `);

            res.json({ success: true, message: 'Role updated successfully' });
        } catch (err) {
            console.error('Error updating role:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/Employee/Admin/ManageUsers/Roles/:roleId', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const roleId = parseInt(req.params.roleId);

            await pool.request()
                .input('roleId', sql.Int, roleId)
                .query('DELETE FROM Roles WHERE RoleID = @roleId');

            res.json({ success: true, message: 'Role deleted successfully' });
        } catch (err) {
            console.error('Error deleting role:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/ManageUsers/Roles/:roleId/Permissions', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const roleId = parseInt(req.params.roleId);
            const { permissions } = req.body;

            // Delete existing role permissions
            await pool.request()
                .input('roleId', sql.Int, roleId)
                .query('DELETE FROM RolePermissions WHERE RoleID = @roleId');

            // Insert new permissions
            for (const perm of permissions) {
                await pool.request()
                    .input('roleId', sql.Int, roleId)
                    .input('permissionKey', sql.NVarChar, perm.key)
                    .query(`
                        INSERT INTO RolePermissions (RoleID, PermissionKey)
                        VALUES (@roleId, @permissionKey)
                    `);
            }

            res.json({ success: true, message: 'Role permissions updated successfully' });
        } catch (err) {
            console.error('Error updating role permissions:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // =============================================================================
    // USER CRUD OPERATIONS
    // =============================================================================

    router.post('/Employee/Admin/Users/Add', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const { username, email, password, role } = req.body;

            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);

            const result = await pool.request()
                .input('username', sql.NVarChar, username)
                .input('email', sql.NVarChar, email)
                .input('password', sql.NVarChar, hashedPassword)
                .input('role', sql.NVarChar, role)
                .query(`
                    INSERT INTO Users (Username, Email, Password, Role, IsActive, CreatedAt)
                    OUTPUT INSERTED.UserID
                    VALUES (@username, @email, @password, @role, 1, GETDATE())
                `);

            res.json({ success: true, userId: result.recordset[0].UserID });
        } catch (err) {
            console.error('Error adding user:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/Users/Edit', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const { userId, username, email, role } = req.body;

            await pool.request()
                .input('userId', sql.Int, userId)
                .input('username', sql.NVarChar, username)
                .input('email', sql.NVarChar, email)
                .input('role', sql.NVarChar, role)
                .query(`
                    UPDATE Users
                    SET Username = @username, Email = @email, Role = @role, UpdatedAt = GETDATE()
                    WHERE UserID = @userId
                `);

            res.json({ success: true, message: 'User updated successfully' });
        } catch (err) {
            console.error('Error editing user:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/ManageUsers/ToggleActive/:userId/:newStatus', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const userId = parseInt(req.params.userId);
            const newStatus = parseInt(req.params.newStatus);

            await pool.request()
                .input('userId', sql.Int, userId)
                .input('isActive', sql.Bit, newStatus)
                .query(`
                    UPDATE Users
                    SET IsActive = @isActive, UpdatedAt = GETDATE()
                    WHERE UserID = @userId
                `);

            res.json({ success: true, message: 'User status updated successfully' });
        } catch (err) {
            console.error('Error toggling user status:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // =============================================================================
    // CUSTOMER MANAGEMENT
    // =============================================================================

    router.post('/Employee/Admin/Customers/Edit', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { customerId, fullName, email, phoneNumber } = req.body;

            await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('fullName', sql.NVarChar, fullName)
                .input('email', sql.NVarChar, email)
                .input('phoneNumber', sql.NVarChar, phoneNumber || null)
                .query(`
                    UPDATE Customers
                    SET FullName = @fullName, Email = @email, PhoneNumber = @phoneNumber, UpdatedAt = GETDATE()
                    WHERE CustomerID = @customerId
                `);

            res.json({ success: true, message: 'Customer updated successfully' });
        } catch (err) {
            console.error('Error editing customer:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/Customers/Archive', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const { customerId } = req.body;

            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query(`
                    UPDATE Customers
                    SET IsActive = 0, UpdatedAt = GETDATE()
                    WHERE CustomerID = @customerId
                `);

            res.json({ success: true, message: 'Customer archived successfully' });
        } catch (err) {
            console.error('Error archiving customer:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/Employee/Admin/Customers/Dearchive', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const { customerId } = req.body;

            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query(`
                    UPDATE Customers
                    SET IsActive = 1, UpdatedAt = GETDATE()
                    WHERE CustomerID = @customerId
                `);

            res.json({ success: true, message: 'Customer restored successfully' });
        } catch (err) {
            console.error('Error restoring customer:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/Employee/Admin/Customers/Delete/:customerId', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();
            const customerId = parseInt(req.params.customerId);

            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('DELETE FROM Customers WHERE CustomerID = @customerId');

            res.json({ success: true, message: 'Customer deleted successfully' });
        } catch (err) {
            console.error('Error deleting customer:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
