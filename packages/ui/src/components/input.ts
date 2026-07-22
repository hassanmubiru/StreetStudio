/**
 * Input Component
 * 
 * Production-ready form input component with validation, accessibility,
 * and multiple input types support.
 */

import { colors, spacing, typography, borderRadius, transitions } from '../design-system.js';
import { cn, generateId, validateEmail, validatePassword, KEYBOARD_SHORTCUTS } from '../utils.js';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps {
  type?: InputType;
  size?: InputSize;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  id?: string;
  name?: string;
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: HTMLElement;
  rightIcon?: HTMLElement;
  className?: string;
  onChange?: (value: string, event: Event) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  validator?: (value: string) => { isValid: boolean; errors: string[] };
}

const getInputStyles = (size: InputSize, hasError: boolean, disabled: boolean, readonly: boolean): string => {
  const baseStyles = [
    'block',
    'w-full',
    'border',
    'rounded-md',
    'shadow-sm',
    'placeholder-gray-400',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-0',
    'transition-colors',
    disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white',
    readonly ? 'bg-gray-50' : '',
  ].filter(Boolean).join(' ');

  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  }[size];

  const stateStyles = hasError
    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';

  return cn(baseStyles, sizeStyles, stateStyles);
};

export class Input {
  private container: HTMLDivElement;
  private label?: HTMLLabelElement;
  private inputWrapper: HTMLDivElement;
  private input: HTMLInputElement;
  private helperText?: HTMLParagraphElement;
  private errorText?: HTMLParagraphElement;
  private props: Required<Omit<InputProps, 'leftIcon' | 'rightIcon' | 'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown' | 'validator'>> & 
    Pick<InputProps, 'leftIcon' | 'rightIcon' | 'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown' | 'validator'>;
  private validationErrors: string[] = [];

  constructor(props: InputProps) {
    this.props = {
      type: 'text',
      size: 'md',
      placeholder: '',
      value: '',
      disabled: false,
      required: false,
      readonly: false,
      autoFocus: false,
      autoComplete: '',
      maxLength: undefined,
      minLength: undefined,
      pattern: '',
      id: generateId('input'),
      name: '',
      label: '',
      helperText: '',
      errorText: '',
      className: '',
      ...props,
    };

    this.container = this.createContainer();
    this.setupEventListeners();
    
    if (this.props.autoFocus) {
      setTimeout(() => this.input.focus(), 0);
    }
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'space-y-1';

    // Label
    if (this.props.label) {
      this.label = document.createElement('label');
      this.label.htmlFor = this.props.id;
      this.label.className = 'block text-sm font-medium text-gray-700';
      this.label.textContent = this.props.label;
      if (this.props.required) {
        const asterisk = document.createElement('span');
        asterisk.className = 'text-red-500 ml-1';
        asterisk.textContent = '*';
        asterisk.setAttribute('aria-label', 'required');
        this.label.appendChild(asterisk);
      }
      container.appendChild(this.label);
    }

    // Input wrapper (for icons)
    this.inputWrapper = document.createElement('div');
    this.inputWrapper.className = 'relative';

    // Left icon
    if (this.props.leftIcon) {
      const leftIconWrapper = document.createElement('div');
      leftIconWrapper.className = 'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none';
      leftIconWrapper.appendChild(this.props.leftIcon);
      this.inputWrapper.appendChild(leftIconWrapper);
    }

    // Input element
    this.input = this.createInput();
    this.inputWrapper.appendChild(this.input);

    // Right icon
    if (this.props.rightIcon) {
      const rightIconWrapper = document.createElement('div');
      rightIconWrapper.className = 'absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none';
      rightIconWrapper.appendChild(this.props.rightIcon);
      this.inputWrapper.appendChild(rightIconWrapper);
    }

    container.appendChild(this.inputWrapper);

    // Helper text
    if (this.props.helperText) {
      this.helperText = document.createElement('p');
      this.helperText.className = 'text-sm text-gray-500';
      this.helperText.textContent = this.props.helperText;
      this.helperText.id = `${this.props.id}-helper`;
      container.appendChild(this.helperText);
    }

    // Error text
    this.errorText = document.createElement('p');
    this.errorText.className = 'text-sm text-red-600 hidden';
    this.errorText.id = `${this.props.id}-error`;
    this.errorText.setAttribute('role', 'alert');
    container.appendChild(this.errorText);

    return container;
  }

  private createInput(): HTMLInputElement {
    const input = document.createElement('input');
    
    input.type = this.props.type;
    input.id = this.props.id;
    input.name = this.props.name;
    input.value = this.props.value;
    input.placeholder = this.props.placeholder;
    input.disabled = this.props.disabled;
    input.required = this.props.required;
    input.readOnly = this.props.readonly;
    input.autoComplete = this.props.autoComplete;
    
    if (this.props.maxLength !== undefined) {
      input.maxLength = this.props.maxLength;
    }
    
    if (this.props.minLength !== undefined) {
      input.minLength = this.props.minLength;
    }
    
    if (this.props.pattern) {
      input.pattern = this.props.pattern;
    }

    // ARIA attributes
    const ariaDescribedBy: string[] = [];
    if (this.props.helperText) {
      ariaDescribedBy.push(`${this.props.id}-helper`);
    }
    ariaDescribedBy.push(`${this.props.id}-error`);
    input.setAttribute('aria-describedby', ariaDescribedBy.join(' '));

    this.updateInputStyles();

    return input;
  }

  private updateInputStyles(): void {
    const hasError = this.validationErrors.length > 0 || !!this.props.errorText;
    const paddingLeft = this.props.leftIcon ? 'pl-10' : '';
    const paddingRight = this.props.rightIcon ? 'pr-10' : '';
    
    const styles = getInputStyles(
      this.props.size,
      hasError,
      this.props.disabled,
      this.props.readonly
    );
    
    this.input.className = cn(styles, paddingLeft, paddingRight, this.props.className);
    
    // Update ARIA invalid
    this.input.setAttribute('aria-invalid', hasError.toString());
  }

  private validateInput(value: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required validation
    if (this.props.required && !value.trim()) {
      errors.push(`${this.props.label || 'Field'} is required`);
    }

    // Built-in type validation
    if (value) {
      switch (this.props.type) {
        case 'email':
          if (!validateEmail(value)) {
            errors.push('Please enter a valid email address');
          }
          break;
        case 'password':
          if (this.props.validator) {
            // Use custom validator if provided
            break;
          }
          const passwordValidation = validatePassword(value);
          if (!passwordValidation.isValid) {
            errors.push(...passwordValidation.errors);
          }
          break;
        case 'url':
          try {
            new URL(value);
          } catch {
            errors.push('Please enter a valid URL');
          }
          break;
      }
    }

    // Length validation
    if (value && this.props.minLength !== undefined && value.length < this.props.minLength) {
      errors.push(`Must be at least ${this.props.minLength} characters`);
    }

    // Pattern validation
    if (value && this.props.pattern) {
      const regex = new RegExp(this.props.pattern);
      if (!regex.test(value)) {
        errors.push('Please match the requested format');
      }
    }

    // Custom validation
    if (this.props.validator && value) {
      const customValidation = this.props.validator(value);
      if (!customValidation.isValid) {
        errors.push(...customValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private updateErrorDisplay(): void {
    const allErrors = [...this.validationErrors];
    if (this.props.errorText) {
      allErrors.unshift(this.props.errorText);
    }

    if (allErrors.length > 0) {
      this.errorText!.textContent = allErrors[0]; // Show first error
      this.errorText!.classList.remove('hidden');
    } else {
      this.errorText!.classList.add('hidden');
    }

    this.updateInputStyles();
  }

  private setupEventListeners(): void {
    this.input.addEventListener('input', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const value = target.value;
      
      // Real-time validation
      const validation = this.validateInput(value);
      this.validationErrors = validation.errors;
      this.updateErrorDisplay();
      
      if (this.props.onChange) {
        this.props.onChange(value, event);
      }
    });

    this.input.addEventListener('focus', (event: FocusEvent) => {
      if (this.props.onFocus) {
        this.props.onFocus(event);
      }
    });

    this.input.addEventListener('blur', (event: FocusEvent) => {
      // Validate on blur for better UX
      const validation = this.validateInput(this.input.value);
      this.validationErrors = validation.errors;
      this.updateErrorDisplay();
      
      if (this.props.onBlur) {
        this.props.onBlur(event);
      }
    });

    this.input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (this.props.onKeyDown) {
        this.props.onKeyDown(event);
      }
    });
  }

  // Public API
  public updateProps(newProps: Partial<InputProps>): void {
    const oldValue = this.props.value;
    this.props = { ...this.props, ...newProps };
    
    // Update input properties
    if (this.props.value !== oldValue) {
      this.input.value = this.props.value;
    }
    
    this.input.placeholder = this.props.placeholder;
    this.input.disabled = this.props.disabled;
    this.input.required = this.props.required;
    this.input.readOnly = this.props.readonly;
    
    // Update label
    if (this.label && this.props.label) {
      this.label.textContent = this.props.label;
      if (this.props.required) {
        const asterisk = document.createElement('span');
        asterisk.className = 'text-red-500 ml-1';
        asterisk.textContent = '*';
        asterisk.setAttribute('aria-label', 'required');
        this.label.appendChild(asterisk);
      }
    }
    
    // Update helper text
    if (this.helperText && this.props.helperText) {
      this.helperText.textContent = this.props.helperText;
    }
    
    this.updateErrorDisplay();
  }

  public getValue(): string {
    return this.input.value;
  }

  public setValue(value: string): void {
    this.input.value = value;
    const validation = this.validateInput(value);
    this.validationErrors = validation.errors;
    this.updateErrorDisplay();
  }

  public focus(): void {
    this.input.focus();
  }

  public blur(): void {
    this.input.blur();
  }

  public validate(): { isValid: boolean; errors: string[] } {
    const validation = this.validateInput(this.input.value);
    this.validationErrors = validation.errors;
    this.updateErrorDisplay();
    return validation;
  }

  public clearErrors(): void {
    this.validationErrors = [];
    this.updateErrorDisplay();
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public getInputElement(): HTMLInputElement {
    return this.input;
  }

  public destroy(): void {
    this.container.remove();
  }
}