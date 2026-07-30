/**
 * Input Sanitization and XSS Prevention
 *
 * Provides HTML sanitization utilities that strip dangerous tags and attributes,
 * and XSS prevention for user-generated content rendering.
 *
 * Requirements: 13.9
 */

/** Tags that are always allowed (safe inline formatting) */
const ALLOWED_TAGS = new Set([
  'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
  'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'div', 'sub', 'sup', 'abbr', 'mark', 'del', 'ins',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
  'figure', 'figcaption', 'img', 'hr',
]);

/** Tags that should be removed entirely (including their content) */
const REMOVED_ENTIRELY_TAGS = new Set([
  'script', 'style', 'noscript', 'object', 'embed', 'applet',
  'iframe', 'frame', 'frameset', 'form', 'input', 'textarea', 'select',
]);

/** Attributes that are allowed on any tag */
const ALLOWED_GLOBAL_ATTRS = new Set([
  'class', 'id', 'title', 'lang', 'dir', 'role',
  'aria-label', 'aria-describedby', 'aria-hidden', 'aria-live',
]);

/** Tag-specific allowed attributes */
const ALLOWED_TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'title']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'type']),
  blockquote: new Set(['cite']),
  abbr: new Set(['title']),
};

/** Dangerous URL schemes that could execute code */
const DANGEROUS_URL_SCHEMES = /^(javascript|vbscript|data(?!:image\/))/i;

/** Patterns indicating event handler attributes */
const EVENT_HANDLER_PATTERN = /^on[a-z]/i;

/** Patterns indicating dangerous attribute values */
const DANGEROUS_ATTR_VALUE_PATTERN = /(?:javascript|expression|url\s*\()/i;

export interface SanitizerConfig {
  /** Additional tags to allow beyond the defaults */
  allowedTags?: string[];
  /** Additional attributes to allow (global) */
  allowedAttributes?: string[];
  /** Whether to allow target="_blank" on links (adds rel="noopener noreferrer") */
  allowTargetBlank?: boolean;
  /** Maximum allowed string length (0 = unlimited) */
  maxLength?: number;
  /** Whether to strip all HTML and return plain text */
  stripAll?: boolean;
}

/**
 * Sanitize HTML content, removing dangerous tags and attributes.
 * Returns safe HTML suitable for innerHTML insertion.
 */
export function sanitizeHtml(input: string, config?: SanitizerConfig): string {
  if (!input || typeof input !== 'string') return '';

  const options = {
    allowedTags: new Set([...ALLOWED_TAGS, ...(config?.allowedTags ?? [])]),
    allowedAttributes: new Set([...ALLOWED_GLOBAL_ATTRS, ...(config?.allowedAttributes ?? [])]),
    allowTargetBlank: config?.allowTargetBlank ?? true,
    maxLength: config?.maxLength ?? 0,
    stripAll: config?.stripAll ?? false,
  };

  // Enforce max length before processing
  let html = options.maxLength > 0 ? input.slice(0, options.maxLength) : input;

  // If stripping all HTML, return text content only
  if (options.stripAll) {
    return stripHtmlTags(html);
  }

  // Use DOMParser for safe parsing
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild as HTMLElement;

  if (!container) return '';

  sanitizeNode(container, options);

  return container.innerHTML;
}

/**
 * Strip all HTML tags from a string, returning plain text.
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  return doc.body.textContent ?? '';
}

/**
 * Escape special HTML characters to prevent XSS when inserting into HTML context.
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Escape a string for safe use inside a JavaScript string literal.
 */
export function escapeJsString(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\//g, '<\\/');
}

/**
 * Sanitize a URL, removing dangerous schemes.
 * Returns empty string if URL is considered dangerous.
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Check for dangerous schemes
  if (DANGEROUS_URL_SCHEMES.test(trimmed)) {
    return '';
  }

  // Allow relative URLs, http, https, mailto, tel
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('?') ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed)
  ) {
    return trimmed;
  }

  // Block anything else that looks like a scheme
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed)) {
    return '';
  }

  return trimmed;
}

/**
 * Sanitize user input for use as text content (not HTML).
 * Removes control characters and normalizes whitespace.
 */
export function sanitizeTextInput(input: string, maxLength?: number): string {
  if (!input || typeof input !== 'string') return '';

  let cleaned = input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newline and tab
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize Unicode line/paragraph separators
    .replace(/[\u2028\u2029]/g, '\n')
    // Trim
    .trim();

  if (maxLength && maxLength > 0) {
    cleaned = cleaned.slice(0, maxLength);
  }

  return cleaned;
}

/**
 * Validate and sanitize CSS class names.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
export function sanitizeClassName(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();
}

/**
 * Create a safe HTML fragment from user content using template literals.
 * Automatically escapes all interpolated values.
 */
export function safeHtml(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += escapeHtml(String(values[i] ?? ''));
    }
  }
  return result;
}

// --- Private helpers ---

interface SanitizeOptions {
  allowedTags: Set<string>;
  allowedAttributes: Set<string>;
  allowTargetBlank: boolean;
  maxLength: number;
  stripAll: boolean;
}

function sanitizeNode(node: HTMLElement, options: SanitizeOptions): void {
  const childNodes = Array.from(node.childNodes);

  for (const child of childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      // Completely remove dangerous tags including their content
      if (REMOVED_ENTIRELY_TAGS.has(tagName)) {
        node.removeChild(element);
        continue;
      }

      if (!options.allowedTags.has(tagName)) {
        // Replace disallowed element with its text content
        const text = document.createTextNode(element.textContent ?? '');
        node.replaceChild(text, element);
        continue;
      }

      // Sanitize attributes
      sanitizeAttributes(element, tagName, options);

      // Recurse into children
      sanitizeNode(element, options);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Remove HTML comments (could contain conditional IE directives)
      node.removeChild(child);
    }
  }
}

function sanitizeAttributes(element: HTMLElement, tagName: string, options: SanitizeOptions): void {
  const attrs = Array.from(element.attributes);
  const tagSpecificAttrs = ALLOWED_TAG_ATTRS[tagName];

  for (const attr of attrs) {
    const attrName = attr.name.toLowerCase();

    // Always remove event handlers
    if (EVENT_HANDLER_PATTERN.test(attrName)) {
      element.removeAttribute(attr.name);
      continue;
    }

    // Check if attribute is allowed globally or for this tag
    const isAllowed =
      options.allowedAttributes.has(attrName) ||
      (tagSpecificAttrs && tagSpecificAttrs.has(attrName));

    if (!isAllowed) {
      element.removeAttribute(attr.name);
      continue;
    }

    // Sanitize attribute values
    const value = attr.value;

    // Check for dangerous values (javascript: in any attribute value)
    if (DANGEROUS_ATTR_VALUE_PATTERN.test(value)) {
      element.removeAttribute(attr.name);
      continue;
    }

    // Special handling for href and src attributes
    if (attrName === 'href' || attrName === 'src') {
      const sanitizedUrl = sanitizeUrl(value);
      if (!sanitizedUrl) {
        element.removeAttribute(attr.name);
      } else {
        element.setAttribute(attr.name, sanitizedUrl);
      }
    }
  }

  // Ensure links with target="_blank" have rel="noopener noreferrer"
  if (tagName === 'a' && element.getAttribute('target') === '_blank') {
    if (options.allowTargetBlank) {
      element.setAttribute('rel', 'noopener noreferrer');
    } else {
      element.removeAttribute('target');
    }
  }
}
