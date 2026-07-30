/**
 * Unit tests for Mobile Functionality
 * 
 * Comprehensive tests covering:
 * - Responsive layout behavior across breakpoints (Requirements 10.1)
 * - Touch gestures and mobile-specific interactions (Requirements 10.2)
 * - Offline capabilities and background sync (Requirements 10.6)
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKPOINTS,
  MEDIA_QUERIES,
  MIN_TOUCH_TARGET,
  getCurrentBreakpoint,
  isBreakpointActive,
  isTouchDevice,
  BreakpointObserver,
  ResponsiveCSS,
} from '../../styles/responsive.js';
import { TouchGestureHandler } from './touch-gesture-handler.js';
import { PullToRefresh } from './pull-to-refresh.js';
import { StorageManager, StorageType } from '../../services/storage.js';

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});

function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches?: Array<{ clientX: number; clientY: number }>
): TouchEvent {
  const touchList = touches.map((t, i) => ({
    identifier: i,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    target: document.body,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  })) as unknown as Touch[];

  const changed = (changedTouches || touches).map((t, i) => ({
    identifier: i,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    target: document.body,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  })) as unknown as Touch[];

  return new TouchEvent(type, {
    touches: touchList,
    changedTouches: changed,
    bubbles: true,
    cancelable: true,
  });
}

// ===========================================================================
// Section 1: Responsive Layout Behavior Across Breakpoints
// ===========================================================================
