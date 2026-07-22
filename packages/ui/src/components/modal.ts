/**
 * Modal Component
 * 
 * Production-ready modal/dialog component with accessibility support,
 * focus trapping, and backdrop handling.
 */

import { colors, spacing, borderRadius, shadows, transitions, zIndex } from '../design-system.js';
import { cn, trapFocus, generateId, KEYBOARD_SHORTCUTS, getAnimationDuration, prefersReducedMotion } from '../utils.js';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

export interface ModalProps {
  isOpen: boolean;
  size?: ModalSize;
  title?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  children?: HTMLElement[];
  onClose?: () => void;
  onOpen?: () => void;
}

const getModalStyles = (size: ModalSize): string => {
  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-lg', 
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-none m-4',
  }[size];

  return cn(
    'relative bg-white rounded-lg shadow-xl transform transition-all',
    sizeStyles
  );
};

export class Modal {
  private backdrop: HTMLDivElement;
  private container: HTMLDivElement;
  private header?: HTMLDivElement;
  private content: HTMLDivElement;
  private props: Required<Omit<ModalProps, 'children' | 'onClose' | 'onOpen'>> & Pick<ModalProps, 'children' | 'onClose' | 'onOpen'>;
  private focusTrap?: () => void;
  private previousActiveElement?: HTMLElement;
  private isAnimating = false;

  constructor(props: ModalProps) {
    this.props = {
      isOpen: false,
      size: 'md',
      title: '',
      closeOnBackdrop: true,
      closeOnEscape: true,
      showCloseButton: true,
      className: '',
      ...props,
    };

    this.backdrop = this.createBackdrop();
    this.container = this.createContainer();
    this.setupEventListeners();
    
    if (this.props.isOpen) {
      this.show();
    }
  }

  private createBackdrop(): HTMLDivElement {
    const backdrop = document.createElement('div');
    backdrop.className = cn(
      'fixed inset-0 z-50 overflow-y-auto',
      'bg-black bg-opacity-50',
      'flex items-center justify-center p-4',
      'transition-opacity duration-300',
      'opacity-0 pointer-events-none'
    );
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.id = generateId('modal');

    return backdrop;
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = cn(
      getModalStyles(this.props.size),
      'transform scale-95 transition-transform duration-300',
      this.props.className
    );

    // Header
    if (this.props.title || this.props.showCloseButton) {
      this.header = this.createHeader();
      container.appendChild(this.header);
    }

    // Content
    this.content = document.createElement('div');
    this.content.className = 'px-6 pb-6';
    if (!this.header) {
      this.content.classList.add('pt-6');
    }
    
    if (this.props.children) {
      this.props.children.forEach(child => this.content.appendChild(child));
    }

    container.appendChild(this.content);
    this.backdrop.appendChild(container);

    return container;
  }

  private createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-6 py-4 border-b border-gray-200';

    if (this.props.title) {
      const title = document.createElement('h2');
      title.className = 'text-lg font-semibold text-gray-900';
      title.textContent = this.props.title;
      title.id = `${this.backdrop.id}-title`;
      this.backdrop.setAttribute('aria-labelledby', title.id);
      header.appendChild(title);
    }

    if (this.props.showCloseButton) {
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = cn(
        'p-1 rounded-md text-gray-400 hover:text-gray-600',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        'transition-colors'
      );
      closeButton.setAttribute('aria-label', 'Close modal');
      closeButton.innerHTML = `
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
      
      closeButton.addEventListener('click', () => this.close());
      header.appendChild(closeButton);
    }

    return header;
  }

  private setupEventListeners(): void {
    // Backdrop click
    this.backdrop.addEventListener('click', (event) => {
      if (event.target === this.backdrop && this.props.closeOnBackdrop) {
        this.close();
      }
    });

    // Escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYBOARD_SHORTCUTS.ESCAPE && this.props.closeOnEscape) {
        event.preventDefault();
        this.close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Store cleanup function
    this.backdrop.addEventListener('modal:destroy', () => {
      document.removeEventListener('keydown', handleKeyDown);
    });
  }

  private show(): void {
    if (this.isAnimating || this.props.isOpen) return;
    
    this.isAnimating = true;
    this.previousActiveElement = document.activeElement as HTMLElement;

    // Add to DOM
    document.body.appendChild(this.backdrop);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(() => {
      this.backdrop.classList.remove('opacity-0', 'pointer-events-none');
      this.backdrop.classList.add('opacity-100');
      
      this.container.classList.remove('scale-95');
      this.container.classList.add('scale-100');

      // Setup focus trap
      this.focusTrap = trapFocus(this.container);

      setTimeout(() => {
        this.isAnimating = false;
        if (this.props.onOpen) {
          this.props.onOpen();
        }
      }, getAnimationDuration(300));
    });
  }

  private hide(): void {
    if (this.isAnimating || !this.props.isOpen) return;
    
    this.isAnimating = true;

    // Cleanup focus trap
    if (this.focusTrap) {
      this.focusTrap();
      this.focusTrap = undefined;
    }

    // Animate out
    this.backdrop.classList.remove('opacity-100');
    this.backdrop.classList.add('opacity-0');
    
    this.container.classList.remove('scale-100');
    this.container.classList.add('scale-95');

    setTimeout(() => {
      // Remove from DOM
      if (this.backdrop.parentNode) {
        document.body.removeChild(this.backdrop);
      }
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      // Restore focus
      if (this.previousActiveElement) {
        this.previousActiveElement.focus();
        this.previousActiveElement = undefined;
      }

      this.backdrop.classList.add('pointer-events-none');
      this.isAnimating = false;
    }, getAnimationDuration(300));
  }

  // Public API
  public open(): void {
    if (!this.props.isOpen) {
      this.props.isOpen = true;
      this.show();
    }
  }

  public close(): void {
    if (this.props.isOpen && this.props.onClose) {
      this.props.onClose();
    }
    
    if (this.props.isOpen) {
      this.props.isOpen = false;
      this.hide();
    }
  }

  public updateProps(newProps: Partial<ModalProps>): void {
    const wasOpen = this.props.isOpen;
    this.props = { ...this.props, ...newProps };

    // Handle open/close state changes
    if (!wasOpen && this.props.isOpen) {
      this.show();
    } else if (wasOpen && !this.props.isOpen) {
      this.hide();
    }

    // Update title
    if (this.header && this.props.title) {
      const titleElement = this.header.querySelector('h2');
      if (titleElement) {
        titleElement.textContent = this.props.title;
      }
    }

    // Update container styles
    this.container.className = cn(
      getModalStyles(this.props.size),
      'transform transition-transform duration-300',
      this.props.isOpen ? 'scale-100' : 'scale-95',
      this.props.className
    );
  }

  public setContent(children: HTMLElement[]): void {
    this.content.innerHTML = '';
    children.forEach(child => this.content.appendChild(child));
  }

  public getElement(): HTMLDivElement {
    return this.backdrop;
  }

  public isVisible(): boolean {
    return this.props.isOpen && !this.isAnimating;
  }

  public destroy(): void {
    if (this.focusTrap) {
      this.focusTrap();
    }
    
    if (this.props.isOpen) {
      document.body.style.overflow = '';
      if (this.previousActiveElement) {
        this.previousActiveElement.focus();
      }
    }

    // Dispatch cleanup event
    this.backdrop.dispatchEvent(new CustomEvent('modal:destroy'));
    
    if (this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
  }

  // Static factory methods
  static confirm(options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }): Modal {
    const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel } = options;

    const content = document.createElement('div');
    content.className = 'space-y-4';

    const messageEl = document.createElement('p');
    messageEl.className = 'text-gray-600';
    messageEl.textContent = message;
    content.appendChild(messageEl);

    const actions = document.createElement('div');
    actions.className = 'flex justify-end space-x-3';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
    confirmBtn.textContent = confirmText;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    content.appendChild(actions);

    const modal = new Modal({
      isOpen: true,
      size: 'sm',
      title,
      children: [content],
      closeOnBackdrop: false,
      closeOnEscape: true,
      onClose: () => {
        if (onCancel) onCancel();
        modal.destroy();
      },
    });

    cancelBtn.addEventListener('click', () => {
      modal.close();
    });

    confirmBtn.addEventListener('click', () => {
      onConfirm();
      modal.close();
    });

    return modal;
  }

  static alert(options: {
    title: string;
    message: string;
    buttonText?: string;
    onClose?: () => void;
  }): Modal {
    const { title, message, buttonText = 'OK', onClose } = options;

    const content = document.createElement('div');
    content.className = 'space-y-4';

    const messageEl = document.createElement('p');
    messageEl.className = 'text-gray-600';
    messageEl.textContent = message;
    content.appendChild(messageEl);

    const actions = document.createElement('div');
    actions.className = 'flex justify-end';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
    okBtn.textContent = buttonText;

    actions.appendChild(okBtn);
    content.appendChild(actions);

    const modal = new Modal({
      isOpen: true,
      size: 'sm',
      title,
      children: [content],
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {
        if (onClose) onClose();
        modal.destroy();
      },
    });

    okBtn.addEventListener('click', () => {
      modal.close();
    });

    return modal;
  }
}