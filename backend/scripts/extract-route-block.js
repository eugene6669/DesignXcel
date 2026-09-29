'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const outPath = process.argv[2];
const startLine = parseInt(process.argv[3], 10);
const endLine = parseInt(process.argv[4], 10);
const fnName = process.argv[5];
const ctxKeys = process.argv[6] ? process.argv[6].split(',') : [];

if (!outPath || !startLine || !endLine || !fnName) {
    console.error('Usage: node extract-route-block.js <outPath> <startLine> <endLine> <fnName> [ctx,key,list]');
    process.exit(1);
}

const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);
const body = lines.slice(startLine - 1, endLine).join('\n');

const destructuring = ctxKeys.map((k) => `        ${k}`).join(',\n');

const renderHelper = ctxKeys.includes('makeRenderRoleActivityLogsPage')
    ? '\n    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);\n'
    : '\n';

const header = `'use strict';

/**
 * Extracted from routes.js lines ${startLine}-${endLine}.
 */
module.exports = function ${fnName}(router, ctx) {
    const {
${destructuring}
    } = ctx;
${renderHelper}
`;

const footer = `
};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body + footer, 'utf8');
console.log('Wrote', outPath);
