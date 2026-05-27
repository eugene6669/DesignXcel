#!/usr/bin/env node
'use strict';

const { runFullSync, ROLES } = require('../utils/employeeRoleViewSync');

const summary = runFullSync();
summary.forEach((s) => {
    console.log(
        `${s.role}: ${s.pages} pages, ${s.partials} partials` +
        (s.dashboard ? ', dashboard URLs fixed' : '')
    );
});
console.log('Done. Dashboard templates (*Manager.ejs) were not overwritten.');
