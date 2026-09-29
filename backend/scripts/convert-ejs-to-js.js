'use strict';

/**
 * One-time migration script: converts .ejs views to plain JS render modules.
 * Run from backend/: node scripts/convert-ejs-to-js.js
 *
 * Uses ejs.compile (dev-only during migration) to preserve output equivalence,
 * wrapping each compiled template in a standalone module.
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const BACKEND_ROOT = path.join(__dirname, '..');
const VIEWS_ROOT = path.join(BACKEND_ROOT, 'views');
const OUTPUT_ROOT = path.join(BACKEND_ROOT, 'views-js');
const REGISTRY_JS_PATH = path.join(VIEWS_ROOT, 'render', 'registry.js');

function walkEjsFiles(dir, base = dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkEjsFiles(full, base));
        } else if (entry.name.endsWith('.ejs')) {
            results.push(path.relative(base, full).replace(/\\/g, '/'));
        }
    }
    return results.sort();
}

function viewKeyFromRelative(relativePath) {
    return relativePath.replace(/\.ejs$/, '').replace(/\\/g, '/');
}

function jsModulePathFromKey(viewKey) {
    return path.join(OUTPUT_ROOT, viewKey + '.js');
}

function compileTemplate(ejsPath) {
    const source = fs.readFileSync(ejsPath, 'utf8');
    const compiled = ejs.compile(source, {
        filename: ejsPath,
        client: true,
        strict: false,
        _with: true,
        localsName: 'locals',
        escapeFn: 'escapeHtml',
        destructure: false,
        compileDebug: false,
        beautify: false
    });
    return compiled.toString();
}

function runtimeRequirePath(outPath) {
    const rel = path.relative(path.dirname(outPath), path.join(VIEWS_ROOT, 'render'))
        .replace(/\\/g, '/');
    return rel.startsWith('.') ? rel : './' + rel;
}

function buildModule(viewKey, compiledFnSource, outPath) {
    const runtimePath = runtimeRequirePath(outPath);
    const escaped = JSON.stringify(compiledFnSource);
    return `'use strict';

const { createInclude } = require('${runtimePath}/viewRuntime');
const { escapeHtml, rethrow } = require('${runtimePath}/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = ${escaped};

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: ${viewKey}
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('${viewKey}', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: '${viewKey}' };
`;
}

function buildRegistryJs(registryEntries) {
    const lines = Object.entries(registryEntries)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, reqPath]) => `    '${key}': require('${reqPath}'),`)
        .join('\n');

    return `'use strict';

/** Auto-generated view registry — do not edit; run scripts/convert-ejs-to-js.js */
module.exports = {
${lines}
};
`;
}

function main() {
    if (!fs.existsSync(VIEWS_ROOT)) {
        console.error('Views root not found:', VIEWS_ROOT);
        process.exit(1);
    }

    const ejsFiles = walkEjsFiles(VIEWS_ROOT);
    console.log(`Found ${ejsFiles.length} EJS files`);

    const registryEntries = {};
    let failed = 0;

    for (const rel of ejsFiles) {
        const ejsPath = path.join(VIEWS_ROOT, rel);
        const viewKey = viewKeyFromRelative(rel);

        try {
            const compiledFnSource = compileTemplate(ejsPath);
            const outPath = jsModulePathFromKey(viewKey);
            const moduleSource = buildModule(viewKey, compiledFnSource, outPath);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, moduleSource, 'utf8');

            const reqPath = path.relative(path.dirname(REGISTRY_JS_PATH), outPath)
                .replace(/\\/g, '/');
            registryEntries[viewKey] = reqPath.startsWith('.') ? reqPath : './' + reqPath;
        } catch (err) {
            failed += 1;
            console.error(`FAILED ${rel}:`, err.message);
        }
    }

    if (failed > 0) {
        console.error(`${failed} templates failed to compile`);
        process.exit(1);
    }

    fs.writeFileSync(REGISTRY_JS_PATH, buildRegistryJs(registryEntries), 'utf8');
    console.log(`Wrote ${ejsFiles.length} JS view modules to ${OUTPUT_ROOT}`);
    console.log(`Registry: ${REGISTRY_JS_PATH}`);
}

main();
