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
