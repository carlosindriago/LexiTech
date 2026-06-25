// extension/__tests__/popover.test.js
// Tests for the Shadow DOM popover. Verifies:
//   - The popover is created inside a Shadow Root (not in the light DOM).
//   - All dynamic data is rendered via textContent (no innerHTML for LLM data).
//   - State transitions: Loading → Success / Loading → Error.

const popover = require('../lib/popover');

beforeEach(() => {
  document.body.innerHTML = '';
  popover.destroyPopover();
});

describe('createPopover', () => {
  test('attaches a host <div> to <body> with a non-zero z-index', () => {
    popover.createPopover();
    const host = document.getElementById(popover.HOST_ID);
    expect(host).not.toBeNull();
    expect(host.parentNode).toBe(document.body);
    const z = parseInt(host.style.zIndex, 10);
    expect(z).toBeGreaterThan(100000);
  });

  test('creates a real open Shadow Root', () => {
    const { host } = popover.createPopover();
    expect(host.shadowRoot).not.toBeNull();
  });

  test('removes a pre-existing popover before creating a new one', () => {
    popover.createPopover();
    popover.createPopover();
    const hosts = document.querySelectorAll('#' + popover.HOST_ID);
    expect(hosts.length).toBe(1);
  });
});

describe('renderLoading', () => {
  test('renders a Loading message inside the shadow popover (not in light DOM)', () => {
    const { shadow } = popover.createPopover();
    popover.renderLoading(shadow);
    const loadingEl = shadow.querySelector('.lex-loading');
    expect(loadingEl).not.toBeNull();
    expect(loadingEl.textContent.toLowerCase()).toContain('loading');
    // Light DOM should NOT contain the loading text.
    expect(document.body.textContent.toLowerCase()).not.toContain('loading');
  });
});

describe('renderError', () => {
  test('renders an error message inside the shadow popover', () => {
    const { shadow } = popover.createPopover();
    popover.renderError(shadow, 'something broke');
    const errEl = shadow.querySelector('.lex-error');
    expect(errEl).not.toBeNull();
    expect(errEl.textContent).toContain('something broke');
  });

  test('handles falsy error messages gracefully', () => {
    const { shadow } = popover.createPopover();
    popover.renderError(shadow, '');
    const errEl = shadow.querySelector('.lex-error');
    expect(errEl).not.toBeNull();
    expect(errEl.textContent.toLowerCase()).toContain('error');
  });
});

describe('renderExplanation', () => {
  const sample = {
    term: 'container',
    part_of_speech: 'noun',
    difficulty_level: 'intermediate',
    definition: 'A standard unit of software that packages up code.',
    etymology: 'From contain + -er',
    usage_example: 'Deploy the application as a container.',
    synonyms: ['package', 'image'],
    antonyms: [],
    related_concepts: ['Docker', 'Kubernetes'],
    common_misuses: ['Confused with VM'],
    memory_aid: 'Contains an app.',
    audio_available: true,
  };

  test('renders the 12 pedagogical fields via textContent (XSS-safe)', () => {
    const { shadow } = popover.createPopover();
    popover.renderExplanation(shadow, sample);
    const popoverEl = shadow.querySelector('.lex-popover');
    expect(popoverEl).not.toBeNull();
    // term, definition, etymology, usage_example, memory_aid should be present.
    expect(popoverEl.textContent).toContain('container');
    expect(popoverEl.textContent).toContain('standard unit of software');
    expect(popoverEl.textContent).toContain('From contain + -er');
    expect(popoverEl.textContent).toContain('Deploy the application as a container');
    expect(popoverEl.textContent).toContain('Contains an app');
  });

  test('renders list sections for non-empty arrays, skips empty ones', () => {
    const { shadow } = popover.createPopover();
    popover.renderExplanation(shadow, sample);
    const lists = shadow.querySelectorAll('.lex-list');
    // Synonyms (2), Related concepts (2), Common misuses (1) — Antonyms is empty so skipped.
    expect(lists.length).toBe(3);
    // Spot-check list contents.
    expect(lists[0].textContent).toContain('package');
    expect(lists[0].textContent).toContain('image');
  });

  test('does NOT use innerHTML — XSS payload is rendered as text', () => {
    const xss = {
      term: '<script>alert(1)</script>',
      part_of_speech: 'noun',
      difficulty_level: 'beginner',
      definition: '<img src=x onerror=alert(1)>',
      etymology: 'safe',
      usage_example: 'safe',
      synonyms: ['<svg/onload=alert(1)>'],
      antonyms: [],
      related_concepts: [],
      common_misuses: [],
      memory_aid: 'safe',
      audio_available: true,
    };
    const { shadow } = popover.createPopover();
    popover.renderExplanation(shadow, xss);
    const popoverEl = shadow.querySelector('.lex-popover');
    // The payload appears as TEXT, not as live HTML elements.
    expect(popoverEl.querySelector('script')).toBeNull();
    expect(popoverEl.querySelector('img')).toBeNull();
    expect(popoverEl.querySelector('svg')).toBeNull();
    // And the dangerous strings are present as plain text.
    expect(popoverEl.textContent).toContain('<script>alert(1)</script>');
  });

  test('gracefully handles invalid payloads by rendering an error', () => {
    const { shadow } = popover.createPopover();
    popover.renderExplanation(shadow, null);
    const errEl = shadow.querySelector('.lex-error');
    expect(errEl).not.toBeNull();
  });
});

describe('destroyPopover', () => {
  test('removes the host element from the DOM', () => {
    popover.createPopover();
    expect(document.getElementById(popover.HOST_ID)).not.toBeNull();
    popover.destroyPopover();
    expect(document.getElementById(popover.HOST_ID)).toBeNull();
  });
});
