/**
 * Mobile-Optimized Interface Components
 * 
 * Touch-friendly components for mobile devices including:
 * - Mobile video player with gesture controls
 * - Touch gesture detection handler
 * - Mobile comment input with keyboard optimization
 * - Swipe actions for list items
 * 
 * Requirements: 10.4, 10.5
 */

export { TouchGestureHandler } from './touch-gesture-handler.js';
export type {
  GestureEvent,
  PanEvent,
  SwipeDirection,
  GestureType,
  TouchGestureOptions,
  TouchGestureCallbacks,
} from './touch-gesture-handler.js';

export { MobileVideoPlayer } from './mobile-video-player.js';
export type {
  MobilePlayerOptions,
  MobilePlayerCallbacks,
  MobilePlayerState,
} from './mobile-video-player.js';

export { MobileCommentInput } from './mobile-comment-input.js';
export type {
  MobileCommentInputOptions,
  MobileCommentInputCallbacks,
  MobileCommentInputState,
} from './mobile-comment-input.js';

export { SwipeableItem, SwipeActionsList } from './swipe-actions.js';
export type {
  SwipeAction,
  SwipeActionType,
  SwipeActionsOptions,
  SwipeActionsCallbacks,
  SwipeableItemOptions,
} from './swipe-actions.js';
