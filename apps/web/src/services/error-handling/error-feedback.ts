/**
 * User Feedback Collection for Error Reporting
 * 
 * Builds a user feedback form for error reports with context capture
 * (current page, browser info, error stack), consent-based submission.
 * 
 * Implements Requirement 13.3.
 */

import { logger } from '../../app/client-logger.js';
import { toast } from '../../utils/toast.js';

export interface ErrorContext {
  currentPage: string;
  browserInfo: BrowserInfo;
  errorStack?: string;
  errorMessage?: string;
  errorId?: string;
  timestamp: string;
  sessionDuration: number;
  recentActions: string[];
}

export interface BrowserInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  viewportSize: string;
  cookiesEnabled: boolean;
  onlineStatus: boolean;
  memoryUsage?: number;
}

export interface FeedbackReport {
  id: string;
  context: ErrorContext;
  userDescription: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  consentGiven: boolean;
  includeContext: boolean;
  contactEmail?: string;
  submittedAt: string;
}

export interface FeedbackFormConfig {
  endpoint?: string;
  maxDescriptionLength: number;
  categories: string[];
  collectContactEmail: boolean;
  requireConsent: boolean;
  onSubmit?: (report: FeedbackReport) => Promise<void>;
  onCancel?: () => void;
}

const DEFAULT_CONFIG: FeedbackFormConfig = {
  endpoint: '/api/feedback/errors',
  maxDescriptionLength: 2000,
  categories: [
    'Page not loading',
    'Feature not working',
    'Data not saving',
    'Video playback issue',
    'Upload problem',
    'Login/authentication issue',
    'Performance problem',
    'Other',
  ],
  collectContactEmail: true,
  requireConsent: true,
};

export class ErrorFeedbackService {
  private config: FeedbackFormConfig;
  private sessionStartTime: number;
  private recentActions: string[] = [];
  private maxRecentActions = 20;
  private activeForm: HTMLElement | null = null;

  constructor(config?: Partial<FeedbackFormConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStartTime = Date.now();
  }

  /**
   * Record a user action for context
   */
  public recordAction(action: string): void {
    this.recentActions.push(`[${new Date().toLocaleTimeString()}] ${action}`);
    if (this.recentActions.length > this.maxRecentActions) {
      this.recentActions.shift();
    }
  }

  /**
   * Capture current error context
   */
  public captureContext(error?: Error): ErrorContext {
    return {
      currentPage: window.location.href,
      browserInfo: this.captureBrowserInfo(),
      errorStack: error?.stack,
      errorMessage: error?.message,
      timestamp: new Date().toISOString(),
      sessionDuration: Math.round((Date.now() - this.sessionStartTime) / 1000),
      recentActions: [...this.recentActions],
    };
  }

  /**
   * Capture browser information
   */
  private captureBrowserInfo(): BrowserInfo {
    const info: BrowserInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      cookiesEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine,
    };

    // Memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      if (memory) {
        info.memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      }
    }

    return info;
  }

  /**
   * Show the error feedback form
   */
  public showFeedbackForm(error?: Error, errorId?: string): void {
    // Don't show multiple forms
    if (this.activeForm) {
      return;
    }

    const context = this.captureContext(error);
    if (errorId) {
      context.errorId = errorId;
    }

    const form = this.createFeedbackFormElement(context);
    document.body.appendChild(form);
    this.activeForm = form;

    // Focus the first input
    const firstInput = form.querySelector('textarea') as HTMLTextAreaElement;
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }

  /**
   * Create the feedback form DOM element
   */
  private createFeedbackFormElement(context: ErrorContext): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'error-feedback-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'feedback-title');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 16px;
    `;

    overlay.innerHTML = `
      <div class="feedback-form-container" style="
        background: white;
        border-radius: 12px;
        max-width: 520px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      ">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 32px; height: 32px; background: #EFF6FF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 id="feedback-title" style="font-size: 18px; font-weight: 600; color: #111827; margin: 0;">
            Report a Problem
          </h2>
        </div>

        <p style="color: #6B7280; font-size: 14px; margin-bottom: 20px;">
          Help us fix this issue by describing what happened. Your feedback helps improve StreetStudio.
        </p>

        ${context.errorMessage ? `
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <p style="font-size: 12px; font-weight: 500; color: #991B1B; margin: 0 0 4px;">Error detected:</p>
            <p style="font-size: 12px; color: #7F1D1D; margin: 0; font-family: monospace; word-break: break-word;">${this.escapeHtml(context.errorMessage)}</p>
          </div>
        ` : ''}

        <form id="error-feedback-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label for="feedback-category" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 4px;">
              Category
            </label>
            <select id="feedback-category" style="
              width: 100%;
              padding: 8px 12px;
              border: 1px solid #D1D5DB;
              border-radius: 6px;
              font-size: 14px;
              color: #374151;
              background: white;
            ">
              ${this.config.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
          </div>

          <div>
            <label for="feedback-description" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 4px;">
              What happened? <span style="color: #EF4444;">*</span>
            </label>
            <textarea 
              id="feedback-description"
              placeholder="Describe what you were doing and what went wrong..."
              maxlength="${this.config.maxDescriptionLength}"
              required
              style="
                width: 100%;
                min-height: 100px;
                padding: 8px 12px;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                font-size: 14px;
                color: #374151;
                resize: vertical;
                font-family: inherit;
                box-sizing: border-box;
              "
            ></textarea>
            <p style="font-size: 12px; color: #9CA3AF; margin: 4px 0 0;">
              <span id="char-count">0</span> / ${this.config.maxDescriptionLength}
            </p>
          </div>

          <div>
            <label for="feedback-severity" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 4px;">
              How severe is this issue?
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="severity" value="low"> <span style="font-size: 13px;">Minor inconvenience</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="severity" value="medium" checked> <span style="font-size: 13px;">Affects my workflow</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="severity" value="high"> <span style="font-size: 13px;">Can't use a feature</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="severity" value="critical"> <span style="font-size: 13px;">Completely blocked</span>
              </label>
            </div>
          </div>

          ${this.config.collectContactEmail ? `
            <div>
              <label for="feedback-email" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 4px;">
                Email (optional)
              </label>
              <input 
                type="email" 
                id="feedback-email"
                placeholder="your@email.com"
                style="
                  width: 100%;
                  padding: 8px 12px;
                  border: 1px solid #D1D5DB;
                  border-radius: 6px;
                  font-size: 14px;
                  color: #374151;
                  box-sizing: border-box;
                "
              />
              <p style="font-size: 12px; color: #9CA3AF; margin: 4px 0 0;">
                We'll only contact you about this issue.
              </p>
            </div>
          ` : ''}

          <div style="background: #F9FAFB; border-radius: 8px; padding: 12px;">
            <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="feedback-include-context" checked style="margin-top: 2px;" />
              <span style="font-size: 13px; color: #4B5563;">
                Include technical context (current page, browser info) to help diagnose the issue.
                <span style="color: #9CA3AF;">No personal data will be shared.</span>
              </span>
            </label>
          </div>

          ${this.config.requireConsent ? `
            <div>
              <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="feedback-consent" required style="margin-top: 2px;" />
                <span style="font-size: 13px; color: #4B5563;">
                  I consent to submitting this feedback to help improve StreetStudio. <span style="color: #EF4444;">*</span>
                </span>
              </label>
            </div>
          ` : ''}

          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button type="submit" id="feedback-submit" style="
              flex: 1;
              padding: 10px 16px;
              background: #2563EB;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
            ">
              Submit Report
            </button>
            <button type="button" id="feedback-cancel" style="
              flex: 1;
              padding: 10px 16px;
              background: #F3F4F6;
              color: #374151;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
            ">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;

    this.attachFormListeners(overlay, context);
    return overlay;
  }

  private attachFormListeners(overlay: HTMLElement, context: ErrorContext): void {
    const form = overlay.querySelector('#error-feedback-form') as HTMLFormElement;
    const cancelBtn = overlay.querySelector('#feedback-cancel') as HTMLButtonElement;
    const descriptionInput = overlay.querySelector('#feedback-description') as HTMLTextAreaElement;
    const charCount = overlay.querySelector('#char-count') as HTMLElement;

    // Character count
    descriptionInput.addEventListener('input', () => {
      charCount.textContent = String(descriptionInput.value.length);
    });

    // Cancel
    cancelBtn.addEventListener('click', () => {
      this.closeFeedbackForm(overlay);
      this.config.onCancel?.();
    });

    // Close on escape key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeFeedbackForm(overlay);
        this.config.onCancel?.();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeFeedbackForm(overlay);
        this.config.onCancel?.();
      }
    });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit(overlay, context);
    });
  }

  private async handleSubmit(overlay: HTMLElement, context: ErrorContext): Promise<void> {
    const form = overlay.querySelector('#error-feedback-form') as HTMLFormElement;
    const submitBtn = overlay.querySelector('#feedback-submit') as HTMLButtonElement;
    const descriptionInput = overlay.querySelector('#feedback-description') as HTMLTextAreaElement;
    const categoryInput = overlay.querySelector('#feedback-category') as HTMLSelectElement;
    const severityInput = form.querySelector('input[name="severity"]:checked') as HTMLInputElement;
    const includeContextInput = overlay.querySelector('#feedback-include-context') as HTMLInputElement;
    const consentInput = overlay.querySelector('#feedback-consent') as HTMLInputElement | null;
    const emailInput = overlay.querySelector('#feedback-email') as HTMLInputElement | null;

    // Validate
    if (!descriptionInput.value.trim()) {
      toast.warning('Please describe the issue you encountered.');
      return;
    }

    if (this.config.requireConsent && consentInput && !consentInput.checked) {
      toast.warning('Please provide consent to submit feedback.');
      return;
    }

    // Disable submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    const report: FeedbackReport = {
      id: crypto.randomUUID(),
      context: includeContextInput.checked ? context : {
        ...context,
        browserInfo: { ...context.browserInfo, userAgent: '' },
        errorStack: undefined,
        recentActions: [],
      },
      userDescription: descriptionInput.value.trim(),
      severity: (severityInput?.value || 'medium') as FeedbackReport['severity'],
      category: categoryInput.value,
      consentGiven: consentInput?.checked ?? true,
      includeContext: includeContextInput.checked,
      contactEmail: emailInput?.value?.trim() || undefined,
      submittedAt: new Date().toISOString(),
    };

    try {
      if (this.config.onSubmit) {
        await this.config.onSubmit(report);
      } else {
        await this.submitReport(report);
      }

      toast.success('Thank you! Your feedback has been submitted.');
      this.closeFeedbackForm(overlay);

      logger.info('Error feedback submitted', { reportId: report.id, category: report.category });
    } catch (error) {
      toast.error('Failed to submit feedback. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';

      logger.error('Failed to submit error feedback', { error: (error as Error).message });
    }
  }

  /**
   * Submit the report to the backend
   */
  private async submitReport(report: FeedbackReport): Promise<void> {
    if (!this.config.endpoint) {
      // Store locally if no endpoint
      this.storeReportLocally(report);
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      // Store locally as fallback
      this.storeReportLocally(report);
      throw new Error(`Submission failed: ${response.status}`);
    }
  }

  private storeReportLocally(report: FeedbackReport): void {
    try {
      const stored = localStorage.getItem('streetstudio_pending_feedback') || '[]';
      const reports = JSON.parse(stored) as FeedbackReport[];
      reports.push(report);
      // Keep last 10 pending reports
      const trimmed = reports.slice(-10);
      localStorage.setItem('streetstudio_pending_feedback', JSON.stringify(trimmed));
    } catch {
      logger.warn('Failed to store feedback report locally');
    }
  }

  private closeFeedbackForm(overlay: HTMLElement): void {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    this.activeForm = null;
  }

  /**
   * Get pending feedback reports (stored locally when submission failed)
   */
  public getPendingReports(): FeedbackReport[] {
    try {
      const stored = localStorage.getItem('streetstudio_pending_feedback') || '[]';
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  /**
   * Retry submitting pending reports
   */
  public async retryPendingReports(): Promise<number> {
    const pending = this.getPendingReports();
    if (pending.length === 0) return 0;

    let submitted = 0;
    const failed: FeedbackReport[] = [];

    for (const report of pending) {
      try {
        await this.submitReport(report);
        submitted++;
      } catch {
        failed.push(report);
      }
    }

    localStorage.setItem('streetstudio_pending_feedback', JSON.stringify(failed));
    return submitted;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
let feedbackService: ErrorFeedbackService | null = null;

export function initializeErrorFeedback(config?: Partial<FeedbackFormConfig>): ErrorFeedbackService {
  feedbackService = new ErrorFeedbackService(config);
  return feedbackService;
}

export function getErrorFeedbackService(): ErrorFeedbackService {
  if (!feedbackService) {
    feedbackService = new ErrorFeedbackService();
  }
  return feedbackService;
}
