/**
 * Notification Controller
 *
 * Manages application notifications and alerts, coordinating between
 * the notification store, delivery service, and UI components.
 * Handles WebSocket-driven real-time notifications, mention detection,
 * and notification display.
 *
 * Requirements: 5.7, 7.6
 */

import type { Uuid } from '@streetstudio/shared';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: { label: string; handler: () => void };
}

export interface NotificationControllerOptions {
  /** Maximum number of visible toast notifications. */
  maxToasts?: number;
  /** Default toast duration in ms. */
  defaultDuration?: number;
  /** Container element for toast display. */
  toastContainer?: HTMLElement;
}

interface ToastEntry {
  id: string;
  options: Required<Omit<ToastOptions, 'action'>> & { action?: ToastOptions['action'] };
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

// --------------------------------------------------------------------------
// NotificationController
// --------------------------------------------------------------------------

/**
 * NotificationController manages toast notifications and coordinates
 * notification delivery between the backend (via WebSocket) and the UI.
 */
export class NotificationController {
  private toasts: ToastEntry[] = [];
  private toastContainer: HTMLElement | null = null;
  private options: Required<Omit<NotificationControllerOptions, 'toastContainer'>> & {
    toastContainer?: HTMLElement;
  };
  private nextId = 0;
  private listeners: Set<(event: NotificationEvent) => void> = new Set();

  constructor(options: NotificationControllerOptions = {}) {
    this.options = {
      maxToasts: options.maxToasts ?? 5,
      defaultDuration: options.defaultDuration ?? 5000,
      toastContainer: options.toastContainer,
    };
  }

  /**
   * Initialize notification system — setup toast container and event listeners.
   */
  public initialize(): void {
    if (!this.toastContainer) {
      this.toastContainer = this.options.toastContainer ?? this.createToastContainer();
    }
  }

  /**
   * Show a toast notification.
   */
  public show(message: string, type: ToastType = 'info'): void {
    this.showToast({ message, type });
  }

  /**
   * Show a toast notification with full options.
   */
  public showToast(options: ToastOptions): void {
    const id = `toast-${this.nextId++}`;
    const type = options.type ?? 'info';
    const duration = options.duration ?? this.options.defaultDuration;

    const element = this.createToastElement(id, options.message, type, options.action);

    const entry: ToastEntry = {
      id,
      options: { message: options.message, type, duration, action: options.action },
      element,
      timer: null,
    };

    // Remove oldest if at capacity
    if (this.toasts.length >= this.options.maxToasts) {
      const oldestToast = this.toasts[0];
      if (oldestToast) {
        this.dismissToast(oldestToast.id);
      }
    }

    this.toasts.push(entry);
    this.toastContainer?.appendChild(element);

    // Announce to screen readers
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'polite');

    // Auto-dismiss after duration (0 = persistent)
    if (duration > 0) {
      entry.timer = setTimeout(() => this.dismissToast(id), duration);
    }
  }

  /**
   * Show a mention notification toast with navigation action.
   */
  public showMentionNotification(
    mentionerName: string,
    resourceId: Uuid,
    onNavigate?: () => void
  ): void {
    this.showToast({
      message: `${mentionerName} mentioned you in a comment`,
      type: 'info',
      duration: 8000,
      action: onNavigate ? { label: 'View', handler: onNavigate } : undefined,
    });
  }

  /**
   * Dismiss a toast by ID.
   */
  public dismissToast(toastId: string): void {
    const index = this.toasts.findIndex((t) => t.id === toastId);
    if (index === -1) return;

    const entry = this.toasts[index];
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);

    // Animate out
    entry.element.classList.add('toast-exit');
    setTimeout(() => {
      entry.element.remove();
    }, 300);

    this.toasts.splice(index, 1);
  }

  /**
   * Dismiss all toasts.
   */
  public dismissAll(): void {
    for (const entry of [...this.toasts]) {
      this.dismissToast(entry.id);
    }
  }

  /**
   * Subscribe to notification events.
   */
  public on(listener: (event: NotificationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit a notification event to all listeners.
   */
  public emit(event: NotificationEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the controller
      }
    });
  }

  /**
   * Get the number of currently visible toasts.
   */
  public getActiveToastCount(): number {
    return this.toasts.length;
  }

  /**
   * Cleanup notification controller and remove all toasts.
   */
  public destroy(): void {
    this.dismissAll();
    this.listeners.clear();
    if (this.toastContainer && !this.options.toastContainer) {
      this.toastContainer.remove();
    }
    this.toastContainer = null;
  }

  private createToastContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'toast-container';
    // A labelled landmark role: `aria-label` is prohibited on a generic <div>
    // (its implicit role), so declare `role="region"` — which requires an
    // accessible name (supplied by aria-label) and also contains the live
    // notifications in a landmark (fixes axe `aria-prohibited-attr`).
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Notifications');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-relevant', 'additions removals');
    document.body.appendChild(container);
    return container;
  }

  private createToastElement(
    id: string,
    message: string,
    type: ToastType,
    action?: { label: string; handler: () => void }
  ): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('data-toast-id', id);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    switch (type) {
      case 'success':
        icon.textContent = '✓';
        break;
      case 'warning':
        icon.textContent = '⚠';
        break;
      case 'error':
        icon.textContent = '✕';
        break;
      default:
        icon.textContent = 'ℹ';
    }
    toast.appendChild(icon);

    // Message
    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;
    toast.appendChild(msg);

    // Action button (optional)
    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action-btn';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => {
        action.handler();
        this.dismissToast(id);
      });
      toast.appendChild(actionBtn);
    }

    // Dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'toast-dismiss-btn';
    dismissBtn.textContent = '×';
    dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    dismissBtn.addEventListener('click', () => this.dismissToast(id));
    toast.appendChild(dismissBtn);

    return toast;
  }
}

/** Event types emitted by the notification controller. */
export interface NotificationEvent {
  type: 'mention' | 'reply' | 'reaction' | 'system' | 'read' | 'read_all';
  notificationId?: Uuid;
  payload?: Record<string, unknown>;
}
