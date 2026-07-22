/**
 * Client-Side Form Validation
 * 
 * Comprehensive form validation with clear error messages and prevention
 * of invalid form submissions. Implements Requirement 13.9.
 */

export interface ValidationRule<T = any> {
  validate: (value: T) => boolean | string;
  message?: string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule[] | ValidationRule;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  firstError?: string;
}

export class FormValidator {
  private schema: ValidationSchema;
  
  constructor(schema: ValidationSchema) {
    this.schema = schema;
  }

  /**
   * Validate form data against schema
   */
  public validate(data: Record<string, any>): ValidationResult {
    const errors: Record<string, string[]> = {};
    let firstError: string | undefined;

    for (const [field, rules] of Object.entries(this.schema)) {
      const fieldValue = data[field];
      const fieldRules = Array.isArray(rules) ? rules : [rules];
      const fieldErrors: string[] = [];

      for (const rule of fieldRules) {
        const result = rule.validate(fieldValue);
        
        if (result !== true) {
          const errorMessage = typeof result === 'string' 
            ? result 
            : rule.message || `Invalid ${field}`;
          
          fieldErrors.push(errorMessage);
          
          if (!firstError) {
            firstError = errorMessage;
          }
        }
      }

      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      firstError,
    };
  }

  /**
   * Validate a single field
   */
  public validateField(field: string, value: any): ValidationResult {
    const rules = this.schema[field];
    if (!rules) {
      return { isValid: true, errors: {} };
    }

    const fieldRules = Array.isArray(rules) ? rules : [rules];
    const fieldErrors: string[] = [];

    for (const rule of fieldRules) {
      const result = rule.validate(value);
      
      if (result !== true) {
        const errorMessage = typeof result === 'string' 
          ? result 
          : rule.message || `Invalid ${field}`;
        
        fieldErrors.push(errorMessage);
      }
    }

    return {
      isValid: fieldErrors.length === 0,
      errors: fieldErrors.length > 0 ? { [field]: fieldErrors } : {},
      firstError: fieldErrors[0],
    };
  }
}

// Common validation rules
export const ValidationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    validate: (value: any) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    },
    message,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true; // Let required rule handle empty values
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true; // Let required rule handle empty values
      return value.length >= min;
    },
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true;
      return value.length <= max;
    },
    message: message || `Must be no more than ${max} characters`,
  }),

  pattern: (regex: RegExp, message = 'Invalid format'): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true;
      return regex.test(value);
    },
    message,
  }),

  numeric: (message = 'Must be a number'): ValidationRule => ({
    validate: (value: any) => {
      if (value === null || value === undefined || value === '') return true;
      return !isNaN(Number(value));
    },
    message,
  }),

  min: (minimum: number, message?: string): ValidationRule => ({
    validate: (value: number) => {
      if (value === null || value === undefined) return true;
      return Number(value) >= minimum;
    },
    message: message || `Must be at least ${minimum}`,
  }),

  max: (maximum: number, message?: string): ValidationRule => ({
    validate: (value: number) => {
      if (value === null || value === undefined) return true;
      return Number(value) <= maximum;
    },
    message: message || `Must be no more than ${maximum}`,
  }),

  matches: (otherField: string, message = 'Fields do not match'): ValidationRule => ({
    validate: function(this: any, value: any) {
      // Note: 'this' should be bound to the form data when validating
      if (!value || !this || !this[otherField]) return true;
      return value === this[otherField];
    },
    message,
  }),

  url: (message = 'Please enter a valid URL'): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message,
  }),

  fileSize: (maxSizeInBytes: number, message?: string): ValidationRule => ({
    validate: (file: File) => {
      if (!file) return true;
      return file.size <= maxSizeInBytes;
    },
    message: message || `File size must be less than ${formatFileSize(maxSizeInBytes)}`,
  }),

  fileType: (allowedTypes: string[], message?: string): ValidationRule => ({
    validate: (file: File) => {
      if (!file) return true;
      return allowedTypes.some(type => {
        if (type.includes('/')) {
          return file.type === type;
        } else {
          return file.type.startsWith(`${type}/`);
        }
      });
    },
    message: message || `File must be one of: ${allowedTypes.join(', ')}`,
  }),

  custom: (validator: (value: any) => boolean | string, message?: string): ValidationRule => ({
    validate: validator,
    message,
  }),
};

// Pre-defined validation schemas for common forms
export const ValidationSchemas = {
  // Authentication forms
  login: {
    email: [
      ValidationRules.required('Email is required'),
      ValidationRules.email(),
    ],
    password: [
      ValidationRules.required('Password is required'),
    ],
  },

  register: {
    email: [
      ValidationRules.required('Email is required'),
      ValidationRules.email(),
    ],
    password: [
      ValidationRules.required('Password is required'),
      ValidationRules.minLength(8, 'Password must be at least 8 characters'),
      ValidationRules.pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and number'
      ),
    ],
    confirmPassword: [
      ValidationRules.required('Please confirm your password'),
      ValidationRules.matches('password', 'Passwords do not match'),
    ],
    displayName: [
      ValidationRules.required('Display name is required'),
      ValidationRules.minLength(2),
      ValidationRules.maxLength(50),
    ],
  },

  // Project creation
  project: {
    name: [
      ValidationRules.required('Project name is required'),
      ValidationRules.minLength(1),
      ValidationRules.maxLength(100),
      ValidationRules.pattern(
        /^[a-zA-Z0-9\s\-_.]+$/,
        'Name can only contain letters, numbers, spaces, hyphens, underscores, and periods'
      ),
    ],
    description: [
      ValidationRules.maxLength(2000, 'Description is too long'),
    ],
  },

  // Video upload
  videoUpload: {
    title: [
      ValidationRules.required('Title is required'),
      ValidationRules.minLength(1),
      ValidationRules.maxLength(255),
      ValidationRules.pattern(
        /^[^<>{}]+$/,
        'Title cannot contain < > { } characters'
      ),
    ],
    description: [
      ValidationRules.maxLength(2000),
      ValidationRules.pattern(
        /^[^<>{}]*$/,
        'Description cannot contain < > { } characters'
      ),
    ],
    file: [
      ValidationRules.required('Please select a video file'),
      ValidationRules.fileType(['video'], 'File must be a video'),
      ValidationRules.fileSize(2 * 1024 * 1024 * 1024, 'Video file must be less than 2GB'),
    ],
  },

  // Comment form
  comment: {
    body: [
      ValidationRules.required('Comment cannot be empty'),
      ValidationRules.minLength(1),
      ValidationRules.maxLength(1000, 'Comment is too long'),
    ],
  },

  // Profile settings
  profile: {
    displayName: [
      ValidationRules.required('Display name is required'),
      ValidationRules.minLength(2),
      ValidationRules.maxLength(50),
    ],
    bio: [
      ValidationRules.maxLength(500, 'Bio is too long'),
    ],
    email: [
      ValidationRules.required('Email is required'),
      ValidationRules.email(),
    ],
  },
};

/**
 * Enhanced form element that includes validation
 */
export class ValidatedForm {
  private element: HTMLFormElement;
  private validator: FormValidator;
  private realTimeValidation = true;
  private preventInvalidSubmission = true;

  constructor(element: HTMLFormElement, schema: ValidationSchema, options: {
    realTimeValidation?: boolean;
    preventInvalidSubmission?: boolean;
  } = {}) {
    this.element = element;
    this.validator = new FormValidator(schema);
    this.realTimeValidation = options.realTimeValidation ?? true;
    this.preventInvalidSubmission = options.preventInvalidSubmission ?? true;

    this.setupValidation();
  }

  private setupValidation(): void {
    // Prevent default form submission and add validation
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      
      const formData = this.getFormData();
      const result = this.validator.validate(formData);
      
      if (!result.isValid && this.preventInvalidSubmission) {
        this.showValidationErrors(result.errors);
        
        // Focus first invalid field
        const firstInvalidField = Object.keys(result.errors)[0];
        if (firstInvalidField) {
          const field = this.element.querySelector(`[name="${firstInvalidField}"]`) as HTMLElement;
          field?.focus();
        }
        
        return;
      }

      // Clear any existing errors
      this.clearValidationErrors();
      
      // Dispatch custom event with validated data
      this.element.dispatchEvent(new CustomEvent('validatedSubmit', {
        detail: { data: formData, validation: result }
      }));
    });

    // Real-time validation on field changes
    if (this.realTimeValidation) {
      this.element.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.name) {
          this.validateField(target.name, target.value);
        }
      });

      this.element.addEventListener('blur', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.name) {
          this.validateField(target.name, target.value);
        }
      });
    }
  }

  private validateField(fieldName: string, value: any): void {
    const result = this.validator.validateField(fieldName, value);
    
    if (!result.isValid) {
      this.showFieldError(fieldName, result.firstError!);
    } else {
      this.clearFieldError(fieldName);
    }
  }

  private showFieldError(fieldName: string, message: string): void {
    const field = this.element.querySelector(`[name="${fieldName}"]`) as HTMLElement;
    if (!field) return;

    // Remove existing error
    this.clearFieldError(fieldName);

    // Add error class
    field.classList.add('validation-error');
    field.setAttribute('aria-invalid', 'true');

    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'validation-error-message';
    errorElement.textContent = message;
    errorElement.setAttribute('role', 'alert');
    errorElement.id = `${fieldName}-error`;
    
    field.setAttribute('aria-describedby', errorElement.id);

    // Insert error message after the field
    field.parentNode?.insertBefore(errorElement, field.nextSibling);
  }

  private clearFieldError(fieldName: string): void {
    const field = this.element.querySelector(`[name="${fieldName}"]`) as HTMLElement;
    if (!field) return;

    field.classList.remove('validation-error');
    field.setAttribute('aria-invalid', 'false');
    field.removeAttribute('aria-describedby');

    // Remove error message
    const errorElement = this.element.querySelector(`#${fieldName}-error`);
    errorElement?.remove();
  }

  private showValidationErrors(errors: Record<string, string[]>): void {
    for (const [fieldName, fieldErrors] of Object.entries(errors)) {
      if (fieldErrors.length > 0) {
        this.showFieldError(fieldName, fieldErrors[0]!);
      }
    }
  }

  private clearValidationErrors(): void {
    // Remove all error messages
    const errorElements = this.element.querySelectorAll('.validation-error-message');
    errorElements.forEach(el => el.remove());

    // Remove error classes
    const errorFields = this.element.querySelectorAll('.validation-error');
    errorFields.forEach(field => {
      field.classList.remove('validation-error');
      field.setAttribute('aria-invalid', 'false');
      field.removeAttribute('aria-describedby');
    });
  }

  private getFormData(): Record<string, any> {
    const formData = new FormData(this.element);
    const data: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      // Handle multiple values (checkboxes, multi-select)
      if (data[key]) {
        if (Array.isArray(data[key])) {
          data[key].push(value);
        } else {
          data[key] = [data[key], value];
        }
      } else {
        data[key] = value;
      }
    }

    // Handle file inputs
    const fileInputs = this.element.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
    fileInputs.forEach(input => {
      if (input.name) {
        data[input.name] = input.files?.[0] || null;
      }
    });

    return data;
  }

  /**
   * Manually validate the form
   */
  public validate(): ValidationResult {
    const data = this.getFormData();
    return this.validator.validate(data);
  }

  /**
   * Get form data
   */
  public getData(): Record<string, any> {
    return this.getFormData();
  }
}

// Utility functions
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// CSS for validation styling
export const ValidationCSS = `
  .validation-error {
    border-color: #ef4444 !important;
    box-shadow: 0 0 0 1px #ef4444 !important;
  }

  .validation-error-message {
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .validation-error:focus {
    outline: 2px solid #ef4444;
    outline-offset: 2px;
  }
`;