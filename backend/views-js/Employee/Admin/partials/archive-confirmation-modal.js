'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<!-- Archive confirmation — use with showArchiveConfirmModal() in product-inventory.js -->\\n<div id=\\\"archiveConfirmModal\\\" class=\\\"inventory-confirmation-modal archive-confirm-modal\\\" aria-hidden=\\\"true\\\">\\n    <div class=\\\"inventory-confirmation-content archive-confirm-content\\\" role=\\\"dialog\\\" aria-labelledby=\\\"archiveConfirmTitle\\\">\\n        <div class=\\\"archive-confirm-icon\\\" aria-hidden=\\\"true\\\">\\n            <svg xmlns=\\\"http://www.w3.org/2000/svg\\\" width=\\\"40\\\" height=\\\"40\\\" fill=\\\"none\\\" viewBox=\\\"0 0 24 24\\\" stroke=\\\"currentColor\\\" stroke-width=\\\"1.75\\\">\\n                <path stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\" d=\\\"M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4\\\"/>\\n            </svg>\\n        </div>\\n        <h3 id=\\\"archiveConfirmTitle\\\">Archive item?</h3>\\n        <p id=\\\"archiveConfirmMessage\\\" class=\\\"archive-confirm-message\\\"></p>\\n        <p class=\\\"archive-confirm-hint\\\">The item will move to <strong>Archived items</strong>. You can restore it from there later.</p>\\n        <div class=\\\"inventory-confirmation-buttons\\\">\\n            <button type=\\\"button\\\" class=\\\"inventory-cancel-btn\\\" id=\\\"cancelArchiveConfirm\\\">Cancel</button>\\n            <button type=\\\"button\\\" class=\\\"inventory-confirm-btn archive-confirm-btn-danger\\\" id=\\\"confirmArchiveConfirm\\\">Archive</button>\\n        </div>\\n    </div>\\n</div>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/Admin/partials/archive-confirmation-modal
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/Admin/partials/archive-confirmation-modal', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/Admin/partials/archive-confirmation-modal' };
