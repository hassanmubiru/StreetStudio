/**
 * Mobile Comment Composition
 * 
 * Touch-keyboard-optimized comment input for mobile devices.
 * Handles virtual keyboard appearance, auto-grow textarea,
 * and provides a streamlined commenting experience.
 * 
 * Requirements: 10.5
 */

import { MIN_TOUCH_TARGET } from '../../styles/responsive.js';

export interface MobileCommentInputOptions {
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Current video timestamp in seconds (for timestamped comments) */
  currentTimestamp?: number;
  /** Whether to include timestamp by default */
  includeTimestamp?: boolean;
  /** Maximum textarea rows before scroll (default: 5) */
  maxRows?: number;
}

export interface MobileCommentInputCallbacks {
  onSubmit?: (text: string, timestamp?: number) => Promise<void>;
  onFocus?: () => void;
  onBlur?: () => void;
  onHeightChange?: (height: number) => void;
}

export interface MobileCommentInputState {
  text: string;
  isFocused: boolean;
  isSubmitting: boolean;
  includeTimestamp: boolean;
  charCount: number;
}

/**
 * Formats seconds into "m:ss" or "h:mm:ss"
 */
function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * MobileCommentInput
 * 
 * Touch-optimized comment input that:
 * - Uses 16px font to prevent iOS zoom on focus
 * - Auto-grows textarea to fit content (up to maxRows)
 * - Repositions above virtual keyboard
 * - Provides large touch targets for submit and timestamp toggle
 * - Handles keyboard show/hide events for smooth UX
 * - Character count display
 */
export class MobileCommentInput {
  private container: HTMLElement;
  private options: Required<MobileCommentInputOptions>;
  private callbacks: MobileCommentInputCallbacks;
  private state: MobileCommentInputState;
  private isDestroyed = false;

  // DOM elements
  private textareaEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private timestampBtn!: HTMLButtonElement;
  private timestampLabel!: HTMLSpanElement;
  private charCountEl!: HTMLSpanElement;
  private wrapperEl!: HTMLElement;

  // Virtual keyboard handling
  private visualViewportHandler: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    options: MobileCommentInputOptions = {},
    callbacks: MobileCommentInputCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      placeholder: options.placeholder ?? 'Add a comment...',
      maxLength: options.maxLength ?? 1000,
      currentTimestamp: options.currentTimestamp ?? 0,
      includeTimestamp: options.includeTimestamp ?? true,
      maxRows: options.maxRows ?? 5,
    };
    this.callbacks = callbacks;
    this.state = {
      text: '',
      isFocused: false,
      isSubmitting: false,
      includeTimestamp: this.options.includeTimestamp,
      charCount: 0,
    };

    this.buildDOM();
    this.setupKeyboardListeners();
  }

  private buildDOM(): void {
    this.container.className = 'mobile-comment-input';
    this.container.setAttribute('role', 'form');
    this.container.setAttribute('aria-label', 'Comment');
    this.container.innerHTML = '';

    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'mobile-comment-wrapper';
    this.wrapperEl.style.cssText = `
      display: flex; flex-direction: column; gap: 8px;
      padding: 8px 12px; background: white; border-top: 1px solid #e5e7eb;
      position: sticky; bottom: 0; z-index: 10;
    `;

    // Top row: timestamp toggle + char count
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: space-between;';

    // Timestamp toggle
    const timestampGroup = document.createElement('div');
    timestampGroup.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    this.timestampBtn = document.createElement('button');
    this.timestampBtn.type = 'button';
    this.timestampBtn.className = 'mobile-timestamp-toggle';
    this.timestampBtn.setAttribute('aria-pressed', String(this.state.includeTimestamp));
    this.timestampBtn.setAttribute('aria-label', 'Include timestamp');
    this.timestampBtn.style.cssText = `
      min-width: ${MIN_TOUCH_TARGET}px; min-height: 32px;
      background: ${this.state.includeTimestamp ? '#dbeafe' : '#f3f4f6'};
      border: 1px solid ${this.state.includeTimestamp ? '#3b82f6' : '#d1d5db'};
      border-radius: 16px; padding: 4px 10px; font-size: 0.75rem;
      color: ${this.state.includeTimestamp ? '#1d4ed8' : '#6b7280'};
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      touch-action: manipulation; display: flex; align-items: center; gap: 4px;
    `;
    this.timestampBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>`;
    this.timestampLabel = document.createElement('span');
    this.timestampLabel.textContent = formatTimestamp(this.options.currentTimestamp);
    this.timestampBtn.appendChild(this.timestampLabel);
    this.timestampBtn.addEventListener('click', () => this.toggleTimestamp());
    timestampGroup.appendChild(this.timestampBtn);
    topRow.appendChild(timestampGroup);

    // Character count
    this.charCountEl = document.createElement('span');
    this.charCountEl.className = 'mobile-char-count';
    this.charCountEl.style.cssText = 'font-size: 0.75rem; color: #9ca3af;';
    this.charCountEl.textContent = `0/${this.options.maxLength}`;
    this.charCountEl.setAttribute('aria-live', 'polite');
    topRow.appendChild(this.charCountEl);
    this.wrapperEl.appendChild(topRow);

    // Input row: textarea + submit
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display: flex; align-items: flex-end; gap: 8px;';

    this.textareaEl = document.createElement('textarea');
    this.textareaEl.className = 'mobile-comment-textarea';
    this.textareaEl.placeholder = this.options.placeholder;
    this.textareaEl.maxLength = this.options.maxLength;
    this.textareaEl.rows = 1;
    this.textareaEl.setAttribute('aria-label', 'Comment text');
    this.textareaEl.setAttribute('enterkeyhint', 'send');
    // 16px font prevents iOS auto-zoom on focus
    this.textareaEl.style.cssText = `
      flex: 1; min-height: ${MIN_TOUCH_TARGET}px; max-height: ${this.options.maxRows * 24}px;
      border: 1px solid #d1d5db; border-radius: 20px; padding: 10px 16px;
      font-size: 16px; line-height: 1.5; resize: none; outline: none;
      overflow-y: auto; -webkit-appearance: none; appearance: none;
      transition: border-color 0.2s;
    `;
    this.textareaEl.addEventListener('input', () => this.handleInput());
    this.textareaEl.addEventListener('focus', () => this.handleFocus());
    this.textareaEl.addEventListener('blur', () => this.handleBlur());
    this.textareaEl.addEventListener('keydown', (e) => this.handleKeydown(e));
    inputRow.appendChild(this.textareaEl);

    // Submit button
    this.submitBtn = document.createElement('button');
    this.submitBtn.type = 'button';
    this.submitBtn.className = 'mobile-comment-submit';
    this.submitBtn.setAttribute('aria-label', 'Send comment');
    this.submitBtn.disabled = true;
    this.submitBtn.style.cssText = `
      min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px;
      background: #3b82f6; border: none; border-radius: 50%;
      color: white; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      opacity: 0.5; transition: opacity 0.2s;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    `;
    this.submitBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    inputRow.appendChild(this.submitBtn);

    this.wrapperEl.appendChild(inputRow);
    this.container.appendChild(this.wrapperEl);
  }

  private setupKeyboardListeners(): void {
    // Use Visual Viewport API for keyboard detection
    if (window.visualViewport) {
      this.visualViewportHandler = () => {
        if (this.state.isFocused && window.visualViewport) {
          const offset = window.innerHeight - window.visualViewport.height;
          if (offset > 100) {
            // Keyboard is visible - adjust position
            this.wrapperEl.style.paddingBottom = `${offset}px`;
          } else {
            this.wrapperEl.style.paddingBottom = '';
          }
          this.callbacks.onHeightChange?.(offset);
        }
      };
      window.visualViewport.addEventListener('resize', this.visualViewportHandler);
    }
  }
