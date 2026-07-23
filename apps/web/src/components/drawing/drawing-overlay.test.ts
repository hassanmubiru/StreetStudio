/**
 * Drawing Overlay Tests
 * 
 * Tests for drawing functionality, undo/redo, and persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DrawingOverlay, DrawingTool } from './drawing-overlay.js';

describe('DrawingOverlay', () => {
  let container: HTMLElement;
  let drawingOverlay: DrawingOverlay;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    drawingOverlay = new DrawingOverlay(container);
  });

  afterEach(() => {
    drawingOverlay?.destroy();
    container?.remove();
  });

  describe('Tool Management', () => {
    it('should set and get current tool', () => {
      drawingOverlay.setTool('pen');
      const state = drawingOverlay.getState();
      expect(state.currentTool).toBe('pen');
    });

    it('should update cursor based on tool', () => {
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      
      drawingOverlay.setTool('pen');
      expect(canvas.style.cursor).toBe('crosshair');
      
      drawingOverlay.setTool('text');
      expect(canvas.style.cursor).toBe('text');
      
      drawingOverlay.setTool('none');
      expect(canvas.style.cursor).toBe('default');
    });

    it('should enable/disable pointer events based on tool', () => {
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      
      drawingOverlay.setTool('pen');
      expect(canvas.style.pointerEvents).toBe('auto');
      
      drawingOverlay.setTool('none');
      expect(canvas.style.pointerEvents).toBe('none');
    });
  });

  describe('Drawing Operations', () => {
    it('should create drawing paths when drawing', () => {
      drawingOverlay.setTool('pen');
      
      // Simulate mouse down, move, up
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const mouseMove = new MouseEvent('mousemove', { clientX: 150, clientY: 150 });
      const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseMove);
      canvas.dispatchEvent(mouseUp);
      
      const state = drawingOverlay.getState();
      expect(state.paths.length).toBe(1);
      expect(state.paths[0].tool).toBe('pen');
      expect(state.paths[0].points.length).toBeGreaterThan(1);
    });

    it('should support different drawing tools', () => {
      const tools: DrawingTool[] = ['pen', 'highlighter', 'arrow'];
      
      tools.forEach((tool, index) => {
        drawingOverlay.setTool(tool);
        
        const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
        const mouseDown = new MouseEvent('mousedown', { clientX: 100 + index * 50, clientY: 100 });
        const mouseUp = new MouseEvent('mouseup', { clientX: 100 + index * 50, clientY: 100 });
        
        canvas.dispatchEvent(mouseDown);
        canvas.dispatchEvent(mouseUp);
        
        const state = drawingOverlay.getState();
        expect(state.paths[index].tool).toBe(tool);
      });
    });

    it('should handle text annotations', () => {
      drawingOverlay.setTool('text');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      
      canvas.dispatchEvent(mouseDown);
      
      // Should create a text input
      const textInput = container.querySelector('input[type="text"]');
      expect(textInput).toBeTruthy();
      
      if (textInput) {
        (textInput as HTMLInputElement).value = 'Test annotation';
        textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        
        const state = drawingOverlay.getState();
        expect(state.textAnnotations.length).toBe(1);
        expect(state.textAnnotations[0].text).toBe('Test annotation');
      }
    });
  });

  describe('Undo/Redo Functionality', () => {
    it('should support undo operation', () => {
      drawingOverlay.setTool('pen');
      
      // Create a drawing
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      let state = drawingOverlay.getState();
      expect(state.paths.length).toBe(1);
      
      // Undo the drawing
      const undoResult = drawingOverlay.undo();
      expect(undoResult).toBe(true);
      
      state = drawingOverlay.getState();
      expect(state.paths.length).toBe(0);
    });

    it('should support redo operation', () => {
      drawingOverlay.setTool('pen');
      
      // Create a drawing
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      // Undo the drawing
      drawingOverlay.undo();
      
      let state = drawingOverlay.getState();
      expect(state.paths.length).toBe(0);
      
      // Redo the drawing
      const redoResult = drawingOverlay.redo();
      expect(redoResult).toBe(true);
      
      state = drawingOverlay.getState();
      expect(state.paths.length).toBe(1);
    });

    it('should return false when no undo/redo available', () => {
      const undoResult = drawingOverlay.undo();
      expect(undoResult).toBe(false);
      
      const redoResult = drawingOverlay.redo();
      expect(redoResult).toBe(false);
    });

    it('should clear redo stack on new action', () => {
      drawingOverlay.setTool('pen');
      
      // Create first drawing
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      let mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      let mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      // Undo
      drawingOverlay.undo();
      
      // Create second drawing (should clear redo stack)
      mouseDown = new MouseEvent('mousedown', { clientX: 200, clientY: 200 });
      mouseUp = new MouseEvent('mouseup', { clientX: 250, clientY: 250 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      // Redo should not work now
      const redoResult = drawingOverlay.redo();
      expect(redoResult).toBe(false);
    });
  });

  describe('Style Management', () => {
    it('should set and apply drawing styles', () => {
      const customStyle = {
        color: '#ff0000',
        strokeWidth: 5,
        opacity: 0.8
      };
      
      drawingOverlay.setStyle(customStyle);
      drawingOverlay.setTool('pen');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      const state = drawingOverlay.getState();
      expect(state.paths[0].style.color).toBe('#ff0000');
      expect(state.paths[0].style.strokeWidth).toBe(5);
      expect(state.paths[0].style.opacity).toBe(0.8);
    });
  });

  describe('State Management', () => {
    it('should notify state changes', () => {
      const stateChangeSpy = vi.fn();
      drawingOverlay.onStateChanged(stateChangeSpy);
      
      drawingOverlay.setTool('pen');
      expect(stateChangeSpy).toHaveBeenCalled();
      
      drawingOverlay.clear();
      expect(stateChangeSpy).toHaveBeenCalledTimes(2);
    });

    it('should load and restore state', () => {
      const testState = {
        currentTool: 'highlighter' as DrawingTool,
        paths: [{
          id: 'test-path',
          tool: 'pen' as DrawingTool,
          points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
          style: { color: '#000000', strokeWidth: 2, opacity: 1.0 },
          timestamp: Date.now()
        }],
        textAnnotations: [{
          id: 'test-annotation',
          x: 100,
          y: 100,
          text: 'Test',
          style: { fontSize: 16, color: '#000000', fontFamily: 'Arial' },
          timestamp: Date.now()
        }]
      };
      
      drawingOverlay.loadState(testState);
      
      const currentState = drawingOverlay.getState();
      expect(currentState.currentTool).toBe('highlighter');
      expect(currentState.paths.length).toBe(1);
      expect(currentState.textAnnotations.length).toBe(1);
    });

    it('should clear all drawings', () => {
      drawingOverlay.setTool('pen');
      
      // Create some drawings
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 150 });
      
      canvas.dispatchEvent(mouseDown);
      canvas.dispatchEvent(mouseUp);
      
      let state = drawingOverlay.getState();
      expect(state.paths.length).toBe(1);
      
      // Clear all
      drawingOverlay.clear();
      
      state = drawingOverlay.getState();
      expect(state.paths.length).toBe(0);
      expect(state.textAnnotations.length).toBe(0);
      expect(state.redoStack.length).toBe(0);
    });
  });

  describe('Touch Support', () => {
    it('should handle touch events', () => {
      drawingOverlay.setTool('pen');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch]
      });
      const touchEnd = new TouchEvent('touchend', { touches: [] });
      
      canvas.dispatchEvent(touchStart);
      canvas.dispatchEvent(touchEnd);
      
      const state = drawingOverlay.getState();
      expect(state.paths.length).toBe(1);
    });
  });

  describe('Canvas Resizing', () => {
    it('should handle container resize', () => {
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      const initialWidth = canvas.width;
      const initialHeight = canvas.height;
      
      // Resize container
      container.style.width = '1000px';
      container.style.height = '800px';
      
      // Trigger resize observer
      const resizeObserver = (window as any).ResizeObserver;
      if (resizeObserver) {
        // Simulate resize
        const rect = container.getBoundingClientRect();
        expect(rect.width).toBe(1000);
        expect(rect.height).toBe(800);
      }
    });
  });
});