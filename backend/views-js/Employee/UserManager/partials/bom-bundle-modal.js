'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<div id=\\\"bomBundleModal\\\" class=\\\"modal bom-modal\\\">\\n    <div class=\\\"modal-content\\\">\\n        <span class=\\\"close-button\\\" id=\\\"bomCloseModal\\\">&times;</span>\\n        <h3 id=\\\"bomModalTitle\\\">Create Raw Materials Bundle</h3>\\n        <input type=\\\"hidden\\\" id=\\\"bomEditBundleId\\\" value=\\\"\\\">\\n        <div class=\\\"bom-form-compact\\\">\\n            <label for=\\\"bomBundleName\\\">Bundle name <span class=\\\"req\\\">*</span></label>\\n            <input type=\\\"text\\\" id=\\\"bomBundleName\\\" placeholder=\\\"Executive Office Chair Kit\\\" required>\\n            <label for=\\\"bomBundleDescription\\\">Description</label>\\n            <textarea id=\\\"bomBundleDescription\\\" rows=\\\"2\\\" placeholder=\\\"Optional\\\"></textarea>\\n        </div>\\n        <div class=\\\"bom-materials-block\\\">\\n            <h4>Materials <span class=\\\"req\\\">*</span></h4>\\n            <p class=\\\"bom-hint\\\">Qty per finished unit — cannot exceed current stock.</p>\\n            <div id=\\\"bomMaterialsContainer\\\"></div>\\n            <button type=\\\"button\\\" id=\\\"bomAddMaterialRowBtn\\\" class=\\\"add-material-btn bom-add-row-btn\\\">+ Add material</button>\\n        </div>\\n        <div class=\\\"rm-form-actions\\\">\\n            <button type=\\\"button\\\" class=\\\"rm-btn rm-btn-secondary\\\" id=\\\"bomCancelModal\\\">Cancel</button>\\n            <button type=\\\"button\\\" class=\\\"rm-btn rm-btn-primary\\\" id=\\\"bomSaveBundleBtn\\\">Save</button>\\n        </div>\\n    </div>\\n</div>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/UserManager/partials/bom-bundle-modal
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/UserManager/partials/bom-bundle-modal', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/UserManager/partials/bom-bundle-modal' };
