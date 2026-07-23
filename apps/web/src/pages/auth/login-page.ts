/**
 * Login Page
 * 
 * User authentication login form with email/password fields, remember me option,
 * and dynamic OAuth provider configuration.
 * Requirements: 1.1, 1.4, 1.6
 */

import type { AuthController } from '../../app/auth/auth-controller.js';
import { oauthConfigService, type OAuthProvider } from '../../services/oauth-config.js';
import { ssoConfigService, type SSOProvider } from '../../services/sso-config.js';
import { logger } from '../../app/client-logger.js';

export class LoginPage {
  private element: HTMLElement;
  private authController: AuthController;
  private oauthProviders: OAuthProvider[] = [];
  private ssoProviders: SSOProvider[] = [];
  private emailInput?: HTMLInputElement;

  constructor(authController: AuthController) {
    this.authController = authController;
    this.element = document.createElement('div');
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load OAuth providers
      this.oauthProviders = await oauthConfigService.getEnabledProviders();
      
      // Load SSO providers
      this.ssoProviders = await ssoConfigService.getEnabledProviders();
      
      logger.info('Auth providers loaded', {
        oauthCount: this.oauthProviders.length,
        ssoCount: this.ssoProviders.length,
      });
    } catch (error) {
      logger.warn('Failed to load auth providers', {
        error: (error as Error).message,
      });
    }
    
    this.render();
    this.attachEventListeners();
    this.checkForCallbackErrors();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    // Set up the container with proper accessibility
    this.element.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('aria-label', 'Sign in to StreetStudio');

    this.element.innerHTML = `
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            StreetStudio
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="space-y-6" novalidate>
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              aria-describedby="email-error"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white invalid:border-red-500 invalid:focus:border-red-500 invalid:focus:ring-red-500"
              placeholder="Enter your email"
            />
            <div id="email-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              aria-describedby="password-error"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your password"
            />
            <div id="password-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
              />
              <label for="remember-me" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                Remember me
              </label>
            </div>

            <div class="text-sm">
              <a href="/auth/forgot-password" class="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">
                Forgot your password?
              </a>
            </div>
          </div>

          <!-- Error Message -->
          <div id="error-message" class="hidden bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded relative" role="alert" aria-live="polite">
            <span id="error-text"></span>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            id="login-button"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span id="button-text">Sign in</span>
            <span id="loading-spinner" class="hidden ml-2">
              <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </span>
          </button>

          ${this.renderSSOSection()}
          ${this.renderOAuthSection()}

          <!-- Sign Up Link -->
          <div class="text-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?
              <a href="/auth/register" class="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">
                Sign up
              </a>
            </span>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Render SSO provider section dynamically
   */
  private renderSSOSection(): string {
    if (!this.ssoProviders || this.ssoProviders.length === 0) {
      return '';
    }

    const providerButtons = this.ssoProviders.map(provider => {
      const customStyle = provider.buttonColor 
        ? `style="background-color: ${provider.buttonColor}; color: ${provider.buttonTextColor || '#ffffff'}; border-color: ${provider.buttonColor};"` 
        : '';
      
      return `
        <button
          type="button"
          data-sso-provider="${provider.id}"
          class="w-full inline-flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            !provider.buttonColor 
              ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600' 
              : 'hover:opacity-90'
          }"
          ${customStyle}
          aria-label="Sign in with ${provider.displayName}"
        >
          <span class="sr-only">Sign in with ${provider.displayName}</span>
          ${provider.iconSvg ? `<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">${provider.iconSvg}</svg>` : ''}
          <span>${provider.displayName}</span>
        </button>
      `;
    }).join('');

    return `
      <!-- SSO Options -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">Sign in with your organization</span>
          </div>
        </div>

        <div class="mt-6 space-y-3">
          ${providerButtons}
        </div>
      </div>
    `;
  }

  /**
   * Render OAuth provider section dynamically
   */
  private renderOAuthSection(): string {
    if (!this.oauthProviders || this.oauthProviders.length === 0) {
      return '';
    }

    const providerButtons = this.oauthProviders.map(provider => {
      const customStyle = provider.buttonColor 
        ? `style="background-color: ${provider.buttonColor}; color: ${provider.buttonTextColor || '#ffffff'}; border-color: ${provider.buttonColor};"` 
        : '';
      
      return `
        <button
          type="button"
          data-oauth-provider="${provider.id}"
          class="w-full inline-flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            !provider.buttonColor 
              ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600' 
              : 'hover:opacity-90'
          }"
          ${customStyle}
          aria-label="Sign in with ${provider.displayName}"
        >
          <span class="sr-only">Sign in with ${provider.displayName}</span>
          ${provider.iconSvg ? `<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">${provider.iconSvg}</svg>` : ''}
          <span>${provider.displayName}</span>
        </button>
      `;
    }).join('');

    // Calculate grid columns based on number of providers
    const gridCols = this.oauthProviders.length === 1 ? 'grid-cols-1' : 
                    this.oauthProviders.length === 2 ? 'grid-cols-2' :
                    this.oauthProviders.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

    return `
      <!-- OAuth Options -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">Or continue with</span>
          </div>
        </div>

        <div class="mt-6 grid ${gridCols} gap-3">
          ${providerButtons}
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const form = this.element.querySelector('#login-form') as HTMLFormElement;
    const submitButton = this.element.querySelector('#login-button') as HTMLButtonElement;
    const errorMessage = this.element.querySelector('#error-message') as HTMLElement;
    const errorText = this.element.querySelector('#error-text') as HTMLElement;
    const buttonText = this.element.querySelector('#button-text') as HTMLElement;
    const loadingSpinner = this.element.querySelector('#loading-spinner') as HTMLElement;
    const emailInput = this.element.querySelector('#email') as HTMLInputElement;
    const passwordInput = this.element.querySelector('#password') as HTMLInputElement;

    // Store email input reference for SSO auto-redirect
    this.emailInput = emailInput;

    // Form submission handler with SSO auto-redirect check
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;

      // Client-side validation
      if (!this.validateForm(email, password)) {
        return;
      }

      // Show loading state
      submitButton.disabled = true;
      buttonText.textContent = 'Signing in...';
      loadingSpinner.classList.remove('hidden');
      errorMessage.classList.add('hidden');

      try {
        const result = await this.authController.login(email, password);

        if (result.success) {
          // Login successful - router will handle redirect
          logger.info('User login successful', { email });
          window.history.pushState({}, '', '/dashboard');
          window.dispatchEvent(new PopStateEvent('popstate'));
        } else {
          // Show generic error message (Requirement 1.3)
          errorText.textContent = 'Invalid credentials';
          errorMessage.classList.remove('hidden');
          
          // Clear password field for security (Requirement 1.3)
          passwordInput.value = '';
          passwordInput.focus();
        }
      } catch (error) {
        console.error('Login error:', error);
        errorText.textContent = 'An unexpected error occurred. Please try again.';
        errorMessage.classList.remove('hidden');
        
        // Clear password field on any error
        passwordInput.value = '';
      } finally {
        // Reset button state
        submitButton.disabled = false;
        buttonText.textContent = 'Sign in';
        loadingSpinner.classList.add('hidden');
      }
    });

    // OAuth provider handlers
    const oauthButtons = this.element.querySelectorAll('[data-oauth-provider]');
    oauthButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const providerId = (event.currentTarget as HTMLElement).getAttribute('data-oauth-provider');
        if (providerId) {
          await this.handleOAuthLogin(providerId, button as HTMLButtonElement);
        }
      });
    });

    // Clear error on input
    const inputs = [emailInput, passwordInput];
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        errorMessage.classList.add('hidden');
        this.clearFieldError(input);
      });

      // Real-time validation
      input.addEventListener('blur', () => {
        this.validateField(input);
      });
    });

    // Handle URL parameters (e.g., from registration success)
    this.handleUrlParameters();
  }

  /**
   * Validate form inputs
   */
  private validateForm(email: string, password: string): boolean {
    let isValid = true;

    // Email validation
    if (!email) {
      this.showFieldError('email', 'Email address is required');
      isValid = false;
    } else if (!this.isValidEmail(email)) {
      this.showFieldError('email', 'Please enter a valid email address');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#email') as HTMLInputElement);
    }

    // Password validation
    if (!password) {
      this.showFieldError('password', 'Password is required');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#password') as HTMLInputElement);
    }

    return isValid;
  }

  /**
   * Validate individual field
   */
  private validateField(input: HTMLInputElement): void {
    const value = input.value.trim();
    
    switch (input.id) {
      case 'email':
        if (!value) {
          this.showFieldError('email', 'Email address is required');
        } else if (!this.isValidEmail(value)) {
          this.showFieldError('email', 'Please enter a valid email address');
        } else {
          this.clearFieldError(input);
        }
        break;
      case 'password':
        if (!value) {
          this.showFieldError('password', 'Password is required');
        } else {
          this.clearFieldError(input);
        }
        break;
    }
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

  /**
   * Handle OAuth login
   */
  private async handleOAuthLogin(providerId: string, button: HTMLButtonElement): Promise<void> {
    try {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Connecting...';

      await oauthConfigService.initiateOAuth(providerId);

    } catch (error) {
      logger.error('OAuth login failed', {
        provider: providerId,
        error: (error as Error).message,
      });

      const errorText = this.element.querySelector('#error-text') as HTMLElement;
      const errorMessage = this.element.querySelector('#error-message') as HTMLElement;
      
      errorText.textContent = `Failed to connect with ${providerId}. Please try again.`;
      errorMessage.classList.remove('hidden');

      // Reset button
      button.disabled = false;
      button.textContent = button.querySelector('span:not(.sr-only)')?.textContent || providerId;
    }
  }

  /**
   * Handle URL parameters
   */
  private handleUrlParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Show registration success message
    if (urlParams.get('registered') === 'true') {
      const successMessage = document.createElement('div');
      successMessage.className = 'mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded';
      successMessage.setAttribute('role', 'alert');
      successMessage.innerHTML = 'Registration successful! Please check your email to verify your account, then sign in.';
      
      const form = this.element.querySelector('#login-form');
      if (form) {
        form.insertBefore(successMessage, form.firstChild);
      }
    }

    // Show password reset success message
    if (urlParams.get('password-reset') === 'true') {
      const successMessage = document.createElement('div');
      successMessage.className = 'mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded';
      successMessage.setAttribute('role', 'alert');
      successMessage.innerHTML = 'Password updated successfully! You can now sign in with your new password.';
      
      const form = this.element.querySelector('#login-form');
      if (form) {
        form.insertBefore(successMessage, form.firstChild);
      }
    }

    // Focus email input
    const emailInput = this.element.querySelector('#email') as HTMLInputElement;
    if (emailInput) {
      emailInput.focus();
    }
  }

  /**
   * Email validation helper
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}