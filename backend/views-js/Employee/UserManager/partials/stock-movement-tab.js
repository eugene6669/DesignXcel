'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<div id=\\\"stockMovementTab\\\" class=\\\"tab-content\")\n    ; __append(escapeFn( typeof activeTab !== 'undefined' && activeTab === 'stock-movement' ? ' active' : '' ))\n    ; __append(\"\\\">\\n    <div class=\\\"content-area stock-movement-area\\\">\\n        <p class=\\\"bom-intro\\\">Product inventory and raw material restocks. Expand each group to view movement history.</p>\\n        <div class=\\\"inventory-filter-card\\\">\\n            <form id=\\\"stockMovementFilterForm\\\" class=\\\"inventory-filter-form\\\" onsubmit=\\\"return false;\\\">\\n                <div class=\\\"inventory-filter-field\\\">\\n                    <label for=\\\"stockMovementProductFilter\\\">Product ID (optional)</label>\\n                    <input type=\\\"number\\\" id=\\\"stockMovementProductFilter\\\" min=\\\"1\\\" placeholder=\\\"All products\\\">\\n                </div>\\n                <div class=\\\"inventory-filter-field\\\">\\n                    <label for=\\\"stockMovementPageSize\\\">Products per page</label>\\n                    <select id=\\\"stockMovementPageSize\\\" class=\\\"stock-movement-page-size\\\">\\n                        <option value=\\\"5\\\">5</option>\\n                        <option value=\\\"10\\\" selected>10</option>\\n                        <option value=\\\"20\\\">20</option>\\n                        <option value=\\\"50\\\">50</option>\\n                    </select>\\n                </div>\\n                <div class=\\\"inventory-filter-actions\\\">\\n                    <button type=\\\"button\\\" id=\\\"stockMovementApplyFilter\\\" class=\\\"pi-btn pi-btn-primary\\\">Apply</button>\\n                    <button type=\\\"button\\\" id=\\\"stockMovementClearFilter\\\" class=\\\"pi-btn pi-btn-secondary\\\">Clear</button>\\n                </div>\\n            </form>\\n            <p id=\\\"stockMovementSummary\\\" class=\\\"inventory-list-summary\\\"></p>\\n        </div>\\n        <div id=\\\"stockMovementLoading\\\" class=\\\"stock-movement-loading\\\">Loading movement history…</div>\\n        <div id=\\\"stockMovementListWrap\\\" class=\\\"stock-movement-list-wrap\\\" style=\\\"display:none;\\\">\\n            <h4 class=\\\"stock-mv-section-title\\\">Product inventory</h4>\\n            <div id=\\\"stockMovementGroupedList\\\" class=\\\"stock-movement-grouped-list\\\"></div>\\n            <h4 id=\\\"stockMovementRawSectionHead\\\" class=\\\"stock-mv-section-title\\\" style=\\\"display:none;margin-top:24px;\\\">Raw materials</h4>\\n            <div id=\\\"stockMovementRawMaterialsList\\\" class=\\\"stock-movement-grouped-list\\\"></div>\\n        </div>\\n        <p id=\\\"stockMovementEmpty\\\" class=\\\"inventory-list-empty\\\" style=\\\"display:none;\\\">No stock movements recorded yet.</p>\\n        <nav id=\\\"stockMovementPagination\\\" class=\\\"inventory-pagination stock-movement-pagination\\\" style=\\\"display:none;\\\" aria-label=\\\"Stock movement pages\\\"></nav>\\n    </div>\\n</div>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/UserManager/partials/stock-movement-tab
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/UserManager/partials/stock-movement-tab', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/UserManager/partials/stock-movement-tab' };
