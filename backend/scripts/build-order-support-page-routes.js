'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);

const pageCtxKeys = [
    'pool', 'sql', 'isAuthenticated', 'checkPermission', 'EMPLOYEE_SYNC_ROLES',
    'makeRenderRoleActivityLogsPage', 'sendActivityLogsData', 'buildInventoryAlertsPayload',
    'USER_PERMISSION_LEGACY_KEYS'
];

function buildModule(fnName, bodyLines, extraAfterDestructuring = '') {
    const destructuring = pageCtxKeys.map((k) => `        ${k}`).join(',\n');
    return `'use strict';

/** Extracted Order Support routes — see routes/employee/${fnName}.js */
module.exports = function ${fnName}(router, ctx) {
    const {
${destructuring}
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);
${extraAfterDestructuring}
${bodyLines.join('\n')}
};
`;
}

const leadBody = lines.slice(2737, 2825); // 2738-2825

const mainPart1 = lines.slice(2866, 3042); // 2867-3042, before duplicate chat
const mainPart2 = lines.slice(3123, 3209); // 3124-3209

const returnedStatusesBlock = `
    const employeeReturnedOrderStatuses = [
        'Return', 'Returned', 'Processing (Pickup)', 'Awaiting Inspection', 'Inspection Complete',
        'Pickup Received', 'Declined', 'Completed Returned', 'Refunded'
    ];
`;

const mainBody = [...mainPart1, ...mainPart2];

const outDir = path.join(__dirname, '../routes/employee');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
    path.join(outDir, 'orderSupportLeadRoutes.js'),
    buildModule('registerOrderSupportLeadRoutes', leadBody),
    'utf8'
);

fs.writeFileSync(
    path.join(outDir, 'orderSupportRoutes.js'),
    buildModule('registerOrderSupportRoutes', mainBody, `\n${returnedStatusesBlock}`),
    'utf8'
);

console.log('Wrote orderSupportLeadRoutes.js and orderSupportRoutes.js');
