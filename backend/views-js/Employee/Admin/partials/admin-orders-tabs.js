'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ;  const tab = typeof ordersTab !== 'undefined' ? ordersTab : 'pending'; \n    ; __append(\"\\n<nav class=\\\"admin-orders-tabs\\\" aria-label=\\\"Order status tabs\\\">\\n    <a href=\\\"/Employee/Admin/Orders?tab=pending\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'pending' ? 'active' : '' ))\n    ; __append(\"\\\">Pending Verification</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=processing\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'processing' ? 'active' : '' ))\n    ; __append(\"\\\">Processing</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=shipping\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'shipping' ? 'active' : '' ))\n    ; __append(\"\\\">Shipping</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=delivery\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'delivery' ? 'active' : '' ))\n    ; __append(\"\\\">Delivery</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=receive\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'receive' ? 'active' : '' ))\n    ; __append(\"\\\">Receive</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=completed\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'completed' ? 'active' : '' ))\n    ; __append(\"\\\">Completed</a>\\n    <a href=\\\"/Employee/Admin/Orders?tab=cancelled\\\" class=\\\"\")\n    ; __append(escapeFn( tab === 'cancelled' ? 'active' : '' ))\n    ; __append(\"\\\">Cancelled</a>\\n</nav>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/Admin/partials/admin-orders-tabs
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/Admin/partials/admin-orders-tabs', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/Admin/partials/admin-orders-tabs' };
