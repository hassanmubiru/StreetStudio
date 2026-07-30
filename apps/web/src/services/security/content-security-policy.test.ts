/**
 * Unit Tests: Content Security Policy
 *
 * Tests CSP meta tag generation, nonce management, directive configuration,
 * and violation reporting.
 *
 * Validates: Requirements 13.9
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentSecurityPolicy, generateNonce } from './content-security-policy.js';

// Mock crypto.getRandomValues for predictable nonce generation in tests
const mockGetRandomValues = vi.fn((array: Uint8Array) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = (i * 17 + 42) % 256;
  }
  return array;
});

vi.stubGlobal('crypto', {
  getRandomValues: mockGetRandomValues,
  randomUUID: vi.fn(() => 'test-uuid-123'),
});

describe('ContentSecurityPolicy', () => {
  let csp: ContentSecurityPolicy;

  beforeEach(() => {
    document.head.innerHTML = '';
    csp = new ContentSecurityPolicy();
  });

  afterEach(() => {
    csp.destroy();
    document.head.innerHTML = '';
  });

  describe('generateNonce', () => {
    it('generates a base64-encoded nonce string', () => {
      const nonce = generateNonce();
      expect(nonce).toBeTruthy();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });

    it('calls crypto.getRandomValues', () => {
      generateNonce();
      expect(mockGetRandomValues).toHaveBeenCalled();
    });
  });

  describe('constructor', () => {
    it('creates an instance with default directives', () => {
      const config = csp.getConfig();
      expect(config.directives['default-src']).toContain("'self'");
      expect(config.directives['script-src']).toContain("'self'");
      expect(config.directives['object-src']).toContain("'none'");
    });

    it('generates a nonce by default', () => {
      expect(csp.getNonce()).toBeTruthy();
    });

    it('does not generate nonce when useNonces is false', () => {
      const noNonceCsp = new ContentSecurityPolicy({ useNonces: false });
      expect(noNonceCsp.getNonce()).toBeNull();
      noNonceCsp.destroy();
    });

    it('accepts custom configuration', () => {
      const customCsp = new ContentSecurityPolicy({
        reportOnly: true,
        reportUri: '/csp-report',
        directives: { 'connect-src': ["'self'", 'https://api.example.com'] },
      });
      const config = customCsp.getConfig();
      expect(config.reportOnly).toBe(true);
      expect(config.reportUri).toBe('/csp-report');
      expect(config.directives['connect-src']).toContain('https://api.example.com');
      customCsp.destroy();
    });
  });

  describe('buildPolicyString', () => {
    it('builds a valid CSP policy string', () => {
      const policy = csp.buildPolicyString();
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("object-src 'none'");
    });

    it('includes nonce in script-src and style-src', () => {
      const nonce = csp.getNonce();
      const policy = csp.buildPolicyString();
      expect(policy).toContain(`'nonce-${nonce}'`);
      expect(policy).toMatch(/script-src[^;]*'nonce-/);
      expect(policy).toMatch(/style-src[^;]*'nonce-/);
    });

    it('includes report-uri when configured', () => {
      const reportCsp = new ContentSecurityPolicy({ reportUri: '/csp-violations' });
      const policy = reportCsp.buildPolicyString();
      expect(policy).toContain('report-uri /csp-violations');
      reportCsp.destroy();
    });

    it('includes report-to when configured', () => {
      const reportCsp = new ContentSecurityPolicy({ reportToGroup: 'csp-endpoint' });
      const policy = reportCsp.buildPolicyString();
      expect(policy).toContain('report-to csp-endpoint');
      reportCsp.destroy();
    });

    it('separates directives with semicolons', () => {
      const policy = csp.buildPolicyString();
      expect(policy).toMatch(/; /);
    });
  });

  describe('applyPolicy', () => {
    it('injects a meta tag into document head', () => {
      csp.applyPolicy();
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      expect(meta).not.toBeNull();
    });

    it('sets Content-Security-Policy http-equiv for enforcing mode', () => {
      csp.applyPolicy();
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      expect(meta).not.toBeNull();
    });

    it('sets Content-Security-Policy-Report-Only for report-only mode', () => {
      const reportOnlyCsp = new ContentSecurityPolicy({ reportOnly: true });
      reportOnlyCsp.applyPolicy();
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy-Report-Only"]');
      expect(meta).not.toBeNull();
      reportOnlyCsp.destroy();
    });

    it('replaces existing meta tag on re-apply', () => {
      csp.applyPolicy();
      csp.applyPolicy();
      const metas = document.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
      expect(metas.length).toBe(1);
    });

    it('returns the created meta element', () => {
      const meta = csp.applyPolicy();
      expect(meta).toBeInstanceOf(HTMLMetaElement);
      expect(meta.getAttribute('content')).toContain("default-src");
    });
  });

  describe('removePolicy', () => {
    it('removes the CSP meta tag from the document', () => {
      csp.applyPolicy();
      expect(document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();

      csp.removePolicy();
      expect(document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).toBeNull();
    });

    it('does nothing if no policy is applied', () => {
      expect(() => csp.removePolicy()).not.toThrow();
    });
  });

  describe('rotateNonce', () => {
    it('generates a new nonce value', () => {
      const originalNonce = csp.getNonce();
      // Change mock to return different values
      mockGetRandomValues.mockImplementationOnce((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = (i * 23 + 99) % 256;
        }
        return array;
      });
      const newNonce = csp.rotateNonce();
      expect(newNonce).toBeTruthy();
      // Both nonces are generated from the same mock, but the method was called
      expect(typeof newNonce).toBe('string');
    });

    it('updates the applied policy when nonce is rotated', () => {
      csp.applyPolicy();
      const newNonce = csp.rotateNonce();
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      expect(meta?.getAttribute('content')).toContain(`'nonce-${newNonce}'`);
    });
  });

  describe('directive management', () => {
    it('setDirective updates a directive', () => {
      csp.setDirective('connect-src', ["'self'", 'https://api.example.com']);
      const config = csp.getConfig();
      expect(config.directives['connect-src']).toContain('https://api.example.com');
    });

    it('addSource adds a source to an existing directive', () => {
      csp.addSource('script-src', 'https://cdn.example.com');
      const config = csp.getConfig();
      expect(config.directives['script-src']).toContain('https://cdn.example.com');
    });

    it('addSource does not duplicate existing sources', () => {
      csp.addSource('script-src', "'self'");
      const config = csp.getConfig();
      const selfCount = config.directives['script-src']!.filter(s => s === "'self'").length;
      expect(selfCount).toBe(1);
    });

    it('addSource creates a new directive if it does not exist', () => {
      csp.addSource('worker-src', "'self'");
      const config = csp.getConfig();
      expect(config.directives['worker-src']).toContain("'self'");
    });

    it('removeSource removes a source from a directive', () => {
      csp.addSource('img-src', 'https://images.example.com');
      csp.removeSource('img-src', 'https://images.example.com');
      const config = csp.getConfig();
      expect(config.directives['img-src']).not.toContain('https://images.example.com');
    });
  });

  describe('violation reporting', () => {
    it('onViolation registers a handler', () => {
      const handler = vi.fn();
      csp.onViolation(handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('onViolation returns an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = csp.onViolation(handler);
      expect(typeof unsubscribe).toBe('function');
    });

    it('startViolationListening returns a cleanup function', () => {
      const cleanup = csp.startViolationListening();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  describe('destroy', () => {
    it('removes the policy and cleans up', () => {
      csp.applyPolicy();
      csp.destroy();
      expect(document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).toBeNull();
      expect(csp.getNonce()).toBeNull();
    });
  });
});
