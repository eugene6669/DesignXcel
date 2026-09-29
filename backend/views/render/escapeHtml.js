'use strict';

/**
 * HTML escape matching EJS client compile default (encode_char / _ENCODE_HTML_RULES).
 * Must stay byte-compatible with former <%= %> output.
 */
function escapeHtml(markup) {
    if (markup == null || markup === undefined) {
        return '';
    }
    return String(markup)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&#34;')
        .replace(/'/g, '&#39;');
}

function rethrow(err, str, flnm, lineno) {
    throw err;
}

module.exports = { escapeHtml, rethrow };
