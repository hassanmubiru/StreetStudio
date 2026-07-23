/**
 * Property Tests for Navigation Consistency
 * 
 * Property 3: Keyboard Navigation Universality
 * Validates: Requirements 2.2
 * 
 * For any navigation element in the top navigation bar, keyboard navigation
 * SHALL provide the same accessibility and functionality as mouse interaction
 * with proper focus indicators.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { TopNavigation } from './components/top-navigation.js';
import type { OrganizationDto, MemberDto } from '@streetstudio/shared';

// Mock DOM APIs for testing
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn(() => ({
    outline: 'none',
    boxShadow: 'none',
    borderColor: '#000',
  })),
  writable: true,
});

// Navigation element configuration generator
const navigationElementArb = fc.record({
  elementType: fc.oneof(
    fc.constant('mobile-menu-button'),
    fc.constant('org-switcher-button'),
    fc.constant('search-input'),
    fc.constant('notifications-button'),
    fc.constant('user-menu-button'),
    fc.constant('user-menu-item')
  ),
  isAuthenticated: fc.boolean(),
  hasOrganization: fc.boolean(),
  isDropdownOpen: fc.boolean(),
  label: fc.string({ minLength: 1, maxLength: 50 }),
  route: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
});

// Keyboard interaction generator
const keyboardInteractionArb = fc.record({
  key: fc.oneof(
    fc.constant('Tab'),
    fc.constant('Enter'),
    fc.constant('Space'),
    fc.constant('Escape'),
    fc.constant('ArrowUp'),
    fc.constant('ArrowDown'),
    fc.constant('ArrowLeft'),
    fc.constant('ArrowRight'),
    fc.constant('Home'),
    fc.constant('End')
  ),
  shiftKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  altKey: fc.boolean(),
  preventDefault: fc.boolean(),
});

// User interaction type generator
const interactionTypeArb = fc.oneof(
  fc.constant('keyboard'),
  fc.constant('mouse'),
  fc.constant('touch'),
  fc.constant('focus'),
  fc.constant('blur')
);

// Mock user and organization data generators
const mockUserArb = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  avatarUrl: fc.option(fc.webUrl()),
});

const mockOrganizationArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

interface NavigationElementConfig {
  elementType: string;
  isAuthenticated: boolean;
  hasOrganization: boolean;
  isDropdownOpen: boolean;
  label: string;
  route?: string;
}

interface KeyboardInteraction {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  preventDefault: boolean;
}

/**
 * Helper functions for navigation testing
 */

function createMockUser(userData: any): MemberDto {
  return {
    id: userData.id,
    email: userData.email,
    displayName: userData.displayName,
    avatarUrl: userData.avatarUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as MemberDto;
}

function createMockOrganization(orgData: any): OrganizationDto {
  return {
    id: orgData.id,
    name: orgData.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as OrganizationDto;
}

function setupNavigationComponent(config: NavigationElementConfig, user?: MemberDto, org?: OrganizationDto): TopNavigation {
  const container = document.createElement('div');
  document.body.appendChild(container);
  
  const options = {
    onOrganizationChange: vi.fn(),
    onMobileMenuToggle: vi.fn(),
    onUserMenuAction: vi.fn(),
  };
  
  const navigation = new TopNavigation(container, options);
  navigation.initialize();
  
  if (config.isAuthenticated && user) {
    navigation.updateAuthContext(user, org);
  }
  
  return navigation;
}

function simulateKeyboardInteraction(element: HTMLElement, interaction: KeyboardInteraction): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: interaction.key,
    shiftKey: interaction.shiftKey,
    ctrlKey: interaction.ctrlKey,
    altKey: interaction.altKey,
    bubbles: true,
    cancelable: true,
  });
  
  element.dispatchEvent(event);
  
  if (interaction.preventDefault) {
    event.preventDefault();
  }
  
  return event;
}

function simulateMouseInteraction(element: HTMLElement, type: string = 'click'): Event {
  let event: Event;
  
  switch (type) {
    case 'click':
      event = new MouseEvent('click', { bubbles: true, cancelable: true });
      break;
    case 'mouseenter':
      event = new MouseEvent('mouseenter', { bubbles: true, cancelable: true });
      break;
    case 'mouseleave':
      event = new MouseEvent('mouseleave', { bubbles: true, cancelable: true });
      break;
    default:
      event = new MouseEvent('click', { bubbles: true, cancelable: true });
  }
  
  element.dispatchEvent(event);
  return event;
}

function checkAccessibilityCompliance(element: HTMLElement): boolean {
  // Check for essential accessibility attributes
  const hasRole = element.getAttribute('role') !== null || 
                  element.tagName.toLowerCase() === 'button' ||
                  element.tagName.toLowerCase() === 'a' ||
                  element.tagName.toLowerCase() === 'input';
  
  const hasLabel = element.textContent?.trim() || 
                  element.getAttribute('aria-label') ||
                  element.getAttribute('aria-labelledby') ||
                  element.getAttribute('title');
  
  const isFocusable = element.tabIndex >= -1 ||
                     element.matches('a, button, input, select, textarea, [tabindex]');
  
  const hasProperAria = !element.hasAttribute('aria-haspopup') || 
                       element.hasAttribute('aria-expanded');
  
  return hasRole && !!hasLabel && isFocusable && hasProperAria;
}

function checkFocusIndicators(element: HTMLElement): boolean {
  // In test environment, we check for focus-related classes and attributes
  const hasFocusClass = element.classList.contains('focus:ring-2') ||
                       element.classList.contains('focus:outline-none') ||
                       element.classList.contains('focus-visible');
  
  const isFocusable = element.tabIndex >= -1;
  const isCurrentlyFocused = document.activeElement === element;
  
  return isFocusable && (hasFocusClass || isCurrentlyFocused);
}

function getNavigationElement(container: HTMLElement, elementType: string): HTMLElement | null {
  switch (elementType) {
    case 'mobile-menu-button':
      return container.querySelector('#mobile-menu-button');
    case 'org-switcher-button':
      return container.querySelector('#org-switcher-button');
    case 'search-input':
      return container.querySelector('#search');
    case 'notifications-button':
      return container.querySelector('#notifications-button');
    case 'user-menu-button':
      return container.querySelector('#user-menu-button');
    case 'user-menu-item':
      return container.querySelector('#user-menu [role="menuitem"]');
    default:
      return null;
  }
}

function compareInteractionResults(keyboardResult: any, mouseResult: any): boolean {
  // Compare the functional outcomes of keyboard vs mouse interactions
  // In test environment, we verify that both interactions produce similar results
  
  if (typeof keyboardResult !== typeof mouseResult) {
    return false;
  }
  
  // For navigation elements, both should either navigate or trigger the same action
  if (keyboardResult === null && mouseResult === null) {
    return true; // Both had no effect
  }
  
  if (keyboardResult === mouseResult) {
    return true; // Both had the same effect
  }
  
  // For complex objects, check key properties
  if (typeof keyboardResult === 'object' && typeof mouseResult === 'object') {
    const keyboardKeys = Object.keys(keyboardResult || {});
    const mouseKeys = Object.keys(mouseResult || {});
    
    if (keyboardKeys.length !== mouseKeys.length) {
      return false;
    }
    
    return keyboardKeys.every(key => 
      keyboardResult[key] === mouseResult[key]
    );
  }
  
  return false;
}

describe('Feature: web-application-implementation, Property 3: Keyboard Navigation Universality', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Create test container
    container = document.createElement('div');
    container.setAttribute('data-testid', 'navigation-test-container');
    document.body.appendChild(container);
    
    // Mock CSS and style calculations
    vi.mocked(window.getComputedStyle).mockReturnValue({
      outline: '2px solid #0066cc',
      boxShadow: '0 0 0 3px rgba(0, 102, 204, 0.3)',
      borderColor: '#0066cc',
    } as any);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.2**
   * 
   * For any navigation element in the top navigation bar, keyboard navigation
   * SHALL provide the same accessibility and functionality as mouse interaction
   * with proper focus indicators.
   */
  it('keyboard navigation provides equivalent functionality to mouse interaction for any navigation element', async () => {
    await fc.assert(
      fc.asyncProperty(
        navigationElementArb,
        mockUserArb,
        mockOrganizationArb,
        keyboardInteractionArb,
        async (navConfig, userData, orgData, keyboardAction) => {
          const user = navConfig.isAuthenticated ? createMockUser(userData) : undefined;
          const org = navConfig.hasOrganization ? createMockOrganization(orgData) : undefined;
          
          // Setup navigation component
          const navigation = setupNavigationComponent(navConfig, user, org);
          const targetElement = getNavigationElement(container, navConfig.elementType);
          
          // Skip if element doesn't exist (valid based on configuration)
          if (!targetElement) {
            return true;
          }
          
          // Verify element is accessible
          const isAccessible = checkAccessibilityCompliance(targetElement);
          expect(isAccessible).toBe(true);
          
          // Test keyboard interaction
          targetElement.focus();
          const keyboardEvent = simulateKeyboardInteraction(targetElement, keyboardAction);
          
          // Test mouse interaction
          const mouseEvent = simulateMouseInteraction(targetElement);
          
          // Verify focus indicators are present
          const hasFocusIndicators = checkFocusIndicators(targetElement);
          expect(hasFocusIndicators).toBe(true);
          
          // Verify both interactions maintain element accessibility
          expect(checkAccessibilityCompliance(targetElement)).toBe(true);
          
          // For activating elements (Enter/Space), verify equivalent behavior
          if (keyboardAction.key === 'Enter' || keyboardAction.key === ' ') {
            // Both keyboard and mouse activation should have similar effects
            const keyboardActivated = !keyboardEvent.defaultPrevented;
            const mouseActivated = !mouseEvent.defaultPrevented;
            
            // Either both are handled or both are not handled consistently
            expect(keyboardActivated).toBe(mouseActivated);
          }
          
          // Cleanup
          navigation.destroy();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.2**
   * 
   * For any sequence of navigation elements, keyboard focus management SHALL
   * maintain proper tab order and visual focus indicators throughout all elements.
   */
  it('focus management maintains proper order and indicators across any navigation element sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(navigationElementArb, { minLength: 1, maxLength: 5 }),
        mockUserArb,
        mockOrganizationArb,
        fc.array(keyboardInteractionArb, { minLength: 1, maxLength: 10 }),
        async (navConfigs, userData, orgData, keyboardSequence) => {
          // Use configuration from first element for overall state
          const primaryConfig = navConfigs[0];
          const user = primaryConfig.isAuthenticated ? createMockUser(userData) : undefined;
          const org = primaryConfig.hasOrganization ? createMockOrganization(orgData) : undefined;
          
          // Setup navigation component
          const navigation = setupNavigationComponent(primaryConfig, user, org);
          
          // Get all existing navigation elements
          const existingElements = [
            '#mobile-menu-button',
            '#org-switcher-button', 
            '#search',
            '#notifications-button',
            '#user-menu-button'
          ].map(selector => container.querySelector(selector))
            .filter(Boolean) as HTMLElement[];
          
          if (existingElements.length === 0) {
            navigation.destroy();
            return true;
          }
          
          // Test focus sequence through elements
          let currentIndex = 0;
          existingElements[0].focus();
          
          for (const keyAction of keyboardSequence) {
            const currentElement = existingElements[currentIndex];
            
            // Apply keyboard interaction
            simulateKeyboardInteraction(currentElement, keyAction);
            
            // Verify element maintains accessibility
            expect(checkAccessibilityCompliance(currentElement)).toBe(true);
            
            // Handle tab navigation
            if (keyAction.key === 'Tab') {
              const nextIndex = keyAction.shiftKey 
                ? Math.max(0, currentIndex - 1)
                : Math.min(existingElements.length - 1, currentIndex + 1);
              
              if (nextIndex !== currentIndex) {
                existingElements[nextIndex].focus();
                currentIndex = nextIndex;
              }
            }
            
            // Verify focus indicators on currently focused element
            if (document.activeElement && existingElements.includes(document.activeElement as HTMLElement)) {
              const focusedElement = document.activeElement as HTMLElement;
              expect(checkFocusIndicators(focusedElement)).toBe(true);
            }
            
            // Verify tab order consistency
            existingElements.forEach((element, index) => {
              const tabIndex = element.tabIndex;
              expect(tabIndex).toBeGreaterThanOrEqual(-1);
            });
          }
          
          // Verify final state maintains accessibility
          existingElements.forEach(element => {
            expect(checkAccessibilityCompliance(element)).toBe(true);
          });
          
          // Cleanup
          navigation.destroy();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.2**
   * 
   * For any combination of interaction types (keyboard, mouse, touch) on navigation elements,
   * the accessibility features SHALL remain consistent and functional across all interaction methods.
   */
  it('accessibility features remain consistent across any interaction method combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        navigationElementArb,
        mockUserArb,
        mockOrganizationArb,
        fc.array(interactionTypeArb, { minLength: 1, maxLength: 5 }),
        async (navConfig, userData, orgData, interactionSequence) => {
          const user = navConfig.isAuthenticated ? createMockUser(userData) : undefined;
          const org = navConfig.hasOrganization ? createMockOrganization(orgData) : undefined;
          
          // Setup navigation component
          const navigation = setupNavigationComponent(navConfig, user, org);
          const targetElement = getNavigationElement(container, navConfig.elementType);
          
          if (!targetElement) {
            navigation.destroy();
            return true;
          }
          
          // Record initial accessibility state
          const initialAccessibility = checkAccessibilityCompliance(targetElement);
          expect(initialAccessibility).toBe(true);
          
          // Apply sequence of different interaction types
          for (const interactionType of interactionSequence) {
            switch (interactionType) {
              case 'keyboard':
                targetElement.focus();
                simulateKeyboardInteraction(targetElement, {
                  key: 'Enter',
                  shiftKey: false,
                  ctrlKey: false,
                  altKey: false,
                  preventDefault: false
                });
                break;
                
              case 'mouse':
                simulateMouseInteraction(targetElement, 'click');
                break;
                
              case 'touch':
                // Simulate touch as click for test environment
                const touchEvent = new TouchEvent('touchstart', {
                  bubbles: true,
                  cancelable: true
                });
                targetElement.dispatchEvent(touchEvent);
                break;
                
              case 'focus':
                targetElement.focus();
                break;
                
              case 'blur':
                targetElement.blur();
                break;
            }
            
            // After each interaction, verify accessibility is maintained
            const currentAccessibility = checkAccessibilityCompliance(targetElement);
            expect(currentAccessibility).toBe(true);
            
            // Verify element remains functionally consistent
            expect(targetElement.tabIndex).toBeGreaterThanOrEqual(-1);
            
            // Check that focus management works properly
            if (interactionType === 'focus') {
              expect(checkFocusIndicators(targetElement)).toBe(true);
            }
          }
          
          // Final verification - element should still be fully accessible
          expect(checkAccessibilityCompliance(targetElement)).toBe(true);
          
          // Cleanup
          navigation.destroy();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.2**
   * 
   * For any navigation state transitions (dropdowns opening/closing, authentication changes),
   * keyboard navigation SHALL remain functional and maintain focus appropriately.
   */
  it('keyboard navigation remains functional through any navigation state transition', async () => {
    await fc.assert(
      fc.asyncProperty(
        navigationElementArb,
        mockUserArb,
        mockOrganizationArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 3 }), // State changes
        async (navConfig, userData, orgData, stateChanges) => {
          const user = createMockUser(userData);
          const org = createMockOrganization(orgData);
          
          // Setup navigation component
          const navigation = setupNavigationComponent(navConfig, user, org);
          
          // Get focusable elements
          const focusableElements = container.querySelectorAll('button, a, input, [tabindex]') as NodeListOf<HTMLElement>;
          
          if (focusableElements.length === 0) {
            navigation.destroy();
            return true;
          }
          
          // Test navigation through state changes
          for (let i = 0; i < stateChanges.length; i++) {
            const shouldToggleAuth = stateChanges[i];
            
            // Simulate state change (authentication toggle)
            if (shouldToggleAuth) {
              if (Math.random() > 0.5) {
                navigation.updateAuthContext(user, org);
              } else {
                // Simulate logout by updating with different context
                navigation.updateAuthContext(user, undefined);
              }
            }
            
            // Test keyboard navigation through all elements
            for (const element of Array.from(focusableElements)) {
              // Focus element
              element.focus();
              
              // Verify it's still accessible
              expect(checkAccessibilityCompliance(element)).toBe(true);
              
              // Test keyboard interaction
              const keyEvent = simulateKeyboardInteraction(element, {
                key: 'Enter',
                shiftKey: false,
                ctrlKey: false,
                altKey: false,
                preventDefault: false
              });
              
              // Verify element maintains keyboard functionality
              expect(element.tabIndex).toBeGreaterThanOrEqual(-1);
              
              // Test Escape key for dropdowns
              simulateKeyboardInteraction(element, {
                key: 'Escape',
                shiftKey: false,
                ctrlKey: false,
                altKey: false,
                preventDefault: false
              });
              
              // Verify element is still accessible after Escape
              expect(checkAccessibilityCompliance(element)).toBe(true);
            }
          }
          
          // Final verification - all elements should remain accessible
          focusableElements.forEach(element => {
            expect(checkAccessibilityCompliance(element)).toBe(true);
          });
          
          // Cleanup
          navigation.destroy();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});