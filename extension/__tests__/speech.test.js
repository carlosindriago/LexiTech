// extension/__tests__/speech.test.js
// Tests for the Web Speech API wrapper. jsdom does not provide
// speechSynthesis, so each test installs a fresh mock on `window`.

const { speakTerm, DEFAULT_LANG } = require('../lib/speech');

describe('speakTerm', () => {
  let speakMock;
  let lastUtterance;
  let savedSynthesis;
  let savedUtterance;

  beforeEach(() => {
    lastUtterance = null;
    speakMock = jest.fn((utter) => { lastUtterance = utter; });

    savedSynthesis = window.speechSynthesis;
    savedUtterance = window.SpeechSynthesisUtterance;

    window.speechSynthesis = { speak: speakMock };
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1.0;
      this.pitch = 1.0;
    };
  });

  afterEach(() => {
    if (savedSynthesis === undefined) {
      delete window.speechSynthesis;
    } else {
      window.speechSynthesis = savedSynthesis;
    }
    if (savedUtterance === undefined) {
      delete window.SpeechSynthesisUtterance;
    } else {
      window.SpeechSynthesisUtterance = savedUtterance;
    }
  });

  test('queues an utterance with the en-US locale by default', () => {
    expect(speakTerm('container')).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(lastUtterance).not.toBeNull();
    expect(lastUtterance.text).toBe('container');
    expect(lastUtterance.lang).toBe('en-US');
  });

  test('respects a custom lang option', () => {
    speakTerm('hola', { lang: 'es-ES' });
    expect(lastUtterance.lang).toBe('es-ES');
  });

  test('respects custom rate and pitch', () => {
    speakTerm('hello', { rate: 1.5, pitch: 0.8 });
    expect(lastUtterance.rate).toBe(1.5);
    expect(lastUtterance.pitch).toBe(0.8);
  });

  test('falls back to defaults for invalid rate or pitch', () => {
    speakTerm('hello', { rate: -1, pitch: 'invalid' });
    expect(lastUtterance.rate).toBe(1.0);
    expect(lastUtterance.pitch).toBe(1.0);
  });

  test('returns false for empty or non-string input', () => {
    expect(speakTerm('')).toBe(false);
    expect(speakTerm(null)).toBe(false);
    expect(speakTerm(undefined)).toBe(false);
    expect(speakTerm(42)).toBe(false);
    expect(speakTerm({})).toBe(false);
    expect(speakMock).not.toHaveBeenCalled();
  });

  test('returns false when speechSynthesis is not on window', () => {
    delete window.speechSynthesis;
    expect(speakTerm('hello')).toBe(false);
  });

  test('returns false when SpeechSynthesisUtterance is not a constructor', () => {
    delete window.SpeechSynthesisUtterance;
    expect(speakTerm('hello')).toBe(false);
  });

  test('catches exceptions from speak() and returns false', () => {
    window.speechSynthesis.speak = jest.fn(() => { throw new Error('queue full'); });
    expect(speakTerm('hello')).toBe(false);
  });

  test('DEFAULT_LANG is "en-US" (matches the agents.md directive)', () => {
    expect(DEFAULT_LANG).toBe('en-US');
  });
});
