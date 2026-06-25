// extension/lib/popover.js
// LexiTech Popover — Shadow DOM UI for displaying LLM explanations.
//
// Design rules enforced here:
//   1. The popover is attached to a host <div> appended to <body>, with
//      `attachShadow({ mode: 'open' })` so it cannot inherit host-page CSS.
//   2. All dynamic text uses `textContent` — NEVER `innerHTML` for
//      LLM output or user data (XSS prevention).
//   3. The popover has a z-index at the safe-integer max so it sits
//      above most host overlays.
//   4. The CSS lives inside the shadow root, scoped automatically.

(function (root) {
  'use strict';

  var HOST_ID = 'lexitech-popover-host';
  var MAX_Z = 2147483647; // Number.MAX_SAFE_INTEGER — saturate z-index

  // CSS lives inside the shadow root, so it cannot leak in or out.
  var POPOVER_CSS = ''
    + ':host { all: initial; }'
    + '.lex-popover {'
    + '  position: fixed;'
    + '  top: 24px; right: 24px;'
    + '  width: 360px; max-height: 480px;'
    + '  background: #ffffff;'
    + '  color: #1a1a1a;'
    + '  border: 1px solid #d0d0d0;'
    + '  border-radius: 8px;'
    + '  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);'
    + '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,'
    + '               Helvetica, Arial, sans-serif;'
    + '  font-size: 14px;'
    + '  line-height: 1.45;'
    + '  padding: 14px 16px;'
    + '  overflow-y: auto;'
    + '  box-sizing: border-box;'
    + '}'
    + '.lex-header { display: flex; justify-content: space-between; align-items: baseline;'
    + '             margin-bottom: 8px; gap: 8px; }'
    + '.lex-term { font-weight: 700; font-size: 16px; }'
    + '.lex-close { cursor: pointer; color: #888; background: none; border: none;'
    + '             font-size: 22px; line-height: 1; padding: 0 4px; }'
    + '.lex-close:hover { color: #1a1a1a; }'
    + '.lex-pos { color: #888; font-size: 12px; font-style: italic; }'
    + '.lex-section { margin: 8px 0; }'
    + '.lex-label { font-weight: 600; color: #555; font-size: 11px;'
    + '            text-transform: uppercase; letter-spacing: 0.6px; }'
    + '.lex-body { margin: 4px 0 0; white-space: pre-wrap; word-wrap: break-word; }'
    + '.lex-list { margin: 4px 0 0; padding-left: 20px; }'
    + '.lex-list li { margin: 2px 0; }'
    + '.lex-loading { color: #888; text-align: center; padding: 20px 0; }'
    + '.lex-error { color: #b00020; padding: 8px 0; white-space: pre-wrap; }'
    + '.lex-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }'
    + '.lex-speak { cursor: pointer; background: #1a73e8; color: #fff; border: none;'
    + '             border-radius: 4px; padding: 6px 12px; font-size: 13px;'
    + '             font-family: inherit; }'
    + '.lex-speak:hover { background: #1557b0; }'
    + '.lex-speak:disabled { background: #cccccc; cursor: not-allowed; }'
    + '';

  /**
   * Create a fresh popover and attach it to <body>. Any prior popover
   * (identified by HOST_ID) is removed first. Returns the shadow root
   * plus the inner popover element so callers can render into them.
   */
  function createPopover() {
    var existing = document.getElementById(HOST_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-lexitech', 'popover-host');
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.zIndex = String(MAX_Z);
    host.style.pointerEvents = 'none';

    var shadow = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = POPOVER_CSS;
    shadow.appendChild(style);

    var popover = document.createElement('div');
    popover.className = 'lex-popover';
    popover.setAttribute('data-lexitech', 'popover');
    popover.style.pointerEvents = 'auto';
    shadow.appendChild(popover);

    document.body.appendChild(host);
    return { host: host, shadow: shadow, popover: popover };
  }

  function renderLoading(shadow) {
    var popoverEl = shadow.querySelector('.lex-popover');
    if (!popoverEl) return;
    popoverEl.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'lex-loading';
    wrap.textContent = 'Loading explanation…';
    popoverEl.appendChild(wrap);
  }

  function renderError(shadow, errorMessage) {
    var popoverEl = shadow.querySelector('.lex-popover');
    if (!popoverEl) return;
    popoverEl.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'lex-error';
    wrap.textContent = 'Error: ' + String(errorMessage || 'unknown error');
    popoverEl.appendChild(wrap);
  }

  function renderExplanation(shadow, data) {
    if (!data || typeof data !== 'object') {
      renderError(shadow, 'invalid response from backend');
      return;
    }
    var popoverEl = shadow.querySelector('.lex-popover');
    if (!popoverEl) return;
    popoverEl.textContent = '';
    popoverEl.appendChild(buildHeader(data));
    popoverEl.appendChild(buildSection('Definition', data.definition));
    popoverEl.appendChild(buildSection('Etymology', data.etymology));
    popoverEl.appendChild(buildSection('Example', data.usage_example));
    if (Array.isArray(data.synonyms) && data.synonyms.length > 0) {
      popoverEl.appendChild(buildListSection('Synonyms', data.synonyms));
    }
    if (Array.isArray(data.antonyms) && data.antonyms.length > 0) {
      popoverEl.appendChild(buildListSection('Antonyms', data.antonyms));
    }
    if (Array.isArray(data.related_concepts) && data.related_concepts.length > 0) {
      popoverEl.appendChild(buildListSection('Related concepts', data.related_concepts));
    }
    if (Array.isArray(data.common_misuses) && data.common_misuses.length > 0) {
      popoverEl.appendChild(buildListSection('Common misuses', data.common_misuses));
    }
    popoverEl.appendChild(buildSection('Memory aid', data.memory_aid));
    popoverEl.appendChild(buildActions(data));
  }

  function buildHeader(data) {
    var header = document.createElement('div');
    header.className = 'lex-header';
    var term = document.createElement('span');
    term.className = 'lex-term';
    term.textContent = String(data.term || '');
    header.appendChild(term);
    var meta = document.createElement('span');
    meta.className = 'lex-pos';
    var pos = String(data.part_of_speech || '');
    var level = String(data.difficulty_level || '');
    meta.textContent = (pos + (pos && level ? ' • ' : '') + level);
    header.appendChild(meta);
    return header;
  }

  function buildSection(label, body) {
    var section = document.createElement('div');
    section.className = 'lex-section';
    var labelEl = document.createElement('div');
    labelEl.className = 'lex-label';
    labelEl.textContent = String(label);
    var bodyEl = document.createElement('div');
    bodyEl.className = 'lex-body';
    bodyEl.textContent = String(body == null ? '' : body);
    section.appendChild(labelEl);
    section.appendChild(bodyEl);
    return section;
  }

  function buildListSection(label, items) {
    var section = document.createElement('div');
    section.className = 'lex-section';
    var labelEl = document.createElement('div');
    labelEl.className = 'lex-label';
    labelEl.textContent = String(label);
    var list = document.createElement('ul');
    list.className = 'lex-list';
    for (var i = 0; i < items.length; i++) {
      var li = document.createElement('li');
      li.textContent = String(items[i]);
      list.appendChild(li);
    }
    section.appendChild(labelEl);
    section.appendChild(list);
    return section;
  }

  function buildActions(data) {
    var actions = document.createElement('div');
    actions.className = 'lex-actions';
    var speak = document.createElement('button');
    speak.className = 'lex-speak';
    speak.type = 'button';
    speak.setAttribute('data-term', String(data.term || ''));
    speak.textContent = '🔊 Speak';
    actions.appendChild(speak);
    return actions;
  }

  function destroyPopover() {
    var existing = document.getElementById(HOST_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  var api = {
    createPopover: createPopover,
    renderLoading: renderLoading,
    renderError: renderError,
    renderExplanation: renderExplanation,
    destroyPopover: destroyPopover,
    HOST_ID: HOST_ID,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LexiPopover = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
