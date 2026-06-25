// extension/lib/text-extraction.js
// Pure logic for extracting a context window around a user selection.
// Loaded both by the Chrome content script (as a global `LexiTextExtraction`)
// and by Jest (as a CommonJS module).
//
// No DOM side effects, no event listeners, no globals beyond the export.

(function (root) {
  'use strict';

  // Tag names whose text content must NEVER bleed into the context window.
  var HIDDEN_TAGS = [
    'script', 'style', 'noscript', 'template', 'svg',
    'iframe', 'object', 'embed', 'audio', 'video', 'canvas',
    'meta', 'link', 'title', 'head',
  ];

  // Inline-style and ARIA attributes that mark an element as hidden.
  var HIDDEN_ARIA = ['aria-hidden'];

  // Default cap; must match the backend's ExplanationRequest max_length.
  var MAX_CONTEXT_LENGTH = 500;

  function isElementHidden(el) {
    if (!el || el.nodeType !== 1 /* ELEMENT_NODE */) {
      return false;
    }
    if (el.getAttribute && el.getAttribute('hidden') !== null) {
      return true;
    }
    for (var i = 0; i < HIDDEN_ARIA.length; i++) {
      if (el.getAttribute && el.getAttribute(HIDDEN_ARIA[i]) === 'true') {
        return true;
      }
    }
    if (el.style) {
      if (el.style.display === 'none' || el.style.visibility === 'hidden') {
        return true;
      }
    }
    return false;
  }

  function collectVisibleText(node) {
    if (!node) return '';
    if (node.nodeType === 3 /* TEXT_NODE */) {
      return node.textContent || '';
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) {
      return '';
    }
    if (isElementHidden(node)) {
      return '';
    }
    var tag = (node.tagName || '').toLowerCase();
    if (HIDDEN_TAGS.indexOf(tag) !== -1) {
      return '';
    }

    var result = '';
    var children = node.childNodes || [];
    for (var ci = 0; ci < children.length; ci++) {
      result += collectVisibleText(children[ci]);
    }

    // Insert a separator so block elements do not glue together.
    if (result && (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'h1'
        || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'br')) {
      result = result + ' ';
    }
    return result;
  }

  function extractContextFromRange(range, term, maxLength) {
    if (!range || range.collapsed) return '';
    if (typeof term !== 'string' || term.length === 0) return '';

    var limit = (typeof maxLength === 'number' && maxLength > 0) ? maxLength : MAX_CONTEXT_LENGTH;
    var fullText = collectVisibleText(range.commonAncestorContainer);
    if (!fullText) return '';

    var termLower = term.toLowerCase();
    var fullLower = fullText.toLowerCase();
    var termIndex = fullLower.indexOf(termLower);

    if (termIndex === -1) {
      return truncate(fullText, limit);
    }

    var half = Math.floor((limit - term.length) / 2);
    if (half < 0) half = 0;
    var start = Math.max(0, termIndex - half);
    var end = Math.min(fullText.length, start + limit);

    // Re-anchor start if the window was clamped at the end.
    if (end - start < limit && end === fullText.length) {
      start = Math.max(0, end - limit);
    }
    return fullText.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+/g, ' ').trim();
  }

  var api = {
    extractContextFromRange: extractContextFromRange,
    collectVisibleText: collectVisibleText,
    isElementHidden: isElementHidden,
    MAX_CONTEXT_LENGTH: MAX_CONTEXT_LENGTH,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LexiTextExtraction = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
