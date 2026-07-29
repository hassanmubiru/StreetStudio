/**
 * Property-Based Tests for Collaboration Presence Reliability
 *
 * **Property 7: Collaboration Presence Reliability**
 * **Validates: Requirements 7.1**
 *
 * For any number of concurrent users viewing a video, presence indicators
 * SHALL accurately display all active viewers with correct avatar thumbnails
 * and user information.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  PresenceTracker,
  PresenceIndicators,
  getInitials,
  getAvatarColor,
  isValidPresenceUser,
  type PresenceUser,
  type PresenceIndicatorsOptions,
  type Uuid,
} from './presence-indicators.js';

// --------------------------------------------------------------------------
// Arbitraries (Generators)
// --------------------------------------------------------------------------

/**
 * Arbitrary for generating valid UUIDs.
 */
const uuidArbitrary = fc.uuid();

/**
 * Arbitrary for generating display names.
 */
const displayNameArbitrary = fc.oneof(
  fc.constantFrom(
    'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince',
    'Eve Wilson', 'Frank Miller', 'Grace Hopper', 'Henry Ford',
    'Ivy Chen', 'Jack Thompson', 'Kate Williams', 'Leo Martinez'
  ),
  fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim())
);

/**
 * Arbitrary for generating avatar URLs.
 */
const avatarUrlArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.webUrl().map(url => `${url}/avatar.png`)
);

/**
 * Arbitrary for generating presence status.
 */
const presenceStatusArbitrary = fc.oneof(
  fc.constant('active' as const),
  fc.constant('idle' as const),
  fc.constant('away' as const)
);

/**
 * Arbitrary for generating ISO timestamps.
 */
const isoTimestampArbitrary = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2025-12-31'),
}).map(d => d.toISOString());

/**
 * Arbitrary for generating a valid PresenceUser.
 */
const presenceUserArbitrary = fc.record({
  id: uuidArbitrary,
  displayName: displayNameArbitrary,
  avatarUrl: avatarUrlArbitrary,
  status: presenceStatusArbitrary,
  joinedAt: isoTimestampArbitrary,
  isTyping: fc.oneof(fc.constant(undefined), fc.boolean()),
});

/**
 * Arbitrary for generating a list of unique viewers (unique by ID).
 */
const viewerListArbitrary = (minLength = 0, maxLength = 50) =>
  fc.uniqueArray(presenceUserArbitrary, {
    minLength,
    maxLength,
    selector: (user) => user.id,
  });

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('Property 7: Collaboration Presence Reliability', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * Core property: For any number of concurrent users, the presence tracker
   * accurately tracks all active viewers with correct user information.
   */
  it('accurately tracks all active viewers regardless of count', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(0, 50),
        uuidArbitrary,
        (viewers, currentUserId) => {
          const tracker = new PresenceTracker(currentUserId);

          // Add all viewers
          for (const viewer of viewers) {
            tracker.upsertUser(viewer);
          }

          // Expected viewers: all valid users except current user
          const expectedViewers = viewers.filter(
            v => isValidPresenceUser(v) && v.id !== currentUserId
          );

          const trackedViewers = tracker.getViewers();

          // Count must match
          expect(trackedViewers.length).toBe(expectedViewers.length);
          expect(tracker.getViewerCount()).toBe(expectedViewers.length);

          // Every expected viewer must be present with correct info
          for (const expected of expectedViewers) {
            const found = trackedViewers.find(v => v.id === expected.id);
            expect(found).toBeDefined();
            expect(found!.displayName).toBe(expected.displayName);
            expect(found!.avatarUrl).toBe(expected.avatarUrl);
            expect(found!.status).toBe(expected.status);
            expect(found!.joinedAt).toBe(expected.joinedAt);
          }

          // No extra viewers should be tracked
          for (const tracked of trackedViewers) {
            const isExpected = expectedViewers.some(e => e.id === tracked.id);
            expect(isExpected).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * The presence UI component renders correct avatar elements for all viewers.
   */
  it('renders correct avatar elements for all viewers with proper user information', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(1, 30),
        uuidArbitrary,
        fc.integer({ min: 1, max: 10 }),
        (viewers, currentUserId, maxVisibleAvatars) => {
          // Ensure currentUserId is not in the viewer list
          const filteredViewers = viewers.filter(v => v.id !== currentUserId);
          if (filteredViewers.length === 0) return; // skip trivial case

          const options: PresenceIndicatorsOptions = {
            videoId: 'test-video-id',
            currentUserId,
            maxVisibleAvatars,
            showTypingIndicators: true,
            showViewersList: true,
          };

          const indicators = new PresenceIndicators(container, options);
          indicators.setViewers(filteredViewers);

          // Check avatar stack exists
          const avatarStack = container.querySelector('.presence-avatar-stack');
          expect(avatarStack).not.toBeNull();

          // Count rendered avatars (excluding overflow indicator)
          const avatars = avatarStack!.querySelectorAll('.presence-avatar:not(.presence-overflow)');
          const expectedVisible = Math.min(filteredViewers.length, maxVisibleAvatars);
          expect(avatars.length).toBe(expectedVisible);

          // Each visible avatar should have correct user info in aria-label
          const sortedViewers = [...filteredViewers].sort(
            (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
          );

          for (let i = 0; i < expectedVisible; i++) {
            const avatar = avatars[i]!;
            const viewer = sortedViewers[i]!;
            const ariaLabel = avatar.getAttribute('aria-label');
            expect(ariaLabel).toContain(viewer.displayName);
            expect(ariaLabel).toContain(viewer.status);

            // Verify user ID is stored
            expect(avatar.getAttribute('data-user-id')).toBe(viewer.id);

            // Verify avatar content (image or initials)
            if (viewer.avatarUrl) {
              const img = avatar.querySelector('img');
              expect(img).not.toBeNull();
              expect(img!.src).toBe(viewer.avatarUrl);
            } else {
              const initials = avatar.querySelector('.presence-avatar-initials');
              expect(initials).not.toBeNull();
              expect(initials!.textContent).toBe(getInitials(viewer.displayName));
            }
          }

          // Check overflow indicator if needed
          if (filteredViewers.length > maxVisibleAvatars) {
            const overflow = avatarStack!.querySelector('.presence-overflow');
            expect(overflow).not.toBeNull();
            const overflowCount = filteredViewers.length - maxVisibleAvatars;
            expect(overflow!.textContent).toBe(`+${overflowCount}`);
          }

          indicators.destroy();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * The current user is never shown in the presence indicators.
   */
  it('never displays the current user in the viewers list', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(1, 20),
        (viewers) => {
          // Pick one viewer to be the "current user"
          const currentUser = viewers[0]!;

          const tracker = new PresenceTracker(currentUser.id);
          for (const viewer of viewers) {
            tracker.upsertUser(viewer);
          }

          const trackedViewers = tracker.getViewers();

          // Current user should never appear
          const hasSelf = trackedViewers.some(v => v.id === currentUser.id);
          expect(hasSelf).toBe(false);

          // All other valid viewers should be present
          const expectedOthers = viewers.filter(
            v => v.id !== currentUser.id && isValidPresenceUser(v)
          );
          expect(trackedViewers.length).toBe(expectedOthers.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * User join/leave operations maintain accurate presence state.
   */
  it('maintains accurate state through arbitrary join/leave sequences', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(2, 30),
        uuidArbitrary,
        fc.array(
          fc.record({
            action: fc.oneof(fc.constant('join'), fc.constant('leave')),
            userIndex: fc.nat(),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (initialViewers, currentUserId, operations) => {
          const tracker = new PresenceTracker(currentUserId);

          // Start with initial viewers
          const activeSet = new Set<Uuid>();
          const userMap = new Map<Uuid, PresenceUser>();

          for (const viewer of initialViewers) {
            if (viewer.id !== currentUserId && isValidPresenceUser(viewer)) {
              tracker.upsertUser(viewer);
              activeSet.add(viewer.id);
              userMap.set(viewer.id, viewer);
            }
          }

          // Apply operations
          for (const op of operations) {
            const targetIndex = op.userIndex % initialViewers.length;
            const targetUser = initialViewers[targetIndex]!;

            if (op.action === 'leave' && activeSet.has(targetUser.id)) {
              tracker.removeUser(targetUser.id);
              activeSet.delete(targetUser.id);
            } else if (op.action === 'join' && !activeSet.has(targetUser.id)) {
              if (targetUser.id !== currentUserId) {
                tracker.upsertUser(targetUser);
                activeSet.add(targetUser.id);
              }
            }
          }

          // Verify final state matches expected
          const trackedViewers = tracker.getViewers();
          expect(trackedViewers.length).toBe(activeSet.size);

          for (const viewer of trackedViewers) {
            expect(activeSet.has(viewer.id)).toBe(true);
          }

          for (const id of activeSet) {
            expect(tracker.hasUser(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * User information updates are reflected accurately in the display.
   */
  it('reflects user information updates accurately', () => {
    fc.assert(
      fc.property(
        presenceUserArbitrary,
        presenceUserArbitrary,
        uuidArbitrary,
        (originalUser, updatedInfo, currentUserId) => {
          // Ensure user is not the current user
          if (originalUser.id === currentUserId) return;

          const tracker = new PresenceTracker(currentUserId);
          tracker.upsertUser(originalUser);

          // Update with new info but same ID
          const updatedUser: PresenceUser = {
            ...updatedInfo,
            id: originalUser.id,
          };
          tracker.upsertUser(updatedUser);

          // Should still have exactly one entry
          expect(tracker.getViewerCount()).toBe(1);

          const viewers = tracker.getViewers();
          const viewer = viewers[0]!;

          // Updated info should be reflected
          expect(viewer.id).toBe(originalUser.id);
          expect(viewer.displayName).toBe(updatedUser.displayName);
          expect(viewer.avatarUrl).toBe(updatedUser.avatarUrl);
          expect(viewer.status).toBe(updatedUser.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * Presence indicators correctly handle the full viewers list display.
   */
  it('expanded viewers list shows all viewers with complete information', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(1, 20),
        uuidArbitrary,
        (viewers, currentUserId) => {
          const filteredViewers = viewers.filter(v => v.id !== currentUserId);
          if (filteredViewers.length === 0) return;

          const options: PresenceIndicatorsOptions = {
            videoId: 'test-video-id',
            currentUserId,
            maxVisibleAvatars: 3,
            showTypingIndicators: true,
            showViewersList: true,
          };

          const indicators = new PresenceIndicators(container, options);
          indicators.setViewers(filteredViewers);

          // Simulate expanding the viewers list
          const toggleBtn = container.querySelector('.presence-viewers-toggle') as HTMLButtonElement;
          expect(toggleBtn).not.toBeNull();
          toggleBtn.click();

          // Verify viewers list is rendered
          const viewersList = container.querySelector('.presence-viewers-list');
          expect(viewersList).not.toBeNull();

          // All viewers should be listed
          const listItems = viewersList!.querySelectorAll('.presence-viewer-item');
          expect(listItems.length).toBe(filteredViewers.length);

          // Each item should have correct user ID
          const sortedViewers = [...filteredViewers].sort(
            (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
          );

          for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i]!;
            const viewer = sortedViewers[i]!;
            expect(item.getAttribute('data-user-id')).toBe(viewer.id);

            // Verify name is displayed
            const nameEl = item.querySelector('.presence-viewer-name');
            expect(nameEl).not.toBeNull();
            expect(nameEl!.textContent).toBe(viewer.displayName);

            // Verify status is displayed
            const statusEl = item.querySelector('.presence-viewer-status');
            expect(statusEl).not.toBeNull();
            expect(statusEl!.textContent).toBe(viewer.status);
          }

          indicators.destroy();
          container.innerHTML = '';
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * The getInitials utility always produces valid initials for any display name.
   */
  it('getInitials produces valid initials for any display name', () => {
    fc.assert(
      fc.property(
        displayNameArbitrary,
        (name) => {
          const initials = getInitials(name);
          // Initials should be non-empty
          expect(initials.length).toBeGreaterThan(0);
          // Initials should be at most 2 characters
          expect(initials.length).toBeLessThanOrEqual(2);
          // Initials should be uppercase
          expect(initials).toBe(initials.toUpperCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * The getAvatarColor utility deterministically maps user IDs to colors.
   */
  it('getAvatarColor is deterministic for the same user ID', () => {
    fc.assert(
      fc.property(
        uuidArbitrary,
        (userId) => {
          const color1 = getAvatarColor(userId);
          const color2 = getAvatarColor(userId);
          expect(color1).toBe(color2);
          // Should be a valid hex color
          expect(color1).toMatch(/^#[0-9a-f]{6}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * Viewer count displayed always matches actual tracked viewers.
   */
  it('viewer count badge matches actual tracked viewer count', () => {
    fc.assert(
      fc.property(
        viewerListArbitrary(1, 30),
        uuidArbitrary,
        (viewers, currentUserId) => {
          const filteredViewers = viewers.filter(v => v.id !== currentUserId);
          if (filteredViewers.length === 0) return;

          const options: PresenceIndicatorsOptions = {
            videoId: 'test-video-id',
            currentUserId,
            maxVisibleAvatars: 5,
            showTypingIndicators: true,
            showViewersList: true,
          };

          const indicators = new PresenceIndicators(container, options);
          indicators.setViewers(filteredViewers);

          // The toggle button text should reflect the correct count
          const toggleBtn = container.querySelector('.presence-viewers-toggle');
          expect(toggleBtn).not.toBeNull();
          expect(toggleBtn!.textContent).toBe(`${filteredViewers.length} viewing`);

          // The component's getViewerCount should also match
          expect(indicators.getViewerCount()).toBe(filteredViewers.length);

          indicators.destroy();
          container.innerHTML = '';
        }
      ),
      { numRuns: 100 }
    );
  });
});
