'use strict';

/**
 * Extracted from routes.js lines 5560-5987.
 */
module.exports = function registerOrderSupportManageUsersRoutes(router, ctx) {
    const {
        pool,
        sql,
        isAuthenticated,
        checkPermission,
        logActivity
    } = ctx;



    // =============================================================================
    // ORDER SUPPORT - MANAGE USERS API ROUTES
    // =============================================================================

    // Get Customer Accounts API for Order Support
    router.get('/Employee/OrderSupport/OrderManageUsers/Customers', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            await pool.connect();

            // Check if Customers table exists
            const tableCheck = await pool.request().query(`
                SELECT COUNT(*) as tableExists
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'Customers'
            `);

            if (tableCheck.recordset[0].tableExists === 0) {
                res.json({
                    success: true,
                    customers: [],
                    message: 'Customer accounts feature not yet implemented'
                });
                return;
            }

            const result = await pool.request().query(`
                SELECT 
                    CustomerID,
                    FullName,
                    Email,
                    PhoneNumber,
                    IsActive,
                    CreatedAt
                FROM Customers
                ORDER BY CreatedAt DESC
            `);

            // Return customer data as plain text
            const customers = result.recordset;

            res.json({
                success: true,
                customers: customers
            });
        } catch (error) {
            console.error('Error fetching customers:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch customer accounts'
            });
        }
    });

    // Edit User route for Order Support
    router.post('/Employee/OrderSupport/OrderManageUsers/Users/Edit', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const { userId, username, fullName, email, roleId, isActive, password } = req.body;

            await pool.connect();

            // Get current user data before updating
            const currentUserResult = await pool.request()
                .input('userId', sql.Int, userId)
                .query('SELECT Username, FullName, Email, RoleID, IsActive, PasswordHash FROM Users WHERE UserID = @userId');

            if (currentUserResult.recordset.length === 0) {
                return res.json({ success: false, message: 'User not found' });
            }

            const currentUser = currentUserResult.recordset[0];
            const changes = {};

            // Decrypt current user data for comparison using transparent encryption service
            const decryptedCurrentUser = currentUser;
            const currentUsername = decryptedCurrentUser.Username;
            const currentFullName = decryptedCurrentUser.FullName;
            const currentEmail = decryptedCurrentUser.Email;

            // Check for changes and build changes object
            if (currentUsername !== username) {
                changes.Username = { old: currentUsername, new: username };
            }
            if (currentFullName !== fullName) {
                changes.FullName = { old: currentFullName, new: fullName };
            }
            if (currentEmail !== email) {
                changes.Email = { old: currentEmail, new: email };
            }
            if (currentUser.IsActive !== (isActive === '1' ? 1 : 0)) {
                changes.IsActive = { old: currentUser.IsActive, new: (isActive === '1' ? 1 : 0) };
            }
            if (roleId && currentUser.RoleID !== parseInt(roleId)) {
                changes.RoleID = { old: currentUser.RoleID, new: parseInt(roleId) };
            }

            // Encrypt the new data using transparent encryption service
            // Store user data as plain text
            const userData = {
                Username: username,
                FullName: fullName,
                Email: email
            };

            // Handle password update if provided
            if (password && password.trim() !== '') {
                const bcrypt = require('bcryptjs');
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.request()
                    .input('userId', sql.Int, userId)
                    .input('password', sql.NVarChar, hashedPassword)
                    .query(`
                        UPDATE Users 
                        SET PasswordHash = @password
                        WHERE UserID = @userId
                    `);
                changes.Password = { old: '[HIDDEN]', new: '[UPDATED]' };
            }

            // Update user information with encrypted data
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('username', sql.NVarChar, userData.Username)
                .input('fullName', sql.NVarChar, userData.FullName)
                .input('email', sql.NVarChar, userData.Email)
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE Users 
                    SET Username = @username, FullName = @fullName, Email = @email, IsActive = @isActive
                    WHERE UserID = @userId
                `);

            // Update user role if roleId is provided
            if (roleId) {
                await pool.request()
                    .input('userId', sql.Int, userId)
                    .input('roleId', sql.Int, roleId)
                    .query(`
                        UPDATE Users 
                        SET RoleID = @roleId 
                        WHERE UserID = @userId
                    `);
            }

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Users',
                userId.toString(),
                `OrderSupport updated user information for ${username} (ID: ${userId})`,
                Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
            );

            res.json({ success: true, message: 'User updated successfully' });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ success: false, message: 'Failed to update user' });
        }
    });

    // Edit Customer route for Order Support
    router.post('/Employee/OrderSupport/OrderManageUsers/Customers/Edit', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const { customerId, fullName, email, phone, isActive } = req.body;

            await pool.connect();

            // Get current customer data before updating
            const currentCustomerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT FullName, Email, PhoneNumber, IsActive FROM Customers WHERE CustomerID = @customerId');

            if (currentCustomerResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Customer not found' });
            }

            const currentCustomer = currentCustomerResult.recordset[0];
            const changes = {};

            // Decrypt current customer data for comparison using transparent encryption service
            const decryptedCurrentCustomer = currentCustomer;
            const currentFullName = decryptedCurrentCustomer.FullName;
            const currentEmail = decryptedCurrentCustomer.Email;
            const currentPhoneNumber = decryptedCurrentCustomer.PhoneNumber;

            // Check for changes and build changes object
            if (currentFullName !== fullName) {
                changes.FullName = { old: currentFullName, new: fullName };
            }
            if (currentEmail !== email) {
                changes.Email = { old: currentEmail, new: email };
            }
            if (currentPhoneNumber !== phone) {
                changes.PhoneNumber = { old: currentPhoneNumber, new: phone };
            }
            if (currentCustomer.IsActive !== (isActive === '1' ? 1 : 0)) {
                changes.IsActive = { old: currentCustomer.IsActive, new: (isActive === '1' ? 1 : 0) };
            }

            // Encrypt the new data using transparent encryption service
            // Store customer data as plain text
            const customerData = {
                FullName: fullName,
                Email: email,
                PhoneNumber: phone
            };

            // Update customer information with encrypted data
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .input('fullName', sql.NVarChar, customerData.FullName)
                .input('email', sql.NVarChar, customerData.Email)
                .input('phone', sql.NVarChar, customerData.PhoneNumber)
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE Customers 
                    SET FullName = @fullName, Email = @email, PhoneNumber = @phone, IsActive = @isActive
                    WHERE CustomerID = @customerId
                `);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Customers',
                customerId.toString(),
                `OrderSupport updated customer information for ${fullName} (ID: ${customerId})`,
                Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
            );

            res.json({ success: true, message: 'Customer updated successfully' });
        } catch (error) {
            console.error('Error updating customer:', error);
            res.status(500).json({ success: false, message: 'Failed to update customer' });
        }
    });

    // Order Support - Archive Customer route (Soft Delete)
    router.post('/Employee/OrderSupport/OrderManageUsers/Customers/Archive', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const { customerId } = req.body;

            if (!customerId) {
                return res.status(400).json({ success: false, message: 'Customer ID is required' });
            }

            await pool.connect();

            // Get current customer data before archiving
            const currentCustomerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT FullName, Email, IsActive FROM Customers WHERE CustomerID = @customerId');

            if (currentCustomerResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Customer not found' });
            }

            const currentCustomer = currentCustomerResult.recordset[0];

            // Check if customer is already archived
            if (currentCustomer.IsActive === 0) {
                return res.json({ success: false, message: 'Customer is already archived' });
            }

            // Archive the customer (soft delete by setting IsActive = 0)
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('UPDATE Customers SET IsActive = 0 WHERE CustomerID = @customerId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'DELETE',
                'Customers',
                customerId.toString(),
                `Order Support archived customer ${currentCustomer.FullName} (ID: ${customerId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            res.json({ success: true, message: 'Customer archived successfully' });
        } catch (error) {
            console.error('Error archiving customer:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to archive customer',
                error: error.message
            });
        }
    });

    // Order Support - Dearchive Customer route (Restore Archived Customer)
    router.post('/Employee/OrderSupport/OrderManageUsers/Customers/Dearchive', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const { customerId } = req.body;

            if (!customerId) {
                return res.status(400).json({ success: false, message: 'Customer ID is required' });
            }

            await pool.connect();

            // Get current customer data before dearchiving
            const currentCustomerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT FullName, Email, IsActive FROM Customers WHERE CustomerID = @customerId');

            if (currentCustomerResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Customer not found' });
            }

            const currentCustomer = currentCustomerResult.recordset[0];

            // Customer data is already plain text
            const fullName = currentCustomer.FullName;
            const email = currentCustomer.Email;

            // Check if customer is already active
            if (currentCustomer.IsActive === 1) {
                return res.json({ success: false, message: 'Customer is already active' });
            }

            // Dearchive the customer (restore by setting IsActive = 1)
            await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('UPDATE Customers SET IsActive = 1 WHERE CustomerID = @customerId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Customers',
                customerId.toString(),
                `Order Support dearchived customer ${currentCustomer.FullName} (ID: ${customerId})`,
                JSON.stringify({ IsActive: { old: 0, new: 1 } })
            );

            res.json({ success: true, message: 'Customer restored successfully' });
        } catch (error) {
            console.error('Error dearchiving customer:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to restore customer',
                error: error.message
            });
        }
    });
    // Order Support - Permanently Delete Customer route (Hard Delete)
    router.delete('/Employee/OrderSupport/OrderManageUsers/Customers/Delete/:customerId', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const { customerId } = req.params;

            if (!customerId) {
                return res.status(400).json({ success: false, message: 'Customer ID is required' });
            }

            await pool.connect();

            // Get current customer data before deleting
            const currentCustomerResult = await pool.request()
                .input('customerId', sql.Int, customerId)
                .query('SELECT FullName, Email FROM Customers WHERE CustomerID = @customerId');

            if (currentCustomerResult.recordset.length === 0) {
                return res.json({ success: false, message: 'Customer not found' });
            }

            const currentCustomer = currentCustomerResult.recordset[0];

            // Start transaction for customer deletion
            const transaction = pool.transaction();
            await transaction.begin();

            try {
                // Use helper function to safely delete customer and all related data
                await deleteCustomerSafely(customerId, transaction);

                // Commit transaction
                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'DELETE',
                    'Customers',
                    customerId.toString(),
                    `Order Support permanently deleted customer ${currentCustomer.FullName} (ID: ${customerId})`,
                    JSON.stringify({ action: 'permanent_delete' })
                );
            } catch (transactionError) {
                // Rollback transaction on error
                await transaction.rollback();
                throw transactionError;
            }

            res.json({ success: true, message: 'Customer permanently deleted successfully' });
        } catch (error) {
            console.error('Error permanently deleting customer:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to permanently delete customer',
                error: error.message
            });
        }
    });

    // Toggle User Active Status API for Order Support
    router.post('/Employee/OrderSupport/OrderManageUsers/ToggleActive/:userId/:newStatus', isAuthenticated, checkPermission('users_manage_users'), async (req, res) => {
        try {
            const userId = req.params.userId;
            const newStatus = parseInt(req.params.newStatus);

            await pool.connect();

            await pool.request()
                .input('userId', sql.Int, userId)
                .input('isActive', sql.Bit, newStatus)
                .query(`
                    UPDATE Users 
                    SET IsActive = @isActive, UpdatedAt = GETDATE()
                    WHERE UserID = @userId
                `);

            res.json({ success: true, message: 'User status updated successfully' });
        } catch (error) {
            console.error('Error toggling user status:', error);
            res.status(500).json({ success: false, message: 'Failed to update user status' });
        }
    });
};
