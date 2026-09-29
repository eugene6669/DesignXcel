'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<!-- Quick edit parent (Product Inventory): name, category, main image -->\\n<div id=\\\"editInventoryProductQuickModal\\\" class=\\\"modal pi-modal-compact\\\">\\n    <div class=\\\"modal-content\\\">\\n        <span class=\\\"close-button\\\" id=\\\"closeEditInventoryProductQuickModal\\\">&times;</span>\\n        <h3>Edit Product Inventory</h3>\\n        <form id=\\\"editInventoryProductQuickForm\\\" enctype=\\\"multipart/form-data\\\">\\n            <input type=\\\"hidden\\\" id=\\\"editInventoryProductQuickId\\\" name=\\\"inventoryProductId\\\">\\n            <input type=\\\"hidden\\\" id=\\\"editInventoryProductQuickCurrentImage\\\" name=\\\"currentImageURL\\\">\\n            <div class=\\\"form-group\\\">\\n                <label for=\\\"editInventoryProductQuickName\\\">Product Name</label>\\n                <input type=\\\"text\\\" id=\\\"editInventoryProductQuickName\\\" name=\\\"name\\\" required>\\n            </div>\\n            <div class=\\\"form-group\\\">\\n                <label for=\\\"editInventoryProductQuickCategory\\\">Category</label>\\n                <select id=\\\"editInventoryProductQuickCategory\\\" name=\\\"category\\\" required></select>\\n            </div>\\n            <div class=\\\"form-group\\\">\\n                <label for=\\\"editInventoryProductQuickImage\\\">Main Image</label>\\n                <div id=\\\"editInventoryProductQuickImagePreview\\\" style=\\\"margin:6px 0;min-height:40px;\\\"></div>\\n                <input type=\\\"file\\\" id=\\\"editInventoryProductQuickImage\\\" name=\\\"productImage\\\" accept=\\\"image/*\\\">\\n            </div>\\n            <div class=\\\"form-group pi-section\\\" id=\\\"editInventoryProductQuickRecipeSection\\\">\\n                <h4 style=\\\"margin:0 0 8px;font-size:0.95em;\\\">Raw Materials</h4>\\n                <div id=\\\"editInventoryProductQuickBomBundleDisplay\\\" class=\\\"pi-recipe-bom-label\\\" style=\\\"font-size:0.88em;margin-bottom:6px;color:#444;\\\"><em>Loading raw materials…</em></div>\\n                <div id=\\\"editInventoryProductQuickRecipeList\\\" class=\\\"pi-recipe-materials-list\\\" style=\\\"font-size:0.88em;color:#333;\\\"></div>\\n            </div>\\n            <div class=\\\"pi-form-actions\\\">\\n                <button type=\\\"button\\\" id=\\\"cancelEditInventoryProductQuick\\\" class=\\\"pi-btn pi-btn-secondary pi-btn-sm\\\">Cancel</button>\\n                <button type=\\\"submit\\\" id=\\\"saveEditInventoryProductQuick\\\" class=\\\"pi-btn pi-btn-primary pi-btn-sm\\\">Save</button>\\n            </div>\\n        </form>\\n    </div>\\n</div>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/OrderSupport/partials/edit-inventory-product-quick-modal
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/OrderSupport/partials/edit-inventory-product-quick-modal', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/OrderSupport/partials/edit-inventory-product-quick-modal' };
