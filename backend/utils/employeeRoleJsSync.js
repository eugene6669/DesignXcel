'use strict';

const fs = require('fs');
const path = require('path');
const {
    ROLES,
    applyUrlReplacements,
    applyJsPathReplacements
} = require('./employeeRoleViewSync');

const adminJsDir = path.join(__dirname, '..', 'public', 'js', 'Employee', 'Admin');

const SKIP_SYNC_JS = new Set(['AdminManageUsers.js', 'role-manager.js']);

function adminJsToRoleFilename(filename, role) {
    if (SKIP_SYNC_JS.has(filename)) return null;
    if (filename.startsWith('Admin') && filename.endsWith('.js')) {
        const suffix = filename.slice(5);
        return `${role.viewPrefix}${suffix}`;
    }
    return filename;
}

function transformJsContent(raw, role) {
    let s = applyUrlReplacements(raw, role);
    s = applyJsPathReplacements(s, role);
    s = s.replace(/Enhanced Admin/g, `Enhanced ${role.pageTitlePrefix}`);
    s = s.replace(/AdminLogs\.js/g, `${role.viewPrefix}Logs.js`);
    s = s.replace(/AdminAlerts\.js/g, `${role.viewPrefix}Alerts.js`);
    s = s.replace(/AdminCMS\.js/g, `${role.viewPrefix}CMS.js`);
    return s;
}

function syncRoleJs(role) {
    const destDir = path.join(__dirname, '..', 'public', 'js', 'Employee', role.roleName);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let count = 0;
    for (const filename of fs.readdirSync(adminJsDir)) {
        if (!filename.endsWith('.js')) continue;
        const destName = adminJsToRoleFilename(filename, role);
        if (!destName) continue;

        const raw = fs.readFileSync(path.join(adminJsDir, filename), 'utf8');
        fs.writeFileSync(
            path.join(destDir, destName),
            transformJsContent(raw, role),
            'utf8'
        );
        count++;
    }
    return count;
}

function runFullJsSync() {
    return ROLES.map((role) => ({
        role: role.roleName,
        files: syncRoleJs(role)
    }));
}

module.exports = {
    runFullJsSync,
    syncRoleJs,
    transformJsContent,
    adminJsToRoleFilename,
    SKIP_SYNC_JS
};
