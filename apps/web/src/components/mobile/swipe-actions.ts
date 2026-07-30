/**
 * Swipe Actions Component
 * 
 * Provides swipe-to-reveal action buttons for list items on mobile.
 * Supports configurable left/right swipe actions (delete, archive, etc.)
 * with haptic-like visual feedback and threshold-based activation.
 * 
 * Requirements: 10.5
 */

import { TouchGestureHandler, type PanEvent } from './touch-gesture-handler.js';
import { MIN_TOUCH_TARGET } from '../../styles/responsive.js';

export type SwipeActionType = 'delete' | 'archive' | 'pin' | 'mark-read' | 'custom';

export interface SwipeAction {
  type: SwipeActionType;
  label: string;
  icon?: string;
  color: string;
  /** Background color when action is triggered */
  activeColor?: string;
}

export interface SwipeActionsOptions {
  /** Actions revealed on left swipe (swiping content to the left) */
  leftActions?: SwipeAction[];
  /** Actions revealed on right swipe (swiping content to the right) */
  rightActions?: SwipeAction[];
  /** Width of action buttons in px (default: 72) */
  actionWidth?: number;
  /** Threshold ratio (0-1) to trigger full action (default: 0.4) */
  triggerThreshold?: number;
  /** Whether to auto-close after action (default: true) */
  autoClose?: boolean;
  /** Animation duration in ms (default: 200) */
  animationDuration?: number;
}

export interface SwipeActionsCallbacks {
  onAction?: (action: SwipeAction, itemId: string) => void;
  onOpen?: (direction: 'left' | 'right', itemId: string) => void;
  onClose?: (itemId: string) => void;
}

export interface SwipeableItemOptions {
  id: string;
  content: HTMLElement;
}

const DEFAULT_OPTIONS: Required<SwipeActionsOptions> = {
  leftActions: [],
  rightActions: [],
  actionWidth: 72,
  triggerThreshold: 0.4,
  autoClose: true,
  animationDuration: 200,
};

/**
 * SwipeableItem
 * 
 * Wraps a list item element to add swipe-to-reveal action functionality.
 * Provides left and right action panels that appear when the user
 * swipes the content horizontally.
 */
export class SwipeableItem {
  private container: HTMLElement;
  private options: Required<SwipeActionsOptions>;
  private callbacks: SwipeActionsCallbacks;
  private itemId: string;
  private gestureHandler: TouchGestureHandler | null = null;
  private isDestroyed = false;

  // DOM
  private wrapperEl!: HTMLElement;
  private contentEl!: HTMLElement;
  private leftPanel!: HTMLElement;
  private rightPanel!: HTMLElement;

  // State
  private currentOffset = 0;
  private isOpen: 'left' | 'right' | null = null;

  constructor(
    container: HTMLElement,
    item: SwipeableItemOptions,
    options: SwipeActionsOptions = {},
    callbacks: SwipeActionsCallbacks = {}
  ) {
    this.container = container;
    this.itemId = item.id;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;

    this.buildDOM(item.content);
    this.setupGestures();
  }

  private buildDOM(content: HTMLElement): void {
    this.container.className = 'swipeable-item';
    this.container.style.cssText = 'position: relative; overflow: hidden;';
    this.container.setAttribute('data-swipeable-id', this.itemId);
    this.container.innerHTML = '';

    // Wrapper for the swipeable content
    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'swipeable-item__wrapper';
    this.wrapperEl.style.cssText = `
      position: relative; display: flex; width: 100%;
      transition: transform ${this.options.animationDuration}ms ease-out;
      will-change: transform;
    `;

    // Right action panel (revealed on left swipe)
    if (this.options.leftActions.length > 0) {
      this.rightPanel = this.createActionPanel(this.options.leftActions, 'right');
      this.container.appendChild(this.rightPanel);
    } else {
      this.rightPanel = document.createElement('div');
    }

    // Left action panel (revealed on right swipe)
    if (this.options.rightActions.length > 0) {
      this.leftPanel = this.createActionPanel(this.options.rightActions, 'left');
      this.container.appendChild(this.leftPanel);
    } else {
      this.leftPanel = document.createElement('div');
    }

    // Content
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'swipeable-item__content';
    this.contentEl.style.cssText = `
      width: 100%; flex-shrink: 0; background: white;
      position: relative; z-index: 1;
    `;
    this.contentEl.appendChild(content);
    this.wrapperEl.appendChild(this.contentEl);

    this.container.appendChild(this.wrapperEl);
  }

  private createActionPanel(actions: SwipeAction[], side: 'left' | 'right'): HTMLElement {
    const panel = document.createElement('div');
    panel.className = `swipeable-item__actions swipeable-item__actions--${side}`;
    const totalWidth = actions.length * this.options.actionWidth;
    panel.style.cssText = `
      position: absolute; top: 0; ${side}: 0; bottom: 0;
      display: flex; width: ${totalWidth}px; z-index: 0;
    `;

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swipeable-action-btn';
      btn.setAttribute('aria-label', action.label);
      btn.setAttribute('data-action-type', action.type);
      btn.style.cssText = `
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 4px;
        background: ${action.color}; border: none; color: white;
        font-size: 0.75rem; font-weight: 500; cursor: pointer;
        min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px;
        -webkit-tap-highlight-color: transparent; touch-action: manipulation;
      `;
      if (action.icon) {
        btn.innerHTML = `${action.icon}<span>${action.label}</span>`;
      } else {
        btn.textContent = action.label;
      }
      btn.addEventListener('click', () => this.triggerAction(action));
      panel.appendChild(btn);
    }

    return panel;
  }

  private setupGestures(): void {
    this.gestureHandler = new TouchGestureHandler(
      this.contentEl,
      {
        onPanStart: () => this.handlePanStart(),
        onPanMove: (e) => this.handlePanMove(e),
        onPanEnd: (e) => this.handlePanEnd(e),
      },
      {
        enablePan: true,
        directionLock: true,
        preventDefault: false,
      }
    );
  }

  private handlePanStart(): void {
    // Disable transition during drag
    this.wrapperEl.style.transition = 'none';
  }

  private handlePanMove(event: PanEvent): void {
    const { deltaX } = event;
    let offset = deltaX;

    // Determine max offset based on available actions
    const leftMax = this.options.rightActions.length * this.options.actionWidth;
    const rightMax = this.options.leftActions.length * this.options.actionWidth;

    // Apply resistance when past limits
    if (offset > 0) {
      // Swiping right
      if (this.options.rightActions.length === 0) {
        offset = offset * 0.2; // resistance
      } else {
        offset = Math.min(offset, leftMax * 1.2);
      }
    } else {
      // Swiping left
      if (this.options.leftActions.length === 0) {
        offset = offset * 0.2; // resistance
      } else {
        offset = Math.max(offset, -rightMax * 1.2);
      }
    }

    this.currentOffset = offset;
    this.contentEl.style.transform = `translateX(${offset}px)`;
  }

  private handlePanEnd(event: PanEvent): void {
    // Restore transition
    this.wrapperEl.style.transition = `transform ${this.options.animationDuration}ms ease-out`;
    this.contentEl.style.transition = `transform ${this.options.animationDuration}ms ease-out`;

    const leftMax = this.options.rightActions.length * this.options.actionWidth;
    const rightMax = this.options.leftActions.length * this.options.actionWidth;
    const threshold = this.options.triggerThreshold;

    if (this.currentOffset > 0 && this.options.rightActions.length > 0) {
      // Swiping right - check if past threshold
      if (this.currentOffset > leftMax * threshold || event.velocity > 0.5) {
        this.openActions('right');
      } else {
        this.close();
      }
    } else if (this.currentOffset < 0 && this.options.leftActions.length > 0) {
      // Swiping left - check if past threshold
      if (Math.abs(this.currentOffset) > rightMax * threshold || event.velocity > 0.5) {
        this.openActions('left');
      } else {
        this.close();
      }
    } else {
      this.close();
    }
  }

  private openActions(direction: 'left' | 'right'): void {
    const offset = direction === 'right'
      ? this.options.rightActions.length * this.options.actionWidth
      : -(this.options.leftActions.length * this.options.actionWidth);

    this.currentOffset = offset;
    this.contentEl.style.transform = `translateX(${offset}px)`;
    this.isOpen = direction;
    this.callbacks.onOpen?.(direction, this.itemId);
  }

  private triggerAction(action: SwipeAction): void {
    this.callbacks.onAction?.(action, this.itemId);
    if (this.options.autoClose) {
      this.close();
    }
  }

  // --- Public API ---

  public close(): void {
    this.currentOffset = 0;
    this.contentEl.style.transform = 'translateX(0)';
    if (this.isOpen) {
      this.callbacks.onClose?.(this.itemId);
      this.isOpen = null;
    }
  }

  public isActionOpen(): boolean {
    return this.isOpen !== null;
  }

  public getOpenDirection(): 'left' | 'right' | null {
    return this.isOpen;
  }

  public getId(): string {
    return this.itemId;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.gestureHandler?.destroy();
    this.container.innerHTML = '';
  }
}

/**
 * SwipeActionsList
 * 
 * Manages a list of swipeable items, ensuring only one item
 * is open at a time and providing list-level event handling.
 */
export class SwipeActionsList {
  private container: HTMLElement;
  private options: SwipeActionsOptions;
  private callbacks: SwipeActionsCallbacks;
  private items: Map<string, SwipeableItem> = new Map();

  constructor(
    container: HTMLElement,
    options: SwipeActionsOptions = {},
    callbacks: SwipeActionsCallbacks = {}
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.container.className = 'swipe-actions-list';
    this.container.setAttribute('role', 'list');
  }

  /** Add a swipeable item to the list */
  public addItem(item: SwipeableItemOptions): SwipeableItem {
    const itemContainer = document.createElement('div');
    itemContainer.setAttribute('role', 'listitem');
    this.container.appendChild(itemContainer);

    const swipeableItem = new SwipeableItem(
      itemContainer,
      item,
      this.options,
      {
        onAction: (action, itemId) => {
          this.callbacks.onAction?.(action, itemId);
        },
        onOpen: (direction, itemId) => {
          // Close other items when one opens
          this.closeAllExcept(itemId);
          this.callbacks.onOpen?.(direction, itemId);
        },
        onClose: (itemId) => {
          this.callbacks.onClose?.(itemId);
        },
      }
    );

    this.items.set(item.id, swipeableItem);
    return swipeableItem;
  }

  /** Remove an item from the list */
  public removeItem(id: string): void {
    const item = this.items.get(id);
    if (item) {
      item.destroy();
      item.getElement().remove();
      this.items.delete(id);
    }
  }

  /** Close all open items */
  public closeAll(): void {
    this.items.forEach(item => item.close());
  }

  /** Close all items except the specified one */
  public closeAllExcept(id: string): void {
    this.items.forEach((item, itemId) => {
      if (itemId !== id) item.close();
    });
  }

  /** Get all items */
  public getItems(): Map<string, SwipeableItem> {
    return this.items;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.items.forEach(item => item.destroy());
    this.items.clear();
    this.container.innerHTML = '';
  }
}
