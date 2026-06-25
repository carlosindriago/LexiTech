// extension/content.js
// LexiTech content script — the only JS injected into web pages.
//
// Responsibilities:
//   1. Listen for text selection (mouseup) and extract DOM context.
//   2. Open the Shadow DOM popover and render Loading → Success/Error.
//   3. Forward the request to the service worker via chrome.runtime.
//   4. Handle LEXITECH_EXTRACT_CONTEXT messages from the context menu click.
//
// Files loaded BEFORE this one (per manifest content_scripts.js order):
//   - lib/text-extraction.js  (exposes LexiTextExtraction)
//   - lib/popover.js          (exposes LexiPopover)
//
// Hard rules:
//   - No innerHTML for any dynamic data; textContent only.
//   - All chrome.* calls wrapped in try/catch or .catch().
//   - No persistent global state; all state lives in the popover or is
//     computed on demand.

(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    // Extension context not available — silently abort.
    return;
  }

  var extraction = window.LexiTextExtraction || {};
  var popover = window.LexiPopover || {};
  var speech = window.LexiSpeech || {};

  var MAX_TERM_LENGTH = 100;

  // -- 1. Mouseup: user selected text -----------------------------------------

  document.addEventListener('mouseup', function (event) {
    // If the user clicked inside the popover, ignore — let the popover handle it.
    var path = event && event.composedPath ? event.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node && node.getAttribute && node.getAttribute('data-lexitech') === 'popover-host') {
        return;
      }
    }

    try {
      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      var term = String(selection.toString() || '').trim();
      if (term.length === 0 || term.length > MAX_TERM_LENGTH) return;

      var range = selection.getRangeAt(0);
      var context = extraction.extractContextFromRange
        ? extraction.extractContextFromRange(range, term, 500)
        : '';
      if (!context) return;

      showAndExplain(term, context);
    } catch (err) {
      console.error('[LexiTech] mouseup handler failed:', String((err && err.message) || err));
    }
  });

  // -- 2. Click outside: dismiss the popover ----------------------------------

  document.addEventListener('mousedown', function (event) {
    var host = document.getElementById(popover.HOST_ID || 'lexitech-popover-host');
    if (!host) return;
    var shadow = host.shadowRoot;
    if (!shadow) return;
    var popoverEl = shadow.querySelector('.lex-popover');
    if (!popoverEl) return;
    var path = event && event.composedPath ? event.composedPath() : [];
    for (var j = 0; j < path.length; j++) {
      if (path[j] === popoverEl) return; // click inside popover — keep open
    }
    popover.destroyPopover();
  });

  // -- 3. Context-menu click from the service worker --------------------------

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || typeof message !== 'object') return false;
      if (message.type !== 'LEXITECH_EXTRACT_CONTEXT') return false;

      try {
        var term = String(message.term || '').trim();
        if (term.length === 0 || term.length > MAX_TERM_LENGTH) {
          sendResponse({ ok: false, error: 'invalid term length' });
          return false;
        }
        var range = findTermRange(term);
        if (!range) {
          sendResponse({ ok: false, error: 'term not found in document' });
          return false;
        }
        var context = extraction.extractContextFromRange
          ? extraction.extractContextFromRange(range, term, 500)
          : '';
        if (!context) {
          sendResponse({ ok: false, error: 'no context available' });
          return false;
        }
        showAndExplain(term, context);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
      return false; // sync response — work continues in showAndExplain
    });
  }

  // -- Helpers ----------------------------------------------------------------

  function showAndExplain(term, context) {
    if (!popover.createPopover) return;
    var p = popover.createPopover();
    popover.renderLoading(p.shadow);
    askBackend(term, context)
      .then(function (data) {
        popover.renderExplanation(p.shadow, data, {
          onSpeak: typeof speech.speakTerm === 'function' ? speech.speakTerm : null,
        });
      })
      .catch(function (err) {
        popover.renderError(p.shadow, String((err && err.message) || err));
      });
  }

  function askBackend(term, context) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(
          { type: 'LEXITECH_EXPLAIN', payload: { term: term, context: context } },
          function (response) {
            try {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              if (!response) {
                return reject(new Error('no response from service worker'));
              }
              if (!response.ok) {
                return reject(new Error(response.error || 'unknown error'));
              }
              resolve(response.data);
            } catch (innerErr) {
              reject(innerErr);
            }
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  function findTermRange(term) {
    if (typeof document.createTreeWalker !== 'function') return null;
    var termLower = term.toLowerCase();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var text = String(node.textContent || '');
      var idx = text.toLowerCase().indexOf(termLower);
      if (idx !== -1) {
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + term.length);
        return range;
      }
    }
    return null;
  }
})();
