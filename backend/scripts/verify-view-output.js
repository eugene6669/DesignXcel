'use strict';

const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { getViewModule } = require('../views/render/viewRuntime');

const viewsRoot = path.join(__dirname, '../views');
const samples = [
    'Employee/Forbidden',
    'EmpLogin/EmpLogin',
    'Employee/Admin/AdminAlerts',
    'Employee/Admin/AdminManager',
    'Employee/Admin/AdminProductInventory'
];

function compare(viewKey, locals) {
    const ejsPath = path.join(viewsRoot, viewKey + '.ejs');
    const ejsOut = ejs.render(fs.readFileSync(ejsPath, 'utf8'), locals, { filename: ejsPath });
    const jsOut = getViewModule(viewKey).render(locals);
    const match = ejsOut === jsOut;
    console.log(`${viewKey}: ${match ? 'MATCH' : 'MISMATCH'} (ejs=${ejsOut.length}, js=${jsOut.length})`);
    if (!match) {
        for (let i = 0; i < Math.max(ejsOut.length, jsOut.length); i++) {
            if (ejsOut[i] !== jsOut[i]) {
                console.log(`  first diff at ${i}: ejs=${JSON.stringify(ejsOut.slice(i, i + 40))} js=${JSON.stringify(jsOut.slice(i, i + 40))}`);
                break;
            }
        }
    }
    return match;
}

(async () => {
    const user = { role: 'Admin', FullName: 'Test User' };
    let allOk = true;
    allOk = compare('Employee/Forbidden', { user }) && allOk;
    allOk = compare('EmpLogin/EmpLogin', { error: 'Bad login', email: 'test@x.com' }) && allOk;
    allOk = compare('Employee/Admin/AdminAlerts', { user }) && allOk;
    allOk = compare('Employee/Admin/AdminManager', { user }) && allOk;
    allOk = compare('Employee/Admin/AdminProductInventory', {
        user,
        inventoryItems: [],
        products: [],
        categories: [],
        allInventoryProducts: [],
        materials: [],
        units: [],
        bomBundles: [],
        pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 1 },
        listFilters: { search: '', category: '' },
        inventoryProductIdFocus: null,
        activeTab: 'ProductInventory'
    }) && allOk;
    process.exit(allOk ? 0 : 1);
})();
