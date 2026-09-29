'use strict';

/**
 * Admin Miscellaneous Routes
 * Handles: DeliveryRates, WalkIn, ChatSupport, Messages, CMS, Logs, Alerts
 */

module.exports = function registerAdminMiscRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        checkPermission,
        sendActivityLogsData,
        buildInventoryAlertsPayload
    } = context;

    // =============================================================================
    // DELIVERY RATES
    // =============================================================================

    router.get('/Employee/Admin/DeliveryRates', isAuthenticated, (req, res) => {
        res.render('Employee/Admin/AdminRates', { user: req.session.user });
    });

    // =============================================================================
    // CHAT SUPPORT & MESSAGES
    // =============================================================================

    router.get('/Employee/Admin/ChatSupport', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            
            // Check if Leads table exists first
            const tableCheck = await pool.request().query(`
                SELECT COUNT(*) as tableExists
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'Leads'
            `);

            let leads = [];
            let threads = [];

            if (tableCheck.recordset[0].tableExists > 0) {
                const result = await pool.request().query(`
                    SELECT 
                        l.LeadID,
                        l.Name,
                        l.Email,
                        l.PhoneNumber,
                        l.Message,
                        l.Status,
                        l.CreatedAt,
                        l.UpdatedAt
                    FROM Leads l
                    ORDER BY l.CreatedAt DESC
                `);
                leads = result.recordset || [];
            }

            res.render('Employee/Admin/AdminChatSupport', {
                user: req.session.user,
                leads: leads,
                threads: threads,
                selectedThread: null
            });
        } catch (err) {
            console.error('Error fetching leads:', err);
            res.render('Employee/Admin/AdminChatSupport', {
                user: req.session.user,
                leads: [],
                threads: [],
                selectedThread: null
            });
        }
    });

    router.get('/Employee/Admin/Messages', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT 
                    l.LeadID,
                    l.Name,
                    l.Email,
                    l.PhoneNumber,
                    l.Message,
                    l.Status,
                    l.CreatedAt,
                    l.UpdatedAt
                FROM Leads l
                ORDER BY l.CreatedAt DESC
            `);

            res.render('Employee/Admin/AdminMessages', {
                user: req.session.user,
                messages: result.recordset || []
            });
        } catch (err) {
            console.error('Error fetching messages:', err);
            res.render('Employee/Admin/AdminMessages', {
                user: req.session.user,
                messages: []
            });
        }
    });

    // =============================================================================
    // CMS (CONTENT MANAGEMENT)
    // =============================================================================

    router.get('/Employee/Admin/CMS', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            // Check if CMS table exists
            const tableCheck = await pool.request().query(`
                SELECT COUNT(*) as tableExists
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'CMS'
            `);

            let cmsContent = [];
            if (tableCheck.recordset[0].tableExists > 0) {
                const result = await pool.request().query(`
                    SELECT 
                        CMSID,
                        Section,
                        Title,
                        Content,
                        ImageURL,
                        IsActive,
                        DisplayOrder,
                        CreatedAt,
                        UpdatedAt
                    FROM CMS
                    ORDER BY DisplayOrder, Section, CreatedAt DESC
                `);
                cmsContent = result.recordset || [];
            }

            res.render('Employee/Admin/AdminCMS', {
                user: req.session.user,
                cmsContent: cmsContent
            });
        } catch (err) {
            console.error('Error fetching CMS content:', err);
            res.render('Employee/Admin/AdminCMS', {
                user: req.session.user,
                cmsContent: []
            });
        }
    });

    // =============================================================================
    // ACTIVITY LOGS
    // =============================================================================

    router.get('/Employee/Admin/Logs', isAuthenticated, async (req, res) => {
        res.render('Employee/Admin/AdminLogs', { user: req.session.user });
    });

    router.get('/Employee/Admin/Logs/Data', isAuthenticated, sendActivityLogsData);

    // =============================================================================
    // ALERTS
    // =============================================================================

    router.get('/Employee/Admin/Alerts', isAuthenticated, (req, res) => {
        res.render('Employee/Admin/AdminAlerts', { user: req.session.user });
    });

    router.get('/Employee/Admin/Alerts/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const payload = await buildInventoryAlertsPayload(pool);
            res.json(payload);
        } catch (err) {
            console.error('Error fetching alerts data:', err);
            res.status(500).json({
                success: false,
                lowStockProducts: [],
                outOfStockProducts: [],
                lowStockRawMaterials: [],
                outOfStockRawMaterials: [],
                error: err.message
            });
        }
    });
};
