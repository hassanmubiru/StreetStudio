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
