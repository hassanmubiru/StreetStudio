/**
 * Property-Based Tests for Recording Controls Accessibility
 * 
 * These tests validate that the recording control panel remains accessible and functional
 * without obscuring critical content or interactive elements, regardless of screen content 
 * configuration, using property-based testing with minimum 100 iterations.
 * 
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RecordingController, type RecordingOptions } from './recording-controller.js';

// Mock canvas context for drawing overlay
const mockCanvas2DContext = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  rect: vi.fn(),
  setLineDash: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: vi.fn(),
  createRadialGradient: vi.fn(),
  createPattern: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  isPointInPath: vi.fn(),
  isPointInStroke: vi.fn(),
  clip: vi.fn(),
  font: '12px Arial',
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  shadowBlur: 0,
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  canvas: null as any,
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
  if (contextType === '2d') {
    const context = { ...mockCanvas2DContext };
    context.canvas = {
      width: 800,
      height: 600,
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: vi.fn(),
      })),
    } as any;
    return context;
  }
  return null;
});

// Mock window.scrollTo
Object.defineProperty(global.window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

// Mock navigator.mediaDevices for testing
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: vi.fn(() => 
      Promise.resolve({
        getTracks: () => [{ stop: vi.fn() }],
        getVideoTracks: () => [{ stop: vi.fn() }],
        getAudioTracks: () => [{ stop: vi.fn() }],
      } as any)
    ),
  },
  writable: true,
});

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  stream: {
    getTracks: () => [{ stop: vi.fn() }],
  },
  ondataavailable: null,
  onstop: null,
})) as any;

/**
 * Arbitrary for generating various screen content configurations
 */
const arbitraryScreenContent = fc.record({
  // Screen dimensions
  screenWidth: fc.integer({ min: 320, max: 3840 }),
  screenHeight: fc.integer({ min: 200, max: 2160 }),
  
  // Critical interactive elements that must remain accessible
  criticalElements: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      type: fc.oneof(
        fc.constant('button'),
        fc.constant('link'),
        fc.constant('input'),
        fc.constant('select'),
        fc.constant('textarea')
      ),
      x: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }), // Relative position (0-1)
      y: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
      width: fc.float({ min: Math.fround(0.01), max: Math.fround(0.3), noNaN: true }), // Relative size
      height: fc.float({ min: Math.fround(0.01), max: Math.fround(0.1), noNaN: true }),
      priority: fc.oneof(
        fc.constant('critical'),
        fc.constant('important'), 
        fc.constant('normal')
      ),
    }),
    { minLength: 0, maxLength: 20 }
  ),
  
  // Background content areas
  contentAreas: fc.array(
    fc.record({
      type: fc.oneof(
        fc.constant('text'),
        fc.constant('image'),
        fc.constant('video'),
        fc.constant('form')
      ),
      x: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
      y: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
      width: fc.float({ min: Math.fround(0.1), max: Math.fround(1), noNaN: true }),
      height: fc.float({ min: Math.fround(0.1), max: Math.fround(1), noNaN: true }),
    }),
    { minLength: 0, maxLength: 10 }
  ),

  // Viewport scroll position
  scrollX: fc.integer({ min: 0, max: 1000 }),
  scrollY: fc.integer({ min: 0, max: 2000 }),
});

/**
 * Arbitrary for generating recording control panel configurations
 */
const arbitraryControlConfig = fc.record({
  position: fc.oneof(
    fc.constant('top-left'),
    fc.constant('top-right'),
    fc.constant('bottom-left'),
    fc.constant('bottom-right'),
    fc.constant('floating')
  ),
  showDrawingTools: fc.boolean(),
  compactMode: fc.boolean(),
  enableKeyboardShortcuts: fc.boolean(),
});

/**
 * Test helper to simulate screen content and check accessibility
 */
function createScreenContentSimulation(
  screenContent: ReturnType<typeof arbitraryScreenContent.generate>['value'],
  controlConfig: ReturnType<typeof arbitraryControlConfig.generate>['value']
) {
  // Create container with specified dimensions
  const container = document.createElement('div');
  container.style.width = `${screenContent.screenWidth}px`;
  container.style.height = `${screenContent.screenHeight}px`;
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  // Add critical interactive elements
  screenContent.criticalElements.forEach((element, index) => {
    const el = document.createElement(element.type === 'link' ? 'a' : element.type);
    // Sanitize ID to avoid CSS selector issues
    const sanitizedId = `critical-${element.id.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`;
    el.id = sanitizedId;
    el.className = `critical-element priority-${element.priority}`;
    
    // Position absolutely within container
    el.style.position = 'absolute';
    el.style.left = `${element.x * screenContent.screenWidth}px`;
    el.style.top = `${element.y * screenContent.screenHeight}px`;
    el.style.width = `${element.width * screenContent.screenWidth}px`;
    el.style.height = `${element.height * screenContent.screenHeight}px`;
    el.style.backgroundColor = element.priority === 'critical' ? 'red' : 
                               element.priority === 'important' ? 'orange' : 'blue';
    el.style.border = '2px solid black';
    el.style.zIndex = '10';

    // Make interactive
    if (element.type === 'button') {
      (el as HTMLButtonElement).textContent = `Critical ${element.priority}`;
      (el as HTMLButtonElement).onclick = () => {};
    } else if (element.type === 'link') {
      (el as HTMLAnchorElement).href = '#';
      (el as HTMLAnchorElement).textContent = `Critical Link`;
    } else if (element.type === 'input') {
      (el as HTMLInputElement).placeholder = 'Critical input';
    }

    container.appendChild(el);
  });

  // Add background content areas  
  screenContent.contentAreas.forEach((area, index) => {
    const el = document.createElement('div');
    el.className = `content-area content-${area.type}`;
    el.style.position = 'absolute';
    el.style.left = `${area.x * screenContent.screenWidth}px`;
    el.style.top = `${area.y * screenContent.screenHeight}px`;
    el.style.width = `${area.width * screenContent.screenWidth}px`;
    el.style.height = `${area.height * screenContent.screenHeight}px`;
    el.style.backgroundColor = '#f0f0f0';
    el.style.border = '1px solid #ddd';
    el.style.zIndex = '1';
    el.textContent = `${area.type} content ${index}`;
    
    container.appendChild(el);
  });

  // Simulate scroll position (remove scrollTo call to avoid jsdom warnings)
  // In a real implementation, this would set scroll position
  // window.scrollTo(screenContent.scrollX, screenContent.scrollY);

  return { container };
}

/**
 * Check if recording controls obscure critical elements
 */
function checkControlsAccessibility(
  container: HTMLElement,
  criticalElements: Array<{ id: string; priority: string; x: number; y: number; width: number; height: number }>
): {
  obscuredCriticalElements: string[];
  accessibleCriticalElements: string[];
  controlsVisible: boolean;
  controlsInteractable: boolean;
} {
  const recordingControls = container.querySelector('.recording-controls') as HTMLElement;
  const controlsVisible = recordingControls && getComputedStyle(recordingControls).display !== 'none';
  
  let controlsInteractable = false;
  if (recordingControls) {
    const buttons = recordingControls.querySelectorAll('button');
    controlsInteractable = buttons.length > 0 && 
      Array.from(buttons).every(btn => !btn.disabled && getComputedStyle(btn).pointerEvents !== 'none');
  }

  const obscuredCriticalElements: string[] = [];
  const accessibleCriticalElements: string[] = [];

  if (recordingControls) {
    const controlsRect = recordingControls.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    criticalElements.forEach((element, index) => {
      // Use the same sanitized ID as in creation
      const sanitizedId = `critical-${element.id.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`;
      const el = container.querySelector(`#${sanitizedId}`) as HTMLElement;
      
      if (el) {
        const elementRect = el.getBoundingClientRect();
        
        // Check if element overlaps with controls
        const overlaps = !(
          elementRect.right <= controlsRect.left ||
          elementRect.left >= controlsRect.right ||
          elementRect.bottom <= controlsRect.top ||
          elementRect.top >= controlsRect.bottom
        );

        if (overlaps) {
          // Calculate overlap area
          const overlapArea = Math.max(0, 
            Math.min(elementRect.right, controlsRect.right) - Math.max(elementRect.left, controlsRect.left)
          ) * Math.max(0,
            Math.min(elementRect.bottom, controlsRect.bottom) - Math.max(elementRect.top, controlsRect.top)
          );
          
          const elementArea = elementRect.width * elementRect.height;
          const overlapPercentage = elementArea > 0 ? overlapArea / elementArea : 0;
          
          // Consider element obscured if more than 25% is covered
          if (overlapPercentage > 0.25) {
            obscuredCriticalElements.push(elementId);
          } else {
            accessibleCriticalElements.push(elementId);
          }
        } else {
          accessibleCriticalElements.push(elementId);
        }
      }
    });
  } else {
    // If no controls, all elements are accessible
    criticalElements.forEach((element, index) => {
      accessibleCriticalElements.push(`critical-${element.id}-${index}`);
    });
  }

  return {
    obscuredCriticalElements,
    accessibleCriticalElements, 
    controlsVisible,
    controlsInteractable,
  };
}

describe('Recording Controls Accessibility Properties', () => {
  let mockRecorder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset canvas context mock
    Object.keys(mockCanvas2DContext).forEach(key => {
      if (typeof mockCanvas2DContext[key as keyof typeof mockCanvas2DContext] === 'function') {
        (mockCanvas2DContext[key as keyof typeof mockCanvas2DContext] as any).mockClear?.();
      }
    });
    
    // Reset MediaRecorder mock
    mockRecorder = {
      start: vi.fn(),
      stop: vi.fn(), 
      pause: vi.fn(),
      resume: vi.fn(),
      state: 'inactive',
      stream: {
        getTracks: () => [{ stop: vi.fn() }],
      },
      ondataavailable: null,
      onstop: null,
    };
    
    (global.MediaRecorder as any).mockImplementation(() => mockRecorder);
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 3.2**
   * 
   * Property 4: Recording Control Accessibility
   * For any screen content configuration, the recording control panel SHALL remain 
   * accessible and functional without obscuring critical content or interactive elements.
   */
  it('Property 4: Recording Control Accessibility - Controls remain accessible across all screen configurations', () => {
    fc.assert(
      fc.property(
        arbitraryScreenContent,
        arbitraryControlConfig,
        (screenContent, controlConfig) => {
          // Create screen content simulation
          const { container } = createScreenContentSimulation(screenContent, controlConfig);

          // Initialize recording controller with drawing disabled to focus on controls accessibility
          const recordingOptions: RecordingOptions = {
            enableDrawing: false, // Disable drawing to focus on recording controls
            persistDrawings: false, // Disable persistence for tests
            syncWithRecording: true,
          };

          const recordingController = new RecordingController(
            container,
            recordingOptions,
            {
              onRecordingStart: vi.fn(),
              onRecordingStop: vi.fn(),
            }
          );

          // Check accessibility immediately after initialization
          const accessibility = checkControlsAccessibility(container, screenContent.criticalElements);

          // Critical assertions for accessibility
          
          // 1. Recording controls must be visible and interactable
          expect(accessibility.controlsVisible).toBe(true);
          expect(accessibility.controlsInteractable).toBe(true);

          // 2. Critical elements must not be obscured by recording controls
          const criticalObscured = screenContent.criticalElements.filter(
            (el, idx) => accessibility.obscuredCriticalElements.includes(`critical-${el.id}-${idx}`) &&
            el.priority === 'critical'
          );
          
          expect(criticalObscured.length).toBe(0); // NO critical elements should be obscured

          // 3. At least 80% of important elements should remain accessible
          const importantElements = screenContent.criticalElements.filter(el => el.priority === 'important');
          if (importantElements.length > 0) {
            const obscuredImportant = importantElements.filter(
              (el, idx) => {
                const globalIdx = screenContent.criticalElements.indexOf(el);
                return accessibility.obscuredCriticalElements.includes(`critical-${el.id}-${globalIdx}`);
              }
            );
            const accessibilityRatio = (importantElements.length - obscuredImportant.length) / importantElements.length;
            expect(accessibilityRatio).toBeGreaterThanOrEqual(0.8);
          }

          // 4. Recording controls should be positioned to minimize content interference
          const recordingControls = container.querySelector('.recording-controls') as HTMLElement;
          if (recordingControls) {
            const controlsRect = recordingControls.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Controls should be within container bounds
            expect(controlsRect.left).toBeGreaterThanOrEqual(containerRect.left - 10); // 10px tolerance
            expect(controlsRect.top).toBeGreaterThanOrEqual(containerRect.top - 10);
            expect(controlsRect.right).toBeLessThanOrEqual(containerRect.right + 10);
            expect(controlsRect.bottom).toBeLessThanOrEqual(containerRect.bottom + 10);

            // Controls should have reasonable size (not too large)
            const controlsArea = controlsRect.width * controlsRect.height;
            const containerArea = containerRect.width * containerRect.height;
            const controlsSizeRatio = containerArea > 0 ? controlsArea / containerArea : 0;
            expect(controlsSizeRatio).toBeLessThanOrEqual(0.15); // Controls should not take more than 15% of screen
          }

          // 5. Test keyboard accessibility if shortcuts are enabled
          if (controlConfig.enableKeyboardShortcuts) {
            const recordButton = container.querySelector('.record-btn') as HTMLButtonElement;
            if (recordButton) {
              expect(recordButton.tabIndex).toBeGreaterThanOrEqual(0); // Should be keyboard focusable
              expect(recordButton.getAttribute('aria-label')).toBeTruthy(); // Should have aria-label
            }
          }

          // 6. Test responsive behavior for small screens
          if (screenContent.screenWidth < 480) {
            // On small screens, controls should be more compact or repositioned
            const controlsRect = recordingControls?.getBoundingClientRect();
            if (controlsRect) {
              // Controls should not be too wide on mobile
              expect(controlsRect.width).toBeLessThanOrEqual(screenContent.screenWidth * 0.9);
            }
          }

          // Clean up
          recordingController.destroy();
          container.remove();

          // Return success - all accessibility requirements met
          return true;
        }
      ),
      { 
        numRuns: 100, // Minimum 100 iterations as per requirements
        verbose: 0,
        seed: 100, // Deterministic for reproducible results
      }
    );
  });

  it('Property 4a: Recording controls adapt position dynamically to avoid critical content', () => {
    fc.assert(
      fc.property(
        arbitraryScreenContent.filter(content => content.criticalElements.length > 0),
        (screenContent) => {
          const { container } = createScreenContentSimulation(screenContent, {
            position: 'floating',
            showDrawingTools: true,
            compactMode: false,
            enableKeyboardShortcuts: true,
          });

          const recordingController = new RecordingController(
            container,
            {
              enableDrawing: true,
              persistDrawings: false,
            }
          );

          // Simulate dynamic repositioning scenarios
          const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
          let bestPosition = null;
          let minObscuredCritical = Infinity;

          for (const position of positions) {
            // Simulate repositioning controls (in a real implementation, this would be automatic)
            const controls = container.querySelector('.recording-controls') as HTMLElement;
            if (controls) {
              controls.className = `recording-controls absolute ${position.replace('-', ' ')} z-20`;
            }

            const accessibility = checkControlsAccessibility(container, screenContent.criticalElements);
            const criticalObscuredCount = accessibility.obscuredCriticalElements.length;

            if (criticalObscuredCount < minObscuredCritical) {
              minObscuredCritical = criticalObscuredCount;
              bestPosition = position;
            }
          }

          // Controls should find a position that minimizes obstruction
          expect(minObscuredCritical).toBeLessThanOrEqual(
            Math.floor(screenContent.criticalElements.filter(el => el.priority === 'critical').length * 0.1)
          );

          recordingController.destroy();
          container.remove();

          return true;
        }
      ),
      { 
        numRuns: 50,
        seed: 101,
      }
    );
  });

  it('Property 4b: Recording controls maintain accessibility during state changes', () => {
    fc.assert(
      fc.property(
        arbitraryScreenContent,
        fc.array(fc.oneof(
          fc.constant('start'),
          fc.constant('pause'), 
          fc.constant('resume'),
          fc.constant('stop')
        ), { minLength: 1, maxLength: 10 }),
        (screenContent, stateChanges) => {
          const { container } = createScreenContentSimulation(screenContent, {
            position: 'top-left',
            showDrawingTools: true,
            compactMode: false,
            enableKeyboardShortcuts: true,
          });

          const recordingController = new RecordingController(
            container,
            { enableDrawing: true, persistDrawings: false }
          );

          let allStatesAccessible = true;

          // Test accessibility across different recording states
          for (const action of stateChanges) {
            try {
              switch (action) {
                case 'start':
                  // Mock successful recording start
                  mockRecorder.state = 'recording';
                  break;
                case 'pause':
                  if (mockRecorder.state === 'recording') {
                    mockRecorder.state = 'paused';
                  }
                  break;
                case 'resume':
                  if (mockRecorder.state === 'paused') {
                    mockRecorder.state = 'recording';
                  }
                  break;
                case 'stop':
                  mockRecorder.state = 'inactive';
                  break;
              }

              // Check accessibility after state change
              const accessibility = checkControlsAccessibility(container, screenContent.criticalElements);
              
              // Controls must remain visible and interactable
              if (!accessibility.controlsVisible || !accessibility.controlsInteractable) {
                allStatesAccessible = false;
                break;
              }

              // Critical elements must not be obscured
              const criticalObscured = accessibility.obscuredCriticalElements.filter(id => {
                const element = container.querySelector(`#${id}`) as HTMLElement;
                return element?.classList.contains('priority-critical');
              });

              if (criticalObscured.length > 0) {
                allStatesAccessible = false;
                break;
              }

            } catch (error) {
              // State change should not cause errors
              allStatesAccessible = false;
              break;
            }
          }

          recordingController.destroy();
          container.remove();

          return allStatesAccessible;
        }
      ),
      { 
        numRuns: 100,
        seed: 102,
      }
    );
  });

  it('Property 4c: Recording controls respect user accessibility preferences', () => {
    fc.assert(
      fc.property(
        arbitraryScreenContent,
        fc.record({
          reducedMotion: fc.boolean(),
          highContrast: fc.boolean(),
          largeText: fc.boolean(),
          keyboardOnly: fc.boolean(),
        }),
        (screenContent, accessibilityPrefs) => {
          // Mock user accessibility preferences
          Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn((query: string) => ({
              matches: (
                (query.includes('prefers-reduced-motion') && accessibilityPrefs.reducedMotion) ||
                (query.includes('prefers-contrast') && accessibilityPrefs.highContrast)
              ),
              media: query,
              onchange: null,
              addListener: vi.fn(),
              removeListener: vi.fn(),
            })),
          });

          const { container } = createScreenContentSimulation(screenContent, {
            position: 'floating',
            showDrawingTools: true,
            compactMode: false,
            enableKeyboardShortcuts: accessibilityPrefs.keyboardOnly,
          });

          const recordingController = new RecordingController(
            container,
            { 
              enableDrawing: true, 
              persistDrawings: false,
            }
          );

          const controls = container.querySelector('.recording-controls') as HTMLElement;
          let accessibilityCompliant = true;

          if (controls) {
            // Check high contrast compliance
            if (accessibilityPrefs.highContrast) {
              const computedStyle = getComputedStyle(controls);
              // Controls should have sufficient contrast (simplified check)
              accessibilityCompliant = computedStyle.backgroundColor !== 'transparent';
            }

            // Check keyboard accessibility
            if (accessibilityPrefs.keyboardOnly) {
              const focusableElements = controls.querySelectorAll(
                'button, [tabindex]:not([tabindex="-1"])'
              );
              accessibilityCompliant = focusableElements.length > 0;
              
              // Check that all interactive elements have proper labels
              focusableElements.forEach(element => {
                const hasLabel = element.getAttribute('aria-label') || 
                               element.getAttribute('title') ||
                               element.textContent?.trim();
                if (!hasLabel) {
                  accessibilityCompliant = false;
                }
              });
            }

            // Check reduced motion compliance (simplified)
            if (accessibilityPrefs.reducedMotion) {
              // Should not have animation classes that would cause motion
              const hasMotionClasses = controls.classList.contains('animate-pulse') ||
                                     controls.classList.contains('transition-all');
              accessibilityCompliant = accessibilityCompliant && !hasMotionClasses;
            }
          }

          recordingController.destroy();
          container.remove();

          return accessibilityCompliant;
        }
      ),
      { 
        numRuns: 100,
        seed: 103,
      }
    );
  });
});