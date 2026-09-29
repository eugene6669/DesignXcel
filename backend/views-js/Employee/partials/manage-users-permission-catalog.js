'use strict';

const { createInclude } = require('../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; \nvar catalogSections = (typeof permissionSections !== 'undefined' && permissionSections) ? permissionSections : [];\nvar catalogLegacyKeys = (typeof permissionLegacyKeys !== 'undefined' && permissionLegacyKeys) ? permissionLegacyKeys : {};\n\n    ; __append(\"\\n                    const permissionSections = \")\n    ; __append( JSON.stringify(catalogSections) )\n    ; __append(\";\\n                    const permissionLegacyKeys = \")\n    ; __append( JSON.stringify(catalogLegacyKeys) )\n    ; __append(\";\\n\\n                    function resolveUserPermissionAccess(permissionName, permissionRows) {\\n                        const direct = permissionRows.find(p => p.PermissionName === permissionName);\\n                        if (direct) return !!direct.CanAccess;\\n                        const legacy = permissionLegacyKeys[permissionName] || [];\\n                        for (let i = 0; i < legacy.length; i++) {\\n                            const row = permissionRows.find(p => p.PermissionName === legacy[i]);\\n                            if (row && row.CanAccess) return true;\\n                        }\\n                        return false;\\n                    }\\n\\n                    function buildOriginalPermissionsMap(permissionRows) {\\n                        const map = {};\\n                        permissionSections.forEach(function (section) {\\n                            section.permissions.forEach(function (permission) {\\n                                map[permission.key] = resolveUserPermissionAccess(permission.key, permissionRows);\\n                            });\\n                        });\\n                        return map;\\n                    }\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/partials/manage-users-permission-catalog
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/partials/manage-users-permission-catalog', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/partials/manage-users-permission-catalog' };
