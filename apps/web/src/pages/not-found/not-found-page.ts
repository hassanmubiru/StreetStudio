/**
 * 404 Not Found Page
 * 
 * Page displayed when route is not found.
 */

export class NotFoundPage {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8';
    this.element.innerHTML = `
      <div class="max-w-md w-full text-center">
        <div class="mb-8">
          <div class="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-4">
            404
          </div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Page not found
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or you entered the wrong URL.
          </p>
        </div>

        <!-- Actions -->
        <div class="space-y-3">
          <a 
            href="/dashboard" 
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 inline-block"
          >
            Go to Dashboard
          </a>
          <button 
            onclick="window.history.back()" 
            class="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white py-2 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Go Back
          </button>
        </div>

        <!-- Help -->
        <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Need help? Try these options:
          </p>
          <div class="space-y-1 text-sm">
            <a href="/" class="text-blue-600 hover:text-blue-500 block">
              • Go to Homepage
            </a>
            <a href="/search" class="text-blue-600 hover:text-blue-500 block">
              • Search for content
            </a>
            <a href="/settings" class="text-blue-600 hover:text-blue-500 block">
              • Check your settings
            </a>
          </div>
        </div>
      </div>
    `;
  }
}