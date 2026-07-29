/**
 * Timeline Editor Components
 * 
 * Frame-accurate timeline editor with zoom, navigation, trim tools,
 * split functionality, and audio waveform visualization.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.9
 */
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
  TimelineState,
  TrimMode,
  TrimOperation,
  SplitOperation,
  WaveformData,
  TimelineEditorOptions,
  TimelineEditorCallbacks,
} from './timeline-editor.js';
