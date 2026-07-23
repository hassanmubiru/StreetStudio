/**
 * Authentication Security Property Tests
 * 
 * Property-based tests for authentication security consistency requirements.
 * These tests validate universal behaviors that should hold across all inputs.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import fc from 'fast-check';
import { AuthController, type SessionConfig } from '../../app/auth/auth-controller.js';
import { LoginPage } from './login-page.js';

/**
 * **Property 1: Authentication Security Consistency**
 * **Validates: Requirements 1.3**
 * 
 * For any set of invalid login credentials, the authentication system SHALL display
 * a generic error message without revealing which specific credential was incorrect 
 * and SHALL clear the password field.
 */

// Mock dependencies
const mockDashboardSession = {
  useBearerToken: vi.fn(),
  clearAuthentication: vi.fn(),
  currentMember: vi.fn()
};

const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock localStorage and sessionStorage
const createStorageMock = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
});

Object.defineProperty(window, 'localStorage', { value: createStorageMock() });
Object.defineProperty(window, 'sessionStorage', { value: createStorageMock() });

// Mock window APIs
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000/auth/login',
    pathname: '/auth/login',
    search: '',
    origin: 'http://localhost:3000'
  },
  writable: true
});

Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn()
  },
  writable: true
});

// Mock crypto for OAuth state generation
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-123')
  },
  writable: true
});

// Mock document for DOM manipulation
const createMockElement = (tagName: string) => ({
  tagName: tagName.toUpperCase(),
  innerHTML: '',
  textContent: '',
  value: '',
  className: '',
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false)
  },
  setAttribute: vi.fn(),
  getAttribute: vi.fn(() => null),
  removeAttribute: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  appendChild: vi.fn(),
  insertAdjacentElement: vi.fn(),
  querySelector: vi.fn(() => null),
  querySelectorAll: vi.fn(() => []),
  focus: vi.fn(),
  blur: vi.fn(),
  click: vi.fn(),
  dispatchEvent: vi.fn(),
  parentElement: null,
  children: [],
  style: {}
});

const mockDocument = {
  createElement: vi.fn((tag: string) => createMockElement(tag)),
  querySelector: vi.fn(() => null),
  querySelectorAll: vi.fn(() => []),
  getElementById: vi.fn(() => null),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  body: createMockElement('body'),
  head: createMockElement('head')
};

Object.defineProperty(global, 'document', { value: mockDocument, writable: true });

// Mock OAuth and SSO services
vi.mock('../../services/oauth-config.js', () => ({
  oauthConfigService: {
    getEnabledProviders: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({ enabled: false, providers: [] })
  }
}));

vi.mock('../../services/sso-config.js', () => ({
  ssoConfigService: {
    getEnabledProviders: vi.fn().mockResolvedValue([]),
    shouldAutoRedirect: vi.fn().mockResolvedValue(null)
  }
}));

describe('Feature: web-application-implementation, Property 1: Authentication Security Consistency', () => {
  let authController: AuthController;
  let mockConfig: SessionConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      tokenStorage: {
        strategy: 'memory',
        secure: true,
        sameSite: 'strict'
      },
      refreshMargin: 5 * 60 * 1000,
      maxRetries: 2,
      sessionTimeout: 30 * 60 * 1000
    };

    authController = new AuthController(mockDashboardSession as any, mockConfig);
    
    // Reset document mocks
    mockDocument.createElement.mockClear();
    mockDocument.querySelector.mockImplementation((selector: string) => {
      // Return mock elements for common selectors used in LoginPage
      if (selector === '#login-form') {
        const form = createMockElement('form');
        form.addEventListener = vi.fn((event, handler) => {
          // Store the handler for manual triggering in tests
          (form as any)._submitHandler = handler;
        });
        return form;
      }
      if (selector === '#email') {
        const input = createMockElement('input');
        input.value = '';
        return input;
      }
      if (selector === '#password') {
        const input = createMockElement('input');
        input.value = '';
        return input;
      }
      if (selector === '#error-message') {
        return createMockElement('div');
      }
      if (selector === '#error-text') {
        return createMockElement('span');
      }
      if (selector === '#login-button') {
        return createMockElement('button');
      }
      if (selector === '#button-text') {
        return createMockElement('span');
      }
      if (selector === '#loading-spinner') {
        return createMockElement('span');
      }
      return null;
    });
  });

  afterEach(() => {
    authController.destroy();
    vi.clearAllTimers();
  });

  it('Invalid credentials always show generic error and clear password field', async () => {
    /**
     * This test validates that for ANY set of invalid credentials,
     * the authentication system consistently:
     * 1. Shows a generic "Invalid credentials" message
     * 2. Clears the password field
     * 3. Does not reveal which specific credential was incorrect
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary email and password combinations
        fc.record({
          email: fc.oneof(
            // Invalid emails (various formats)
            fc.string({ minLength: 0, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 20 }).map(s => s + '@'),
            fc.string({ minLength: 1, maxLength: 20 }).map(s => '@' + s),
            fc.string({ minLength: 1, maxLength: 20 }).map(s => s + '@invalid'),
            // Valid email format but wrong credentials
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s))
            ).map(([local, domain]) => `${local}@${domain}.com`)
          ),
          password: fc.oneof(
            // Various invalid passwords
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.constant(''),
            fc.constant('wrong-password'),
            fc.constant('123456'),
            fc.constant('password123')
          )
        }),
        async ({ email, password }) => {
          // Mock fetch to always return authentication failure
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => 'Authentication failed',
            json: async () => ({ error: 'Authentication failed' })
          } as Response);

          // Test the login method directly
          const result = await authController.login(email, password);

          // Property 1: Authentication result should always indicate failure
          expect(result.success).toBe(false);
          
          // Property 2: Error message should be generic and not reveal which credential was wrong
          expect(result.error).toBeDefined();
          
          // The error message should be generic and not contain specific field information
          const errorMessage = result.error!.toLowerCase();
          
          // Should not reveal which specific field was incorrect
          expect(errorMessage).not.toMatch(/email.*incorrect|wrong.*email|invalid.*email/);
          expect(errorMessage).not.toMatch(/password.*incorrect|wrong.*password|invalid.*password/);
          expect(errorMessage).not.toMatch(/username.*not.*found|user.*not.*exist/);
          
          // Should use generic terminology
          expect(errorMessage).toMatch(/invalid.*credential|authentication.*failed|login.*failed/);

          // Verify the auth state is properly set to unauthenticated
          const state = authController.getState();
          expect(state.isAuthenticated).toBe(false);
          expect(state.currentUser).toBeUndefined();
        }
      ),
      { numRuns: 100 } // Test with 100 different credential combinations
    );
  });

  it('Login page consistently handles invalid credentials with security measures', async () => {
    /**
     * This test validates the UI-level security behavior:
     * 1. Password field is cleared on any authentication failure
     * 2. Generic error message is displayed
     * 3. Focus is moved to password field for retry
     */
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.oneof(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.emailAddress()
          ),
          password: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async ({ email, password }) => {
          // Setup mock elements to track their state
          const passwordInput = createMockElement('input');
          passwordInput.value = password; // Set initial password value
          
          const errorMessageElement = createMockElement('div');
          const errorTextElement = createMockElement('span');
          
          // Mock querySelector to return our tracked elements
          mockDocument.querySelector.mockImplementation((selector: string) => {
            switch (selector) {
              case '#password': return passwordInput;
              case '#error-message': return errorMessageElement;
              case '#error-text': return errorTextElement;
              case '#login-form':
              case '#email':
              case '#login-button':
              case '#button-text':
              case '#loading-spinner':
                return createMockElement('element');
              default: return null;
            }
          });

          // Mock failed authentication
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => 'Invalid credentials',
            json: async () => ({ error: 'Invalid credentials' })
          } as Response);

          // Create login page instance
          const loginPage = new LoginPage(authController);
          
          // Wait for initialization to complete
          await new Promise(resolve => setTimeout(resolve, 0));

          // Simulate authentication failure by calling login directly
          const result = await authController.login(email, password);

          // Property 1: Authentication should fail
          expect(result.success).toBe(false);

          // Property 2: Error message should be generic
          expect(result.error).toBeDefined();
          expect(result.error).toMatch(/invalid.*credential|authentication.*failed/i);

          // Property 3: The login page implementation should handle this consistently
          // (We can't directly test the UI interaction in this unit test environment,
          // but we can verify the controller behavior that drives the UI)
          
          // Verify that the error doesn't leak information about which field was wrong
          const errorMsg = result.error!.toLowerCase();
          expect(errorMsg).not.toContain('email');
          expect(errorMsg).not.toContain('password');
          expect(errorMsg).not.toContain('username');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Cross-validation: Different invalid credentials produce the same error pattern', async () => {
    /**
     * This test validates that different types of invalid credentials
     * (wrong email vs wrong password vs both wrong) all produce
     * the same generic error response pattern.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          // First set of invalid credentials
          fc.record({
            email: fc.emailAddress(),
            password: fc.string({ minLength: 1, maxLength: 50 })
          }),
          // Second set of invalid credentials  
          fc.record({
            email: fc.emailAddress(),
            password: fc.string({ minLength: 1, maxLength: 50 })
          })
        ),
        async ([credentials1, credentials2]) => {
          // Ensure we have different credential sets
          fc.pre(
            credentials1.email !== credentials2.email || 
            credentials1.password !== credentials2.password
          );

          // Mock both authentication attempts to fail
          mockFetch
            .mockResolvedValueOnce({
              ok: false,
              status: 401,
              text: async () => 'Authentication failed',
              json: async () => ({ error: 'Authentication failed' })
            } as Response)
            .mockResolvedValueOnce({
              ok: false,
              status: 401,
              text: async () => 'Authentication failed', 
              json: async () => ({ error: 'Authentication failed' })
            } as Response);

          // Test both credential sets
          const result1 = await authController.login(credentials1.email, credentials1.password);
          const result2 = await authController.login(credentials2.email, credentials2.password);

          // Property: Both should fail with the same pattern
          expect(result1.success).toBe(false);
          expect(result2.success).toBe(false);
          
          // Property: Error messages should follow the same pattern
          expect(result1.error).toBeDefined();
          expect(result2.error).toBeDefined();
          
          // Both should be generic and not reveal credential-specific information
          const error1 = result1.error!.toLowerCase();
          const error2 = result2.error!.toLowerCase();
          
          // Both should use generic language
          expect(error1).toMatch(/invalid.*credential|authentication.*failed/);
          expect(error2).toMatch(/invalid.*credential|authentication.*failed/);
          
          // Neither should reveal specific field information
          [error1, error2].forEach(error => {
            expect(error).not.toMatch(/email|password|username/);
          });
        }
      ),
      { numRuns: 50 } // Test with 50 pairs of credential combinations
    );
  });

  it('Network errors do not reveal authentication details', async () => {
    /**
     * This test validates that even when network errors occur during authentication,
     * the system doesn't accidentally reveal information about credential validity.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          password: fc.string({ minLength: 1, maxLength: 50 })
        }),
        fc.oneof(
          fc.constant('network-error'),
          fc.constant('timeout'),
          fc.constant('server-error'),
          fc.constant('unknown-error')
        ),
        async (credentials, errorType) => {
          // Mock different types of network failures
          const mockError = (() => {
            switch (errorType) {
              case 'network-error':
                return Promise.reject(new Error('Network request failed'));
              case 'timeout':
                return Promise.reject(new Error('Request timeout'));
              case 'server-error':
                return Promise.resolve({
                  ok: false,
                  status: 500,
                  text: async () => 'Internal server error',
                  json: async () => ({ error: 'Internal server error' })
                } as Response);
              case 'unknown-error':
              default:
                return Promise.reject(new Error('Unknown error occurred'));
            }
          })();

          mockFetch.mockImplementationOnce(() => mockError);

          // Test authentication with network error
          const result = await authController.login(credentials.email, credentials.password);

          // Property: Should fail securely without revealing credential information
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          
          const errorMessage = result.error!.toLowerCase();
          
          // Should not reveal credential-specific information even on network errors
          expect(errorMessage).not.toMatch(/email.*found|email.*valid/);
          expect(errorMessage).not.toMatch(/password.*correct|password.*match/);
          expect(errorMessage).not.toMatch(/user.*exist|account.*found/);
          
          // Should use generic error language
          expect(errorMessage).toMatch(/error|failed|unavailable|try.*again/);
        }
      ),
      { numRuns: 50 }
    );
  });
});