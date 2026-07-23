/**
 * Property-Based Tests for Password Reset Security
 * 
 * **Property 2: Password Reset Security Uniformity**  
 * **Validates: Requirements 1.5**
 * 
 * For any email address (valid, invalid, existing, or non-existing), 
 * the password reset request SHALL display the same confirmation message 
 * and follow the same response pattern.
 */

import { describe, test, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ForgotPasswordPage } from './forgot-password-page.js';

// Mock AuthController for testing
const mockAuthController = {
  requestPasswordReset: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  onAuthStateChange: vi.fn(),
  getState: vi.fn(),
};

// Mock console for clean test output
global.console = {
  ...global.console,
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
};

describe('Password Reset Security Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock fetch
    global.fetch = vi.fn();
  });

  /**
   * Property 2: Password Reset Security Uniformity
   * 
   * This property verifies that for ANY email address (valid, invalid, 
   * existing, or non-existing), the password reset request displays 
   * the same confirmation message and follows the same response pattern.
   * 
   * **Validates: Requirements 1.5**
   */
  test('Property 2: Password Reset Security Uniformity - Same response for any email input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various types of email inputs
        fc.oneof(
          // Valid email formats
          fc.emailAddress(),
          // Invalid email formats
          fc.string().filter(s => !s.includes('@') || s.length > 50),
          // Empty/whitespace strings
          fc.oneof(fc.constant(''), fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { maxLength: 10 })),
          // Special characters and edge cases
          fc.stringOf(fc.constantFrom('@', '.', '-', '_', '+', '!', '#', '$', '%'), { maxLength: 30 }),
          // Very long strings
          fc.string({ minLength: 100, maxLength: 200 }),
          // Strings with HTML/script content
          fc.oneof(
            fc.constant('<script>alert("test")</script>'),
            fc.constant('user@domain.com<script>'),
            fc.constant('test@<img src=x onerror=alert(1)>.com')
          )
        ),
        async (emailInput) => {
          // Create fresh page instance for each test
          const forgotPasswordPage = new ForgotPasswordPage(mockAuthController as any);
          const pageElement = forgotPasswordPage.getElement();
          document.body.appendChild(pageElement);

          // Mock both success and failure scenarios
          const shouldAPISucceed = Math.random() > 0.5;
          
          if (shouldAPISucceed) {
            mockAuthController.requestPasswordReset.mockResolvedValueOnce({ success: true });
          } else {
            mockAuthController.requestPasswordReset.mockRejectedValueOnce(new Error('API Error'));
          }

          // Simulate form submission with the generated email
          const form = pageElement.querySelector('[data-forgot-password-form]') as HTMLFormElement;
          const emailField = pageElement.querySelector('#email') as HTMLInputElement;
          const submitButton = pageElement.querySelector('[data-submit-button]') as HTMLButtonElement;

          if (!form || !emailField || !submitButton) {
            throw new Error('Required form elements not found');
          }

          // Set the email value
          emailField.value = emailInput.trim();

          // Trigger form submission
          const formEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(formEvent);

          // Wait for async operations
          await new Promise(resolve => setTimeout(resolve, 100));

          // Verify uniform security response regardless of input
          const successMessage = pageElement.querySelector('[data-success-message]') as HTMLElement;
          const errorMessage = pageElement.querySelector('[data-error-message]') as HTMLElement;

          // Key security property: For valid email formats (even if non-existent),
          // the system should show success message for security
          const isValidEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());

          if (isValidEmailFormat) {
            // Valid email format should ALWAYS show success message (security requirement)
            if (successMessage && !successMessage.classList.contains('hidden')) {
              // Success message should contain generic language that doesn't reveal email existence
              const messageText = successMessage.textContent || '';
              const containsGenericLanguage = messageText.includes('If an account with that email exists');
              
              // Verify the message is appropriately vague for security
              if (!containsGenericLanguage) {
                throw new Error(`Success message should contain generic language for security. Got: "${messageText}"`);
              }
              
              // Verify button is disabled after submission (consistent behavior)
              if (!submitButton.disabled || submitButton.textContent !== 'Email Sent') {
                throw new Error('Submit button should be disabled and show "Email Sent" after submission');
              }
            } else {
              throw new Error('Valid email format should show success message for security uniformity');
            }
          } else {
            // Invalid email format should show validation error (not success message)
            const emailError = pageElement.querySelector('#email-error') as HTMLElement;
            
            if (emailInput.trim() === '') {
              // Empty email should show required field error
              if (!emailError || emailError.classList.contains('hidden')) {
                throw new Error('Empty email should show validation error');
              }
            } else if (!isValidEmailFormat && emailInput.trim() !== '') {
              // Invalid format should show format error
              if (!emailError || emailError.classList.contains('hidden')) {
                throw new Error('Invalid email format should show validation error');
              }
            }
          }

          // Critical security verification: No matter what happens (API success/failure),
          // the user experience should be consistent for valid emails
          if (isValidEmailFormat) {
            // Verify API was called if email format is valid
            if (mockAuthController.requestPasswordReset.mock.calls.length === 0) {
              throw new Error('API should be called for valid email formats');
            }
            
            // Verify the API was called with the trimmed email
            const apiCall = mockAuthController.requestPasswordReset.mock.calls[0];
            if (apiCall[0] !== emailInput.trim()) {
              throw new Error(`API should be called with trimmed email. Expected: "${emailInput.trim()}", Got: "${apiCall[0]}"`);
            }
          }

          // Cleanup
          document.body.removeChild(pageElement);
        }
      ),
      {
        // Run minimum 100 iterations as specified in design
        numRuns: 100,
        // Increase timeout for async operations
        timeout: 10000,
        // Custom error reporting
        errorWithCause: true,
      }
    );
  }, 15000); // Increase test timeout for 100 iterations

  /**
   * Supporting property: Response timing consistency
   * 
   * Verifies that response times are consistent regardless of email validity
   * to prevent timing-based enumeration attacks.
   */
  test('Response timing should be consistent regardless of email validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.emailAddress(), // Valid existing email
          fc.emailAddress().map(email => 'nonexistent.' + email), // Valid but non-existent email
        ),
        async ([existingEmail, nonExistentEmail]) => {
          const timings: number[] = [];
          
          // Test both email types
          for (const email of [existingEmail, nonExistentEmail]) {
            // Mock API to simulate different response scenarios
            if (email === existingEmail) {
              // Simulate existing user (but still return success for security)
              mockAuthController.requestPasswordReset.mockResolvedValueOnce({ success: true });
            } else {
              // Simulate non-existent user (but still return success for security)  
              mockAuthController.requestPasswordReset.mockResolvedValueOnce({ success: true });
            }

            const forgotPasswordPage = new ForgotPasswordPage(mockAuthController as any);
            const pageElement = forgotPasswordPage.getElement();
            document.body.appendChild(pageElement);

            const form = pageElement.querySelector('[data-forgot-password-form]') as HTMLFormElement;
            const emailField = pageElement.querySelector('#email') as HTMLInputElement;

            emailField.value = email;

            const startTime = performance.now();
            
            // Trigger form submission
            const formEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(formEvent);
            
            // Wait for completion
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const endTime = performance.now();
            timings.push(endTime - startTime);

            document.body.removeChild(pageElement);
          }

          // Verify timing difference is not significant (within 50ms tolerance)
          // This helps prevent timing-based email enumeration
          const timingDifference = Math.abs(timings[0] - timings[1]);
          if (timingDifference > 50) {
            throw new Error(`Timing difference too large: ${timingDifference}ms. This could enable email enumeration attacks.`);
          }
        }
      ),
      {
        numRuns: 50, // Fewer runs for timing test
        timeout: 8000,
      }
    );
  }, 12000);

  /**
   * Supporting property: Message content consistency
   * 
   * Verifies that the success message content is identical regardless
   * of the email's actual existence in the system.
   */
  test('Success message content should be identical for all valid email formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.emailAddress(), { minLength: 2, maxLength: 5 }),
        async (emailAddresses) => {
          const messageContents: string[] = [];
          
          for (const email of emailAddresses) {
            // Mock different API scenarios (some succeed, some fail)
            const shouldSucceed = Math.random() > 0.5;
            if (shouldSucceed) {
              mockAuthController.requestPasswordReset.mockResolvedValueOnce({ success: true });
            } else {
              mockAuthController.requestPasswordReset.mockRejectedValueOnce(new Error('Database error'));
            }

            const forgotPasswordPage = new ForgotPasswordPage(mockAuthController as any);
            const pageElement = forgotPasswordPage.getElement();
            document.body.appendChild(pageElement);

            const form = pageElement.querySelector('[data-forgot-password-form]') as HTMLFormElement;
            const emailField = pageElement.querySelector('#email') as HTMLInputElement;

            emailField.value = email;

            // Submit form
            const formEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(formEvent);
            
            await new Promise(resolve => setTimeout(resolve, 50));

            // Extract success message content
            const successMessage = pageElement.querySelector('[data-success-message]') as HTMLElement;
            if (successMessage && !successMessage.classList.contains('hidden')) {
              const messageText = successMessage.textContent?.trim() || '';
              messageContents.push(messageText);
            }

            document.body.removeChild(pageElement);
          }

          // Verify all messages are identical (security requirement)
          if (messageContents.length > 1) {
            const firstMessage = messageContents[0];
            const allIdentical = messageContents.every(msg => msg === firstMessage);
            
            if (!allIdentical) {
              throw new Error(`Success messages should be identical for security. Got different messages: ${JSON.stringify(messageContents)}`);
            }
            
            // Verify message doesn't leak information
            const hasGenericLanguage = firstMessage.includes('If an account with that email exists');
            if (!hasGenericLanguage) {
              throw new Error(`Message should use generic language. Got: "${firstMessage}"`);
            }
          }
        }
      ),
      {
        numRuns: 30,
        timeout: 6000,
      }
    );
  }, 10000);
});