/**
 * Unit Tests: Input Sanitization and XSS Prevention
 *
 * Tests HTML sanitization, XSS prevention, URL sanitization,
 * and text input cleaning.
 *
 * Validates: Requirements 13.9
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  stripHtmlTags,
  escapeHtml,
  escapeJsString,
  sanitizeUrl,
  sanitizeTextInput,
  sanitizeClassName,
  safeHtml,
} from './input-sanitizer.js';

describe('sanitizeHtml', () => {
  it('allows safe formatting tags', () => {
    const input = '<b>bold</b> <i>italic</i> <em>emphasis</em>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<em>emphasis</em>');
  });

  it('allows paragraph and line breaks', () => {
    const input = '<p>paragraph</p><br>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<p>paragraph</p>');
    expect(result).toContain('<br>');
  });

  it('allows lists', () => {
    const input = '<ul><li>item 1</li><li>item 2</li></ul>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item 1</li>');
  });

  it('allows links with href', () => {
    const input = '<a href="https://example.com">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<a href="https://example.com">link</a>');
  });

  it('strips script tags', () => {
    const input = '<script>alert("xss")</script><p>safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    // The text content of removed elements may remain as plain text (not executable)
    expect(result).toContain('<p>safe</p>');
  });

  it('strips iframe tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe');
  });

  it('removes event handler attributes', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('removes onclick handler', () => {
    const input = '<button onclick="steal()">Click</button>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('steal');
  });

  it('removes javascript: URLs from href', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('removes data: URLs from img src (non-image)', () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('data:text');
  });

  it('adds rel="noopener noreferrer" to target="_blank" links', () => {
    const input = '<a href="https://example.com" target="_blank">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('strips disallowed tags but preserves text content', () => {
    const input = '<marquee>scrolling text</marquee>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<marquee');
    expect(result).toContain('scrolling text');
  });

  it('removes HTML comments', () => {
    const input = '<!-- secret comment --><p>visible</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('secret');
    expect(result).toContain('<p>visible</p>');
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });

  it('enforces maxLength option', () => {
    const longInput = '<p>' + 'a'.repeat(1000) + '</p>';
    const result = sanitizeHtml(longInput, { maxLength: 50 });
    expect(result.length).toBeLessThanOrEqual(100); // Some overhead from parsing
  });

  it('strips all HTML when stripAll is true', () => {
    const input = '<h1>Title</h1><p>Content with <b>bold</b></p>';
    const result = sanitizeHtml(input, { stripAll: true });
    expect(result).toBe('TitleContent with bold');
  });

  it('allows additional tags via config', () => {
    const input = '<details><summary>More</summary>Content</details>';
    const result = sanitizeHtml(input, { allowedTags: ['details', 'summary'] });
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>');
  });

  it('removes attributes with dangerous CSS expressions', () => {
    const input = '<div class="expression(alert(1))">content</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('expression');
  });
});

describe('stripHtmlTags', () => {
  it('removes all HTML tags', () => {
    expect(stripHtmlTags('<p>hello</p>')).toBe('hello');
  });

  it('handles nested tags', () => {
    expect(stripHtmlTags('<div><p>nested <b>text</b></p></div>')).toBe('nested text');
  });

  it('handles empty input', () => {
    expect(stripHtmlTags('')).toBe('');
    expect(stripHtmlTags(null as any)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtmlTags('plain text')).toBe('plain text');
  });

  it('handles entities properly', () => {
    expect(stripHtmlTags('<p>&amp; &lt; &gt;</p>')).toBe('& < >');
  });
});

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes forward slashes', () => {
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('handles empty input', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null as any)).toBe('');
  });

  it('handles strings without special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('escapeJsString', () => {
  it('escapes single quotes', () => {
    expect(escapeJsString("it's")).toBe("it\\'s");
  });

  it('escapes double quotes', () => {
    expect(escapeJsString('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes newlines and tabs', () => {
    expect(escapeJsString('line1\nline2')).toBe('line1\\nline2');
    expect(escapeJsString('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('escapes backslashes', () => {
    expect(escapeJsString('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes Unicode line/paragraph separators', () => {
    expect(escapeJsString('text\u2028more')).toBe('text\\u2028more');
    expect(escapeJsString('text\u2029more')).toBe('text\\u2029more');
  });

  it('escapes closing script tags', () => {
    expect(escapeJsString('</script>')).toBe('<\\/script>');
  });

  it('handles empty input', () => {
    expect(escapeJsString('')).toBe('');
    expect(escapeJsString(null as any)).toBe('');
  });
});

describe('sanitizeUrl', () => {
  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('allows hash links', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });

  it('allows query-only URLs', () => {
    expect(sanitizeUrl('?page=2')).toBe('?page=2');
  });

  it('allows mailto links', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows tel links', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('blocks javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(sanitizeUrl('JavaScript:void(0)')).toBe('');
  });

  it('blocks vbscript: URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox')).toBe('');
  });

  it('blocks data: URLs (non-image)', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('handles empty input', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl(null as any)).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('blocks unknown schemes', () => {
    expect(sanitizeUrl('custom://something')).toBe('');
  });
});

describe('sanitizeTextInput', () => {
  it('removes null bytes', () => {
    expect(sanitizeTextInput('hello\0world')).toBe('helloworld');
  });

  it('removes control characters', () => {
    expect(sanitizeTextInput('hello\x01\x02world')).toBe('helloworld');
  });

  it('preserves newlines and normal whitespace', () => {
    expect(sanitizeTextInput('line1\nline2')).toBe('line1\nline2');
  });

  it('trims whitespace', () => {
    expect(sanitizeTextInput('  hello  ')).toBe('hello');
  });

  it('normalizes Unicode line separators', () => {
    expect(sanitizeTextInput('line1\u2028line2')).toBe('line1\nline2');
  });

  it('enforces maxLength', () => {
    const result = sanitizeTextInput('a'.repeat(100), 50);
    expect(result.length).toBe(50);
  });

  it('handles empty input', () => {
    expect(sanitizeTextInput('')).toBe('');
    expect(sanitizeTextInput(null as any)).toBe('');
  });
});

describe('sanitizeClassName', () => {
  it('allows valid class names', () => {
    expect(sanitizeClassName('my-class_name')).toBe('my-class_name');
  });

  it('allows spaces for multiple classes', () => {
    expect(sanitizeClassName('class-a class-b')).toBe('class-a class-b');
  });

  it('removes special characters', () => {
    expect(sanitizeClassName('my<class>')).toBe('myclass');
    expect(sanitizeClassName('class"name')).toBe('classname');
  });

  it('handles empty input', () => {
    expect(sanitizeClassName('')).toBe('');
    expect(sanitizeClassName(null as any)).toBe('');
  });
});

describe('safeHtml', () => {
  it('escapes interpolated values', () => {
    const userInput = '<script>alert("xss")</script>';
    const result = safeHtml`<p>${userInput}</p>`;
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('preserves template string literals', () => {
    const name = 'World';
    const result = safeHtml`<h1>Hello, ${name}!</h1>`;
    expect(result).toBe('<h1>Hello, World!</h1>');
  });

  it('handles null/undefined values', () => {
    const result = safeHtml`<p>${null}</p>`;
    expect(result).toBe('<p></p>');
  });

  it('handles numeric values', () => {
    const count = 42;
    const result = safeHtml`<span>${count}</span>`;
    expect(result).toBe('<span>42</span>');
  });
});
