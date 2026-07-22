/**
 * StreetStudio Web Application Entry Point
 * 
 * Production SPA for video recording, reviewing, and collaboration.
 */

import { StreetStudioApp } from './app/app.js';
import { setupGlobalCSS } from './styles/global.js';
import { setupErrorHandling } from './app/error-handler.js';
import { setupAccessibility } from './app/accessibility.js';
import { initializeAnalytics } from './app/analytics.js';

// Setup global error handling
setupErrorHandling();

// Setup accessibility features
setupAccessibility();

// Setup global CSS and design system
await setupGlobalCSS();

// Initialize analytics (if enabled)
initializeAnalytics();

// Application configuration
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8080',
  environment: import.meta.env.MODE || 'development',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  enableDevTools: import.meta.env.MODE === 'development',
};

// Performance monitoring
const perfMark = performance.mark('app-init-start');

// Initialize application
async function initializeApp() {
  try {
    // Setup global CSS and design system
    await setupGlobalCSS();
    
    // Remove loading spinner
    const loadingElement = document.getElementById('loading');
    
    // Initialize StreetStudio app
    const app = new StreetStudioApp({
      container: document.getElementById('app')!,
      config,
    });

    // Start the application
    await app.initialize();
    
    // Hide loading screen with animation
    if (loadingElement) {
      loadingElement.style.opacity = '0';
      loadingElement.style.transition = 'opacity 300ms ease-out';
      
      setTimeout(() => {
        loadingElement.remove();
      }, 300);
    }
    
    // Performance measurement
    performance.mark('app-init-end');
    performance.measure('app-initialization', 'app-init-start', 'app-init-end');
    
    // Log initialization time in development
    if (config.enableDevTools) {
      const measure = performance.getEntriesByName('app-initialization')[0];
      console.log(`🚀 StreetStudio initialized in ${Math.round(measure.duration)}ms`);
    }
    
  } catch (error) {
    console.error('Failed to initialize StreetStudio:', error);
    
    // Show error state
    const appContainer = document.getElementById('app')!;
    appContainer.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="max-w-md w-full px-6">
          <div class="text-center">
            <div class="text-red-600 mb-4">
              <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z" />
              </svg>
            </div>
            <h1 class="text-xl font-semibold text-gray-900 mb-2">
              Failed to Load StreetStudio
            </h1>
            <p class="text-gray-600 mb-6">
              We encountered an error while starting the application. Please try refreshing the page.
            </p>
            <button 
              onclick="window.location.reload()" 
              class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Hot module replacement for development
if (import.meta.hot) {
  import.meta.hot.accept();
}