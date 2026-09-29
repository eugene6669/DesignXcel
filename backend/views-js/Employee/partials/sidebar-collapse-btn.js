'use strict';

const { createInclude } = require('../../../views/render/viewRuntime');
const { escapeHtml, rethrow } = require('../../../views/render/escapeHtml');

/** Compiled from EJS — regenerate via scripts/convert-ejs-to-js.js */
const COMPILED_SOURCE = "function anonymous(locals, escapeFn, include, rethrow\n) {\nescapeFn = escapeFn || function (markup) {\n  return markup == undefined\n    ? ''\n    : String(markup)\n      .replace(_MATCH_HTML, encode_char);\n};\nvar _ENCODE_HTML_RULES = {\n      \"&\": \"&amp;\"\n    , \"<\": \"&lt;\"\n    , \">\": \"&gt;\"\n    , '\"': \"&#34;\"\n    , \"'\": \"&#39;\"\n    }\n  , _MATCH_HTML = /[&<>'\"]/g;\nfunction encode_char(c) {\n  return _ENCODE_HTML_RULES[c] || c;\n};\n;\n  var __output = \"\";\n  function __append(s) { if (s !== undefined && s !== null) __output += s }\n  with (locals || {}) {\n    ; __append(\"<button type=\\\"button\\\" class=\\\"sidebar-collapse-btn\\\" aria-label=\\\"Hide sidebar\\\" aria-expanded=\\\"true\\\" title=\\\"Hide sidebar\\\">\\n    <svg class=\\\"sidebar-collapse-icon\\\" viewBox=\\\"0 0 24 24\\\" width=\\\"18\\\" height=\\\"18\\\" fill=\\\"none\\\" stroke=\\\"currentColor\\\"\\n        stroke-width=\\\"2\\\" stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\" aria-hidden=\\\"true\\\">\\n        <polyline points=\\\"15 18 9 12 15 6\\\"></polyline>\\n    </svg>\\n</button>\\n\")\n  }\n  return __output;\n\n}";

let _compiledFn;

function getCompiledFn() {
    if (!_compiledFn) {
        // eslint-disable-next-line no-new-func
        _compiledFn = (new Function('return ' + COMPILED_SOURCE))();
    }
    return _compiledFn;
}

/**
 * Render view: Employee/partials/sidebar-collapse-btn
 */
function render(locals) {
    locals = locals || {};
    const include = createInclude('Employee/partials/sidebar-collapse-btn', locals);
    return getCompiledFn()(locals, escapeHtml, include, rethrow);
}

module.exports = { render, viewKey: 'Employee/partials/sidebar-collapse-btn' };
