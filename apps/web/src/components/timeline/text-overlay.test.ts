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
