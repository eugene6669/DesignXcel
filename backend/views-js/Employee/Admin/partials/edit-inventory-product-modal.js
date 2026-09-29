'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<!-- Edit Product Modal (Products listing page) -->\\r\\n<div id=\\\"editInventoryProductModal\\\" class=\\\"modal pi-modal-compact\\\">\\r\\n    <div class=\\\"modal-content\\\">\\r\\n        <span class=\\\"close-button\\\" id=\\\"closeEditInventoryProductModal\\\">&times;</span>\\r\\n        <h3>Edit Product</h3>\\r\\n        <form id=\\\"editInventoryProductForm\\\" enctype=\\\"multipart/form-data\\\">\\r\\n            <input type=\\\"hidden\\\" id=\\\"editInventoryProductId\\\" name=\\\"inventoryProductId\\\">\\r\\n            <input type=\\\"hidden\\\" id=\\\"editInventoryProductCurrentImage\\\" name=\\\"currentImageURL\\\">\\r\\n            <input type=\\\"hidden\\\" id=\\\"editInventoryProductCurrentThumbnails\\\" name=\\\"currentThumbnailURLs\\\" value=\\\"[]\\\">\\r\\n            <div class=\\\"form-group\\\">\\r\\n                <label for=\\\"editInventoryProductName\\\">Product Name</label>\\r\\n                <input type=\\\"text\\\" id=\\\"editInventoryProductName\\\" name=\\\"name\\\" required>\\r\\n            </div>\\r\\n            <div class=\\\"form-group\\\">\\r\\n                <label for=\\\"editInventoryProductCategory\\\">Category</label>\\r\\n                <select id=\\\"editInventoryProductCategory\\\" name=\\\"category\\\" required></select>\\r\\n            </div>\\r\\n            <div class=\\\"form-group\\\">\\r\\n                <label for=\\\"editInventoryProductDescription\\\">Description</label>\\r\\n                <textarea id=\\\"editInventoryProductDescription\\\" name=\\\"description\\\" rows=\\\"3\\\" placeholder=\\\"Optional\\\"></textarea>\\r\\n            </div>\\r\\n            <div class=\\\"form-group pi-section\\\">\\r\\n                <strong>Product Images</strong>\\r\\n                <div id=\\\"editInventoryProductImagePreview\\\" class=\\\"pi-media-preview-main\\\" style=\\\"margin:8px 0;min-height:40px;\\\"></div>\\r\\n                <label for=\\\"editInventoryProductImage\\\">Main Image</label>\\r\\n                <input type=\\\"file\\\" id=\\\"editInventoryProductImage\\\" name=\\\"productImage\\\" accept=\\\"image/*\\\">\\r\\n                <div id=\\\"editInventoryProductThumbnailsPreview\\\" class=\\\"pi-media-preview-thumbs\\\" style=\\\"margin:10px 0 6px;\\\"></div>\\r\\n                <label for=\\\"editInventoryProductThumbnails\\\">Thumbnails (up to 4)</label>\\r\\n                <input type=\\\"file\\\" id=\\\"editInventoryProductThumbnails\\\" name=\\\"productThumbnail\\\" accept=\\\"image/*\\\" multiple>\\r\\n            </div>\\r\\n            <div class=\\\"form-group pi-section\\\" id=\\\"editInventoryProductRecipeSection\\\">\\r\\n                <h4 style=\\\"margin:0 0 8px;font-size:0.95em;\\\">Raw Materials</h4>\\r\\n                <div id=\\\"editInventoryProductBomBundleDisplay\\\" class=\\\"pi-recipe-bom-label\\\" style=\\\"font-size:0.88em;margin-bottom:6px;color:#444;\\\"><em>Loading raw materials…</em></div>\\r\\n                <div id=\\\"editInventoryProductRecipeList\\\" class=\\\"pi-recipe-materials-list\\\" style=\\\"font-size:0.88em;color:#333;\\\"></div>\\r\\n            </div>\\r\\n            <div class=\\\"pi-form-actions\\\">\\r\\n                <button type=\\\"button\\\" id=\\\"cancelEditInventoryProduct\\\" class=\\\"pi-btn pi-btn-secondary pi-btn-sm\\\">Cancel</button>\\r\\n                <button type=\\\"submit\\\" id=\\\"saveEditInventoryProduct\\\" class=\\\"pi-btn pi-btn-primary pi-btn-sm\\\">Save</button>\\r\\n            </div>\\r\\n        </form>\\r\\n    </div>\\r\\n</div>\\r\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/Admin/partials/edit-inventory-product-modal
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/Admin/partials/edit-inventory-product-modal', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/Admin/partials/edit-inventory-product-modal' };
