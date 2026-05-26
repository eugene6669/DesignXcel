'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'views', 'Employee');
const roles = ['InventoryManager', 'OrderSupport', 'TransactionManager', 'UserManager'];
const rolePat = '(InventoryManager|OrderSupport|TransactionManager|UserManager)';
let count = 0;

const replacements = [
    [new RegExp(`/css/Employee/${rolePat}/`, 'g'), '/css/Employee/Admin/'],
    [new RegExp(`/js/Employee/${rolePat}/`, 'g'), '/js/Employee/Admin/']
];

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.ejs')) {
            let s = fs.readFileSync(p, 'utf8');
            let next = s;
            for (const [re, to] of replacements) {
                next = next.replace(re, to);
            }
            if (next !== s) {
                fs.writeFileSync(p, next, 'utf8');
                count++;
            }
        }
    }
}

roles.forEach(r => walk(path.join(root, r)));
console.log('Fixed asset paths in', count, 'files');
