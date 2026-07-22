/**
 * Accessibility Setup
 * 
 * Configures accessibility features for the StreetStudio application.
 */

import { announceToScreenReader, createBreakpointObserver, checkMediaQuery, mediaQueries } from '@streetstudio/ui';

export function setupAccessibility(): void {
  // Setup focus management
  setupFocusManagement();
  
  // Setup reduced motion preferences
  setupReducedMotion();
  
  // Setup high contrast support
  setupHighContrast();
  
  // Setup keyboard navigation
  setupKeyboardNavigation();
  
  // Setup screen reader support
  setupScreenReaderSupport();
  
  // Setup responsive accessibility
  setupResponsiveAccessibility();
}

function setupFocusManagement(): void {
  // Track focus for better keyboard navigation
  let isKeyboardUser = false;
  
  // Detect keyboard usage
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      isKeyboardUser = true;
      document.body.classList.add('keyboard-user');
    }
  });
  
  // Reset on mouse usage
  document.addEventListener('mousedown', () => {
    isKeyboardUser = false;
    document.body.classList.remove('keyboard-user');
  });
  
  // Focus visible polyfill for older browsers
  if (!CSS.supports('selector(:focus-visible)')) {
    document.body.classList.add('focus-visible-polyfill');
  }
}

function setupReducedMotion(): void {
  // Apply reduced motion preferences
  const prefersReducedMotion = checkMediaQuery(mediaQueries.prefersReducedMotion);
  
  if (prefersReducedMotion) {
    document.body.classList.add('reduce-motion');
    
    // Disable CSS animations
    const style = document.createElement('style');
    style.textContent = `
      .reduce-motion *,
      .reduce-motion *::before,
      .reduce-motion *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Listen for changes
  const mediaQuery = window.matchMedia(mediaQueries.prefersReducedMotion);
  mediaQuery.addEventListener('change', (event) => {
    if (event.matches) {
      document.body.classList.add('reduce-motion');
      announceToScreenReader('Reduced motion enabled');
    } else {
      document.body.classList.remove('reduce-motion');
      announceToScreenReader('Reduced motion disabled');
    }
  });
}

function setupHighContrast(): void {
  // Apply high contrast preferences
  const prefersHighContrast = checkMediaQuery(mediaQueries.prefersHighContrast);
  
  if (prefersHighContrast) {
    document.body.classList.add('high-contrast');
  }
  
  // Listen for changes
  const mediaQuery = window.matchMedia(mediaQueries.prefersHighContrast);
  mediaQuery.addEventListener('change', (event) => {
    if (event.matches) {
      document.body.classList.add('high-contrast');
      announceToScreenReader('High contrast enabled');
    } else {
      document.body.classList.remove('high-contrast');
      announceToScreenReader('High contrast disabled');
    }
  });
}

function setupKeyboardNavigation(): void {
  // Skip links for main navigation
  const skipLinks = document.createElement('div');
  skipLinks.className = 'skip-links';
  skipLinks.innerHTML = `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <a href="#navigation" class="skip-link">Skip to navigation</a>
    <a href="#search" class="skip-link">Skip to search</a>
  `;
  
  // Insert at beginning of body
  document.body.insertBefore(skipLinks, document.body.firstChild);
  
  // Add skip link styles
  const skipLinkStyles = document.createElement('style');
  skipLinkStyles.textContent = `
    .skip-links {
      position: absolute;
      top: -100px;
      left: 0;
      z-index: 1000;
    }
    
    .skip-link {
      position: absolute;
      top: 0;
      left: 0;
      padding: 8px 16px;
      background: #000;
      color: #fff;
      text-decoration: none;
      border-radius: 0 0 4px 0;
      transform: translateY(-100%);
      transition: transform 0.2s ease;
    }
    
    .skip-link:focus {
      transform: translateY(0);
    }
    
    .reduce-motion .skip-link {
      transition: none;
    }
  `;
  document.head.appendChild(skipLinkStyles);
  
  // Handle Escape key globally
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // Close any open modals, dropdowns, etc.
      const openModal = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (openModal) {
        const closeButton = openModal.querySelector('[aria-label="Close"], [aria-label*="close" i]');
        if (closeButton instanceof HTMLElement) {
          closeButton.click();
        }
      }
      
      // Close any open dropdowns
      const openDropdowns = document.querySelectorAll('[aria-expanded="true"]');
      openDropdowns.forEach(dropdown => {
        if (dropdown instanceof HTMLElement) {
          dropdown.setAttribute('aria-expanded', 'false');
          dropdown.click(); // Trigger close
        }
      });
    }
  });
}

function setupScreenReaderSupport(): void {
  // Create live regions for announcements
  const politeRegion = document.createElement('div');
  politeRegion.id = 'polite-announcements';
  politeRegion.setAttribute('aria-live', 'polite');
  politeRegion.setAttribute('aria-atomic', 'true');
  politeRegion.className = 'sr-only';
  document.body.appendChild(politeRegion);
  
  const assertiveRegion = document.createElement('div');
  assertiveRegion.id = 'assertive-announcements';
  assertiveRegion.setAttribute('aria-live', 'assertive');
  assertiveRegion.setAttribute('aria-atomic', 'true');
  assertiveRegion.className = 'sr-only';
  document.body.appendChild(assertiveRegion);
  
  // Setup page change announcements
  let lastPath = window.location.pathname;
  
  const announcePageChange = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      
      // Get page title for announcement
      const title = document.title || 'Page';
      announceToScreenReader(`Navigated to ${title}`);
    }
  };
  
  // Listen for navigation changes
  window.addEventListener('popstate', announcePageChange);
  
  // Listen for programmatic navigation (for SPA routing)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(announcePageChange, 100);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(announcePageChange, 100);
  };
}

function setupResponsiveAccessibility(): void {
  // Adjust touch targets on mobile
  const updateTouchTargets = (isMobile: boolean) => {
    if (isMobile) {
      document.body.classList.add('mobile-touch-targets');
    } else {
      document.body.classList.remove('mobile-touch-targets');
    }
  };
  
  // Initial check
  updateTouchTargets(window.innerWidth < 768);
  
  // Listen for viewport changes
  createBreakpointObserver('768px', (matches) => {
    updateTouchTargets(!matches); // matches = desktop, !matches = mobile
  });
  
  // Add mobile touch target styles
  const touchTargetStyles = document.createElement('style');
  touchTargetStyles.textContent = `
    .mobile-touch-targets button,
    .mobile-touch-targets [role="button"],
    .mobile-touch-targets input,
    .mobile-touch-targets select,
    .mobile-touch-targets textarea,
    .mobile-touch-targets a {
      min-height: 44px;
      min-width: 44px;
    }
    
    .mobile-touch-targets .touch-target-small {
      min-height: 32px;
      min-width: 32px;
    }
  `;
  document.head.appendChild(touchTargetStyles);
}

// Utility function to announce route changes
export function announceRouteChange(routeName: string): void {
  announceToScreenReader(`Navigated to ${routeName}`);
}

// Utility function to announce loading states
export function announceLoading(message = 'Loading'): void {
  announceToScreenReader(message);
}

// Utility function to announce completion
export function announceComplete(message = 'Complete'): void {
  announceToScreenReader(message);
}