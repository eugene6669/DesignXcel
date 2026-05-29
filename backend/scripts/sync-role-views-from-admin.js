#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { runFullSync } = require('../utils/employeeRoleViewSync');
const { runFullJsSync } = require('../utils/employeeRoleJsSync');

const viewSummary = runFullSync();
viewSummary.forEach((s) => {
    console.log(
        `${s.role}: ${s.pages} pages, ${s.partials} partials` +
        (s.dashboard ? ', dashboard URLs fixed' : '')
    );
});

const jsSummary = runFullJsSync();
jsSummary.forEach((s) => {
    console.log(`${s.role}: ${s.files} JS files synced`);
});

execSync('node backend/scripts/fix-role-css-paths.js', {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit'
});

console.log('Done. Skipped: AdminManager, AdminManageUsers (views); AdminManageUsers.js, role-manager.js (JS).');
