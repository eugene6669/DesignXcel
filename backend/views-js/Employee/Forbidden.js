'use strict';

const { createInclude } = require('../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<!DOCTYPE html>\\n<html lang=\\\"en\\\">\\n<head>\\n    <meta charset=\\\"UTF-8\\\">\\n    <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1.0\\\">\\n    <title>Access Denied - Design Excellence</title>\\n    <link rel=\\\"preconnect\\\" href=\\\"https://fonts.googleapis.com\\\">\\n    <link rel=\\\"preconnect\\\" href=\\\"https://fonts.gstatic.com\\\" crossorigin>\\n    <link href=\\\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap\\\" rel=\\\"stylesheet\\\">\\n    <link rel=\\\"stylesheet\\\" href=\\\"/css/Employee/employee-forbidden.css\\\">\\n</head>\\n<body>\\n    <div class=\\\"forbidden-container\\\">\\n        <div class=\\\"forbidden-icon\\\">&#9888;</div>\\n        <div class=\\\"forbidden-title\\\">Access Denied</div>\\n        <div class=\\\"forbidden-message\\\">\\n            Sorry, you do not have permission to access this section.<br>\\n            Please contact your administrator if you believe this is a mistake.\\n        </div>\\n        <div class=\\\"forbidden-actions\\\">\\n            <button type=\\\"button\\\" class=\\\"forbidden-btn\\\" onclick=\\\"goToDashboard()\\\">Go to Dashboard</button>\\n            <button type=\\\"button\\\" class=\\\"forbidden-btn secondary\\\" onclick=\\\"window.history.back()\\\">Go Back</button>\\n        </div>\\n    </div>\\n\\n    <script>\\n        function goToDashboard() {\\n            const userRole = '\")\n    ; __append(escapeFn( typeof user !== \"undefined\" && user.role ? user.role : \"Guest\" ))\n    ; __append(\"';\\n\\n            switch (userRole) {\\n                case 'Admin':\\n                    window.location.href = '/Employee/AdminManager';\\n                    break;\\n                case 'InventoryManager':\\n                    window.location.href = '/Employee/InventoryManager';\\n                    break;\\n                case 'TransactionManager':\\n                    window.location.href = '/Employee/TransactionManager';\\n                    break;\\n                case 'UserManager':\\n                    window.location.href = '/Employee/UserManager';\\n                    break;\\n                case 'OrderSupport':\\n                    window.location.href = '/Employee/OrderSupport';\\n                    break;\\n                default:\\n                    window.location.href = '/login';\\n                    break;\\n            }\\n        }\\n    </script>\\n</body>\\n</html>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/Forbidden
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/Forbidden', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/Forbidden' };
