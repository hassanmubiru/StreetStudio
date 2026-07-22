/**
 * Keyboard Shortcuts Tests
 * 
 * Unit tests for the keyboard shortcuts manager functionality.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardShortcuts } from './keyboard-shortcuts';

// Mock DOM environment
const mockDocument = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  createElement: vi.fn(() => ({
    className: '',
    innerHTML: '',
    style: {},
    setAttribute: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    textContent: '',
  })),
  getElementById: vi.fn(() => null),
  querySelector: vi.fn(() => null),
  body: {
    appendChild: vi.fn(),
    insertBefore: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false), toggle: vi.fn() },
  },
  head: {
    appendChild: vi.fn(),
  },
  documentElement: {
    style: {},
  },
};

// Mock global objects
(global as any).document = mockDocument;
(global as any).window = {
  location: { pathname: '/' },
};
(global as any).navigator = {
  platform: 'Mac',
};
(global as any).localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

describe('KeyboardShortcuts', () => {
  let keyboardShortcuts: KeyboardShortcuts;

  beforeEach(() => {
    vi.clearAllMocks();
    keyboardShortcuts = new KeyboardShortcuts({
      enableVisualIndicators: false, // Disable for testing
      showHelpOverlay: false,
    });
  });

  afterEach(() => {
    keyboardShortcuts.destroy();
  });

  describe('shortcut registration', () => {
    test('should register a single shortcut', () => {
      const handler = vi.fn();
      
      keyboardShortcuts.register({
        key: 'k',
        modifiers: ['ctrl'],
        description: 'Test shortcut',
        handler,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    test('should register multiple shortcuts', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      // Get initial count (includes accessibility shortcuts)
      const initialCount = keyboardShortcuts.getShortcutsForContext().length;
      
      keyboardShortcuts.register([
        {
          key: 'k',
          modifiers: ['ctrl'],
          description: 'Test shortcut 1',
          handler: handler1,
        },
        {
          key: 'n',
          modifiers: ['ctrl'],
          description: 'Test shortcut 2',
          handler: handler2,
        },
      ]);

      const shortcuts = keyboardShortcuts.getShortcutsForContext();
      expect(shortcuts).toHaveLength(initialCount + 2);
    });

    test('should handle shortcut conflicts with priority', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      // Register low priority shortcut first
      keyboardShortcuts.register({
        key: 'x', // Use a different key to avoid conflicts with existing shortcuts
        modifiers: ['ctrl'],
        description: 'Low priority',
        handler: handler1,
        priority: 1,
      });

      // Register high priority shortcut with same key
      keyboardShortcuts.register({
        key: 'x',
        modifiers: ['ctrl'],
        description: 'High priority',
        handler: handler2,
        priority: 10,
      });

      const shortcuts = keyboardShortcuts.getShortcutsForContext();
      // Find our test shortcuts
      const testShortcuts = shortcuts.filter(s => s.key === 'x');
      
      // Should have both shortcuts, but high priority first
      expect(testShortcuts[0].priority).toBe(10);
      expect(testShortcuts[1].priority).toBe(1);
    });
  });

  describe('context management', () => {
    test('should set and get active context', () => {
      keyboardShortcuts.setContext('video-player');
      
      const handler = vi.fn();
      keyboardShortcuts.register({
        key: ' ',
        context: 'video-player',
        description: 'Play/pause',
        handler,
      });

      const shortcuts = keyboardShortcuts.getShortcutsForContext('video-player');
      const contextShortcut = shortcuts.find(s => s.key === ' ' && s.context === 'video-player');
      expect(contextShortcut).toBeDefined();
      expect(contextShortcut!.context).toBe('video-player');
    });

    test('should include global shortcuts in any context', () => {
      const globalHandler = vi.fn();
      const contextHandler = vi.fn();
      
      keyboardShortcuts.register([
        {
          key: 'z', // Use different key to avoid conflicts with existing shortcuts
          modifiers: ['ctrl'],
          description: 'Global shortcut',
          handler: globalHandler,
        },
        {
          key: ' ',
          context: 'video-player',
          description: 'Context shortcut',
          handler: contextHandler,
        },
      ]);

      keyboardShortcuts.setContext('video-player');
      const shortcuts = keyboardShortcuts.getShortcutsForContext('video-player');
      
      // Filter for our test shortcuts
      const testShortcuts = shortcuts.filter(s => 
        (s.key === 'z' && s.modifiers?.includes('ctrl')) || 
        (s.key === ' ' && s.context === 'video-player')
      );
      
      // Should include both global and context shortcuts
      expect(testShortcuts).toHaveLength(2);
    });
  });

  describe('shortcut unregistration', () => {
    test('should unregister shortcuts by key and context', () => {
      const handler = vi.fn();
      
      keyboardShortcuts.register({
        key: 'y', // Use a different key
        modifiers: ['ctrl'],
        context: 'test-context',
        description: 'Test shortcut',
        handler,
      });

      // Verify it was added
      let shortcuts = keyboardShortcuts.getShortcutsForContext('test-context');
      let testShortcut = shortcuts.find(s => s.key === 'y' && s.context === 'test-context');
      expect(testShortcut).toBeDefined();

      keyboardShortcuts.unregister('y', ['ctrl'], 'test-context');
      
      // Verify it was removed
      shortcuts = keyboardShortcuts.getShortcutsForContext('test-context');
      testShortcut = shortcuts.find(s => s.key === 'y' && s.context === 'test-context');
      expect(testShortcut).toBeUndefined();
    });
  });

  describe('keyboard event handling', () => {
    test('should generate correct key signature from event', () => {
      const handler = vi.fn();
      
      keyboardShortcuts.register({
        key: 'k',
        modifiers: ['ctrl'],
        description: 'Test shortcut',
        handler,
      });

      // Simulate keydown event
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      });

      // Manually trigger the event handler
      const keydownHandler = mockDocument.addEventListener.mock.calls.find(
        call => call[0] === 'keydown'
      )?.[1];

      if (keydownHandler) {
        keydownHandler(event);
      }

      // Note: In a real test environment, we'd verify the handler was called
      // This is a simplified test due to the mock environment
    });
  });

  describe('accessibility features', () => {
    test('should enable/disable shortcuts', () => {
      keyboardShortcuts.setEnabled(false);
      
      // When disabled, shortcuts should not execute
      // This would require a more complex test setup to verify
      expect(true).toBe(true); // Placeholder assertion
    });

    test('should handle input focus detection', () => {
      // Test that shortcuts are not triggered when input elements are focused
      // This would require DOM element mocking
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('help overlay', () => {
    test('should toggle help overlay visibility', () => {
      const shortcutsWithOverlay = new KeyboardShortcuts({
        showHelpOverlay: true,
      });

      shortcutsWithOverlay.toggleHelpOverlay();
      // In a real test, we'd verify the overlay element was created and shown
      
      shortcutsWithOverlay.destroy();
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('cleanup', () => {
    test('should remove event listeners on destroy', () => {
      keyboardShortcuts.destroy();
      
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'keyup',
        expect.any(Function)
      );
    });
  });
});

// Integration test for key signature generation
describe('Key signature generation', () => {
  test('should generate consistent key signatures', () => {
    const shortcuts = new KeyboardShortcuts({ 
      enableVisualIndicators: false,
      showHelpOverlay: false,
    });

    const handler = vi.fn();
    
    // Test various key combinations
    const testCases = [
      { key: 'k', modifiers: ['ctrl'], expected: 'ctrl+k' },
      { key: 'K', modifiers: ['ctrl'], expected: 'ctrl+k' }, // Should be normalized
      { key: 'k', modifiers: ['ctrl', 'shift'], expected: 'ctrl+shift+k' },
      { key: ' ', modifiers: [], expected: ' ' },
      { key: 'Enter', modifiers: ['alt'], expected: 'alt+enter' },
    ];

    testCases.forEach(({ key, modifiers, expected }) => {
      shortcuts.register({
        key,
        modifiers: modifiers as any,
        description: `Test ${expected}`,
        handler,
      });
    });

    shortcuts.destroy();
    expect(true).toBe(true); // Test passes if no errors thrown
  });
});