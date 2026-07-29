/**
 * Text Overlay and Caption Editing
 * 
 * Provides text overlay tools with font, color, and positioning controls,
 * caption editing with speech-to-text integration, timing controls for
 * text and caption synchronization, and caption styling with accessibility compliance.
 * 
 * Requirements: 6.4, 6.5
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TextOverlayStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'light';
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor: string;
  opacity: number;
  textAlign: 'left' | 'center' | 'right';
  textDecoration: 'none' | 'underline' | 'strikethrough';
  letterSpacing: number;
  lineHeight: number;
  textShadow: TextShadowConfig | null;
  outline: TextOutlineConfig | null;
}

export interface TextShadowConfig {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface TextOutlineConfig {
  width: number;
  color: string;
}

export interface TextPosition {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  anchorX: 'left' | 'center' | 'right';
  anchorY: 'top' | 'middle' | 'bottom';
}

export interface TextOverlay {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  position: TextPosition;
  style: TextOverlayStyle;
  isVisible: boolean;
}

export interface CaptionCue {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  style: CaptionStyle;
  speaker?: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  opacity: number;
  position: CaptionPosition;
  textAlign: 'left' | 'center' | 'right';
}

export type CaptionPosition = 'top' | 'middle' | 'bottom';

export interface SpeechToTextResult {
  text: string;
  startTime: number; // seconds
  endTime: number; // seconds
  confidence: number;
  speaker?: string;
}

export interface TextOverlayManagerOptions {
  frameRate: number;
  containerWidth: number;
  containerHeight: number;
  defaultFont?: string;
  defaultFontSize?: number;
  defaultColor?: string;
  captionFontSize?: number;
  captionBackgroundColor?: string;
  captionColor?: string;
  enableSpeechToText?: boolean;
}

export interface TextOverlayCallbacks {
  onOverlayAdd?: (overlay: TextOverlay) => void;
  onOverlayUpdate?: (overlay: TextOverlay) => void;
  onOverlayRemove?: (overlayId: string) => void;
  onCaptionAdd?: (caption: CaptionCue) => void;
  onCaptionUpdate?: (caption: CaptionCue) => void;
  onCaptionRemove?: (captionId: string) => void;
  onSpeechToTextStart?: () => void;
  onSpeechToTextComplete?: (results: SpeechToTextResult[]) => void;
  onSpeechToTextError?: (error: Error) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_FONT_FAMILY = 'Arial, sans-serif';
export const DEFAULT_FONT_SIZE = 24;
export const DEFAULT_COLOR = '#ffffff';
export const DEFAULT_BACKGROUND_COLOR = 'transparent';
export const DEFAULT_CAPTION_FONT_SIZE = 18;
export const DEFAULT_CAPTION_BG = 'rgba(0, 0, 0, 0.75)';
export const DEFAULT_CAPTION_COLOR = '#ffffff';
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
export const MIN_OVERLAY_DURATION_FRAMES = 1;
export const CAPTION_MIN_CONTRAST_RATIO = 4.5; // WCAG AA

export const AVAILABLE_FONTS = [
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Courier New, monospace',
  'Verdana, sans-serif',
  'Impact, sans-serif',
  'Comic Sans MS, cursive',
  'Trebuchet MS, sans-serif',
  'Roboto, sans-serif',
];

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Generate a unique ID for overlays and captions.
 */
export function generateOverlayId(): string {
  return `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate relative luminance of a color (for WCAG contrast).
 * Accepts hex colors like #rrggbb or #rgb.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map(c => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors.
 * Returns a value between 1 and 21.
 */
export function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if text/background color combination meets WCAG AA.
 */
export function meetsWCAGContrast(
  textColor: string,
  bgColor: string,
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  const ratio = contrastRatio(textColor, bgColor);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Convert hex color to RGB array.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Convert seconds to frames.
 */
export function secondsToFrames(seconds: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return Math.round(seconds * frameRate);
}

/**
 * Convert frames to seconds.
 */
export function framesToSeconds(frames: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return frames / frameRate;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Create a default text overlay style.
 */
export function createDefaultStyle(
  options?: Partial<TextOverlayManagerOptions>
): TextOverlayStyle {
  return {
    fontFamily: options?.defaultFont ?? DEFAULT_FONT_FAMILY,
    fontSize: options?.defaultFontSize ?? DEFAULT_FONT_SIZE,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: options?.defaultColor ?? DEFAULT_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    opacity: 1,
    textAlign: 'center',
    textDecoration: 'none',
    letterSpacing: 0,
    lineHeight: 1.2,
    textShadow: null,
    outline: null,
  };
}

/**
 * Create a default caption style.
 */
export function createDefaultCaptionStyle(
  options?: Partial<TextOverlayManagerOptions>
): CaptionStyle {
  return {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: options?.captionFontSize ?? DEFAULT_CAPTION_FONT_SIZE,
    color: options?.captionColor ?? DEFAULT_CAPTION_COLOR,
    backgroundColor: options?.captionBackgroundColor ?? DEFAULT_CAPTION_BG,
    opacity: 1,
    position: 'bottom',
    textAlign: 'center',
  };
}

// ─── TextOverlayManager Class ─────────────────────────────────────────────────

/**
 * Manages text overlays and captions on the timeline.
 * Provides tools for adding, editing, positioning, and timing text elements
 * as well as caption editing with speech-to-text integration.
 */
export class TextOverlayManager {
  private overlays: Map<string, TextOverlay> = new Map();
  private captions: Map<string, CaptionCue> = new Map();
  private options: Required<TextOverlayManagerOptions>;
  private callbacks: TextOverlayCallbacks;
  private speechToTextActive = false;
  private currentFrame = 0;

  constructor(
    options: TextOverlayManagerOptions,
    callbacks: TextOverlayCallbacks = {}
  ) {
    this.options = {
      frameRate: options.frameRate,
      containerWidth: options.containerWidth,
      containerHeight: options.containerHeight,
      defaultFont: options.defaultFont ?? DEFAULT_FONT_FAMILY,
      defaultFontSize: options.defaultFontSize ?? DEFAULT_FONT_SIZE,
      defaultColor: options.defaultColor ?? DEFAULT_COLOR,
      captionFontSize: options.captionFontSize ?? DEFAULT_CAPTION_FONT_SIZE,
      captionBackgroundColor:
        options.captionBackgroundColor ?? DEFAULT_CAPTION_BG,
      captionColor: options.captionColor ?? DEFAULT_CAPTION_COLOR,
      enableSpeechToText: options.enableSpeechToText ?? false,
    };
    this.callbacks = callbacks;
  }

  // ─── Text Overlay Operations ──────────────────────────────────────────────

  /**
   * Add a new text overlay to the timeline.
   */
  public addOverlay(
    text: string,
    startFrame: number,
    endFrame: number,
    position?: Partial<TextPosition>,
    style?: Partial<TextOverlayStyle>
  ): TextOverlay {
    const id = generateOverlayId();
    const overlay: TextOverlay = {
      id,
      text,
      startFrame: Math.max(0, Math.round(startFrame)),
      endFrame: Math.max(
        Math.round(startFrame) + MIN_OVERLAY_DURATION_FRAMES,
        Math.round(endFrame)
      ),
      position: {
        x: position?.x ?? 50,
        y: position?.y ?? 50,
        anchorX: position?.anchorX ?? 'center',
        anchorY: position?.anchorY ?? 'middle',
      },
      style: { ...createDefaultStyle(this.options), ...style },
      isVisible: true,
    };

    this.overlays.set(id, overlay);
    this.callbacks.onOverlayAdd?.(overlay);
    return overlay;
  }

  /**
   * Update an existing text overlay.
   */
  public updateOverlay(
    id: string,
    updates: Partial<Omit<TextOverlay, 'id'>>
  ): TextOverlay | null {
    const overlay = this.overlays.get(id);
    if (!overlay) return null;

    const updated: TextOverlay = {
      ...overlay,
      ...updates,
      id, // ID cannot change
      position: updates.position
        ? { ...overlay.position, ...updates.position }
        : overlay.position,
      style: updates.style
        ? { ...overlay.style, ...updates.style }
        : overlay.style,
    };

    // Validate timing
    updated.startFrame = Math.max(0, Math.round(updated.startFrame));
    updated.endFrame = Math.max(
      updated.startFrame + MIN_OVERLAY_DURATION_FRAMES,
      Math.round(updated.endFrame)
    );

    this.overlays.set(id, updated);
    this.callbacks.onOverlayUpdate?.(updated);
    return updated;
  }

  /**
   * Remove a text overlay.
   */
  public removeOverlay(id: string): boolean {
    const existed = this.overlays.delete(id);
    if (existed) {
      this.callbacks.onOverlayRemove?.(id);
    }
    return existed;
  }

  /**
   * Get a specific overlay by ID.
   */
  public getOverlay(id: string): TextOverlay | undefined {
    return this.overlays.get(id);
  }

  /**
   * Get all overlays.
   */
  public getAllOverlays(): TextOverlay[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Get overlays visible at a specific frame.
   */
  public getOverlaysAtFrame(frame: number): TextOverlay[] {
    return Array.from(this.overlays.values()).filter(
      o => o.isVisible && frame >= o.startFrame && frame <= o.endFrame
    );
  }

  /**
   * Update overlay position (percentage-based, 0-100).
   */
  public setOverlayPosition(
    id: string,
    x: number,
    y: number
  ): TextOverlay | null {
    const overlay = this.overlays.get(id);
    if (!overlay) return null;

    return this.updateOverlay(id, {
      position: {
        ...overlay.position,
        x: clamp(x, 0, 100),
        y: clamp(y, 0, 100),
      },
    });
  }

  /**
   * Update overlay timing (start and end frames).
   */
  public setOverlayTiming(
    id: string,
    startFrame: number,
    endFrame: number
  ): TextOverlay | null {
    return this.updateOverlay(id, { startFrame, endFrame });
  }

  /**
   * Update overlay style properties.
   */
  public setOverlayStyle(
    id: string,
    style: Partial<TextOverlayStyle>
  ): TextOverlay | null {
    const overlay = this.overlays.get(id);
    if (!overlay) return null;

    // Validate font size bounds
    if (style.fontSize !== undefined) {
      style.fontSize = clamp(style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
    }

    // Validate opacity
    if (style.opacity !== undefined) {
      style.opacity = clamp(style.opacity, 0, 1);
    }

    return this.updateOverlay(id, {
      style: { ...overlay.style, ...style },
    });
  }

  /**
   * Toggle overlay visibility.
   */
  public toggleOverlayVisibility(id: string): TextOverlay | null {
    const overlay = this.overlays.get(id);
    if (!overlay) return null;
    return this.updateOverlay(id, { isVisible: !overlay.isVisible });
  }

  // ─── Caption Operations ─────────────────────────────────────────────────

  /**
   * Add a caption cue.
   */
  public addCaption(
    text: string,
    startFrame: number,
    endFrame: number,
    style?: Partial<CaptionStyle>,
    speaker?: string
  ): CaptionCue {
    const id = generateOverlayId();
    const caption: CaptionCue = {
      id,
      text,
      startFrame: Math.max(0, Math.round(startFrame)),
      endFrame: Math.max(
        Math.round(startFrame) + MIN_OVERLAY_DURATION_FRAMES,
        Math.round(endFrame)
      ),
      style: { ...createDefaultCaptionStyle(this.options), ...style },
      speaker,
    };

    this.captions.set(id, caption);
    this.callbacks.onCaptionAdd?.(caption);
    return caption;
  }

  /**
   * Update an existing caption.
   */
  public updateCaption(
    id: string,
    updates: Partial<Omit<CaptionCue, 'id'>>
  ): CaptionCue | null {
    const caption = this.captions.get(id);
    if (!caption) return null;

    const updated: CaptionCue = {
      ...caption,
      ...updates,
      id,
      style: updates.style
        ? { ...caption.style, ...updates.style }
        : caption.style,
    };

    updated.startFrame = Math.max(0, Math.round(updated.startFrame));
    updated.endFrame = Math.max(
      updated.startFrame + MIN_OVERLAY_DURATION_FRAMES,
      Math.round(updated.endFrame)
    );

    this.captions.set(id, updated);
    this.callbacks.onCaptionUpdate?.(updated);
    return updated;
  }

  /**
   * Remove a caption.
   */
  public removeCaption(id: string): boolean {
    const existed = this.captions.delete(id);
    if (existed) {
      this.callbacks.onCaptionRemove?.(id);
    }
    return existed;
  }

  /**
   * Get a specific caption by ID.
   */
  public getCaption(id: string): CaptionCue | undefined {
    return this.captions.get(id);
  }

  /**
   * Get all captions.
   */
  public getAllCaptions(): CaptionCue[] {
    return Array.from(this.captions.values());
  }
