// extension/__tests__/text-extraction.test.js
// Jest tests for the pure context-extraction logic. jsdom env per package.json.
const {
  extractContextFromRange,
  collectVisibleText,
  isElementHidden,
  MAX_CONTEXT_LENGTH,
} = require('../lib/text-extraction');

describe('collectVisibleText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns text from a simple paragraph', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const result = collectVisibleText(document.body);
    expect(result.trim()).toBe('Hello world');
  });

  test('skips <script> and <style> contents', () => {
    document.body.innerHTML =
      '<p>visible</p><script>alert(1)</script><style>body{color:red}</style><p>also visible</p>';
    const result = collectVisibleText(document.body);
    expect(result).toContain('visible');
    expect(result).toContain('also visible');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
  });

  test('skips elements with the hidden attribute', () => {
    document.body.innerHTML = '<p>visible</p><span hidden>invisible</span>';
    expect(collectVisibleText(document.body).trim()).toBe('visible');
  });

  test('skips elements with aria-hidden="true"', () => {
    document.body.innerHTML = '<p>visible</p><span aria-hidden="true">invisible</span>';
    expect(collectVisibleText(document.body).trim()).toBe('visible');
  });

  test('skips elements with display:none inline style', () => {
    document.body.innerHTML = '<p>visible</p><span style="display:none">invisible</span>';
    expect(collectVisibleText(document.body).trim()).toBe('visible');
  });

  test('skips iframe and template', () => {
    document.body.innerHTML =
      '<p>visible</p><iframe src="x">invisible iframe text</iframe><template>invisible template</template>';
    const result = collectVisibleText(document.body);
    expect(result).toContain('visible');
    expect(result).not.toContain('invisible iframe');
    expect(result).not.toContain('invisible template');
  });

  test('inserts separators between block elements', () => {
    document.body.innerHTML = '<p>first</p><p>second</p>';
    const result = collectVisibleText(document.body);
    // Two paragraphs joined with a space — the regex collapses any whitespace.
    expect(result.replace(/\s+/g, ' ').trim()).toBe('first second');
  });
});

describe('isElementHidden', () => {
  test('returns false for a plain div', () => {
    const div = document.createElement('div');
    expect(isElementHidden(div)).toBe(false);
  });

  test('returns true for the hidden attribute', () => {
    const div = document.createElement('div');
    div.setAttribute('hidden', '');
    expect(isElementHidden(div)).toBe(true);
  });

  test('returns true for aria-hidden="true"', () => {
    const div = document.createElement('div');
    div.setAttribute('aria-hidden', 'true');
    expect(isElementHidden(div)).toBe(true);
  });

  test('returns true for display:none', () => {
    const div = document.createElement('div');
    div.style.display = 'none';
    expect(isElementHidden(div)).toBe(true);
  });

  test('returns true for visibility:hidden', () => {
    const div = document.createElement('div');
    div.style.visibility = 'hidden';
    expect(isElementHidden(div)).toBe(true);
  });

  test('returns false for non-element nodes', () => {
    expect(isElementHidden(null)).toBe(false);
    expect(isElementHidden(undefined)).toBe(false);
    expect(isElementHidden({ nodeType: 3 })).toBe(false);
  });
});

describe('extractContextFromRange', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns empty string for a null range', () => {
    expect(extractContextFromRange(null, 'term')).toBe('');
  });

  test('returns empty string for a collapsed range', () => {
    const range = document.createRange();
    expect(extractContextFromRange(range, 'term')).toBe('');
  });

  test('returns empty string for an empty term', () => {
    document.body.innerHTML = '<p>hello world</p>';
    const range = document.createRange();
    range.selectNodeContents(document.body.querySelector('p'));
    expect(extractContextFromRange(range, '')).toBe('');
    expect(extractContextFromRange(range, null)).toBe('');
  });

  test('centers the term in a window of maxLength characters', () => {
    const sentence =
      'Lorem ipsum dolor sit amet, container adipiscing elit, sed do eiusmod tempor incididunt ut labore.';
    document.body.innerHTML = '<p>' + sentence + '</p>';
    const p = document.body.querySelector('p');
    const range = document.createRange();
    range.selectNodeContents(p);

    const result = extractContextFromRange(range, 'container', 30);
    expect(result).toContain('container');
    expect(result.length).toBeLessThanOrEqual(30);
  });

  test('truncates to maxLength when the full text exceeds it', () => {
    document.body.innerHTML = '<p>' + 'a'.repeat(1000) + '</p>';
    const range = document.createRange();
    range.selectNodeContents(document.body.querySelector('p'));
    const result = extractContextFromRange(range, 'a', 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  test('falls back to first maxLength chars when the term is not in context', () => {
    document.body.innerHTML = '<p>Some completely different text here.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.body.querySelector('p'));
    const result = extractContextFromRange(range, 'nonexistent', 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  test('respects custom maxLength of zero or negative by using default', () => {
    document.body.innerHTML = '<p>hello world</p>';
    const range = document.createRange();
    range.selectNodeContents(document.body.querySelector('p'));
    const result = extractContextFromRange(range, 'world', 0);
    // Default cap (500) kicks in, so we get most of the text.
    expect(result.length).toBeGreaterThan(5);
    expect(result).toContain('world');
  });

  test('skips script content when extracting context', () => {
    document.body.innerHTML =
      '<p>Some text before</p><script>SECRETSECRET</script><p>container appears here</p>';
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const result = extractContextFromRange(range, 'container', 200);
    expect(result).toContain('container');
    expect(result).not.toContain('SECRETSECRET');
  });

  test('MAX_CONTEXT_LENGTH constant matches the backend cap (500)', () => {
    expect(MAX_CONTEXT_LENGTH).toBe(500);
  });
});
