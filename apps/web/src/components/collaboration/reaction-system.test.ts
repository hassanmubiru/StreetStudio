/**
 * Unit tests for Reaction System
 *
 * Tests reaction buttons, real-time count updates, custom reaction types,
 * and reaction aggregation/analytics display.
 *
 * Requirements: 5.8
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  summarizeReactions,
  computeReactionAnalytics,
  findReactionType,
  mergeReactionTypes,
  DEFAULT_REACTION_TYPES,
  ReactionButton,
  ReactionButtonGroup,
  ReactionAnalyticsDisplay,
  CustomReactionManager,
  ReactionSystem,
} from './reaction-system';
import type {
  Reaction,
  ReactionTally,
  CustomReactionType,
  ReactionSystemOptions,
  ReactionSystemCallbacks,
  ReactionTarget,
} from './reaction-system';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function makeReaction(overrides: Partial<Reaction> = {}): Reaction {
  return {
    targetType: 'video',
    targetId: 'video-1',
    memberId: 'user-1',
    type: 'like',
    ...overrides,
  };
}

const defaultTarget: ReactionTarget = {
  targetType: 'video',
  targetId: 'video-1',
};

const defaultOptions: ReactionSystemOptions = {
  target: defaultTarget,
  currentUserId: 'user-1',
};

function defaultCallbacks(): ReactionSystemCallbacks {
  return {
    onToggleReaction: vi.fn().mockImplementation((_target, _type, active) =>
      Promise.resolve(!active)
    ),
    onFetchReactions: vi.fn().mockResolvedValue([]),
    onAddCustomReaction: vi.fn().mockResolvedValue(true),
    onRemoveCustomReaction: vi.fn().mockResolvedValue(true),
  };
}

// --------------------------------------------------------------------------
// summarizeReactions
// --------------------------------------------------------------------------

describe('summarizeReactions', () => {
  it('returns empty array for no reactions', () => {
    expect(summarizeReactions([])).toEqual([]);
  });

  it('counts reactions per type', () => {
    const reactions = [
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
    ];
    const tallies = summarizeReactions(reactions);
    expect(tallies[0]).toEqual({ type: 'like', count: 2, reactedByMe: false });
    expect(tallies[1]).toEqual({ type: 'helpful', count: 1, reactedByMe: false });
  });

  it('sorts by count descending then type ascending', () => {
    const reactions = [
      makeReaction({ memberId: 'u1', type: 'unclear' }),
      makeReaction({ memberId: 'u2', type: 'helpful' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
      makeReaction({ memberId: 'u4', type: 'like' }),
    ];
    const tallies = summarizeReactions(reactions);
    expect(tallies[0]!.type).toBe('helpful');
    expect(tallies[0]!.count).toBe(2);
    // 'like' and 'unclear' both have count 1, sorted alphabetically
    expect(tallies[1]!.type).toBe('like');
    expect(tallies[2]!.type).toBe('unclear');
  });

  it('marks reactedByMe when currentUserId matches', () => {
    const reactions = [
      makeReaction({ memberId: 'user-1', type: 'like' }),
      makeReaction({ memberId: 'user-2', type: 'like' }),
      makeReaction({ memberId: 'user-2', type: 'helpful' }),
    ];
    const tallies = summarizeReactions(reactions, 'user-1');
    const likeTally = tallies.find(t => t.type === 'like');
    expect(likeTally?.reactedByMe).toBe(true);
    const helpfulTally = tallies.find(t => t.type === 'helpful');
    expect(helpfulTally?.reactedByMe).toBe(false);
  });

  it('handles single reaction', () => {
    const reactions = [makeReaction({ memberId: 'u1', type: 'like' })];
    const tallies = summarizeReactions(reactions, 'u1');
    expect(tallies).toEqual([{ type: 'like', count: 1, reactedByMe: true }]);
  });
});

// --------------------------------------------------------------------------
// computeReactionAnalytics
// --------------------------------------------------------------------------

describe('computeReactionAnalytics', () => {
  it('returns zeros for no reactions', () => {
    const analytics = computeReactionAnalytics([]);
    expect(analytics.totalReactions).toBe(0);
    expect(analytics.uniqueReactors).toBe(0);
    expect(analytics.tallies).toEqual([]);
    expect(analytics.breakdown).toEqual([]);
  });

  it('computes total reactions and unique reactors', () => {
    const reactions = [
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u1', type: 'helpful' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
    ];
    const analytics = computeReactionAnalytics(reactions);
    expect(analytics.totalReactions).toBe(3);
    expect(analytics.uniqueReactors).toBe(2);
  });

  it('computes percentage breakdown', () => {
    const reactions = [
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
      makeReaction({ memberId: 'u4', type: 'helpful' }),
    ];
    const analytics = computeReactionAnalytics(reactions);
    // Both have 50%
    expect(analytics.breakdown[0]!.percentage).toBe(50);
    expect(analytics.breakdown[1]!.percentage).toBe(50);
  });

  it('rounds percentages', () => {
    const reactions = [
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
    ];
    const analytics = computeReactionAnalytics(reactions);
    const likeBreakdown = analytics.breakdown.find(b => b.type === 'like');
    expect(likeBreakdown?.percentage).toBe(67); // 2/3 = 66.6 -> 67
  });
});

// --------------------------------------------------------------------------
// findReactionType
// --------------------------------------------------------------------------

describe('findReactionType', () => {
  it('finds existing type by key', () => {
    const result = findReactionType(DEFAULT_REACTION_TYPES, 'like');
    expect(result?.key).toBe('like');
    expect(result?.icon).toBe('👍');
  });

  it('returns undefined for non-existing key', () => {
    const result = findReactionType(DEFAULT_REACTION_TYPES, 'nonexistent');
    expect(result).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// mergeReactionTypes
// --------------------------------------------------------------------------

describe('mergeReactionTypes', () => {
  it('returns defaults when no custom types', () => {
    const result = mergeReactionTypes(DEFAULT_REACTION_TYPES, []);
    expect(result.length).toBe(3);
    expect(result.map(t => t.key)).toEqual(['like', 'helpful', 'unclear']);
  });

  it('adds custom types', () => {
    const custom: CustomReactionType[] = [
      { key: 'celebrate', label: '🎉 Celebrate', icon: '🎉', enabled: true },
    ];
    const result = mergeReactionTypes(DEFAULT_REACTION_TYPES, custom);
    expect(result.length).toBe(4);
    expect(result.find(t => t.key === 'celebrate')).toBeDefined();
  });

  it('custom types override defaults with same key', () => {
    const custom: CustomReactionType[] = [
      { key: 'like', label: '❤️ Love', icon: '❤️', enabled: true },
    ];
    const result = mergeReactionTypes(DEFAULT_REACTION_TYPES, custom);
    const likeType = result.find(t => t.key === 'like');
    expect(likeType?.icon).toBe('❤️');
  });

  it('excludes disabled types', () => {
    const custom: CustomReactionType[] = [
      { key: 'disabled-one', label: 'Disabled', icon: '🚫', enabled: false },
    ];
    const result = mergeReactionTypes(DEFAULT_REACTION_TYPES, custom);
    expect(result.find(t => t.key === 'disabled-one')).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// ReactionButton
// --------------------------------------------------------------------------

describe('ReactionButton', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders a button with icon and count', () => {
    const onClick = vi.fn();
    new ReactionButton(
      container,
      DEFAULT_REACTION_TYPES[0]!,
      5,
      false,
      onClick
    );
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(container.querySelector('.reaction-icon')?.textContent).toBe('👍');
    expect(container.querySelector('.reaction-count')?.textContent).toBe('5');
  });

  it('does not render count when 0', () => {
    const onClick = vi.fn();
    new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 0, false, onClick);
    expect(container.querySelector('.reaction-count')).toBeNull();
  });

  it('marks active state with aria-pressed', () => {
    const onClick = vi.fn();
    new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 3, true, onClick);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);
  });

  it('marks inactive state', () => {
    const onClick = vi.fn();
    new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 3, false, onClick);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);
  });

  it('calls onClick with type and active state on click', () => {
    const onClick = vi.fn();
    new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 2, true, onClick);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    button.click();
    expect(onClick).toHaveBeenCalledWith('like', true);
  });

  it('has accessible label with count and state', () => {
    const onClick = vi.fn();
    new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 3, true, onClick);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toContain('3 reactions');
    expect(button.getAttribute('aria-label')).toContain('you reacted');
  });

  it('updates count and active state', () => {
    const onClick = vi.fn();
    const btn = new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 1, false, onClick);
    btn.update(5, true);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.reaction-count')?.textContent).toBe('5');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    const btn = new ReactionButton(container, DEFAULT_REACTION_TYPES[0]!, 1, false, onClick);
    btn.setDisabled(true);
    const button = container.querySelector('.reaction-button') as HTMLButtonElement;
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// ReactionButtonGroup
// --------------------------------------------------------------------------

describe('ReactionButtonGroup', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders buttons for all reaction types', () => {
    const onToggle = vi.fn();
    new ReactionButtonGroup(
      container,
      [...DEFAULT_REACTION_TYPES],
      [],
      onToggle
    );
    const buttons = container.querySelectorAll('.reaction-button');
    expect(buttons.length).toBe(3);
  });

  it('has proper group role and label', () => {
    const onToggle = vi.fn();
    new ReactionButtonGroup(container, [...DEFAULT_REACTION_TYPES], [], onToggle);
    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBe('Reactions');
  });

  it('shows correct counts from tallies', () => {
    const tallies: ReactionTally[] = [
      { type: 'like', count: 5, reactedByMe: true },
      { type: 'helpful', count: 2, reactedByMe: false },
    ];
    const onToggle = vi.fn();
    new ReactionButtonGroup(container, [...DEFAULT_REACTION_TYPES], tallies, onToggle);
    const counts = container.querySelectorAll('.reaction-count');
    // 'like' button should show 5, 'helpful' should show 2, 'unclear' should show none
    const countValues = Array.from(counts).map(el => el.textContent);
    expect(countValues).toContain('5');
    expect(countValues).toContain('2');
  });

  it('calls onToggle when a button is clicked', () => {
    const onToggle = vi.fn();
    new ReactionButtonGroup(container, [...DEFAULT_REACTION_TYPES], [], onToggle);
    const buttons = container.querySelectorAll('.reaction-button');
    (buttons[0] as HTMLButtonElement).click();
    expect(onToggle).toHaveBeenCalledWith('like', false);
  });

  it('updates tallies dynamically', () => {
    const onToggle = vi.fn();
    const group = new ReactionButtonGroup(
      container,
      [...DEFAULT_REACTION_TYPES],
      [],
      onToggle
    );
    group.updateTallies([{ type: 'like', count: 10, reactedByMe: true }]);
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.getAttribute('aria-pressed')).toBe('true');
    const count = likeBtn.querySelector('.reaction-count');
    expect(count?.textContent).toBe('10');
  });
});

// --------------------------------------------------------------------------
// ReactionAnalyticsDisplay
// --------------------------------------------------------------------------

describe('ReactionAnalyticsDisplay', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders analytics summary', () => {
    const analytics = computeReactionAnalytics([
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
    ]);
    new ReactionAnalyticsDisplay(container, analytics, [...DEFAULT_REACTION_TYPES]);
    expect(container.textContent).toContain('3 reactions');
    expect(container.textContent).toContain('3 people');
  });

  it('renders percentage breakdown', () => {
    const analytics = computeReactionAnalytics([
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'helpful' }),
      makeReaction({ memberId: 'u4', type: 'helpful' }),
    ]);
    new ReactionAnalyticsDisplay(container, analytics, [...DEFAULT_REACTION_TYPES]);
    const percentages = container.querySelectorAll('.breakdown-percentage');
    expect(percentages.length).toBe(2);
    expect(percentages[0]!.textContent).toBe('50%');
    expect(percentages[1]!.textContent).toBe('50%');
  });

  it('has proper aria region and label', () => {
    const analytics = computeReactionAnalytics([]);
    new ReactionAnalyticsDisplay(container, analytics, [...DEFAULT_REACTION_TYPES]);
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Reaction analytics');
  });

  it('renders breakdown bars with correct width', () => {
    const analytics = computeReactionAnalytics([
      makeReaction({ memberId: 'u1', type: 'like' }),
      makeReaction({ memberId: 'u2', type: 'like' }),
      makeReaction({ memberId: 'u3', type: 'like' }),
      makeReaction({ memberId: 'u4', type: 'helpful' }),
    ]);
    new ReactionAnalyticsDisplay(container, analytics, [...DEFAULT_REACTION_TYPES]);
    const bars = container.querySelectorAll('.breakdown-bar') as NodeListOf<HTMLElement>;
    expect(bars[0]!.style.width).toBe('75%'); // 3/4
    expect(bars[1]!.style.width).toBe('25%'); // 1/4
  });

  it('updates with new analytics data', () => {
    const analytics = computeReactionAnalytics([]);
    const display = new ReactionAnalyticsDisplay(container, analytics, [...DEFAULT_REACTION_TYPES]);
    expect(container.textContent).toContain('0 reactions');

    const newAnalytics = computeReactionAnalytics([
      makeReaction({ memberId: 'u1', type: 'like' }),
    ]);
    display.update(newAnalytics);
    expect(container.textContent).toContain('1 reactions');
  });
});

// --------------------------------------------------------------------------
// CustomReactionManager
// --------------------------------------------------------------------------

describe('CustomReactionManager', () => {
  let container: HTMLElement;
  let callbacks: ReactionSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('renders custom reaction list', () => {
    const customTypes: CustomReactionType[] = [
      { key: 'celebrate', label: '🎉 Celebrate', icon: '🎉', enabled: true },
    ];
    new CustomReactionManager(container, customTypes, callbacks);
    expect(container.textContent).toContain('🎉 Celebrate');
  });

  it('renders add form with inputs', () => {
    new CustomReactionManager(container, [], callbacks);
    expect(container.querySelector('.custom-reaction-icon-input')).not.toBeNull();
    expect(container.querySelector('.custom-reaction-label-input')).not.toBeNull();
    expect(container.querySelector('.custom-reaction-add-btn')).not.toBeNull();
  });

  it('has proper accessibility attributes', () => {
    new CustomReactionManager(container, [], callbacks);
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Custom reaction types');
  });

  it('adds new custom reaction type', async () => {
    const onTypesChanged = vi.fn();
    new CustomReactionManager(container, [], callbacks, onTypesChanged);

    const iconInput = container.querySelector('.custom-reaction-icon-input') as HTMLInputElement;
    const labelInput = container.querySelector('.custom-reaction-label-input') as HTMLInputElement;
    const addBtn = container.querySelector('.custom-reaction-add-btn') as HTMLButtonElement;

    iconInput.value = '🔥';
    labelInput.value = 'Fire';
    addBtn.click();

    await vi.waitFor(() => {
      expect(callbacks.onAddCustomReaction).toHaveBeenCalled();
      expect(onTypesChanged).toHaveBeenCalled();
    });
  });

  it('removes custom reaction type', async () => {
    const onTypesChanged = vi.fn();
    const customTypes: CustomReactionType[] = [
      { key: 'celebrate', label: '🎉 Celebrate', icon: '🎉', enabled: true },
    ];
    new CustomReactionManager(container, customTypes, callbacks, onTypesChanged);

    const removeBtn = container.querySelector('.custom-reaction-remove-btn') as HTMLButtonElement;
    removeBtn.click();

    await vi.waitFor(() => {
      expect(callbacks.onRemoveCustomReaction).toHaveBeenCalledWith('celebrate');
      expect(onTypesChanged).toHaveBeenCalled();
    });
  });

  it('does not add when inputs are empty', () => {
    new CustomReactionManager(container, [], callbacks);
    const addBtn = container.querySelector('.custom-reaction-add-btn') as HTMLButtonElement;
    addBtn.click();
    expect(callbacks.onAddCustomReaction).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// ReactionSystem (integration)
// --------------------------------------------------------------------------

describe('ReactionSystem', () => {
  let container: HTMLElement;
  let callbacks: ReactionSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('renders reaction button group', () => {
    new ReactionSystem(container, defaultOptions, callbacks);
    expect(container.querySelector('.reaction-button-group')).not.toBeNull();
    const buttons = container.querySelectorAll('.reaction-button');
    expect(buttons.length).toBe(3); // like, helpful, unclear
  });

  it('has proper aria region and label', () => {
    new ReactionSystem(container, defaultOptions, callbacks);
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Reactions');
  });

  it('renders analytics display when showAnalytics is true', () => {
    new ReactionSystem(
      container,
      { ...defaultOptions, showAnalytics: true },
      callbacks
    );
    expect(container.querySelector('.reaction-analytics')).not.toBeNull();
  });

  it('does not render analytics when showAnalytics is false', () => {
    new ReactionSystem(container, defaultOptions, callbacks);
    expect(container.querySelector('.reaction-analytics')).toBeNull();
  });

  it('renders custom reaction manager when allowCustomReactions is true', () => {
    new ReactionSystem(
      container,
      { ...defaultOptions, allowCustomReactions: true },
      callbacks
    );
    expect(container.querySelector('.custom-reaction-manager')).not.toBeNull();
  });

  it('does not render custom reaction manager when allowCustomReactions is false', () => {
    new ReactionSystem(container, defaultOptions, callbacks);
    expect(container.querySelector('.custom-reaction-manager')).toBeNull();
  });

  it('sets reactions and updates button tallies', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([
      makeReaction({ memberId: 'user-1', type: 'like' }),
      makeReaction({ memberId: 'user-2', type: 'like' }),
      makeReaction({ memberId: 'user-3', type: 'helpful' }),
    ]);
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(likeBtn.querySelector('.reaction-count')?.textContent).toBe('2');
  });

  it('toggles reaction on button click', async () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([]);
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLButtonElement;
    likeBtn.click();

    await vi.waitFor(() => {
      expect(callbacks.onToggleReaction).toHaveBeenCalledWith(
        defaultTarget,
        'like',
        false
      );
    });
  });

  it('updates display after toggle', async () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([]);
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLButtonElement;
    likeBtn.click();

    await vi.waitFor(() => {
      const updatedBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
      expect(updatedBtn.getAttribute('aria-pressed')).toBe('true');
      expect(updatedBtn.querySelector('.reaction-count')?.textContent).toBe('1');
    });
  });

  it('handles real-time reaction added event', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([]);
    system.handleRealtimeReaction(
      makeReaction({ memberId: 'user-2', type: 'like' }),
      true
    );
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.querySelector('.reaction-count')?.textContent).toBe('1');
  });

  it('handles real-time reaction removed event', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([
      makeReaction({ memberId: 'user-2', type: 'like' }),
    ]);
    system.handleRealtimeReaction(
      makeReaction({ memberId: 'user-2', type: 'like' }),
      false
    );
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.querySelector('.reaction-count')).toBeNull();
  });

  it('does not duplicate real-time reactions', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([
      makeReaction({ memberId: 'user-2', type: 'like' }),
    ]);
    system.handleRealtimeReaction(
      makeReaction({ memberId: 'user-2', type: 'like' }),
      true
    );
    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.querySelector('.reaction-count')?.textContent).toBe('1');
  });

  it('uses custom reaction types when provided', () => {
    const customTypes: CustomReactionType[] = [
      { key: 'fire', label: '🔥 Fire', icon: '🔥', enabled: true },
      { key: 'star', label: '⭐ Star', icon: '⭐', enabled: true },
    ];
    new ReactionSystem(
      container,
      { ...defaultOptions, reactionTypes: customTypes },
      callbacks
    );
    const buttons = container.querySelectorAll('.reaction-button');
    expect(buttons.length).toBe(2);
    expect(container.querySelector('[data-reaction-type="fire"]')).not.toBeNull();
    expect(container.querySelector('[data-reaction-type="star"]')).not.toBeNull();
  });

  it('fetches reactions via callback', async () => {
    const fetchCallbacks: ReactionSystemCallbacks = {
      ...defaultCallbacks(),
      onFetchReactions: vi.fn().mockResolvedValue([
        makeReaction({ memberId: 'user-2', type: 'like' }),
      ]),
    };
    const system = new ReactionSystem(container, defaultOptions, fetchCallbacks);
    await system.fetchReactions();

    const likeBtn = container.querySelector('[data-reaction-type="like"]') as HTMLElement;
    expect(likeBtn.querySelector('.reaction-count')?.textContent).toBe('1');
  });

  it('returns correct tallies via getTallies', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    system.setReactions([
      makeReaction({ memberId: 'user-1', type: 'like' }),
      makeReaction({ memberId: 'user-2', type: 'like' }),
    ]);
    const tallies = system.getTallies();
    expect(tallies[0]).toEqual({ type: 'like', count: 2, reactedByMe: true });
  });

  it('returns correct analytics via getAnalytics', () => {
    const system = new ReactionSystem(
      container,
      { ...defaultOptions, showAnalytics: true },
      callbacks
    );
    system.setReactions([
      makeReaction({ memberId: 'user-1', type: 'like' }),
      makeReaction({ memberId: 'user-2', type: 'helpful' }),
    ]);
    const analytics = system.getAnalytics();
    expect(analytics.totalReactions).toBe(2);
    expect(analytics.uniqueReactors).toBe(2);
  });

  it('returns available reaction types', () => {
    const system = new ReactionSystem(container, defaultOptions, callbacks);
    const types = system.getReactionTypes();
    expect(types.length).toBe(3);
    expect(types.map(t => t.key)).toEqual(['like', 'helpful', 'unclear']);
  });
});
