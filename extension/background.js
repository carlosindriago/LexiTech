// LexiTech Service Worker (Manifest V3).
//
// Why a service worker and not a content-script fetch?
//   Host pages' Content Security Policy (CSP) blocks fetch() to non-same-origin
//   URLs from content scripts. The service worker runs in the extension's
//   privileged origin and is allowed to talk to the backend at
//   http://localhost:8000.
//
// Responsibilities:
//   1. Register a "Explain Contextually" context menu item on install.
//   2. Receive LEXITECH_EXPLAIN messages from content.js and proxy them to
//      the FastAPI backend, returning the JSON response.
//   3. Forward context-menu clicks to the content script so it can extract
//      DOM context (added in Phase 5).
//
// Security:
//   - No API keys, no tokens, no user data persisted by the SW.
//   - All dynamic data is exchanged as JSON; the SW never builds HTML.
//   - Input is validated before any network call.

const API_BASE_URL = 'http://localhost:8000';
const API_EXPLAIN_PATH = '/api/v1/explain';

const MSG_EXPLAIN = 'LEXITECH_EXPLAIN';
const MSG_EXTRACT_CONTEXT = 'LEXITECH_EXTRACT_CONTEXT';

const CONTEXT_MENU_ID = 'lexitech-explain-contextually';

const MAX_TERM_LENGTH = 100;
const MAX_CONTEXT_LENGTH = 500;


// --- Lifecycle: install the context menu on first install ------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Explain Contextually with LexiTech',
    contexts: ['selection'],
  });
});


// --- Context-menu click → ask content script to extract DOM context -------
// Wired here so the menu is responsive; the actual extraction logic lives in
// content.js (Phase 5). The content script must respond by sending back a
// LEXITECH_EXPLAIN message with { term, context }.

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (typeof info.selectionText !== 'string' || info.selectionText.length === 0) return;
  if (!tab || typeof tab.id !== 'number') return;
  chrome.tabs
    .sendMessage(tab.id, {
      type: MSG_EXTRACT_CONTEXT,
      term: info.selectionText,
    })
    .catch((err) => {
      // No content script listening yet (Phase 5) — silent log.
      console.warn('[LexiTech] content script not available:', String(err && err.message));
    });
});


// --- Message routing from content.js ---------------------------------------
// Returns `true` to keep the message channel open for an async sendResponse.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === MSG_EXPLAIN) {
    handleExplain(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  return false;
});


// --- HTTP proxy to the FastAPI backend ------------------------------------

async function handleExplain(payload) {
  const { term, context } = validateExplainPayload(payload);

  let response;
  try {
    response = await fetch(API_BASE_URL + API_EXPLAIN_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ term, context }),
    });
  } catch (err) {
    throw new Error('Network error reaching the LexiTech backend at ' + API_BASE_URL);
  }

  if (!response.ok) {
    const detail = await safeReadError(response);
    throw new Error('API ' + response.status + ': ' + detail);
  }

  return response.json();
}

function validateExplainPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload must be an object with term and context');
  }
  const term = payload.term;
  const context = payload.context;
  if (typeof term !== 'string' || term.length === 0 || term.length > MAX_TERM_LENGTH) {
    throw new Error('term must be a non-empty string up to ' + MAX_TERM_LENGTH + ' chars');
  }
  if (typeof context !== 'string' || context.length === 0 || context.length > MAX_CONTEXT_LENGTH) {
    throw new Error('context must be a non-empty string up to ' + MAX_CONTEXT_LENGTH + ' chars');
  }
  return { term, context };
}

async function safeReadError(response) {
  try {
    const data = await response.json();
    if (data && typeof data.detail !== 'undefined') return String(data.detail);
    return JSON.stringify(data);
  } catch (_) {
    return response.statusText || 'unknown error';
  }
}
