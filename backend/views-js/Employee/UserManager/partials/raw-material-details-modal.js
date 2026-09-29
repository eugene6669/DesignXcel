'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<div id=\\\"rawMaterialDetailsModal\\\" class=\\\"modal pi-modal-compact inventory-details-modal rm-details-modal\\\" style=\\\"display:none;\\\" aria-hidden=\\\"true\\\">\\n    <div class=\\\"modal-content inventory-details-modal-content rm-details-modal-content\\\">\\n        <span class=\\\"close-button\\\" id=\\\"rmCloseDetailsModal\\\" aria-label=\\\"Close\\\">&times;</span>\\n        <h3>Raw Material Details</h3>\\n        <div class=\\\"inventory-details-hero rm-details-po-layout\\\">\\n            <div class=\\\"inventory-details-image-wrap rm-details-po-image-wrap\\\">\\n                <img id=\\\"rmDetailsPoImage\\\" class=\\\"rm-details-po-thumb\\\" src=\\\"/images/placeholder-no-image.svg\\\" alt=\\\"\\\" role=\\\"button\\\" tabindex=\\\"0\\\" title=\\\"Click to view full size\\\">\\n                <p id=\\\"rmDetailsPoImageHint\\\" class=\\\"rm-po-image-hint\\\">Select a receipt order to preview</p>\\n            </div>\\n            <div class=\\\"inventory-details-meta\\\">\\n                <div class=\\\"inventory-details-meta-row\\\">\\n                    <span class=\\\"inventory-details-label\\\">SKU</span>\\n                    <span id=\\\"rmDetailsSku\\\" class=\\\"inventory-details-value inventory-code-text\\\">—</span>\\n                </div>\\n                <div class=\\\"inventory-details-meta-row\\\">\\n                    <span class=\\\"inventory-details-label\\\">Name</span>\\n                    <strong id=\\\"rmDetailsName\\\" class=\\\"inventory-details-value\\\">—</strong>\\n                </div>\\n                <div class=\\\"inventory-details-meta-row\\\">\\n                    <span class=\\\"inventory-details-label\\\">Unit</span>\\n                    <span id=\\\"rmDetailsUnit\\\" class=\\\"inventory-details-value\\\">—</span>\\n                </div>\\n                <div class=\\\"inventory-details-meta-row rm-details-po-select-row\\\">\\n                    <label class=\\\"inventory-details-label\\\" for=\\\"rmDetailsSupplier\\\">Supplier</label>\\n                    <select id=\\\"rmDetailsSupplier\\\" class=\\\"rm-details-po-select\\\" title=\\\"Supplier with receipt order number, date, and quantity\\\">\\n                        <option value=\\\"\\\">—</option>\\n                    </select>\\n                </div>\\n                <div class=\\\"inventory-details-meta-row rm-details-po-select-row\\\">\\n                    <label class=\\\"inventory-details-label\\\" for=\\\"rmDetailsPoSelect\\\">Receipt orders</label>\\n                    <select id=\\\"rmDetailsPoSelect\\\" class=\\\"rm-details-po-select\\\" title=\\\"Receipt order number, date, quantity, and supplier\\\">\\n                        <option value=\\\"\\\">— No receipt orders —</option>\\n                    </select>\\n                </div>\\n            </div>\\n        </div>\\n        <h4 class=\\\"inventory-details-section-title\\\">Stock Summary</h4>\\n        <div class=\\\"inventory-stock-summary-grid\\\">\\n            <div class=\\\"inventory-stock-card stock-available\\\">\\n                <span class=\\\"inventory-stock-card-label\\\">Total Stock</span>\\n                <span class=\\\"inventory-stock-card-value\\\" id=\\\"rmDetailsStockQty\\\">0</span>\\n            </div>\\n        </div>\\n    </div>\\n</div>\\n\\n<div id=\\\"rmPoImageLightbox\\\" class=\\\"rm-po-lightbox\\\" style=\\\"display:none;\\\" aria-hidden=\\\"true\\\">\\n    <div class=\\\"rm-po-lightbox-backdrop\\\" id=\\\"rmPoLightboxBackdrop\\\"></div>\\n    <button type=\\\"button\\\" class=\\\"rm-po-lightbox-close\\\" id=\\\"rmPoLightboxClose\\\" aria-label=\\\"Close\\\">&times;</button>\\n    <img id=\\\"rmPoImageLightboxImg\\\" src=\\\"\\\" alt=\\\"Receipt order\\\">\\n</div>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/UserManager/partials/raw-material-details-modal
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/UserManager/partials/raw-material-details-modal', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/UserManager/partials/raw-material-details-modal' };
