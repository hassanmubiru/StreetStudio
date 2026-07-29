/**
 * Timeline Components
 * 
 * Includes:
 * - TimelineController/TimelineComponent for playback timeline with markers (Requirements: 5.3, 5.10, 6.1)
 * - TimelineEditor with trim, split, waveform for video editing (Requirements: 6.1, 6.2, 6.3, 6.9)
 */

// Timeline Controller (playback/review)
export {
  TimelineController,
  snapToFrame,
  frameToTime,
  timeToFrame,
  formatTimecode,
} from './timeline-controller.js';

export type {
  TimelineMarker,
  TimelineState as TimelineControllerState,
  TimelineOptions,
  TimelineCallbacks,
} from './timeline-controller.js';

export { TimelineComponent } from './timeline-component.js';

// Timeline Editor (video editing)
export {
  TimelineEditor,
  WaveformRenderer,
  frameToTimecode,
  timecodeToFrame,
  frameToSeconds,
  secondsToFrame,
  frameToPixel,
  pixelToFrame,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  DEFAULT_FRAME_RATE,
  PIXELS_PER_FRAME_BASE,
  TRIM_HANDLE_WIDTH,
  PLAYHEAD_WIDTH,
  WAVEFORM_HEIGHT,
  TIMELINE_TRACK_HEIGHT,
  RULER_HEIGHT,
  MIN_CLIP_FRAMES,
} from './timeline-editor.js';

export type {
  TimelineClip,
  TimelineState as TimelineEditorState,
  TrimMode,
  TrimOperation,
  SplitOperation,
  WaveformData,
  TimelineEditorOptions,
  TimelineEditorCallbacks,
} from './timeline-editor.js';

// Text Overlay and Caption Editing (Requirements: 6.4, 6.5)
export {
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
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CAPTION_FONT_SIZE,
  DEFAULT_CAPTION_BG,
  DEFAULT_CAPTION_COLOR,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_OVERLAY_DURATION_FRAMES,
  CAPTION_MIN_CONTRAST_RATIO,
  AVAILABLE_FONTS,
} from './text-overlay.js';

export type {
  TextOverlayStyle,
  TextShadowConfig,
  TextOutlineConfig,
  TextPosition,
  TextOverlay,
  CaptionCue,
  CaptionStyle,
  CaptionPosition,
  SpeechToTextResult,
  TextOverlayManagerOptions,
  TextOverlayCallbacks,
} from './text-overlay.js';
