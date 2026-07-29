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
