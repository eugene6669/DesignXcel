'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'views', 'Employee');
const roles = ['InventoryManager', 'OrderSupport', 'TransactionManager', 'UserManager'];
const rolePat = '(InventoryManager|OrderSupport|TransactionManager|UserManager)';
const badCss = new RegExp(`/css/Employee/${rolePat}/`, 'g');
let count = 0;

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.ejs')) {
            let s = fs.readFileSync(p, 'utf8');
            if (!badCss.test(s)) continue;
            badCss.lastIndex = 0;
            const next = s.replace(badCss, '/css/Employee/Admin/');
            if (next !== s) {
                fs.writeFileSync(p, next, 'utf8');
                count++;
            }
        }
    }
}

roles.forEach(r => walk(path.join(root, r)));
console.log('Fixed CSS paths in', count, 'files');
