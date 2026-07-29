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
