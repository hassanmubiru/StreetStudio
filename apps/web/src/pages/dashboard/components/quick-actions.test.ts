/**
 * Quick Actions Component Tests
 * 
 * Unit tests for the quick actions component including button rendering,
 * event handling, file upload functionality, and accessibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuickActions } from './quick-actions.js';

describe('QuickActions', () => {
  let quickActions: QuickActions;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' }
    });

    // Mock setTimeout for notifications
    vi.stubGlobal('setTimeout', vi.fn((callback, delay) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 1;
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Component Initialization', () => {
    it('should create quick actions element with correct structure', () => {
      quickActions = new QuickActions();
      
      const element = quickActions.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName).toBe('DIV');
    });

    it('should render heading correctly', () => {
      quickActions = new QuickActions();
      
      const element = quickActions.getElement();
      const heading = element.querySelector('h2');
      expect(heading).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('Quick Actions');
    });

    it('should render grid layout for buttons', () => {
      quickActions = new QuickActions();
      
      const element = quickActions.getElement();
      const grid = element.querySelector('.grid');
      expect(grid).toBeTruthy();
      expect(grid?.className).toContain('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4');
    });
  });

  describe('Button Rendering', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should render start recording button', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#start-recording');
      
      expect(button).toBeTruthy();
      expect(button?.textContent).toContain('Start Recording');
      expect(button?.textContent).toContain('Capture your screen');
      expect(button?.className).toContain('bg-blue-600');
      expect(button?.getAttribute('aria-label')).toBe('Start a new screen recording');
    });

    it('should render new project button', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#new-project');
      
      expect(button).toBeTruthy();
      expect(button?.textContent).toContain('New Project');
      expect(button?.textContent).toContain('Organize your videos');
      expect(button?.className).toContain('bg-green-600');
      expect(button?.getAttribute('aria-label')).toBe('Create a new project');
    });

    it('should render upload video button', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video');
      
      expect(button).toBeTruthy();
      expect(button?.textContent).toContain('Upload Video');
      expect(button?.textContent).toContain('Add existing files');
      expect(button?.className).toContain('bg-purple-600');
      expect(button?.getAttribute('aria-label')).toBe('Upload a video file');
    });

    it('should render search videos button', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#search-videos');
      
      expect(button).toBeTruthy();
      expect(button?.textContent).toContain('Search');
      expect(button?.textContent).toContain('Find your content');
      expect(button?.className).toContain('bg-gray-600');
      expect(button?.getAttribute('aria-label')).toBe('Search videos and projects');
    });
  });

  describe('Button Interactions', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should navigate to recording page on start recording click', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#start-recording') as HTMLButtonElement;
      
      button.click();
      
      expect(window.location.href).toBe('/recordings/new');
    });

    it('should navigate to project creation on new project click', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#new-project') as HTMLButtonElement;
      
      button.click();
      
      expect(window.location.href).toBe('/projects/new');
    });

    it('should navigate to search page on search videos click', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#search-videos') as HTMLButtonElement;
      
      button.click();
      
      expect(window.location.href).toBe('/search');
    });
  });

  describe('File Upload Functionality', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should create and trigger file input on upload video click', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      // Mock createElement and appendChild
      const mockInput = {
        type: '',
        accept: '',
        multiple: false,
        style: { display: '' },
        click: vi.fn(),
        addEventListener: vi.fn()
      };
      
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      button.click();
      
      expect(createElementSpy).toHaveBeenCalledWith('input');
      expect(mockInput.type).toBe('file');
      expect(mockInput.accept).toBe('video/*');
      expect(mockInput.multiple).toBe(true);
      expect(mockInput.style.display).toBe('none');
      expect(appendChildSpy).toHaveBeenCalledWith(mockInput);
      expect(mockInput.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockInput);
    });

    it('should handle file selection and emit upload event', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      // Mock file input and files
      const mockFiles = [
        new File(['video content'], 'test1.mp4', { type: 'video/mp4' }),
        new File(['video content'], 'test2.mp4', { type: 'video/mp4' })
      ];
      
      const mockInput = {
        type: 'file',
        accept: 'video/*',
        multiple: true,
        style: { display: 'none' },
        click: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            // Simulate file selection
            callback({ target: { files: mockFiles } });
          }
        }),
        files: mockFiles
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      // Listen for the custom event
      const eventListener = vi.fn();
      document.addEventListener('dashboard:file-upload', eventListener);
      
      button.click();
      
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { files: mockFiles }
        })
      );
    });

    it('should show notification after file selection', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      const mockFiles = [
        new File(['video content'], 'test1.mp4', { type: 'video/mp4' })
      ];
      
      const mockInput = {
        type: 'file',
        accept: 'video/*',
        multiple: true,
        style: { display: 'none' },
        click: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            callback({ target: { files: mockFiles } });
          }
        })
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      button.click();
      
      // Check if notification was added to body
      const notification = document.body.querySelector('.fixed.top-4.right-4');
      expect(notification).toBeTruthy();
      expect(notification?.textContent).toContain('Upload started');
      expect(notification?.textContent).toContain('Uploading 1 file...');
    });

    it('should handle multiple file upload notification correctly', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      const mockFiles = [
        new File(['video content'], 'test1.mp4', { type: 'video/mp4' }),
        new File(['video content'], 'test2.mp4', { type: 'video/mp4' }),
        new File(['video content'], 'test3.mp4', { type: 'video/mp4' })
      ];
      
      const mockInput = {
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            callback({ target: { files: mockFiles } });
          }
        })
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      button.click();
      
      const notification = document.body.querySelector('.fixed.top-4.right-4');
      expect(notification?.textContent).toContain('Uploading 3 files...');
    });

    it('should not handle file upload when no files selected', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      const mockInput = {
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            callback({ target: { files: null } });
          }
        })
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      const eventListener = vi.fn();
      document.addEventListener('dashboard:file-upload', eventListener);
      
      button.click();
      
      expect(eventListener).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility Features', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should have proper ARIA labels for all buttons', () => {
      const element = quickActions.getElement();
      
      const startRecording = element.querySelector('#start-recording');
      expect(startRecording?.getAttribute('aria-label')).toBe('Start a new screen recording');
      
      const newProject = element.querySelector('#new-project');
      expect(newProject?.getAttribute('aria-label')).toBe('Create a new project');
      
      const uploadVideo = element.querySelector('#upload-video');
      expect(uploadVideo?.getAttribute('aria-label')).toBe('Upload a video file');
      
      const searchVideos = element.querySelector('#search-videos');
      expect(searchVideos?.getAttribute('aria-label')).toBe('Search videos and projects');
    });

    it('should have proper focus styles', () => {
      const element = quickActions.getElement();
      const buttons = element.querySelectorAll('button');
      
      buttons.forEach(button => {
        expect(button.className).toContain('focus:outline-none');
        expect(button.className).toContain('focus:ring-2');
        expect(button.className).toContain('focus:ring-offset-2');
      });
    });

    it('should hide decorative icons from screen readers', () => {
      const element = quickActions.getElement();
      const svgs = element.querySelectorAll('svg');
      
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('should have proper heading structure', () => {
      const element = quickActions.getElement();
      const heading = element.querySelector('h2');
      expect(heading).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('Quick Actions');
    });
  });

  describe('Responsive Design', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should have responsive grid classes', () => {
      const element = quickActions.getElement();
      const grid = element.querySelector('.grid');
      
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).toContain('sm:grid-cols-2');
      expect(grid?.className).toContain('lg:grid-cols-4');
    });

    it('should have consistent button layout across breakpoints', () => {
      const element = quickActions.getElement();
      const buttons = element.querySelectorAll('button');
      
      buttons.forEach(button => {
        expect(button.className).toContain('p-4');
        expect(button.className).toContain('rounded-lg');
        expect(button.className).toContain('text-left');
      });
    });

    it('should have proper spacing and gaps', () => {
      const element = quickActions.getElement();
      const grid = element.querySelector('.grid');
      
      expect(grid?.className).toContain('gap-4');
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should have dark mode classes for heading', () => {
      const element = quickActions.getElement();
      const heading = element.querySelector('h2');
      
      expect(heading?.className).toContain('dark:text-white');
    });

    it('should have consistent hover states', () => {
      const element = quickActions.getElement();
      const buttons = element.querySelectorAll('button');
      
      buttons.forEach(button => {
        expect(button.className).toMatch(/hover:bg-\w+-700/);
        expect(button.className).toMatch(/focus:bg-\w+-700/);
      });
    });

    it('should have proper color variations for different actions', () => {
      const element = quickActions.getElement();
      
      const startRecording = element.querySelector('#start-recording');
      expect(startRecording?.className).toContain('bg-blue-600');
      
      const newProject = element.querySelector('#new-project');
      expect(newProject?.className).toContain('bg-green-600');
      
      const uploadVideo = element.querySelector('#upload-video');
      expect(uploadVideo?.className).toContain('bg-purple-600');
      
      const searchVideos = element.querySelector('#search-videos');
      expect(searchVideos?.className).toContain('bg-gray-600');
    });
  });

  describe('Performance', () => {
    it('should create minimal DOM structure', () => {
      quickActions = new QuickActions();
      
      const element = quickActions.getElement();
      const childCount = element.querySelectorAll('*').length;
      
      // Should not create excessive DOM nodes
      expect(childCount).toBeLessThan(50);
    });

    it('should reuse DOM element on multiple calls', () => {
      quickActions = new QuickActions();
      
      const element1 = quickActions.getElement();
      const element2 = quickActions.getElement();
      
      expect(element1).toBe(element2);
    });

    it('should handle rapid button clicks gracefully', () => {
      quickActions = new QuickActions();
      
      const element = quickActions.getElement();
      const button = element.querySelector('#start-recording') as HTMLButtonElement;
      
      // Rapid clicks should not cause issues
      button.click();
      button.click();
      button.click();
      
      expect(window.location.href).toBe('/recordings/new');
    });
  });

  describe('Notification System', () => {
    beforeEach(() => {
      quickActions = new QuickActions();
    });

    it('should auto-dismiss notifications after timeout', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      const mockFiles = [new File(['content'], 'test.mp4', { type: 'video/mp4' })];
      
      const mockInput = {
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            callback({ target: { files: mockFiles } });
          }
        })
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      button.click();
      
      const notification = document.body.querySelector('.fixed.top-4.right-4');
      expect(notification).toBeTruthy();
      
      // Check that setTimeout was called for auto-dismiss (mocked to execute immediately)
      expect(vi.mocked(setTimeout)).toHaveBeenCalled();
    });

    it('should position notifications correctly', () => {
      const element = quickActions.getElement();
      const button = element.querySelector('#upload-video') as HTMLButtonElement;
      
      const mockFiles = [new File(['content'], 'test.mp4', { type: 'video/mp4' })];
      
      const mockInput = {
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            callback({ target: { files: mockFiles } });
          }
        })
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockInput as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockInput as any);
      
      button.click();
      
      const notification = document.body.querySelector('.fixed.top-4.right-4');
      expect(notification?.className).toContain('fixed');
      expect(notification?.className).toContain('top-4');
      expect(notification?.className).toContain('right-4');
      expect(notification?.className).toContain('z-50');
    });
  });
});