/**
 * Forgot Password Page Component
 * 
 * Password reset request page with email validation and consistent confirmation message.
 * Requirements: 1.5 - Always show same confirmation regardless of email existence
 */

import { AuthController } from '../../app/auth/auth-controller.js';
import { logger } from '../../app/client-logger.js';

export class ForgotPasswordPage {
  private element: HTMLElement;
  private authController?: AuthController;

  constructor(authController?: AuthController) {
    this.authController = authController;
    this.element = this.createElement();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8';
    container.setAttribute('data-main-content', '');
    container.setAttribute('aria-label', 'Reset your password');

    container.innerHTML = `
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Reset your password
          </h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        <form class="mt-8 space-y-6" data-forgot-password-form>
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              aria-describedby="email-error"
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Enter your email address"
            >
            <div id="email-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
          </div>

          <div class="error-message hidden" data-error-message>
            <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded">
            </div>
          </div>

          <div class="success-message hidden" data-success-message>
            <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 px-4 py-3 rounded" role="alert">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L7.53 10.53a.75.75 0 00-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium">
                    If an account with that email exists, we've sent a password reset link. Please check your email and spam folder.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              data-submit-button
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="loading-spinner hidden absolute left-0 inset-y-0 flex items-center pl-3" data-loading-spinner>
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
              Send Reset Link
            </button>
          </div>

          <div class="text-center space-y-2">
            <a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
              Back to sign in
            </a>
            <br>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?
              <a href="/auth/register" class="font-medium text-blue-600 hover:text-blue-500">
                Sign up
              </a>
            </span>
          </div>
        </form>
      </div>
    `;

    return container;
  }

  private setupEventListeners(): void {
    const form = this.element.querySelector('[data-forgot-password-form]') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleForgotPassword();
    });

    // Real-time validation
    const emailInput = form.querySelector('#email') as HTMLInputElement;
    emailInput.addEventListener('blur', () => {
      this.validateEmail(emailInput);
    });

    emailInput.addEventListener('input', () => {
      this.clearFieldError(emailInput);
    });
  }

  private async handleForgotPassword(): Promise<void> {
    if (!this.authController) {
      console.error('AuthController not provided');
      return;
    }

    const form = this.element.querySelector('[data-forgot-password-form]') as HTMLFormElement;
    const emailInput = this.element.querySelector('#email') as HTMLInputElement;
    
    if (!form || !emailInput) {
      console.error('Form or email input not found');
      return;
    }
    
    const formData = new FormData(form);
    const email = (formData.get('email') as string)?.trim();

    // Validation
    if (!this.validateEmail(emailInput)) {
      return;
    }

    // Show loading state
    this.showLoading(true);
    this.hideError();
    this.hideSuccess();

    try {
      // Always call the API regardless of email validity (Requirement 1.5)
      const result = await this.authController.requestPasswordReset(email);

      // Always show the same success message (Requirement 1.5 - Security uniformity)
      this.showSuccess();
      
      // Disable form after submission
      const submitButton = this.element.querySelector('[data-submit-button]') as HTMLButtonElement;
      if (submitButton) {
        submitButton.textContent = 'Email Sent';
        submitButton.disabled = true;
      }

      logger.info('Password reset requested', { 
        email: email.substring(0, 3) + '***' // Log partial email for privacy
      });

    } catch (error) {
      logger.error('Password reset request error', {
        error: (error as Error).message,
      });
      
      // Still show success message for security (don't reveal if email exists)
      this.showSuccess();
      
      const submitButton = this.element.querySelector('[data-submit-button]') as HTMLButtonElement;
      if (submitButton) {
        submitButton.textContent = 'Email Sent';
        submitButton.disabled = true;
      }
    } finally {
      // Don't re-enable the button here - it should stay disabled after successful submission
      // this.showLoading(false);
    }
  }

  /**
   * Validate email field
   */
  private validateEmail(input: HTMLInputElement | null): boolean {
    if (!input) {
      return false;
    }
    
    const email = input.value.trim();
    
    if (!email) {
      this.showFieldError('email', 'Email address is required');
      return false;
    }
    
    if (!this.isValidEmail(email)) {
      this.showFieldError('email', 'Please enter a valid email address');
      return false;
    }
    
    this.clearFieldError(input);
    return true;
  }

  /**
   * Show field-specific error message
   */
  private showFieldError(fieldId: string, message: string): void {
    const input = this.element.querySelector(`#${fieldId}`) as HTMLInputElement;
    const errorElement = this.element.querySelector(`#${fieldId}-error`) as HTMLElement;
    
    if (input && errorElement) {
      input.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
      input.setAttribute('aria-invalid', 'true');
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    }
  }

  /**
   * Clear field-specific error message
   */
  private clearFieldError(input: HTMLInputElement): void {
    const errorElement = this.element.querySelector(`#${input.id}-error`) as HTMLElement;
    
    if (input && errorElement) {
      input.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
      input.removeAttribute('aria-invalid');
      errorElement.classList.add('hidden');
      errorElement.textContent = '';
    }
  }

  private showLoading(loading: boolean): void {
    const submitButton = this.element.querySelector('[data-submit-button]') as HTMLButtonElement;
    const loadingSpinner = this.element.querySelector('[data-loading-spinner]') as HTMLElement;

    if (loading) {
      if (submitButton) {
        submitButton.disabled = true;
      }
      if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
      }
    } else {
      if (submitButton) {
        submitButton.disabled = false;
      }
      if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
      }
    }
  }

  private showError(message: string): void {
    const errorMessage = this.element.querySelector('[data-error-message]') as HTMLElement;
    const errorContent = errorMessage.querySelector('div');
    
    if (errorContent) {
      errorContent.textContent = message;
    }
    
    errorMessage.classList.remove('hidden');
  }

  private hideError(): void {
    const errorMessage = this.element.querySelector('[data-error-message]') as HTMLElement;
    errorMessage.classList.add('hidden');
  }

  private showSuccess(): void {
    const successMessage = this.element.querySelector('[data-success-message]') as HTMLElement;
    successMessage.classList.remove('hidden');
  }

  private hideSuccess(): void {
    const successMessage = this.element.querySelector('[data-success-message]') as HTMLElement;
    successMessage.classList.add('hidden');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}