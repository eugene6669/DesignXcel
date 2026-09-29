'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const startLine = parseInt(process.argv[2], 10);
const endLine = parseInt(process.argv[3], 10);
const replacement = process.argv[4];

if (!startLine || !endLine || !replacement) {
    console.error('Usage: node wire-route-block.js <startLine> <endLine> <replacement>');
    process.exit(1);
}

const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);
const newLines = [
    ...lines.slice(0, startLine - 1),
    replacement,
    ...lines.slice(endLine)
];

fs.writeFileSync(routesPath, newLines.join('\n'), 'utf8');
console.log(`Replaced lines ${startLine}-${endLine}`);
