// extension/lib/speech.js
// Pure wrapper around the Web Speech API for pronouncing a term aloud.
// The function checks for the API's presence and is a no-op in
// environments that lack it (Node, jsdom, browsers without the API).
//
// Loaded both by the Chrome content script (as a global `LexiSpeech`) and
// by Jest (as a CommonJS module).

(function (root) {
  'use strict';

  var DEFAULT_LANG = 'en-US';
  var DEFAULT_RATE = 1.0;
  var DEFAULT_PITCH = 1.0;

  /**
   * Speak `term` using window.speechSynthesis. Returns true if the request
   * was queued, false if speech was unavailable or the input was invalid.
   *
   * @param {string} term  — the text to synthesise.
   * @param {object} [opts]
   * @param {string} [opts.lang='en-US']
   * @param {number} [opts.rate=1.0]
   * @param {number} [opts.pitch=1.0]
   * @returns {boolean}
   */
  function speakTerm(term, opts) {
    if (typeof term !== 'string' || term.length === 0) return false;
    if (typeof window === 'undefined') return false;
    if (!('speechSynthesis' in window)) return false;
    if (typeof window.SpeechSynthesisUtterance !== 'function') return false;

    var utter = new window.SpeechSynthesisUtterance(term);
    utter.lang = (opts && typeof opts.lang === 'string' && opts.lang) || DEFAULT_LANG;
    utter.rate = (opts && typeof opts.rate === 'number' && opts.rate > 0) ? opts.rate : DEFAULT_RATE;
    utter.pitch = (opts && typeof opts.pitch === 'number' && opts.pitch > 0) ? opts.pitch : DEFAULT_PITCH;

    try {
      window.speechSynthesis.speak(utter);
      return true;
    } catch (err) {
      // Some browsers throw if the synthesis queue is in a bad state.
      // Log and degrade gracefully — never break the popover for this.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[LexiTech] speechSynthesis.speak failed:', String((err && err.message) || err));
      }
      return false;
    }
  }

  var api = {
    speakTerm: speakTerm,
    DEFAULT_LANG: DEFAULT_LANG,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LexiSpeech = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
