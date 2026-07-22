/**
 * Reset Password Page Component
 * 
 * Password reset completion page with token validation.
 */

export class ResetPasswordPage {
  private element: HTMLElement;
  private resetToken: string | null = null;

  constructor() {
    // Get reset token from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.resetToken = urlParams.get('token');
    
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
    container.setAttribute('aria-label', 'Set new password');

    // Check if token is present
    if (!this.resetToken) {
      container.innerHTML = this.createInvalidTokenContent();
    } else {
      container.innerHTML = this.createResetFormContent();
    }

    return container;
  }

  private createInvalidTokenContent(): string {
    return `
      <div class="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Invalid Reset Link
          </h1>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
            This password reset link is invalid or has expired.
          </p>
        </div>

        <div class="space-y-4">
          <a
            href="/auth/forgot-password"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 inline-block text-center"
          >
            Request New Reset Link
          </a>
          
          <a
            href="/auth/login"
            class="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white py-2 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 inline-block text-center"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    `;
  }

  private createResetFormContent(): string {
    return `
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Set new password
          </h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your new password below
          </p>
        </div>

        <form class="mt-8 space-y-6" data-reset-password-form>
          <div class="space-y-4">
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Enter new password"
              >
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Password must be at least 8 characters long
              </p>
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Confirm new password"
              >
            </div>
          </div>

          <div class="error-message hidden" data-error-message>
            <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded">
            </div>
          </div>

          <div class="success-message hidden" data-success-message>
            <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 px-4 py-3 rounded">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium">
                    Password successfully updated! You can now sign in with your new password.
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
              Update Password
            </button>
          </div>

          <div class="text-center">
            <a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
              Back to sign in
            </a>
          </div>
        </form>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const form = this.element.querySelector('[data-reset-password-form]') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleResetPassword();
    });
  }

  private async handleResetPassword(): Promise<void> {
    const form = this.element.querySelector('[data-reset-password-form]') as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // Basic validation
    if (!password || !confirmPassword) {
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
      // TODO: Implement actual password reset with token
      // For now, simulate success
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      this.showSuccess();
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        window.location.href = '/auth/login?password-reset=true';
      }, 3000);

    } catch (error) {
      console.error('Password reset error:', error);
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
      loadingSpinner?.classList.remove('hidden');
    } else {
      submitButton.disabled = false;
      loadingSpinner?.classList.add('hidden');
    }
  }

  private showError(message: string): void {
    const errorMessage = this.element.querySelector('[data-error-message]') as HTMLElement;
    const errorContent = errorMessage?.querySelector('div');
    
    if (errorContent) {
      errorContent.textContent = message;
    }
    
    errorMessage?.classList.remove('hidden');
  }

  private hideError(): void {
    const errorMessage = this.element.querySelector('[data-error-message]') as HTMLElement;
    errorMessage?.classList.add('hidden');
  }

  private showSuccess(): void {
    const successMessage = this.element.querySelector('[data-success-message]') as HTMLElement;
    successMessage?.classList.remove('hidden');
  }
}