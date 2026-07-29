/**
 * Timeline Components
 * 
 * Frame-accurate timeline with zoom controls, playback position indicator,
 * scrubbing, markers for comments/annotations, and jump-to-timestamp functionality.
 * 
 * Requirements: 5.3, 5.10, 6.1
 */

export {
  TimelineController,
  snapToFrame,
  frameToTime,
  timeToFrame,
  formatTimecode,
  DEFAULT_FRAME_RATE,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
} from './timeline-controller.js';

export type {
  TimelineMarker,
  TimelineState,
  TimelineOptions,
  TimelineCallbacks,
} from './timeline-controller.js';

export { TimelineComponent } from './timeline-component.js';

export type {
  TimelineComponentOptions,
  TimelineComponentCallbacks,
} from './timeline-component.js';
