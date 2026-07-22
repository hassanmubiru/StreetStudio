/**
 * Toast Notification Component
 * 
 * Production-ready toast notification system with multiple types,
 * auto-dismiss, and accessibility support.
 */

import { colors, spacing, borderRadius, shadows, transitions, zIndex } from '../design-system.js';
import { cn, generateId, getAnimationDuration, announceToScreenReader } from '../utils.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number; // milliseconds, 0 = no auto-dismiss
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: (id: string) => void;
}

interface ToastContainerOptions {
  position?: ToastPosition;
  maxToasts?: number;
}

const getToastStyles = (type: ToastType): string => {
  const baseStyles = [
    'pointer-events-auto',
    'w-full max-w-sm',
    'overflow-hidden',
    'rounded-lg',
    'shadow-lg',
    'ring-1 ring-black ring-opacity-5',
    'transform transition-all duration-300 ease-in-out',
  ].join(' ');

  const typeStyles = {
    success: 'bg-green-50 ring-green-200',
    error: 'bg-red-50 ring-red-200',
    warning: 'bg-yellow-50 ring-yellow-200',
    info: 'bg-blue-50 ring-blue-200',
  }[type];

  return cn(baseStyles, typeStyles);
};

const getIconForType = (type: ToastType): string => {
  const icons = {
    success: `<svg class="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
    </svg>`,
    error: `<svg class="w-5 h-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
    </svg>`,
    warning: `<svg class="w-5 h-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
    </svg>`,
    info: `<svg class="w-5 h-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
    </svg>`,
  };

  return icons[type];
};

const getTextColorForType = (type: ToastType): string => {
  return {
    success: 'text-green-800',
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800',
  }[type];
};

export class Toast {
  private element: HTMLDivElement;
  private props: Required<Omit<ToastProps, 'action' | 'onDismiss'>> & Pick<ToastProps, 'action' | 'onDismiss'>;
  private timeoutId?: number;
  private isVisible = false;

  constructor(props: ToastProps) {
    this.props = {
      id: generateId('toast'),
      type: 'info',
      title: '',
      message: '',
      duration: 5000,
      dismissible: true,
      ...props,
    };

    this.element = this.createElement();
    this.setupEventListeners();
  }

  private createElement(): HTMLDivElement {
    const toast = document.createElement('div');
    toast.id = this.props.id;
    toast.className = cn(
      getToastStyles(this.props.type),
      'translate-x-full opacity-0'
    );
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    const container = document.createElement('div');
    container.className = 'p-4';

    const content = document.createElement('div');
    content.className = 'flex items-start';

    // Icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'flex-shrink-0';
    iconContainer.innerHTML = getIconForType(this.props.type);
    content.appendChild(iconContainer);

    // Text content
    const textContainer = document.createElement('div');
    textContainer.className = 'ml-3 w-0 flex-1';

    if (this.props.title) {
      const title = document.createElement('p');
      title.className = cn('text-sm font-medium', getTextColorForType(this.props.type));
      title.textContent = this.props.title;
      textContainer.appendChild(title);
    }

    const message = document.createElement('p');
    message.className = cn(
      'text-sm',
      getTextColorForType(this.props.type),
      this.props.title ? 'mt-1' : ''
    );
    message.textContent = this.props.message;
    textContainer.appendChild(message);

    // Action button
    if (this.props.action) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = cn(
        'mt-2 text-sm font-medium',
        'focus:outline-none focus:underline',
        getTextColorForType(this.props.type)
      );
      actionButton.textContent = this.props.action.label;
      actionButton.addEventListener('click', () => {
        this.props.action!.onClick();
        this.dismiss();
      });
      textContainer.appendChild(actionButton);
    }

    content.appendChild(textContainer);

    // Dismiss button
    if (this.props.dismissible) {
      const dismissButton = document.createElement('button');
      dismissButton.type = 'button';
      dismissButton.className = cn(
        'ml-4 flex-shrink-0',
        'rounded-md p-1.5',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'transition-colors',
        getTextColorForType(this.props.type),
        'hover:opacity-75'
      );
      dismissButton.setAttribute('aria-label', 'Dismiss notification');
      dismissButton.innerHTML = `
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      `;
      dismissButton.addEventListener('click', () => this.dismiss());
      content.appendChild(dismissButton);
    }

    container.appendChild(content);
    toast.appendChild(container);

    return toast;
  }

  private setupEventListeners(): void {
    // Pause auto-dismiss on hover
    if (this.props.duration > 0) {
      this.element.addEventListener('mouseenter', () => {
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = undefined;
        }
      });

      this.element.addEventListener('mouseleave', () => {
        if (this.props.duration > 0) {
          this.startAutoDismiss();
        }
      });
    }
  }

  private startAutoDismiss(): void {
    if (this.props.duration > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.dismiss();
      }, this.props.duration);
    }
  }

  public show(): void {
    if (this.isVisible) return;
    
    this.isVisible = true;
    
    // Announce to screen readers
    const announcement = this.props.title 
      ? `${this.props.title}: ${this.props.message}`
      : this.props.message;
    announceToScreenReader(announcement);

    // Animate in
    requestAnimationFrame(() => {
      this.element.classList.remove('translate-x-full', 'opacity-0');
      this.element.classList.add('translate-x-0', 'opacity-100');
    });

    // Start auto-dismiss timer
    this.startAutoDismiss();
  }

  public dismiss(): void {
    if (!this.isVisible) return;
    
    this.isVisible = false;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    // Animate out
    this.element.classList.remove('translate-x-0', 'opacity-100');
    this.element.classList.add('translate-x-full', 'opacity-0');

    setTimeout(() => {
      if (this.props.onDismiss) {
        this.props.onDismiss(this.props.id);
      }
      this.destroy();
    }, getAnimationDuration(300));
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public getId(): string {
    return this.props.id;
  }

  public destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export class ToastContainer {
  private container: HTMLDivElement;
  private toasts: Map<string, Toast> = new Map();
  private options: Required<ToastContainerOptions>;

  constructor(options: ToastContainerOptions = {}) {
    this.options = {
      position: 'top-right',
      maxToasts: 5,
      ...options,
    };

    this.container = this.createContainer();
    document.body.appendChild(this.container);
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = this.getPositionClasses();
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'Notifications');

    return container;
  }

  private getPositionClasses(): string {
    const baseClasses = 'fixed z-50 pointer-events-none space-y-4';
    
    const positionClasses = {
      'top-right': 'top-0 right-0 p-6',
      'top-left': 'top-0 left-0 p-6',
      'bottom-right': 'bottom-0 right-0 p-6',
      'bottom-left': 'bottom-0 left-0 p-6',
      'top-center': 'top-0 left-1/2 transform -translate-x-1/2 p-6',
      'bottom-center': 'bottom-0 left-1/2 transform -translate-x-1/2 p-6',
    }[this.options.position];

    return cn(baseClasses, positionClasses);
  }

  public show(props: Omit<ToastProps, 'id' | 'onDismiss'>): string {
    // Remove oldest toasts if we've reached the limit
    if (this.toasts.size >= this.options.maxToasts) {
      const oldestToast = Array.from(this.toasts.values())[0];
      if (oldestToast) {
        oldestToast.dismiss();
      }
    }

    const toast = new Toast({
      ...props,
      onDismiss: (id) => this.remove(id),
    });

    this.toasts.set(toast.getId(), toast);
    
    // Add to container (position based on order)
    if (this.options.position.includes('bottom')) {
      this.container.insertBefore(toast.getElement(), this.container.firstChild);
    } else {
      this.container.appendChild(toast.getElement());
    }

    toast.show();

    return toast.getId();
  }

  public remove(id: string): void {
    const toast = this.toasts.get(id);
    if (toast) {
      toast.dismiss();
      this.toasts.delete(id);
    }
  }

  public clear(): void {
    this.toasts.forEach(toast => toast.dismiss());
    this.toasts.clear();
  }

  public destroy(): void {
    this.clear();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  // Convenience methods
  public success(message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>): string {
    return this.show({ ...options, type: 'success', message });
  }

  public error(message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>): string {
    return this.show({ ...options, type: 'error', message });
  }

  public warning(message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>): string {
    return this.show({ ...options, type: 'warning', message });
  }

  public info(message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>): string {
    return this.show({ ...options, type: 'info', message });
  }
}

// Global toast instance
let globalToastContainer: ToastContainer | null = null;

export const toast = {
  show: (props: Omit<ToastProps, 'id' | 'onDismiss'>) => {
    if (!globalToastContainer) {
      globalToastContainer = new ToastContainer();
    }
    return globalToastContainer.show(props);
  },
  success: (message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>) => {
    if (!globalToastContainer) {
      globalToastContainer = new ToastContainer();
    }
    return globalToastContainer.success(message, options);
  },
  error: (message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>) => {
    if (!globalToastContainer) {
      globalToastContainer = new ToastContainer();
    }
    return globalToastContainer.error(message, options);
  },
  warning: (message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>) => {
    if (!globalToastContainer) {
      globalToastContainer = new ToastContainer();
    }
    return globalToastContainer.warning(message, options);
  },
  info: (message: string, options?: Partial<Omit<ToastProps, 'type' | 'message'>>) => {
    if (!globalToastContainer) {
      globalToastContainer = new ToastContainer();
    }
    return globalToastContainer.info(message, options);
  },
  remove: (id: string) => {
    if (globalToastContainer) {
      globalToastContainer.remove(id);
    }
  },
  clear: () => {
    if (globalToastContainer) {
      globalToastContainer.clear();
    }
  },
};