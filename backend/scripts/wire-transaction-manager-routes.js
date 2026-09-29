'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);

const startLine = 2825;
const endLine = 3927;

const replacement = `    // =============================================================================
    // TRANSACTION MANAGER ROUTES (see routes/employee/transactionManagerRoutes.js)
    // =============================================================================

    registerTransactionManagerRoutes(router, employeeProductRouteCtx);
`;

const newLines = [
    ...lines.slice(0, startLine - 1),
    replacement.trimEnd(),
    ...lines.slice(endLine)
];

fs.writeFileSync(routesPath, newLines.join('\n'), 'utf8');
console.log(`Removed lines ${startLine}-${endLine}`);
