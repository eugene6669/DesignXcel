'use strict';

const { createInclude } = require('../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; /* Shared head assets — include after <title> on Employee dashboard pages */\n    ; __append(\"\\n<link rel=\\\"stylesheet\\\" href=\\\"/css/Employee/Admin/AdminIndexStyles.css?v=20260603e\\\">\\n<link rel=\\\"stylesheet\\\" href=\\\"/css/Employee/employee-sidebar.css?v=20260603e\\\">\\n<link rel=\\\"stylesheet\\\" href=\\\"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css\\\" referrerpolicy=\\\"no-referrer\\\">\\n<link rel=\\\"preconnect\\\" href=\\\"https://fonts.googleapis.com\\\">\\n<link rel=\\\"preconnect\\\" href=\\\"https://fonts.gstatic.com\\\" crossorigin>\\n<link href=\\\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap\\\" rel=\\\"stylesheet\\\">\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/partials/employee-head
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/partials/employee-head', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/partials/employee-head' };
