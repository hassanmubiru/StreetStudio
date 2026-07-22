/**
 * Register Page Component
 * 
 * User registration page with form validation and error handling.
 */

import { AuthController } from '../../app/auth/auth-controller.js';

export class RegisterPage {
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

        <form class="mt-8 space-y-6" data-register-form>
          <div class="space-y-4">
            <div>
              <label for="displayName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Enter your display name"
              >
            </div>
            
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Enter your email address"
              >
            </div>

            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Create a password"
              >
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Confirm your password"
              >
            </div>

            <div class="flex items-center">
              <input
                id="agreeTerms"
                name="agreeTerms"
                type="checkbox"
                required
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
              >
              <label for="agreeTerms" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                I agree to the 
                <a href="/terms" class="text-blue-600 hover:text-blue-500">Terms of Service</a> 
                and 
                <a href="/privacy" class="text-blue-600 hover:text-blue-500">Privacy Policy</a>
              </label>
            </div>
          </div>

          <div class="error-message hidden" data-error-message>
            <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded">
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
              Create Account
            </button>
          </div>

          <div class="text-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?
              <a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
                Sign in
              </a>
            </span>
          </div>
        </form>
      </div>
    `;

    return container;
  }

  private setupEventListeners(): void {
    const form = this.element.querySelector('[data-register-form]') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleRegister();
    });
  }

  private async handleRegister(): Promise<void> {
    if (!this.authController) {
      console.error('AuthController not provided');
      return;
    }

    const form = this.element.querySelector('[data-register-form]') as HTMLFormElement;
    const submitButton = this.element.querySelector('[data-submit-button]') as HTMLButtonElement;
    const loadingSpinner = this.element.querySelector('[data-loading-spinner]') as HTMLElement;
    const errorMessage = this.element.querySelector('[data-error-message]') as HTMLElement;

    // Get form data
    const formData = new FormData(form);
    const displayName = formData.get('displayName') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const agreeTerms = formData.get('agreeTerms') as string;

    // Basic validation
    if (!displayName || !email || !password || !confirmPassword || !agreeTerms) {
      this.showError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      this.showError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      this.showError('Password must be at least 8 characters long');
      return;
    }

    // Show loading state
    this.showLoading(true);
    this.hideError();

    try {
      const result = await this.authController.register(email, password, displayName);

      if (result.success) {
        // Redirect to login with success message
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