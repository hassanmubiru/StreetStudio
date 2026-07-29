/**
 * Activity Feed
 *
 * Displays a real-time stream of collaboration activities including
 * new comments, edits, reactions, and team actions. Supports live updates
 * via WebSocket and provides filtering and pagination capabilities.
 *
 * Requirements: 7.9
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** Activity event types in the feed. */
export type ActivityType =
  | 'comment_added'
  | 'comment_reply'
  | 'reaction_added'
  | 'video_uploaded'
  | 'video_edited'
  | 'member_joined'
  | 'member_left'
  | 'project_created'
  | 'project_updated'
  | 'mention';

/** A single activity event. */
export interface ActivityEvent {
  id: Uuid;
  type: ActivityType;
  actorId: Uuid;
  actorName: string;
  actorAvatarUrl?: string;
  description: string;
  resourceId?: Uuid;
  resourceType?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** Configuration for the activity feed. */
export interface ActivityFeedOptions {
  /** Maximum number of items to display (default 50). */
  maxItems?: number;
  /** Whether to auto-scroll to new items (default true). */
  autoScroll?: boolean;
  /** Whether to group consecutive activities by the same user (default true). */
  groupByUser?: boolean;
  /** Activity types to show (default all). */
  visibleTypes?: ActivityType[];
  /** Current user ID for highlighting own activities. */
  currentUserId?: Uuid;
}

/** Callbacks for activity feed interactions. */
export interface ActivityFeedCallbacks {
  /** Called when a user clicks on an activity to navigate to it. */
  onActivityClick?: (event: ActivityEvent) => void;
  /** Called to load more (older) activities. */
  onLoadMore?: () => Promise<ActivityEvent[]>;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Gets a human-readable icon for an activity type.
 */
export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case 'comment_added':
      return '💬';
    case 'comment_reply':
      return '↩️';
    case 'reaction_added':
      return '👍';
    case 'video_uploaded':
      return '📹';
    case 'video_edited':
      return '✂️';
    case 'member_joined':
      return '👋';
    case 'member_left':
      return '👋';
    case 'project_created':
      return '📁';
    case 'project_updated':
      return '📝';
    case 'mention':
      return '@';
    default:
      return '•';
  }
}

/**
 * Formats a relative time string from an ISO timestamp.
 */
export function formatRelativeTime(isoString: IsoTimestamp, now?: Date): string {
  const date = new Date(isoString);
  const current = now || new Date();
  const diffMs = current.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Groups consecutive activities by the same actor within a time window.
 */
export function groupActivities(
  events: ActivityEvent[],
  groupWindowMs: number = 300000 // 5 minutes
): ActivityEvent[][] {
  if (events.length === 0) return [];

  const groups: ActivityEvent[][] = [];
  let currentGroup: ActivityEvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    const sameActor = prev.actorId === curr.actorId;
    const timeDiff =
      new Date(prev.createdAt).getTime() - new Date(curr.createdAt).getTime();
    const withinWindow = Math.abs(timeDiff) <= groupWindowMs;

    if (sameActor && withinWindow) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }

  groups.push(currentGroup);
  return groups;
}

/**
 * Filters activities by allowed types.
 */
export function filterActivities(
  events: ActivityEvent[],
  visibleTypes?: ActivityType[]
): ActivityEvent[] {
  if (!visibleTypes || visibleTypes.length === 0) return events;
  return events.filter(e => visibleTypes.includes(e.type));
}

// --------------------------------------------------------------------------
// ActivityFeed Class
// --------------------------------------------------------------------------

/**
 * ActivityFeed renders a scrollable list of real-time collaboration events.
 * New events are prepended to the top with animation, and older events
 * can be loaded on demand.
 */
export class ActivityFeed {
  private container: HTMLElement;
  private options: Required<ActivityFeedOptions>;
  private callbacks: ActivityFeedCallbacks;
  private events: ActivityEvent[] = [];
  private isLoadingMore = false;

  constructor(
    container: HTMLElement,
    options: ActivityFeedOptions = {},
    callbacks: ActivityFeedCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      maxItems: options.maxItems ?? 50,
      autoScroll: options.autoScroll ?? true,
      groupByUser: options.groupByUser ?? true,
      visibleTypes: options.visibleTypes ?? [],
      currentUserId: options.currentUserId ?? undefined as any,
    };
    this.callbacks = callbacks;
    this.setupContainer();
    this.render();
  }

  private setupContainer(): void {
    this.container.className = 'activity-feed';
    this.container.setAttribute('role', 'feed');
    this.container.setAttribute('aria-label', 'Activity feed');
  }

  private render(): void {
    this.container.innerHTML = '';

    const filtered = filterActivities(this.events, this.options.visibleTypes);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'activity-feed-empty';
      empty.textContent = 'No activity yet';
      empty.setAttribute('aria-label', 'No activity to show');
      this.container.appendChild(empty);
      return;
    }

    // Render activities (optionally grouped)
    if (this.options.groupByUser) {
      const groups = groupActivities(filtered);
      for (const group of groups) {
        this.container.appendChild(this.renderGroup(group));
      }
    } else {
      for (const event of filtered) {
        this.container.appendChild(this.renderEvent(event));
      }
    }

    // Load more button
    if (this.callbacks.onLoadMore && filtered.length >= this.options.maxItems) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'activity-feed-load-more';
      loadMoreBtn.textContent = 'Load more';
      loadMoreBtn.setAttribute('aria-label', 'Load older activities');
      loadMoreBtn.addEventListener('click', () => this.loadMore());
      this.container.appendChild(loadMoreBtn);
    }
  }

  private renderGroup(group: ActivityEvent[]): HTMLElement {
    const groupEl = document.createElement('div');
    groupEl.className = 'activity-group';
    groupEl.setAttribute('role', 'article');

    if (group.length === 1) {
      return this.renderEvent(group[0]);
    }

    // Group header with actor info
    const first = group[0];
    const header = document.createElement('div');
    header.className = 'activity-group-header';

    const avatar = this.createAvatar(first.actorName, first.actorAvatarUrl);
    header.appendChild(avatar);

    const actorName = document.createElement('span');
    actorName.className = 'activity-actor-name';
    actorName.textContent = first.actorName;
    header.appendChild(actorName);

    const time = document.createElement('span');
    time.className = 'activity-time';
    time.textContent = formatRelativeTime(first.createdAt);
    header.appendChild(time);

    groupEl.appendChild(header);

    // Grouped events
    const itemsList = document.createElement('div');
    itemsList.className = 'activity-group-items';
    for (const event of group) {
      const item = document.createElement('div');
      item.className = 'activity-group-item';
      item.setAttribute('data-activity-id', event.id);

      const icon = document.createElement('span');
      icon.className = 'activity-icon';
      icon.textContent = getActivityIcon(event.type);
      icon.setAttribute('aria-hidden', 'true');
      item.appendChild(icon);

      const desc = document.createElement('span');
      desc.className = 'activity-description';
      desc.textContent = event.description;
      item.appendChild(desc);

      item.addEventListener('click', () => {
        this.callbacks.onActivityClick?.(event);
      });

      itemsList.appendChild(item);
    }
    groupEl.appendChild(itemsList);

    return groupEl;
  }

  private renderEvent(event: ActivityEvent): HTMLElement {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.setAttribute('role', 'article');
    item.setAttribute('data-activity-id', event.id);
    item.setAttribute('aria-label', `${event.actorName}: ${event.description}`);

    if (event.actorId === this.options.currentUserId) {
      item.classList.add('activity-item-own');
    }

    // Icon
    const icon = document.createElement('span');
    icon.className = 'activity-icon';
    icon.textContent = getActivityIcon(event.type);
    icon.setAttribute('aria-hidden', 'true');
    item.appendChild(icon);

    // Content
    const content = document.createElement('div');
    content.className = 'activity-content';

    // Actor + description
    const text = document.createElement('div');
    text.className = 'activity-text';

    const actorSpan = document.createElement('span');
    actorSpan.className = 'activity-actor-name';
    actorSpan.textContent = event.actorName;
    text.appendChild(actorSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'activity-description';
    descSpan.textContent = ` ${event.description}`;
    text.appendChild(descSpan);

    content.appendChild(text);

    // Timestamp
    const time = document.createElement('span');
    time.className = 'activity-time';
    time.textContent = formatRelativeTime(event.createdAt);
    content.appendChild(time);

    item.appendChild(content);

    // Make clickable if there's a resource
    if (event.resourceId && this.callbacks.onActivityClick) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        this.callbacks.onActivityClick!(event);
      });
    }

    return item;
  }

  private createAvatar(name: string, avatarUrl?: string): HTMLElement {
    const avatar = document.createElement('span');
    avatar.className = 'activity-avatar';
    avatar.setAttribute('aria-hidden', 'true');

    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = '';
      img.className = 'activity-avatar-img';
      avatar.appendChild(img);
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
    }

    return avatar;
  }

  private async loadMore(): Promise<void> {
    if (this.isLoadingMore || !this.callbacks.onLoadMore) return;
    this.isLoadingMore = true;

    try {
      const older = await this.callbacks.onLoadMore();
      if (older.length > 0) {
        this.events.push(...older);
        this.render();
      }
    } finally {
      this.isLoadingMore = false;
    }
  }

  /**
   * Set the initial list of activity events.
   */
  public setEvents(events: ActivityEvent[]): void {
    this.events = events.slice(0, this.options.maxItems);
    this.render();
  }

  /**
   * Add a new activity event at the top (real-time update).
   */
  public addEvent(event: ActivityEvent): void {
    // Check type filter
    if (
      this.options.visibleTypes.length > 0 &&
      !this.options.visibleTypes.includes(event.type)
    ) {
      return;
    }

    this.events.unshift(event);

    // Trim to maxItems
    if (this.events.length > this.options.maxItems) {
      this.events = this.events.slice(0, this.options.maxItems);
    }

    this.render();

    // Auto-scroll to top
    if (this.options.autoScroll) {
      this.container.scrollTop = 0;
    }
  }

  /**
   * Remove an activity event by ID.
   */
  public removeEvent(eventId: Uuid): void {
    this.events = this.events.filter(e => e.id !== eventId);
    this.render();
  }

  /**
   * Get the current events.
   */
  public getEvents(): ActivityEvent[] {
    return [...this.events];
  }

  /**
   * Get the count of visible events.
   */
  public getEventCount(): number {
    return filterActivities(this.events, this.options.visibleTypes).length;
  }

  /**
   * Update the filter for visible activity types.
   */
  public setFilter(types: ActivityType[]): void {
    this.options.visibleTypes = types;
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
