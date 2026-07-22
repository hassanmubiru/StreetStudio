/**
 * Toast Notification System
 * 
 * Production-ready toast notifications for user feedback
 */

export interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastInstance {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  options?: ToastOptions;
  element: HTMLElement;
  timer?: number;
}

class ToastManager {
  private toasts: Map<string, ToastInstance> = new Map();
  private container: HTMLElement | null = null;
  private initialized = false;

  private initialize(): void {
    if (this.initialized) return;

    // Create toast container
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'fixed top-4 right-4 z-50 space-y-2 pointer-events-none';
    this.container.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;

    document.body.appendChild(this.container);
    this.initialized = true;
  }

  public show(
    message: string, 
    type: 'success' | 'error' | 'warning' | 'info', 
    options?: ToastOptions
  ): string {
    this.initialize();

    const id = crypto.randomUUID();
    const toast = this.createToast(id, message, type, options);

    this.toasts.set(id, toast);
    this.container!.appendChild(toast.element);

    // Auto-dismiss after duration (default 5 seconds, 0 = no auto-dismiss)
    const duration = options?.duration ?? 5000;
    if (duration > 0) {
      toast.timer = window.setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  private createToast(
    id: string, 
    message: string, 
    type: 'success' | 'error' | 'warning' | 'info', 
    options?: ToastOptions
  ): ToastInstance {
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.style.cssText = `
      pointer-events: auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-left: 4px solid ${this.getTypeColor(type)};
      padding: 16px;
      min-width: 300px;
      max-width: 400px;
      display: flex;
      align-items: flex-start;
      animation: slideIn 0.3s ease-out;
    `;

    const icon = this.getTypeIcon(type);
    const hasAction = options?.action;

    element.innerHTML = `
      <div style="margin-right: 12px; flex-shrink: 0; color: ${this.getTypeColor(type)};">
        ${icon}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="color: #374151; font-size: 14px; line-height: 1.5; word-wrap: break-word;">
          ${this.escapeHtml(message)}
        </div>
        ${hasAction ? `
          <button 
            class="toast-action"
            style="
              margin-top: 8px;
              color: ${this.getTypeColor(type)};
              background: none;
              border: none;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              padding: 0;
              text-decoration: underline;
            "
          >
            ${this.escapeHtml(options.action!.label)}
          </button>
        ` : ''}
      </div>
      <button 
        class="toast-close"
        style="
          margin-left: 12px;
          background: none;
          border: none;
          color: #9CA3AF;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        "
        title="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Add CSS animations
    this.addAnimationStyles();

    // Add event listeners
    const closeBtn = element.querySelector('.toast-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.dismiss(id));

    if (hasAction) {
      const actionBtn = element.querySelector('.toast-action') as HTMLButtonElement;
      actionBtn.addEventListener('click', () => {
        options.action!.onClick();
        this.dismiss(id);
      });
    }

    const toast: ToastInstance = {
      id,
      message,
      type,
      options,
      element,
    };

    return toast;
  }

  private addAnimationStyles(): void {
    if (document.querySelector('#toast-animations')) return;

    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
      
      .toast-close:hover {
        background-color: #F3F4F6 !important;
      }
      
      .toast-action:hover {
        opacity: 0.8;
      }
    `;

    document.head.appendChild(style);
  }

  private getTypeColor(type: string): string {
    switch (type) {
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      case 'warning': return '#F59E0B';
      case 'info': return '#3B82F6';
      default: return '#6B7280';
    }
  }

  private getTypeIcon(type: string): string {
    switch (type) {
      case 'success':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>`;
      case 'error':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
      case 'warning':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
      case 'info':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>`;
      default:
        return '';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public dismiss(id: string): void {
    const toast = this.toasts.get(id);
    if (!toast) return;

    // Clear timer
    if (toast.timer) {
      clearTimeout(toast.timer);
    }

    // Animate out
    toast.element.style.animation = 'slideOut 0.3s ease-in forwards';
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(id);
    }, 300);
  }

  public dismissAll(): void {
    for (const [id] of this.toasts) {
      this.dismiss(id);
    }
  }

  public clear(): void {
    this.toasts.forEach(toast => {
      if (toast.timer) {
        clearTimeout(toast.timer);
      }
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
    });
    this.toasts.clear();
  }
}

// Global toast manager instance
const toastManager = new ToastManager();

export const toast = {
  success: (message: string, options?: ToastOptions): string => {
    return toastManager.show(message, 'success', options);
  },
  
  error: (message: string, options?: ToastOptions): string => {
    return toastManager.show(message, 'error', options);
  },
  
  warning: (message: string, options?: ToastOptions): string => {
    return toastManager.show(message, 'warning', options);
  },
  
  info: (message: string, options?: ToastOptions): string => {
    return toastManager.show(message, 'info', options);
  },

  dismiss: (id: string): void => {
    toastManager.dismiss(id);
  },

  dismissAll: (): void => {
    toastManager.dismissAll();
  },

  clear: (): void => {
    toastManager.clear();
  },
};