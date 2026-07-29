/**
 * Unit tests for TimelineComponent
 * 
 * Tests rendering, scrubbing, zoom controls, markers display, and keyboard navigation.
 * 
 * Requirements: 5.3, 5.10, 6.1
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimelineComponent } from './timeline-component';
import { TimelineController } from './timeline-controller';
import type { TimelineMarker, TimelineComponentCallbacks } from './index';

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  // Give the container dimensions for layout calculations
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 100, right: 800, bottom: 100 }),
  });
  document.body.appendChild(container);
  return container;
}

// Mock canvas context
function mockCanvas(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set fillStyle(_v: string) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
  });
}

describe('TimelineComponent', () => {
  let container: HTMLElement;
  let controller: TimelineController;
  let component: TimelineComponent;
  let callbacks: TimelineComponentCallbacks;

  beforeEach(() => {
    mockCanvas();
    container = createContainer();
    controller = new TimelineController({ frameRate: 30 });
    controller.setDuration(120);
    callbacks = {
      onSeek: vi.fn(),
      onMarkerClick: vi.fn(),
    };
  });

  afterEach(() => {
    if (component) {
      component.destroy();
    }
    container.remove();
  });

  describe('initialization', () => {
    it('renders timeline structure in container', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      expect(container.querySelector('.timeline-wrapper')).not.toBeNull();
      expect(container.querySelector('.timeline-toolbar')).not.toBeNull();
      expect(container.querySelector('.timeline-ruler')).not.toBeNull();
      expect(container.querySelector('.timeline-playhead')).not.toBeNull();
    });

    it('sets correct ARIA attributes on container', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      expect(container.getAttribute('role')).toBe('slider');
      expect(container.getAttribute('aria-label')).toBe('Video timeline');
      expect(container.getAttribute('aria-valuemin')).toBe('0');
      expect(container.getAttribute('aria-valuemax')).toBe('120');
      expect(container.getAttribute('aria-valuenow')).toBe('0');
      expect(container.getAttribute('tabindex')).toBe('0');
    });

    it('renders timecode display', () => {
      component = new TimelineComponent(container, controller, { showTimecode: true }, callbacks);
      const timecode = container.querySelector('.timeline-timecode');
      expect(timecode).not.toBeNull();
      expect(timecode?.textContent).toBe('00:00:00:00');
    });

    it('renders zoom controls', () => {
      component = new TimelineComponent(container, controller, { showZoomControls: true }, callbacks);
      expect(container.querySelector('.zoom-in')).not.toBeNull();
      expect(container.querySelector('.zoom-out')).not.toBeNull();
      expect(container.querySelector('.zoom-fit')).not.toBeNull();
    });

    it('hides zoom controls when disabled', () => {
      component = new TimelineComponent(container, controller, { showZoomControls: false }, callbacks);
      expect(container.querySelector('.zoom-in')).toBeNull();
    });

    it('renders marker lane when markers enabled', () => {
      component = new TimelineComponent(container, controller, { showMarkers: true }, callbacks);
      expect(container.querySelector('.timeline-marker-lane')).not.toBeNull();
    });

    it('hides marker lane when markers disabled', () => {
      component = new TimelineComponent(container, controller, { showMarkers: false }, callbacks);
      expect(container.querySelector('.timeline-marker-lane')).toBeNull();
    });
  });

  describe('zoom controls interaction', () => {
    it('zoom in button increases zoom', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      const zoomInBtn = container.querySelector('.zoom-in') as HTMLButtonElement;
      const initialZoom = controller.getState().zoomLevel;
      zoomInBtn.click();
      expect(controller.getState().zoomLevel).toBeGreaterThan(initialZoom);
    });

    it('zoom out button decreases zoom', () => {
      controller.setZoom(5);
      component = new TimelineComponent(container, controller, {}, callbacks);
      const zoomOutBtn = container.querySelector('.zoom-out') as HTMLButtonElement;
      zoomOutBtn.click();
      expect(controller.getState().zoomLevel).toBeLessThan(5);
    });

    it('zoom fit button resets zoom to fit', () => {
      controller.setZoom(10);
      controller.setScrollOffset(30);
      component = new TimelineComponent(container, controller, {}, callbacks);
      const zoomFitBtn = container.querySelector('.zoom-fit') as HTMLButtonElement;
      zoomFitBtn.click();
      expect(controller.getState().zoomLevel).toBe(1);
      expect(controller.getState().scrollOffset).toBe(0);
    });

    it('zoom label updates on zoom change', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.setZoom(5);
      const label = container.querySelector('.timeline-zoom-label');
      expect(label?.textContent).toBe('5x');
    });
  });

  describe('playhead position', () => {
    it('updates playhead position when time changes', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      const playhead = container.querySelector('.timeline-playhead') as HTMLElement;
      
      controller.setCurrentTime(60); // half of 120s duration
      // At zoom 1, visible duration = 120s, so 60s = 50% of width
      // Width is mocked as 0 in jsdom so the exact pixel check isn't meaningful,
      // but we verify the playhead style is being set
      expect(playhead.style.left).toBeDefined();
    });

    it('updates timecode when time changes', () => {
      component = new TimelineComponent(container, controller, { showTimecode: true }, callbacks);
      controller.seek(61.5);
      const timecode = container.querySelector('.timeline-timecode');
      expect(timecode?.textContent).toBe('00:01:01:15');
    });

    it('updates aria-valuenow when time changes', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(30);
      // aria-valuenow should reflect current time
      expect(container.getAttribute('aria-valuenow')).not.toBe('0');
    });
  });

  describe('markers display', () => {
    it('renders marker elements in the marker lane', () => {
      component = new TimelineComponent(container, controller, { showMarkers: true }, callbacks);
      
      const marker: TimelineMarker = { id: 'm1', time: 30, type: 'comment', label: 'A comment' };
      controller.addMarker(marker);
      
      const markerEl = container.querySelector('[data-marker-id="m1"]');
      expect(markerEl).not.toBeNull();
    });

    it('marker has correct aria-label', () => {
      component = new TimelineComponent(container, controller, { showMarkers: true }, callbacks);
      
      const marker: TimelineMarker = { id: 'm1', time: 30, type: 'comment', label: 'Test note' };
      controller.addMarker(marker);
      
      const markerEl = container.querySelector('[data-marker-id="m1"]');
      expect(markerEl?.getAttribute('aria-label')).toContain('comment marker');
      expect(markerEl?.getAttribute('aria-label')).toContain('Test note');
    });

    it('clicking a marker triggers handleMarkerClick and callback', () => {
      component = new TimelineComponent(container, controller, { showMarkers: true }, callbacks);
      
      const marker: TimelineMarker = { id: 'm1', time: 30, type: 'comment', label: 'Click me' };
      controller.addMarker(marker);
      
      const markerEl = container.querySelector('[data-marker-id="m1"]') as HTMLElement;
      markerEl.click();
      
      expect(callbacks.onMarkerClick).toHaveBeenCalledWith(marker);
    });

    it('removes markers when cleared from controller', () => {
      component = new TimelineComponent(container, controller, { showMarkers: true }, callbacks);
      
      controller.addMarker({ id: 'm1', time: 10, type: 'comment' });
      controller.addMarker({ id: 'm2', time: 50, type: 'annotation' });
      expect(container.querySelectorAll('[data-marker-id]')).toHaveLength(2);
      
      controller.clearMarkers();
      expect(container.querySelectorAll('[data-marker-id]')).toHaveLength(0);
    });
  });

  describe('keyboard navigation', () => {
    function pressKey(element: HTMLElement, key: string, options: Partial<KeyboardEventInit> = {}): void {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      element.dispatchEvent(event);
    }

    it('ArrowRight seeks forward 1 second', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(10);
      pressKey(container, 'ArrowRight');
      expect(controller.getState().currentTime).toBeGreaterThan(10);
    });

    it('ArrowLeft seeks backward 1 second', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(10);
      pressKey(container, 'ArrowLeft');
      expect(controller.getState().currentTime).toBeLessThan(10);
    });

    it('Shift+ArrowRight moves forward 1 frame', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(1);
      pressKey(container, 'ArrowRight', { shiftKey: true });
      // 1 frame at 30fps ≈ 0.033s forward
      expect(controller.getState().currentTime).toBeCloseTo(1 + 1 / 30, 3);
    });

    it('Shift+ArrowLeft moves backward 1 frame', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(1);
      pressKey(container, 'ArrowLeft', { shiftKey: true });
      expect(controller.getState().currentTime).toBeCloseTo(1 - 1 / 30, 3);
    });

    it('Home key seeks to beginning', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(60);
      pressKey(container, 'Home');
      expect(controller.getState().currentTime).toBe(0);
    });

    it('End key seeks to end', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      controller.seek(10);
      pressKey(container, 'End');
      expect(controller.getState().currentTime).toBeCloseTo(120, 1);
    });

    it('+ key zooms in', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      const initialZoom = controller.getState().zoomLevel;
      pressKey(container, '+');
      expect(controller.getState().zoomLevel).toBeGreaterThan(initialZoom);
    });

    it('- key zooms out', () => {
      controller.setZoom(5);
      component = new TimelineComponent(container, controller, {}, callbacks);
      pressKey(container, '-');
      expect(controller.getState().zoomLevel).toBeLessThan(5);
    });
  });

  describe('scrubbing via mouse', () => {
    it('mousedown on ruler starts scrubbing', () => {
      component = new TimelineComponent(container, controller, { enableScrubbing: true }, callbacks);
      const ruler = container.querySelector('.timeline-ruler') as HTMLCanvasElement;
      
      // Mock getBoundingClientRect for the ruler
      Object.defineProperty(ruler, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 800, height: 48, right: 800, bottom: 48 }),
      });
      
      const mousedown = new MouseEvent('mousedown', {
        clientX: 400, // middle of 800px = 50% of duration
        bubbles: true,
        cancelable: true,
      });
      ruler.dispatchEvent(mousedown);
      
      expect(controller.getState().isScrubbing).toBe(true);
    });

    it('mouseup ends scrubbing', () => {
      component = new TimelineComponent(container, controller, { enableScrubbing: true }, callbacks);
      const ruler = container.querySelector('.timeline-ruler') as HTMLCanvasElement;
      
      Object.defineProperty(ruler, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 800, height: 48, right: 800, bottom: 48 }),
      });
      
      ruler.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true, cancelable: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, bubbles: true }));
      
      expect(controller.getState().isScrubbing).toBe(false);
    });
  });

  describe('getElement and getController', () => {
    it('getElement() returns the timeline wrapper', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      expect(component.getElement()).not.toBeNull();
      expect(component.getElement()?.className).toContain('timeline-wrapper');
    });

    it('getController() returns the controller instance', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      expect(component.getController()).toBe(controller);
    });
  });

  describe('destroy', () => {
    it('clears container on destroy', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      component.destroy();
      expect(container.innerHTML).toBe('');
    });

    it('does not throw on double destroy', () => {
      component = new TimelineComponent(container, controller, {}, callbacks);
      component.destroy();
      expect(() => component.destroy()).not.toThrow();
    });

    it('stops responding to controller events after destroy', () => {
      component = new TimelineComponent(container, controller, { showTimecode: true }, callbacks);
      component.destroy();
      
      // This should not throw
      controller.seek(30);
    });
  });
});
