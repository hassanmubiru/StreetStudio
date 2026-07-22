/**
 * Register Page Component
 * 
 * User registration page with email, password, confirm password, and terms acceptance.
 * Includes comprehensive form validation and error handling.
 * Requirements: 1.1, 1.4
 */

import { AuthController } from '../../app/auth/auth-controller.js';
import { oauthConfigService, type OAuthProvider } from '../../services/oauth-config.js';
import { logger } from '../../app/client-logger.js';

export class RegisterPage {
  private element: HTMLElement;
  private authController?: AuthController;
  private oauthProviders: OAuthProvider[] = [];

  constructor(authController?: AuthController) {
    this.authController = authController;
    this.element = this.createElement();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load OAuth providers
      this.oauthProviders = await oauthConfigService.getEnabledProviders();
      
      // Re-render to include OAuth providers
      this.element = this.createElement();
    } catch (error) {
      logger.warn('Failed to load OAuth providers for registration', {
        error: (error as Error).message,
      });
    }
    
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8';
    container.setAttribute('data-main-content', '');
    container.setAttribute('aria-label', 'Sign up for StreetStudio');

    container.innerHTML = `
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Create your account
          </h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Join StreetStudio to start recording and collaborating
          </p>
        </div>

        <form class="mt-8 space-y-6" data-register-form novalidate>
          <div class="space-y-4">
            <div>
              <label for="displayName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Name *
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                aria-describedby="displayName-error"
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Enter your display name"
              >
              <div id="displayName-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
            </div>
            
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address *
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

            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                aria-describedby="password-error password-help"
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Create a password"
              >
              <div id="password-help" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Password must be at least 8 characters long
              </div>
              <div id="password-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                aria-describedby="confirmPassword-error"
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Confirm your password"
              >
              <div id="confirmPassword-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" role="alert"></div>
            </div>

            <div class="flex items-start">
              <input
                id="agreeTerms"
                name="agreeTerms"
                type="checkbox"
                required
                aria-describedby="agreeTerms-error"
                class="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
              >
              <label for="agreeTerms" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                I agree to the 
                <a href="/terms" target="_blank" class="text-blue-600 hover:text-blue-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">Terms of Service</a> 
                and 
                <a href="/privacy" target="_blank" class="text-blue-600 hover:text-blue-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">Privacy Policy</a> *
              </label>
              <div id="agreeTerms-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1 ml-6" role="alert"></div>
            </div>
          </div>

          <div class="error-message hidden" data-error-message>
            <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded" role="alert" aria-live="polite">
            </div>
          </div>

          <div>
            <button
              type="submit"
              data-submit-button
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span class="loading-spinner hidden absolute left-0 inset-y-0 flex items-center pl-3" data-loading-spinner>
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
              Create Account
            </button>
          </div>

          ${this.renderOAuthSection()}

          <div class="text-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?
              <a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">
                Sign in
              </a>
            </span>
          </div>
        </form>
      </div>
    `;

    return container;
  }

  /**
   * Render OAuth provider section for registration
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
          aria-label="Sign up with ${provider.displayName}"
        >
          <span class="sr-only">Sign up with ${provider.displayName}</span>
          ${provider.iconSvg ? `<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">${provider.iconSvg}</svg>` : ''}
          <span>Sign up with ${provider.displayName}</span>
        </button>
      `;
    }).join('');

    // Calculate grid columns based on number of providers
    const gridCols = this.oauthProviders.length === 1 ? 'grid-cols-1' : 'grid-cols-1';

    return `
      <!-- OAuth Registration Options -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">Or sign up with</span>
          </div>
        </div>

        <div class="mt-6 grid ${gridCols} gap-3">
          ${providerButtons}
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const form = this.element.querySelector('[data-register-form]') as HTMLFormElement;
    if (!form) return;

    // Form submission handler
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleRegister();
    });

    // Real-time validation for all inputs
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        this.validateField(input as HTMLInputElement);
      });

      input.addEventListener('input', () => {
        this.clearFieldError(input as HTMLInputElement);
      });
    });

    // Terms checkbox validation
    const termsCheckbox = form.querySelector('#agreeTerms') as HTMLInputElement;
    termsCheckbox.addEventListener('change', () => {
      this.validateField(termsCheckbox);
    });

    // OAuth provider handlers
    const oauthButtons = this.element.querySelectorAll('[data-oauth-provider]');
    oauthButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const providerId = (event.currentTarget as HTMLElement).getAttribute('data-oauth-provider');
        if (providerId) {
          await this.handleOAuthRegistration(providerId, button as HTMLButtonElement);
        }
      });
    });
  }

  private async handleRegister(): Promise<void> {
    if (!this.authController) {
      console.error('AuthController not provided');
      return;
    }

    const form = this.element.querySelector('[data-register-form]') as HTMLFormElement;
    const formData = new FormData(form);
    const displayName = (formData.get('displayName') as string)?.trim();
    const email = (formData.get('email') as string)?.trim();
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const agreeTerms = formData.get('agreeTerms') as string;

    // Comprehensive validation
    if (!this.validateRegistrationForm(displayName, email, password, confirmPassword, agreeTerms)) {
      return;
    }

    // Show loading state
    this.showLoading(true);
    this.hideError();

    try {
      const result = await this.authController.register(email, password, displayName);

      if (result.success) {
        // Redirect to login with success message
        logger.info('User registration successful', { email, displayName });
        window.location.href = '/auth/login?registered=true';
      } else {
        this.showError(result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.showError('An unexpected error occurred. Please try again.');
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Comprehensive form validation
   */
  private validateRegistrationForm(
    displayName: string, 
    email: string, 
    password: string, 
    confirmPassword: string, 
    agreeTerms: string
  ): boolean {
    let isValid = true;

    // Display name validation
    if (!displayName) {
      this.showFieldError('displayName', 'Display name is required');
      isValid = false;
    } else if (displayName.length < 2) {
      this.showFieldError('displayName', 'Display name must be at least 2 characters long');
      isValid = false;
    } else if (displayName.length > 50) {
      this.showFieldError('displayName', 'Display name must be less than 50 characters');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#displayName') as HTMLInputElement);
    }

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
    } else if (password.length < 8) {
      this.showFieldError('password', 'Password must be at least 8 characters long');
      isValid = false;
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      this.showFieldError('password', 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#password') as HTMLInputElement);
    }

    // Confirm password validation
    if (!confirmPassword) {
      this.showFieldError('confirmPassword', 'Please confirm your password');
      isValid = false;
    } else if (password !== confirmPassword) {
      this.showFieldError('confirmPassword', 'Passwords do not match');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#confirmPassword') as HTMLInputElement);
    }

    // Terms agreement validation
    if (!agreeTerms) {
      this.showFieldError('agreeTerms', 'You must agree to the Terms of Service and Privacy Policy');
      isValid = false;
    } else {
      this.clearFieldError(this.element.querySelector('#agreeTerms') as HTMLInputElement);
    }

    return isValid;
  }

  /**
   * Validate individual field
   */
  private validateField(input: HTMLInputElement): void {
    const value = input.value.trim();
    
    switch (input.id) {
      case 'displayName':
        if (!value) {
          this.showFieldError('displayName', 'Display name is required');
        } else if (value.length < 2) {
          this.showFieldError('displayName', 'Display name must be at least 2 characters long');
        } else if (value.length > 50) {
          this.showFieldError('displayName', 'Display name must be less than 50 characters');
        } else {
          this.clearFieldError(input);
        }
        break;
        
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
        } else if (value.length < 8) {
          this.showFieldError('password', 'Password must be at least 8 characters long');
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
          this.showFieldError('password', 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
        } else {
          this.clearFieldError(input);
          // Also validate confirm password if it has a value
          const confirmInput = this.element.querySelector('#confirmPassword') as HTMLInputElement;
          if (confirmInput.value) {
            this.validateField(confirmInput);
          }
        }
        break;
        
      case 'confirmPassword':
        const passwordInput = this.element.querySelector('#password') as HTMLInputElement;
        if (!value) {
          this.showFieldError('confirmPassword', 'Please confirm your password');
        } else if (passwordInput.value !== value) {
          this.showFieldError('confirmPassword', 'Passwords do not match');
        } else {
          this.clearFieldError(input);
        }
        break;
        
      case 'agreeTerms':
        if (!input.checked) {
          this.showFieldError('agreeTerms', 'You must agree to the Terms of Service and Privacy Policy');
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
   * Handle OAuth registration
   */
  private async handleOAuthRegistration(providerId: string, button: HTMLButtonElement): Promise<void> {
    try {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Connecting...';

      await oauthConfigService.initiateOAuth(providerId);

    } catch (error) {
      logger.error('OAuth registration failed', {
        provider: providerId,
        error: (error as Error).message,
      });

      this.showError(`Failed to connect with ${providerId}. Please try again.`);

      // Reset button
      button.disabled = false;
      button.textContent = button.querySelector('span:not(.sr-only)')?.textContent || `Sign up with ${providerId}`;
    }
  }

  /**
   * Email validation helper
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private showLoading(loading: boolean): void {
    const submitButton = this.element.querySelector('[data-submit-button]') as HTMLButtonElement;
    const loadingSpinner = this.element.querySelector('[data-loading-spinner]') as HTMLElement;

    if (loading) {
      submitButton.disabled = true;
      loadingSpinner.classList.remove('hidden');
    } else {
      submitButton.disabled = false;
      loadingSpinner.classList.add('hidden');
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
}