/**
 * Landing Page
 * 
 * Public landing page for unauthenticated users.
 */

export class LandingPage {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.className = 'min-h-screen flex flex-col bg-white dark:bg-gray-900';
    this.element.innerHTML = `
      <!-- Header -->
      <header class="bg-white dark:bg-gray-800 shadow">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center py-6">
            <div class="flex items-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                StreetStudio
              </h1>
            </div>
            <nav class="flex space-x-4">
              <a href="/auth/login" class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                Sign In
              </a>
              <a href="/auth/register" class="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium">
                Get Started
              </a>
            </nav>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1">
        <!-- Hero Section -->
        <div class="relative bg-white dark:bg-gray-900 overflow-hidden">
          <div class="max-w-7xl mx-auto">
            <div class="relative z-10 pb-8 bg-white dark:bg-gray-900 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
              <main class="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
                <div class="sm:text-center lg:text-left">
                  <h1 class="text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
                    <span class="block xl:inline">Record, review, and</span>
                    <span class="block text-blue-600 xl:inline">collaborate</span>
                  </h1>
                  <p class="mt-3 text-base text-gray-500 dark:text-gray-400 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                    Professional video collaboration made simple. Capture your screen, get feedback from your team, and iterate faster than ever.
                  </p>
                  <div class="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                    <div class="rounded-md shadow">
                      <a href="/auth/register" class="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10">
                        Start Recording
                      </a>
                    </div>
                    <div class="mt-3 sm:mt-0 sm:ml-3">
                      <a href="#learn-more" class="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 md:py-4 md:text-lg md:px-10">
                        Learn More
                      </a>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>

        <!-- Features Section -->
        <div id="learn-more" class="py-12 bg-gray-50 dark:bg-gray-800">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="lg:text-center">
              <h2 class="text-base text-blue-600 font-semibold tracking-wide uppercase">Features</h2>
              <p class="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Everything you need for video collaboration
              </p>
            </div>

            <div class="mt-10">
              <div class="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <div class="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Screen Recording</h3>
                    <p class="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Capture your screen, window, or browser tab with high quality video and audio.
                    </p>
                  </div>
                </div>

                <div class="flex">
                  <div class="flex-shrink-0">
                    <div class="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Team Feedback</h3>
                    <p class="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Get timestamped comments, reactions, and feedback from your team in real-time.
                    </p>
                  </div>
                </div>

                <div class="flex">
                  <div class="flex-shrink-0">
                    <div class="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a1 1 0 01-1-1V9a1 1 0 011-1h1a2 2 0 100-4H4a1 1 0 01-1-1V4a1 1 0 011-1h3a1 1 0 011 1v1z"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Video Editing</h3>
                    <p class="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Trim, split, and edit your recordings with our built-in timeline editor.
                    </p>
                  </div>
                </div>

                <div class="flex">
                  <div class="flex-shrink-0">
                    <div class="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Secure & Private</h3>
                    <p class="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Your videos are encrypted and stored securely with enterprise-grade security.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Footer -->
      <footer class="bg-white dark:bg-gray-800">
        <div class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div class="text-center">
            <p class="text-gray-500 dark:text-gray-400 text-sm">
              © 2024 StreetStudio. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    `;
  }
}