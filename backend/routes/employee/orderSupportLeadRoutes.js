'use strict';

/** Extracted Order Support routes — see routes/employee/registerOrderSupportLeadRoutes.js */
module.exports = function registerOrderSupportLeadRoutes(router, ctx) {
    const {
        pool,
        sql,
        isAuthenticated,
        checkPermission,
        EMPLOYEE_SYNC_ROLES,
        makeRenderRoleActivityLogsPage,
        sendActivityLogsData,
        buildInventoryAlertsPayload,
        USER_PERMISSION_LEGACY_KEYS
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);

    // Order Support - Chat Support
    router.get('/Employee/OrderSupport/OrderChatSupport', isAuthenticated, checkPermission('chat_chat_support'), async (req, res) => {
        console.log('=== OrderSupport ChatSupport Route Called ===');
        let threads = [];
        let selectedThread = null;
        let messages = [];

        try {
            await pool.connect();

            // Get thread parameter from query string
            const threadId = req.query.thread;

            // Fetch all chat threads
            const threadsResult = await pool.request().query(`
                SELECT DISTINCT ct.CustomerID, c.FullName, c.Email, c.PhoneNumber,
                       MAX(ct.CreatedAt) as LastMessageAt,
                       COUNT(ct.MessageID) as MessageCount
                FROM ChatThreads ct
                LEFT JOIN Customers c ON ct.CustomerID = c.CustomerID
                GROUP BY ct.CustomerID, c.FullName, c.Email, c.PhoneNumber
                ORDER BY LastMessageAt DESC
            `);
            threads = threadsResult.recordset;

            // If a specific thread is selected, fetch its messages
            if (threadId) {
                selectedThread = threads.find(t => t.CustomerID == threadId);
                if (selectedThread) {
                    const messagesResult = await pool.request()
                        .input('customerId', sql.Int, threadId)
                        .query(`
                            SELECT * FROM ChatMessages 
                            WHERE CustomerID = @customerId 
                            ORDER BY SentAt ASC
                        `);
                    messages = messagesResult.recordset;

                    // Mark messages as read
                    await pool.request()
                        .input('customerId', sql.Int, threadId)
                        .query(`
                            UPDATE ChatMessages 
                            SET IsRead = 1 
                            WHERE CustomerID = @customerId AND SenderType = 'customer' AND IsRead = 0
                        `);
                }
            }

            res.render('Employee/OrderSupport/OrderChatSupport', {
                user: req.session.user,
                threads,
                selectedThread,
                messages,
                error: threads.length === 0 ? 'No chat threads found.' : null
            });
        } catch (err) {
            console.error('Error in OrderChatSupport:', err);
            // Ensure variables are always defined
            threads = threads || [];
            selectedThread = selectedThread || null;
            messages = messages || [];

            res.render('Employee/OrderSupport/OrderChatSupport', {
                user: req.session.user,
                threads,
                selectedThread,
                messages,
                error: 'Failed to load chat.'
            });
        }
    });

    // Order Support - Messages
    router.get('/Employee/OrderSupport/Messages', isAuthenticated, checkPermission('chat_messages'), async (req, res) => {
        console.log('=== OrderSupport Messages Route Called ===');
        try {
            res.render('Employee/OrderSupport/OrderSupportMessages', {
                user: req.session.user
            });
        } catch (err) {
            console.error('Error loading OrderSupport Messages page:', err);
            res.render('Employee/OrderSupport/OrderSupportMessages', {
                user: req.session.user,
                error: 'Failed to load messages interface.'
            });
        }
    });
};
