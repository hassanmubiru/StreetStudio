/**
 * Button Component
 * 
 * Production-ready button component with full accessibility support,
 * multiple variants, sizes, and states.
 */

import { colors, spacing, typography, borderRadius, transitions } from '../design-system.js';
import { cn, generateId, KEYBOARD_SHORTCUTS, getAnimationDuration } from '../utils.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  ariaDescribedBy?: string;
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children?: string | HTMLElement[];
  leftIcon?: HTMLElement;
  rightIcon?: HTMLElement;
  id?: string;
  className?: string;
}

const getButtonStyles = (variant: ButtonVariant, size: ButtonSize, disabled: boolean, loading: boolean, fullWidth: boolean): string => {
  const baseStyles = [
    'inline-flex',
    'items-center',
    'justify-center',
    'font-medium',
    'transition-colors',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-2',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
    fullWidth ? 'w-full' : '',
  ].filter(Boolean).join(' ');

  // Size styles
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm rounded-md',
    md: 'px-4 py-2 text-sm rounded-md',
    lg: 'px-4 py-2 text-base rounded-md',
    xl: 'px-6 py-3 text-base rounded-lg',
  }[size];

  // Variant styles
  const variantStyles = {
    primary: `bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 ${disabled ? '' : 'active:bg-blue-800'}`,
    secondary: `bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 border border-gray-300 ${disabled ? '' : 'active:bg-gray-300'}`,
    ghost: `text-gray-700 hover:bg-gray-100 focus:ring-gray-500 ${disabled ? '' : 'active:bg-gray-200'}`,
    danger: `bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 ${disabled ? '' : 'active:bg-red-800'}`,
    success: `bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 ${disabled ? '' : 'active:bg-green-800'}`,
  }[variant];

  return cn(baseStyles, sizeStyles, variantStyles, loading ? 'cursor-wait' : '');
};

export class Button {
  private element: HTMLButtonElement;
  private props: Required<ButtonProps>;
  private loadingSpinner?: HTMLElement;

  constructor(props: ButtonProps) {
    this.props = {
      variant: 'primary',
      size: 'md',
      disabled: false,
      loading: false,
      fullWidth: false,
      type: 'button',
      ariaLabel: '',
      ariaDescribedBy: '',
      onClick: () => {},
      onKeyDown: () => {},
      children: [],
      leftIcon: undefined,
      rightIcon: undefined,
      id: generateId('button'),
      className: '',
      ...props,
    };

    this.element = this.createElement();
    this.setupEventListeners();
  }

  private createElement(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = this.props.type;
    button.id = this.props.id;
    button.disabled = this.props.disabled || this.props.loading;
    
    if (this.props.ariaLabel) {
      button.setAttribute('aria-label', this.props.ariaLabel);
    }
    
    if (this.props.ariaDescribedBy) {
      button.setAttribute('aria-describedby', this.props.ariaDescribedBy);
    }

    this.updateStyles();
    this.updateContent();

    return button;
  }

  private updateStyles(): void {
    const styles = getButtonStyles(
      this.props.variant,
      this.props.size,
      this.props.disabled,
      this.props.loading,
      this.props.fullWidth
    );
    
    this.element.className = cn(styles, this.props.className);
  }

  private createLoadingSpinner(): HTMLElement {
    const spinner = document.createElement('div');
    spinner.className = 'animate-spin mr-2';
    spinner.innerHTML = `
      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    `;
    return spinner;
  }

  private updateContent(): void {
    // Clear existing content
    this.element.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'flex items-center';
    
    // Loading spinner
    if (this.props.loading) {
      if (!this.loadingSpinner) {
        this.loadingSpinner = this.createLoadingSpinner();
      }
      container.appendChild(this.loadingSpinner);
    }
    
    // Left icon
    if (this.props.leftIcon && !this.props.loading) {
      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'mr-2';
      iconWrapper.appendChild(this.props.leftIcon);
      container.appendChild(iconWrapper);
    }
    
    // Content
    if (typeof this.props.children === 'string') {
      const text = document.createElement('span');
      text.textContent = this.props.children;
      container.appendChild(text);
    } else if (Array.isArray(this.props.children)) {
      this.props.children.forEach(child => container.appendChild(child));
    }
    
    // Right icon
    if (this.props.rightIcon && !this.props.loading) {
      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'ml-2';
      iconWrapper.appendChild(this.props.rightIcon);
      container.appendChild(iconWrapper);
    }
    
    this.element.appendChild(container);
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', (event: MouseEvent) => {
      if (!this.props.disabled && !this.props.loading) {
        this.props.onClick(event);
      }
    });

    this.element.addEventListener('keydown', (event: KeyboardEvent) => {
      // Enhanced keyboard handling
      if (event.key === KEYBOARD_SHORTCUTS.SPACE || event.key === KEYBOARD_SHORTCUTS.ENTER) {
        if (!this.props.disabled && !this.props.loading) {
          event.preventDefault();
          this.element.click();
        }
      }
      
      this.props.onKeyDown(event);
    });

    // Focus and blur for better UX
    this.element.addEventListener('focus', () => {
      this.element.style.transform = 'translateY(-1px)';
    });

    this.element.addEventListener('blur', () => {
      this.element.style.transform = 'translateY(0)';
    });
  }

  // Public API
  public updateProps(newProps: Partial<ButtonProps>): void {
    this.props = { ...this.props, ...newProps };
    
    this.element.disabled = this.props.disabled || this.props.loading;
    
    if (this.props.ariaLabel) {
      this.element.setAttribute('aria-label', this.props.ariaLabel);
    } else {
      this.element.removeAttribute('aria-label');
    }
    
    if (this.props.ariaDescribedBy) {
      this.element.setAttribute('aria-describedby', this.props.ariaDescribedBy);
    } else {
      this.element.removeAttribute('aria-describedby');
    }
    
    this.updateStyles();
    this.updateContent();
  }

  public focus(): void {
    this.element.focus();
  }

  public blur(): void {
    this.element.blur();
  }

  public getElement(): HTMLButtonElement {
    return this.element;
  }

  public destroy(): void {
    this.element.remove();
  }

  // Static factory methods
  static primary(props: Omit<ButtonProps, 'variant'>): Button {
    return new Button({ ...props, variant: 'primary' });
  }

  static secondary(props: Omit<ButtonProps, 'variant'>): Button {
    return new Button({ ...props, variant: 'secondary' });
  }

  static ghost(props: Omit<ButtonProps, 'variant'>): Button {
    return new Button({ ...props, variant: 'ghost' });
  }

  static danger(props: Omit<ButtonProps, 'variant'>): Button {
    return new Button({ ...props, variant: 'danger' });
  }

  static success(props: Omit<ButtonProps, 'variant'>): Button {
    return new Button({ ...props, variant: 'success' });
  }
}