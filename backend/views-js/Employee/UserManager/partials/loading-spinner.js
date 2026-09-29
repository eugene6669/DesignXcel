'use strict';

const { createInclude } = require('../../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ;  \n    // Get optional parameters with defaults\n    const spinnerSize = typeof size !== 'undefined' ? size : 'medium';\n    const spinnerText = typeof text !== 'undefined' ? text : 'Loading...';\n    const isOverlay = typeof overlay !== 'undefined' ? overlay : false;\n    const isFullscreen = typeof fullscreen !== 'undefined' ? fullscreen : false;\n    const customClass = typeof className !== 'undefined' ? className : '';\n    const spinnerId = typeof id !== 'undefined' ? id : 'admin-loading-spinner';\n\n    ; __append(\"\\n<div class=\\\"admin-loading-spinner \")\n    ; __append(escapeFn( spinnerSize ))\n    ; __append(\" \")\n    ; __append(escapeFn( isOverlay ? 'admin-loading-spinner--overlay' : '' ))\n    ; __append(\" \")\n    ; __append(escapeFn( isFullscreen ? 'admin-loading-spinner--fullscreen' : '' ))\n    ; __append(\" \")\n    ; __append(escapeFn( customClass ))\n    ; __append(\"\\\" id=\\\"\")\n    ; __append(escapeFn( spinnerId ))\n    ; __append(\"\\\">\\n    <div class=\\\"admin-loading-spinner__container\\\">\\n        <div class=\\\"admin-loading-spinner__spinner\\\"></div>\\n        \")\n    ;  if (spinnerText && spinnerText !== '') { \n    ; __append(\"\\n            <div class=\\\"admin-loading-spinner__text\\\">\")\n    ; __append(escapeFn( spinnerText ))\n    ; __append(\"</div>\\n        \")\n    ;  } \n    ; __append(\"\\n    </div>\\n</div>\\n\\n<style>\\n    /* Admin Loading Spinner Styles - Matches Admin Design */\\n    .admin-loading-spinner {\\n        display: flex;\\n        align-items: center;\\n        justify-content: center;\\n        width: 100%;\\n        height: 100%;\\n        min-height: 200px;\\n        font-family: var(--font-primary, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif);\\n    }\\n\\n    .admin-loading-spinner.hidden {\\n        display: none;\\n    }\\n\\n    .admin-loading-spinner--overlay {\\n        position: absolute;\\n        top: 0;\\n        left: 0;\\n        right: 0;\\n        bottom: 0;\\n        background: rgba(255, 255, 255, 0.9);\\n        backdrop-filter: blur(4px);\\n        z-index: 1000;\\n        border-radius: 12px;\\n    }\\n\\n    .admin-loading-spinner--fullscreen {\\n        position: fixed;\\n        top: 0;\\n        left: 0;\\n        right: 0;\\n        bottom: 0;\\n        background: rgba(248, 249, 250, 0.95);\\n        backdrop-filter: blur(6px);\\n        z-index: 9999;\\n        min-height: 100vh;\\n    }\\n\\n    .admin-loading-spinner__container {\\n        display: flex;\\n        flex-direction: column;\\n        align-items: center;\\n        justify-content: center;\\n        gap: 1rem;\\n    }\\n\\n    .admin-loading-spinner__spinner {\\n        width: 40px;\\n        height: 40px;\\n        border: 4px solid #f3f4f6;\\n        border-top-color: var(--primary-color, #F0B21B);\\n        border-radius: 50%;\\n        animation: admin-spin 0.8s linear infinite;\\n    }\\n\\n    .admin-loading-spinner.small .admin-loading-spinner__spinner {\\n        width: 24px;\\n        height: 24px;\\n        border-width: 3px;\\n    }\\n\\n    .admin-loading-spinner.large .admin-loading-spinner__spinner {\\n        width: 56px;\\n        height: 56px;\\n        border-width: 5px;\\n    }\\n\\n    .admin-loading-spinner__text {\\n        font-size: 0.875rem;\\n        font-weight: 500;\\n        color: var(--text-light, #7f8c8d);\\n        text-align: center;\\n        letter-spacing: -0.01em;\\n    }\\n\\n    @keyframes admin-spin {\\n        0% {\\n            transform: rotate(0deg);\\n        }\\n        100% {\\n            transform: rotate(360deg);\\n        }\\n    }\\n</style>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/UserManager/partials/loading-spinner
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/UserManager/partials/loading-spinner', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/UserManager/partials/loading-spinner' };
