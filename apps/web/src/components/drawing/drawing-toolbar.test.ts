/**
 * Drawing Toolbar Tests
 * 
 * Tests for toolbar functionality, tool selection, and style controls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DrawingToolbar, ToolbarOptions } from './drawing-toolbar.js';

describe('DrawingToolbar', () => {
  let container: HTMLElement;
  let toolbar: DrawingToolbar;
  let callbacks: any;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    callbacks = {
      onToolChange: vi.fn(),
      onStyleChange: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onClear: vi.fn()
    };

    toolbar = new DrawingToolbar(container, {}, callbacks);
  });

  afterEach(() => {
    toolbar?.destroy();
    container?.remove();
  });

  describe('Toolbar Initialization', () => {
    it('should create toolbar element', () => {
      const toolbarElement = container.querySelector('.drawing-toolbar');
      expect(toolbarElement).toBeTruthy();
    });

    it('should render all default tools', () => {
      const toolButtons = container.querySelectorAll('.tool-btn');
      expect(toolButtons.length).toBe(5); // pen, highlighter, arrow, text, none
    });

    it('should render color palette', () => {
      const colorButtons = container.querySelectorAll('.color-btn');
      expect(colorButtons.length).toBe(8); // Default colors
    });

    it('should render stroke width controls', () => {
      const widthButtons = container.querySelectorAll('.width-btn');
      expect(widthButtons.length).toBe(5); // Default stroke widths
    });

    it('should render action buttons', () => {
      const undoBtn = container.querySelector('.undo-btn');
      const redoBtn = container.querySelector('.redo-btn');
      const clearBtn = container.querySelector('.clear-btn');
      
      expect(undoBtn).toBeTruthy();
      expect(redoBtn).toBeTruthy();
      expect(clearBtn).toBeTruthy();
    });
  });

  describe('Tool Selection', () => {
    it('should handle tool button clicks', () => {
      const penButton = container.querySelector('[data-tool="pen"]') as HTMLButtonElement;
      penButton.click();
      
      expect(callbacks.onToolChange).toHaveBeenCalledWith('pen');
    });

    it('should update tool selection visually', () => {
      toolbar.setTool('highlighter');
      
      const highlighterButton = container.querySelector('[data-tool="highlighter"]');
      expect(highlighterButton?.classList.contains('bg-blue-100')).toBe(true);
    });

    it('should return current tool', () => {
      toolbar.setTool('arrow');
      expect(toolbar.getCurrentTool()).toBe('arrow');
    });

    it('should handle keyboard shortcuts for tools', () => {
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'p' });
      document.dispatchEvent(keyboardEvent);
      
      expect(callbacks.onToolChange).toHaveBeenCalledWith('pen');
    });
  });

  describe('Style Controls', () => {
    it('should handle color selection', () => {
      const redButton = container.querySelector('[data-color="#ff0000"]') as HTMLButtonElement;
      redButton.click();
      
      expect(callbacks.onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({ color: '#ff0000' })
      );
    });

    it('should handle stroke width selection', () => {
      const widthButton = container.querySelector('[data-width="4"]') as HTMLButtonElement;
      widthButton.click();
      
      expect(callbacks.onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({ strokeWidth: 4 })
      );
    });

    it('should update color selection visually', () => {
      toolbar.setColor('#ff0000');
      
      const redButton = container.querySelector('[data-color="#ff0000"]');
      expect(redButton?.classList.contains('border-blue-500')).toBe(true);
    });

    it('should update stroke width selection visually', () => {
      toolbar.setStrokeWidth(8);
      
      const widthButton = container.querySelector('[data-width="8"]');
      expect(widthButton?.classList.contains('bg-blue-100')).toBe(true);
    });

    it('should return current style', () => {
      toolbar.setColor('#00ff00');
      toolbar.setStrokeWidth(6);
      
      const style = toolbar.getCurrentStyle();
      expect(style.color).toBe('#00ff00');
      expect(style.strokeWidth).toBe(6);
    });
  });

  describe('Action Buttons', () => {
    it('should handle undo button click', () => {
      const undoBtn = container.querySelector('.undo-btn') as HTMLButtonElement;
      undoBtn.click();
      
      expect(callbacks.onUndo).toHaveBeenCalled();
    });

    it('should handle redo button click', () => {
      const redoBtn = container.querySelector('.redo-btn') as HTMLButtonElement;
      redoBtn.click();
      
      expect(callbacks.onRedo).toHaveBeenCalled();
    });

    it('should handle clear button click with confirmation', () => {
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      
      const clearBtn = container.querySelector('.clear-btn') as HTMLButtonElement;
      clearBtn.click();
      
      expect(confirmSpy).toHaveBeenCalled();
      expect(callbacks.onClear).toHaveBeenCalled();
      
      confirmSpy.mockRestore();
    });

    it('should not clear when confirmation is cancelled', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      
      const clearBtn = container.querySelector('.clear-btn') as HTMLButtonElement;
      clearBtn.click();
      
      expect(callbacks.onClear).not.toHaveBeenCalled();
      
      confirmSpy.mockRestore();
    });

    it('should update undo/redo button states', () => {
      toolbar.updateUndoRedoState(true, false);
      
      const undoBtn = container.querySelector('.undo-btn') as HTMLButtonElement;
      const redoBtn = container.querySelector('.redo-btn') as HTMLButtonElement;
      
      expect(undoBtn.disabled).toBe(false);
      expect(redoBtn.disabled).toBe(true);
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle Ctrl+Z for undo', () => {
      const keyboardEvent = new KeyboardEvent('keydown', { 
        key: 'z', 
        ctrlKey: true 
      });
      document.dispatchEvent(keyboardEvent);
      
      expect(callbacks.onUndo).toHaveBeenCalled();
    });

    it('should handle Ctrl+Y for redo', () => {
      const keyboardEvent = new KeyboardEvent('keydown', { 
        key: 'y', 
        ctrlKey: true 
      });
      document.dispatchEvent(keyboardEvent);
      
      expect(callbacks.onRedo).toHaveBeenCalled();
    });

    it('should handle Ctrl+Shift+Z for redo', () => {
      const keyboardEvent = new KeyboardEvent('keydown', { 
        key: 'z', 
        ctrlKey: true, 
        shiftKey: true 
      });
      document.dispatchEvent(keyboardEvent);
      
      expect(callbacks.onRedo).toHaveBeenCalled();
    });

    it('should handle Escape to clear tool', () => {
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(keyboardEvent);
      
      expect(callbacks.onToolChange).toHaveBeenCalledWith('none');
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom tools list', () => {
      const customToolbar = new DrawingToolbar(
        container,
        { tools: ['pen', 'highlighter'] },
        callbacks
      );
      
      const toolButtons = container.querySelectorAll('.tool-btn');
      expect(toolButtons.length).toBe(2);
      
      customToolbar.destroy();
    });

    it('should use custom colors', () => {
      const customColors = ['#ff0000', '#00ff00', '#0000ff'];
      const customToolbar = new DrawingToolbar(
        container,
        { colors: customColors },
        callbacks
      );
      
      const colorButtons = container.querySelectorAll('.color-btn');
      expect(colorButtons.length).toBe(3);
      
      customToolbar.destroy();
    });

    it('should use custom stroke widths', () => {
      const customWidths = [1, 3, 5];
      const customToolbar = new DrawingToolbar(
        container,
        { strokeWidths: customWidths },
        callbacks
      );
      
      const widthButtons = container.querySelectorAll('.width-btn');
      expect(widthButtons.length).toBe(3);
      
      customToolbar.destroy();
    });

    it('should position toolbar correctly', () => {
      const positions: Array<'top' | 'bottom' | 'left' | 'right' | 'floating'> = 
        ['top', 'bottom', 'left', 'right', 'floating'];
      
      positions.forEach((position) => {
        const positionedToolbar = new DrawingToolbar(
          container,
          { position },
          callbacks
        );
        
        const toolbarElement = container.querySelector('.drawing-toolbar');
        expect(toolbarElement).toBeTruthy();
        
        positionedToolbar.destroy();
      });
    });

    it('should render compact mode', () => {
      const compactToolbar = new DrawingToolbar(
        container,
        { compact: true },
        callbacks
      );
      
      const styleToggle = container.querySelector('.style-toggle');
      expect(styleToggle).toBeTruthy();
      
      compactToolbar.destroy();
    });
  });

  describe('Style Dropdown', () => {
    it('should toggle style dropdown in compact mode', () => {
      const compactToolbar = new DrawingToolbar(
        container,
        { compact: true },
        callbacks
      );
      
      const styleToggle = container.querySelector('.style-toggle') as HTMLButtonElement;
      const styleDropdown = container.querySelector('.style-dropdown');
      
      // Initially hidden
      expect(styleDropdown?.classList.contains('hidden')).toBe(true);
      
      // Click to show
      styleToggle.click();
      expect(styleDropdown?.classList.contains('hidden')).toBe(false);
      
      // Click again to hide
      styleToggle.click();
      expect(styleDropdown?.classList.contains('hidden')).toBe(true);
      
      compactToolbar.destroy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const toolButtons = container.querySelectorAll('.tool-btn');
      toolButtons.forEach((button) => {
        expect(button.getAttribute('aria-label')).toBeTruthy();
      });
      
      const colorButtons = container.querySelectorAll('.color-btn');
      colorButtons.forEach((button) => {
        expect(button.getAttribute('aria-label')).toBeTruthy();
      });
      
      const widthButtons = container.querySelectorAll('.width-btn');
      widthButtons.forEach((button) => {
        expect(button.getAttribute('aria-label')).toBeTruthy();
      });
    });

    it('should have proper titles for tooltips', () => {
      const toolButtons = container.querySelectorAll('.tool-btn');
      toolButtons.forEach((button) => {
        expect(button.getAttribute('title')).toBeTruthy();
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up properly on destroy', () => {
      const toolbarElement = container.querySelector('.drawing-toolbar');
      expect(toolbarElement).toBeTruthy();
      
      toolbar.destroy();
      
      const afterDestroy = container.querySelector('.drawing-toolbar');
      expect(afterDestroy).toBeFalsy();
    });
  });
});