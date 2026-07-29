/**
 * Unit tests for Text Overlay and Caption Editing
 * 
 * Tests text overlay tools with font, color, and positioning controls,
 * caption editing with speech-to-text integration, timing controls
 * for synchronization, and caption styling/accessibility compliance.
 * 
 * Requirements: 6.4, 6.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TextOverlayManager,
  generateOverlayId,
  relativeLuminance,
  contrastRatio,
  meetsWCAGContrast,
  hexToRgb,
  secondsToFrames,
  framesToSeconds,
  createDefaultStyle,
  createDefaultCaptionStyle,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_COLOR,
  DEFAULT_CAPTION_FONT_SIZE,
  DEFAULT_CAPTION_BG,
  DEFAULT_CAPTION_COLOR,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_OVERLAY_DURATION_FRAMES,
  AVAILABLE_FONTS,
} from './text-overlay';
import type {
  TextOverlayCallbacks,
  TextOverlayManagerOptions,
  SpeechToTextResult,
} from './text-overlay';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createManager(
  overrides?: Partial<TextOverlayManagerOptions>,
  callbacks?: TextOverlayCallbacks
): TextOverlayManager {
  return new TextOverlayManager(
    {
      frameRate: 30,
      containerWidth: 1920,
      containerHeight: 1080,
      ...overrides,
    },
    callbacks
  );
}

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('generateOverlayId', () => {
  it('generates a unique ID string', () => {
    const id1 = generateOverlayId();
    const id2 = generateOverlayId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^overlay-/);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex colors', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]);
    expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]);
  });

  it('parses 3-digit hex colors', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('handles without hash prefix', () => {
    expect(hexToRgb('ff0000')).toEqual([255, 0, 0]);
  });

  it('returns null for invalid input', () => {
    expect(hexToRgb('invalid')).toBeNull();
    expect(hexToRgb('#xyz')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for black', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
  });

  it('returns 1 for white', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });

  it('returns intermediate values for colors', () => {
    const lum = relativeLuminance('#808080');
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black vs white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1 for same color', () => {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 4);
  });

  it('is symmetric', () => {
    const ratio1 = contrastRatio('#ff0000', '#0000ff');
    const ratio2 = contrastRatio('#0000ff', '#ff0000');
    expect(ratio1).toBeCloseTo(ratio2, 4);
  });
});

describe('meetsWCAGContrast', () => {
  it('white on black meets AA', () => {
    expect(meetsWCAGContrast('#ffffff', '#000000')).toBe(true);
  });

  it('white on black meets AAA', () => {
    expect(meetsWCAGContrast('#ffffff', '#000000', 'AAA')).toBe(true);
  });

  it('light gray on white fails AA', () => {
    expect(meetsWCAGContrast('#cccccc', '#ffffff')).toBe(false);
  });
});

describe('secondsToFrames / framesToSeconds', () => {
  it('converts seconds to frames correctly', () => {
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(2.5, 30)).toBe(75);
  });

  it('converts frames to seconds correctly', () => {
    expect(framesToSeconds(30, 30)).toBe(1);
    expect(framesToSeconds(75, 30)).toBe(2.5);
  });

  it('handles zero frame rate', () => {
    expect(secondsToFrames(5, 0)).toBe(0);
    expect(framesToSeconds(100, 0)).toBe(0);
  });

  it('round-trips correctly', () => {
    const seconds = 3.5;
    const frames = secondsToFrames(seconds, 30);
    expect(framesToSeconds(frames, 30)).toBeCloseTo(seconds, 1);
  });
});

describe('createDefaultStyle', () => {
  it('creates style with default values', () => {
    const style = createDefaultStyle();
    expect(style.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    expect(style.fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(style.color).toBe(DEFAULT_COLOR);
    expect(style.opacity).toBe(1);
    expect(style.textAlign).toBe('center');
  });

  it('uses custom options when provided', () => {
    const style = createDefaultStyle({
      defaultFont: 'Georgia, serif',
      defaultFontSize: 32,
      defaultColor: '#ff0000',
    });
    expect(style.fontFamily).toBe('Georgia, serif');
    expect(style.fontSize).toBe(32);
    expect(style.color).toBe('#ff0000');
  });
});

describe('createDefaultCaptionStyle', () => {
  it('creates caption style with default values', () => {
    const style = createDefaultCaptionStyle();
    expect(style.fontSize).toBe(DEFAULT_CAPTION_FONT_SIZE);
    expect(style.color).toBe(DEFAULT_CAPTION_COLOR);
    expect(style.backgroundColor).toBe(DEFAULT_CAPTION_BG);
    expect(style.position).toBe('bottom');
    expect(style.textAlign).toBe('center');
  });
});

// ─── TextOverlayManager Tests ─────────────────────────────────────────────────

describe('TextOverlayManager', () => {
  let manager: TextOverlayManager;
  let callbacks: TextOverlayCallbacks;

  beforeEach(() => {
    callbacks = {
      onOverlayAdd: vi.fn(),
      onOverlayUpdate: vi.fn(),
      onOverlayRemove: vi.fn(),
      onCaptionAdd: vi.fn(),
      onCaptionUpdate: vi.fn(),
      onCaptionRemove: vi.fn(),
      onSpeechToTextStart: vi.fn(),
      onSpeechToTextComplete: vi.fn(),
      onSpeechToTextError: vi.fn(),
    };
    manager = createManager(undefined, callbacks);
  });

  // ─── Text Overlay Tests ─────────────────────────────────────────────────

  describe('overlay management', () => {
    it('adds a text overlay', () => {
      const overlay = manager.addOverlay('Hello', 0, 90);
      expect(overlay.id).toMatch(/^overlay-/);
      expect(overlay.text).toBe('Hello');
      expect(overlay.startFrame).toBe(0);
      expect(overlay.endFrame).toBe(90);
      expect(overlay.isVisible).toBe(true);
      expect(callbacks.onOverlayAdd).toHaveBeenCalledWith(overlay);
    });

    it('applies default style to new overlays', () => {
      const overlay = manager.addOverlay('Test', 0, 30);
      expect(overlay.style.fontFamily).toBe(DEFAULT_FONT_FAMILY);
      expect(overlay.style.fontSize).toBe(DEFAULT_FONT_SIZE);
      expect(overlay.style.color).toBe(DEFAULT_COLOR);
    });

    it('applies custom style to new overlays', () => {
      const overlay = manager.addOverlay('Custom', 0, 30, undefined, {
        fontSize: 48,
        color: '#ff0000',
      });
      expect(overlay.style.fontSize).toBe(48);
      expect(overlay.style.color).toBe('#ff0000');
    });

    it('applies custom position to new overlays', () => {
      const overlay = manager.addOverlay('Pos', 0, 30, {
        x: 25,
        y: 75,
        anchorX: 'left',
        anchorY: 'bottom',
      });
      expect(overlay.position.x).toBe(25);
      expect(overlay.position.y).toBe(75);
      expect(overlay.position.anchorX).toBe('left');
      expect(overlay.position.anchorY).toBe('bottom');
    });

    it('uses center position as default', () => {
      const overlay = manager.addOverlay('Center', 0, 30);
      expect(overlay.position.x).toBe(50);
      expect(overlay.position.y).toBe(50);
      expect(overlay.position.anchorX).toBe('center');
      expect(overlay.position.anchorY).toBe('middle');
    });

    it('retrieves an overlay by ID', () => {
      const overlay = manager.addOverlay('Find me', 0, 60);
      expect(manager.getOverlay(overlay.id)).toEqual(overlay);
    });

    it('returns undefined for non-existent overlay', () => {
      expect(manager.getOverlay('non-existent')).toBeUndefined();
    });

    it('gets all overlays', () => {
      manager.addOverlay('One', 0, 30);
      manager.addOverlay('Two', 30, 60);
      expect(manager.getAllOverlays()).toHaveLength(2);
    });

    it('removes an overlay', () => {
      const overlay = manager.addOverlay('Remove', 0, 30);
      const result = manager.removeOverlay(overlay.id);
      expect(result).toBe(true);
      expect(manager.getOverlay(overlay.id)).toBeUndefined();
      expect(callbacks.onOverlayRemove).toHaveBeenCalledWith(overlay.id);
    });

    it('returns false when removing non-existent overlay', () => {
      expect(manager.removeOverlay('ghost')).toBe(false);
    });

    it('tracks overlay count', () => {
      expect(manager.getOverlayCount()).toBe(0);
      manager.addOverlay('A', 0, 30);
      expect(manager.getOverlayCount()).toBe(1);
      manager.addOverlay('B', 30, 60);
      expect(manager.getOverlayCount()).toBe(2);
    });
  });

  describe('overlay updates', () => {
    it('updates overlay text', () => {
      const overlay = manager.addOverlay('Old', 0, 30);
      const updated = manager.updateOverlay(overlay.id, { text: 'New' });
      expect(updated?.text).toBe('New');
      expect(callbacks.onOverlayUpdate).toHaveBeenCalled();
    });

    it('returns null when updating non-existent overlay', () => {
      expect(manager.updateOverlay('ghost', { text: 'x' })).toBeNull();
    });

    it('updates overlay position', () => {
      const overlay = manager.addOverlay('Pos', 0, 30);
      const updated = manager.setOverlayPosition(overlay.id, 75, 25);
      expect(updated?.position.x).toBe(75);
      expect(updated?.position.y).toBe(25);
    });

    it('clamps position to 0-100', () => {
      const overlay = manager.addOverlay('Clamp', 0, 30);
      const updated = manager.setOverlayPosition(overlay.id, -10, 150);
      expect(updated?.position.x).toBe(0);
      expect(updated?.position.y).toBe(100);
    });

    it('updates overlay timing', () => {
      const overlay = manager.addOverlay('Time', 0, 60);
      const updated = manager.setOverlayTiming(overlay.id, 10, 90);
      expect(updated?.startFrame).toBe(10);
      expect(updated?.endFrame).toBe(90);
    });

    it('enforces minimum duration on timing', () => {
      const overlay = manager.addOverlay('Min', 0, 60);
      const updated = manager.setOverlayTiming(overlay.id, 50, 50);
      expect(updated?.endFrame).toBeGreaterThanOrEqual(
        50 + MIN_OVERLAY_DURATION_FRAMES
      );
    });

    it('clamps start frame to 0', () => {
      const overlay = manager.addOverlay('Neg', 0, 60);
      const updated = manager.setOverlayTiming(overlay.id, -10, 30);
      expect(updated?.startFrame).toBe(0);
    });
  });

  describe('overlay styling', () => {
    it('updates font family', () => {
      const overlay = manager.addOverlay('Font', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, {
        fontFamily: 'Georgia, serif',
      });
      expect(updated?.style.fontFamily).toBe('Georgia, serif');
    });

    it('updates font size', () => {
      const overlay = manager.addOverlay('Size', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, { fontSize: 48 });
      expect(updated?.style.fontSize).toBe(48);
    });

    it('clamps font size to min', () => {
      const overlay = manager.addOverlay('Min', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, { fontSize: 2 });
      expect(updated?.style.fontSize).toBe(MIN_FONT_SIZE);
    });

    it('clamps font size to max', () => {
      const overlay = manager.addOverlay('Max', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, { fontSize: 500 });
      expect(updated?.style.fontSize).toBe(MAX_FONT_SIZE);
    });

    it('updates color', () => {
      const overlay = manager.addOverlay('Color', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, {
        color: '#ff0000',
      });
      expect(updated?.style.color).toBe('#ff0000');
    });

    it('updates opacity', () => {
      const overlay = manager.addOverlay('Opacity', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, { opacity: 0.5 });
      expect(updated?.style.opacity).toBe(0.5);
    });

    it('clamps opacity to 0-1', () => {
      const overlay = manager.addOverlay('Op', 0, 30);
      let updated = manager.setOverlayStyle(overlay.id, { opacity: -0.5 });
      expect(updated?.style.opacity).toBe(0);
      updated = manager.setOverlayStyle(overlay.id, { opacity: 1.5 });
      expect(updated?.style.opacity).toBe(1);
    });

    it('updates text alignment', () => {
      const overlay = manager.addOverlay('Align', 0, 30);
      const updated = manager.setOverlayStyle(overlay.id, {
        textAlign: 'left',
      });
      expect(updated?.style.textAlign).toBe('left');
    });

    it('returns null when styling non-existent overlay', () => {
      expect(manager.setOverlayStyle('ghost', { fontSize: 32 })).toBeNull();
    });
  });
