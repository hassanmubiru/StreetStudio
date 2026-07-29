/**
 * Reaction System
 *
 * Provides reaction buttons (like, helpful, unclear) for videos and comments,
 * real-time reaction count updates and display, custom reaction types for
 * organization customization, and reaction aggregation and analytics display.
 *
 * Requirements: 5.8
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** Target type for reactions. */
export type ReactionTargetType = 'video' | 'comment';

/** Identifies the entity being reacted to. */
export interface ReactionTarget {
  readonly targetType: ReactionTargetType;
  readonly targetId: Uuid;
}

/** A single reaction record. */
export interface Reaction {
  targetType: ReactionTargetType;
  targetId: Uuid;
  memberId: Uuid;
  type: string;
}

/** Per-type tally for display. */
export interface ReactionTally {
  readonly type: string;
  readonly count: number;
  /** True when the current user has reacted with this type. */
  readonly reactedByMe: boolean;
}

/** A custom reaction type defined by an organization. */
export interface CustomReactionType {
  /** Unique key for this reaction type (e.g., 'celebrate', 'bug'). */
  key: string;
  /** Display label (e.g., '🎉 Celebrate'). */
  label: string;
  /** Emoji or icon reference. */
  icon: string;
  /** Whether this reaction is enabled. */
  enabled: boolean;
}

/** Configuration for the reaction system. */
export interface ReactionSystemOptions {
  /** The target being reacted to. */
  target: ReactionTarget;
  /** The current user's member ID. */
  currentUserId: Uuid;
  /** Available reaction types (defaults to built-in types if not provided). */
  reactionTypes?: CustomReactionType[];
  /** Whether to show the analytics/aggregation view. */
  showAnalytics?: boolean;
  /** Whether custom reaction types can be added. */
  allowCustomReactions?: boolean;
}

/** Callbacks for the reaction system. */
export interface ReactionSystemCallbacks {
  /** Called when a user toggles a reaction. Returns the new active state. */
  onToggleReaction?: (target: ReactionTarget, type: string, currentlyActive: boolean) => Promise<boolean>;
  /** Called to fetch current reactions for a target. */
  onFetchReactions?: (target: ReactionTarget) => Promise<Reaction[]>;
  /** Called when a custom reaction type is added. */
  onAddCustomReaction?: (reactionType: CustomReactionType) => Promise<boolean>;
  /** Called when a custom reaction type is removed. */
  onRemoveCustomReaction?: (key: string) => Promise<boolean>;
}

/** Aggregated analytics for reactions on a target. */
export interface ReactionAnalytics {
  totalReactions: number;
  uniqueReactors: number;
  tallies: ReactionTally[];
  /** Percentage breakdown per type. */
  breakdown: Array<{ type: string; percentage: number }>;
}

// --------------------------------------------------------------------------
// Built-in reaction types
// --------------------------------------------------------------------------

/** Default built-in reaction types. */
export const DEFAULT_REACTION_TYPES: readonly CustomReactionType[] = [
  { key: 'like', label: '👍 Like', icon: '👍', enabled: true },
  { key: 'helpful', label: '💡 Helpful', icon: '💡', enabled: true },
  { key: 'unclear', label: '❓ Unclear', icon: '❓', enabled: true },
];

// --------------------------------------------------------------------------
// Pure utility functions
// --------------------------------------------------------------------------

/**
 * Summarizes a flat list of reactions into per-type tallies,
 * ordered by descending count then type name (stable, deterministic).
 */
export function summarizeReactions(
  reactions: readonly Reaction[],
  currentUserId?: Uuid
): ReactionTally[] {
  const counts = new Map<string, number>();
  const mine = new Set<string>();

  for (const r of reactions) {
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    if (currentUserId !== undefined && r.memberId === currentUserId) {
      mine.add(r.type);
    }
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, reactedByMe: mine.has(type) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * Computes analytics from a list of reactions.
 */
export function computeReactionAnalytics(
  reactions: readonly Reaction[],
  currentUserId?: Uuid
): ReactionAnalytics {
  const tallies = summarizeReactions(reactions, currentUserId);
  const totalReactions = reactions.length;
  const uniqueReactors = new Set(reactions.map(r => r.memberId)).size;

  const breakdown = tallies.map(t => ({
    type: t.type,
    percentage: totalReactions > 0 ? Math.round((t.count / totalReactions) * 100) : 0,
  }));

  return { totalReactions, uniqueReactors, tallies, breakdown };
}

/**
 * Finds the reaction type configuration by key.
 */
export function findReactionType(
  types: readonly CustomReactionType[],
  key: string
): CustomReactionType | undefined {
  return types.find(t => t.key === key);
}

/**
 * Merges custom reaction types with defaults, custom types take precedence.
 */
export function mergeReactionTypes(
  defaults: readonly CustomReactionType[],
  custom: readonly CustomReactionType[]
): CustomReactionType[] {
  const map = new Map<string, CustomReactionType>();
  for (const d of defaults) map.set(d.key, { ...d });
  for (const c of custom) map.set(c.key, { ...c });
  return [...map.values()].filter(t => t.enabled);
}

// --------------------------------------------------------------------------
// ReactionButton - Individual reaction button with count
// --------------------------------------------------------------------------

/**
 * ReactionButton renders a single reaction button with its count.
 * It shows active/inactive state and triggers toggle on click.
 */
export class ReactionButton {
  private container: HTMLElement;
  private reactionType: CustomReactionType;
  private count: number;
  private active: boolean;
  private disabled: boolean;
  private onClick: (type: string, active: boolean) => void;

  constructor(
    container: HTMLElement,
    reactionType: CustomReactionType,
    count: number,
    active: boolean,
    onClick: (type: string, active: boolean) => void
  ) {
    this.container = container;
    this.reactionType = reactionType;
    this.count = count;
    this.active = active;
    this.disabled = false;
    this.onClick = onClick;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'reaction-button-wrapper';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `reaction-button${this.active ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(this.active));
    button.setAttribute(
      'aria-label',
      `${this.reactionType.label}, ${this.count} ${this.count === 1 ? 'reaction' : 'reactions'}${this.active ? ', you reacted' : ''}`
    );
    button.disabled = this.disabled;
    button.dataset.reactionType = this.reactionType.key;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'reaction-icon';
    iconSpan.textContent = this.reactionType.icon;
    iconSpan.setAttribute('aria-hidden', 'true');
    button.appendChild(iconSpan);

    if (this.count > 0) {
      const countSpan = document.createElement('span');
      countSpan.className = 'reaction-count';
      countSpan.textContent = String(this.count);
      button.appendChild(countSpan);
    }

    button.addEventListener('click', () => {
      if (!this.disabled) {
        this.onClick(this.reactionType.key, this.active);
      }
    });

    button.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !this.disabled) {
        e.preventDefault();
        this.onClick(this.reactionType.key, this.active);
      }
    });

    this.container.appendChild(button);
  }

  /** Update the button's count and active state. */
  public update(count: number, active: boolean): void {
    this.count = count;
    this.active = active;
    this.render();
  }

  /** Set the disabled state. */
  public setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}

// --------------------------------------------------------------------------
// ReactionButtonGroup - Group of reaction buttons
// --------------------------------------------------------------------------

/**
 * ReactionButtonGroup renders all available reaction buttons in a row
 * and manages their state based on current tallies.
 */
export class ReactionButtonGroup {
  private container: HTMLElement;
  private reactionTypes: CustomReactionType[];
  private tallies: ReactionTally[];
  private buttons: Map<string, ReactionButton> = new Map();
  private onToggle: (type: string, active: boolean) => void;

  constructor(
    container: HTMLElement,
    reactionTypes: CustomReactionType[],
    tallies: ReactionTally[],
    onToggle: (type: string, active: boolean) => void
  ) {
    this.container = container;
    this.reactionTypes = reactionTypes;
    this.tallies = tallies;
    this.onToggle = onToggle;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'reaction-button-group';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', 'Reactions');
    this.buttons.clear();

    for (const reactionType of this.reactionTypes) {
      const tally = this.tallies.find(t => t.type === reactionType.key);
      const count = tally?.count ?? 0;
      const active = tally?.reactedByMe ?? false;

      const wrapper = document.createElement('div');
      wrapper.className = 'reaction-button-slot';
      this.container.appendChild(wrapper);

      const button = new ReactionButton(wrapper, reactionType, count, active, this.onToggle);
      this.buttons.set(reactionType.key, button);
    }
  }

  /** Update tallies and re-render button states. */
  public updateTallies(tallies: ReactionTally[]): void {
    this.tallies = tallies;
    for (const reactionType of this.reactionTypes) {
      const tally = tallies.find(t => t.type === reactionType.key);
      const button = this.buttons.get(reactionType.key);
      if (button) {
        button.update(tally?.count ?? 0, tally?.reactedByMe ?? false);
      }
    }
  }

  /** Update reaction types and re-render. */
  public setReactionTypes(types: CustomReactionType[]): void {
    this.reactionTypes = types;
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}

// --------------------------------------------------------------------------
// ReactionAnalyticsDisplay - Aggregation and analytics view
// --------------------------------------------------------------------------

/**
 * ReactionAnalyticsDisplay shows aggregated reaction data with
 * counts, percentages, and visual breakdown.
 */
export class ReactionAnalyticsDisplay {
  private container: HTMLElement;
  private analytics: ReactionAnalytics;
  private reactionTypes: CustomReactionType[];

  constructor(
    container: HTMLElement,
    analytics: ReactionAnalytics,
    reactionTypes: CustomReactionType[]
  ) {
    this.container = container;
    this.analytics = analytics;
    this.reactionTypes = reactionTypes;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'reaction-analytics';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Reaction analytics');

    // Summary stats
    const summary = document.createElement('div');
    summary.className = 'reaction-analytics-summary';

    const totalEl = document.createElement('span');
    totalEl.className = 'analytics-stat';
    totalEl.setAttribute('aria-label', `Total reactions: ${this.analytics.totalReactions}`);
    totalEl.textContent = `${this.analytics.totalReactions} reactions`;
    summary.appendChild(totalEl);

    const uniqueEl = document.createElement('span');
    uniqueEl.className = 'analytics-stat';
    uniqueEl.setAttribute('aria-label', `Unique reactors: ${this.analytics.uniqueReactors}`);
    uniqueEl.textContent = `${this.analytics.uniqueReactors} people`;
    summary.appendChild(uniqueEl);

    this.container.appendChild(summary);

    // Breakdown bars
    if (this.analytics.breakdown.length > 0) {
      const breakdownContainer = document.createElement('div');
      breakdownContainer.className = 'reaction-breakdown';
      breakdownContainer.setAttribute('role', 'list');
      breakdownContainer.setAttribute('aria-label', 'Reaction breakdown');

      for (const item of this.analytics.breakdown) {
        const row = document.createElement('div');
        row.className = 'breakdown-row';
        row.setAttribute('role', 'listitem');

        const reactionType = findReactionType(this.reactionTypes, item.type);
        const label = reactionType?.icon ?? item.type;

        const labelEl = document.createElement('span');
        labelEl.className = 'breakdown-label';
        labelEl.textContent = label;
        row.appendChild(labelEl);

        const barContainer = document.createElement('div');
        barContainer.className = 'breakdown-bar-container';

        const bar = document.createElement('div');
        bar.className = 'breakdown-bar';
        bar.style.width = `${item.percentage}%`;
        bar.setAttribute(
          'aria-label',
          `${reactionType?.label ?? item.type}: ${item.percentage}%`
        );
        barContainer.appendChild(bar);
        row.appendChild(barContainer);

        const percentEl = document.createElement('span');
        percentEl.className = 'breakdown-percentage';
        percentEl.textContent = `${item.percentage}%`;
        row.appendChild(percentEl);

        breakdownContainer.appendChild(row);
      }

      this.container.appendChild(breakdownContainer);
    }
  }

  /** Update the analytics display with new data. */
  public update(analytics: ReactionAnalytics): void {
    this.analytics = analytics;
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}

// --------------------------------------------------------------------------
// CustomReactionManager - Manage custom reaction types
// --------------------------------------------------------------------------

/**
 * CustomReactionManager provides an interface for adding/removing
 * custom reaction types for organization customization.
 */
export class CustomReactionManager {
  private container: HTMLElement;
  private customTypes: CustomReactionType[];
  private callbacks: ReactionSystemCallbacks;
  private onTypesChanged?: (types: CustomReactionType[]) => void;

  constructor(
    container: HTMLElement,
    customTypes: CustomReactionType[],
    callbacks: ReactionSystemCallbacks,
    onTypesChanged?: (types: CustomReactionType[]) => void
  ) {
    this.container = container;
    this.customTypes = [...customTypes];
    this.callbacks = callbacks;
    this.onTypesChanged = onTypesChanged;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'custom-reaction-manager';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Custom reaction types');

    // Header
    const header = document.createElement('h3');
    header.className = 'custom-reactions-title';
    header.textContent = 'Custom Reactions';
    this.container.appendChild(header);

    // Existing custom types list
    const list = document.createElement('div');
    list.className = 'custom-reactions-list';
    list.setAttribute('role', 'list');

    for (const rt of this.customTypes) {
      const item = document.createElement('div');
      item.className = 'custom-reaction-item';
      item.setAttribute('role', 'listitem');

      const labelEl = document.createElement('span');
      labelEl.className = 'custom-reaction-label';
      labelEl.textContent = `${rt.icon} ${rt.label}`;
      item.appendChild(labelEl);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-reaction-remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove ${rt.label}`);
      removeBtn.addEventListener('click', () => this.removeCustomType(rt.key));
      item.appendChild(removeBtn);

      list.appendChild(item);
    }

    this.container.appendChild(list);

    // Add new custom reaction form
    const form = document.createElement('div');
    form.className = 'custom-reaction-form';
    form.setAttribute('role', 'form');
    form.setAttribute('aria-label', 'Add custom reaction');

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.className = 'custom-reaction-icon-input';
    iconInput.placeholder = 'Emoji';
    iconInput.maxLength = 4;
    iconInput.setAttribute('aria-label', 'Reaction emoji');
    form.appendChild(iconInput);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'custom-reaction-label-input';
    labelInput.placeholder = 'Label';
    labelInput.maxLength = 30;
    labelInput.setAttribute('aria-label', 'Reaction label');
    form.appendChild(labelInput);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'custom-reaction-add-btn';
    addBtn.textContent = 'Add';
    addBtn.setAttribute('aria-label', 'Add custom reaction');
    addBtn.addEventListener('click', () => {
      const icon = iconInput.value.trim();
      const label = labelInput.value.trim();
      if (icon && label) {
        this.addCustomType(icon, label);
        iconInput.value = '';
        labelInput.value = '';
      }
    });
    form.appendChild(addBtn);

    this.container.appendChild(form);
  }

  private async addCustomType(icon: string, label: string): Promise<void> {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const newType: CustomReactionType = { key, label: `${icon} ${label}`, icon, enabled: true };

    const success = await this.callbacks.onAddCustomReaction?.(newType);
    if (success !== false) {
      this.customTypes.push(newType);
      this.onTypesChanged?.(this.customTypes);
      this.render();
    }
  }

  private async removeCustomType(key: string): Promise<void> {
    const success = await this.callbacks.onRemoveCustomReaction?.(key);
    if (success !== false) {
      this.customTypes = this.customTypes.filter(t => t.key !== key);
      this.onTypesChanged?.(this.customTypes);
      this.render();
    }
  }

  /** Get the current list of custom types. */
  public getCustomTypes(): CustomReactionType[] {
    return [...this.customTypes];
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}

// --------------------------------------------------------------------------
// ReactionSystem - Orchestrating component
// --------------------------------------------------------------------------

/**
 * ReactionSystem is the top-level orchestrator that composes
 * ReactionButtonGroup, ReactionAnalyticsDisplay, and CustomReactionManager
 * into a cohesive reaction experience with real-time updates.
 */
export class ReactionSystem {
  private container: HTMLElement;
  private options: ReactionSystemOptions;
  private callbacks: ReactionSystemCallbacks;

  private reactions: Reaction[] = [];
  private reactionTypes: CustomReactionType[];
  private buttonGroup: ReactionButtonGroup;
  private analyticsDisplay: ReactionAnalyticsDisplay | null = null;
  private customManager: CustomReactionManager | null = null;

  private isToggling = false;

  constructor(
    container: HTMLElement,
    options: ReactionSystemOptions,
    callbacks: ReactionSystemCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;

    // Resolve reaction types
    this.reactionTypes = options.reactionTypes
      ? [...options.reactionTypes].filter(t => t.enabled)
      : [...DEFAULT_REACTION_TYPES];

    this.container.className = 'reaction-system';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Reactions');

    // Create sub-containers
    const buttonGroupContainer = document.createElement('div');
    const analyticsContainer = document.createElement('div');
    const customContainer = document.createElement('div');

    this.container.appendChild(buttonGroupContainer);

    // Button group
    const tallies = summarizeReactions(this.reactions, options.currentUserId);
    this.buttonGroup = new ReactionButtonGroup(
      buttonGroupContainer,
      this.reactionTypes,
      tallies,
      (type, active) => this.handleToggle(type, active)
    );

    // Analytics display (optional)
    if (options.showAnalytics) {
      this.container.appendChild(analyticsContainer);
      const analytics = computeReactionAnalytics(this.reactions, options.currentUserId);
      this.analyticsDisplay = new ReactionAnalyticsDisplay(
        analyticsContainer,
        analytics,
        this.reactionTypes
      );
    }

    // Custom reaction manager (optional)
    if (options.allowCustomReactions) {
      this.container.appendChild(customContainer);
      const customTypes = this.reactionTypes.filter(
        t => !DEFAULT_REACTION_TYPES.some(d => d.key === t.key)
      );
      this.customManager = new CustomReactionManager(
        customContainer,
        customTypes,
        callbacks,
        (types) => this.handleCustomTypesChanged(types)
      );
    }
  }

  /** Handle reaction toggle from button click. */
  private async handleToggle(type: string, currentlyActive: boolean): Promise<void> {
    if (this.isToggling) return;
    this.isToggling = true;

    try {
      const newActive = await this.callbacks.onToggleReaction?.(
        this.options.target,
        type,
        currentlyActive
      );

      // Apply optimistic update
      if (newActive !== undefined) {
        if (newActive && !currentlyActive) {
          // Add reaction locally
          this.reactions.push({
            targetType: this.options.target.targetType,
            targetId: this.options.target.targetId,
            memberId: this.options.currentUserId,
            type,
          });
        } else if (!newActive && currentlyActive) {
          // Remove reaction locally
          this.reactions = this.reactions.filter(
            r => !(r.memberId === this.options.currentUserId && r.type === type)
          );
        }
        this.refreshDisplay();
      }
    } finally {
      this.isToggling = false;
    }
  }

  /** Handle custom types being added/removed. */
  private handleCustomTypesChanged(customTypes: CustomReactionType[]): void {
    this.reactionTypes = mergeReactionTypes(DEFAULT_REACTION_TYPES, customTypes);
    this.refreshDisplay();
  }

  /** Refresh all display components with current state. */
  private refreshDisplay(): void {
    const tallies = summarizeReactions(this.reactions, this.options.currentUserId);
    this.buttonGroup.updateTallies(tallies);

    if (this.analyticsDisplay) {
      const analytics = computeReactionAnalytics(this.reactions, this.options.currentUserId);
      this.analyticsDisplay.update(analytics);
    }
  }

  /** Set reactions (e.g., from initial fetch or WebSocket update). */
  public setReactions(reactions: Reaction[]): void {
    this.reactions = [...reactions];
    this.refreshDisplay();
  }

  /**
   * Handle a real-time reaction event (e.g., from WebSocket).
   * Adds or removes the reaction from the local state and refreshes display.
   */
  public handleRealtimeReaction(reaction: Reaction, added: boolean): void {
    if (added) {
      // Avoid duplicates
      const exists = this.reactions.some(
        r => r.memberId === reaction.memberId && r.type === reaction.type
      );
      if (!exists) {
        this.reactions.push(reaction);
      }
    } else {
      this.reactions = this.reactions.filter(
        r => !(r.memberId === reaction.memberId && r.type === reaction.type)
      );
    }
    this.refreshDisplay();
  }

  /** Fetch reactions from the backend and update display. */
  public async fetchReactions(): Promise<void> {
    if (this.callbacks.onFetchReactions) {
      const reactions = await this.callbacks.onFetchReactions(this.options.target);
      this.setReactions(reactions);
    }
  }

  /** Get the current reaction tallies. */
  public getTallies(): ReactionTally[] {
    return summarizeReactions(this.reactions, this.options.currentUserId);
  }

  /** Get the current analytics. */
  public getAnalytics(): ReactionAnalytics {
    return computeReactionAnalytics(this.reactions, this.options.currentUserId);
  }

  /** Get the available reaction types. */
  public getReactionTypes(): CustomReactionType[] {
    return [...this.reactionTypes];
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
