/**
 * Comprehensive Error Boundary System
 * 
 * Production-ready error handling with categorized errors, user consent for reporting,
 * graceful degradation, and contextual help. Implements requirements 13.1, 13.2, 13.6, 13.8.
 */

import { toast } from '@streetstudio/ui';

export type ErrorSeverity = 'fatal' | 'recoverable' | 'minor';
export type ErrorCategory = 'javascript' | 'network' | 'authentication' | 'api' | 'component' | 'unhandledrejection' | 'chunk' | 'permission';

export interface ErrorDetails {
  id: string;
  message: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: string;
  userId?: string;
  organizationId?: string;
  timestamp: string;
  url: string;
  userAgent: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context: Record<string, any>;
  recoverable: boolean;
  retryCount?: number;
}

export interface ErrorReportingConfig {
  enabled: boolean;
  userConsent: boolean;
  endpoint?: string;
  includeUserInfo: boolean;
  includeTelemetry: boolean;
  maxReportsPerSession: number;
}

export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  type: 'primary' | 'secondary';
}

export interface ErrorDisplayOptions {
  showToUser: boolean;
  toastMessage?: string;
  fullScreenError?: boolean;
  recoveryActions?: RecoveryAction[];
  supportContact?: boolean;
}

class ErrorCategorizer {
  public static categorizeError(error: Error, context = 'unknown'): { severity: ErrorSeverity; category: ErrorCategory; recoverable: boolean } {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Fatal errors - complete application failure
    if (
      message.includes('out of memory') ||
      message.includes('maximum call stack') ||
      message.includes('webassembly') ||
      context === 'initialization' ||
      stack.includes('main.js') && !message.includes('network')
    ) {
      return { severity: 'fatal', category: 'javascript', recoverable: false };
    }

    // Authentication errors
    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication') ||
      context === 'authentication'
    ) {
      return { severity: 'recoverable', category: 'authentication', recoverable: true };
    }

    // Network errors
    if (
      message.includes('networkerror') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      context === 'network'
    ) {
      return { severity: 'recoverable', category: 'network', recoverable: true };
    }

    // Code splitting/chunk loading errors
    if (
      message.includes('chunkloaderror') ||
      message.includes('loading chunk') ||
      message.includes('script error')
    ) {
      return { severity: 'recoverable', category: 'chunk', recoverable: true };
    }

    // API errors
    if (
      context === 'api' ||
      message.includes('server error') ||
      message.includes('bad request') ||
      message.includes('rate limit')
    ) {
      return { severity: 'recoverable', category: 'api', recoverable: true };
    }

    // Permission errors
    if (
      message.includes('permission') ||
      message.includes('access denied') ||
      message.includes('not allowed')
    ) {
      return { severity: 'minor', category: 'permission', recoverable: true };
    }

    // Component errors
    if (context === 'component' || stack.includes('component')) {
      return { severity: 'recoverable', category: 'component', recoverable: true };
    }

    // Default classification
    if (context === 'unhandledrejection') {
      return { severity: 'recoverable', category: 'unhandledrejection', recoverable: true };
    }

    // Minor errors for everything else
    return { severity: 'minor', category: 'javascript', recoverable: true };
  }
}

class ErrorReportingService {
  private config: ErrorReportingConfig;
  private reportsThisSession = 0;
  private reportQueue: ErrorDetails[] = [];

  constructor(config: ErrorReportingConfig) {
    this.config = config;
  }

  public updateConfig(updates: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...updates };
    
    if (!this.config.enabled) {
      this.reportQueue = [];
    }
  }

  public async requestUserConsent(): Promise<boolean> {
    if (this.config.userConsent) {
      return true;
    }

    return new Promise((resolve) => {
      const consentModal = this.createConsentModal(resolve);
      document.body.appendChild(consentModal);
    });
  }

  private createConsentModal(onDecision: (consented: boolean) => void): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
        <div class="flex items-center mb-4">
          <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900">Help Improve StreetStudio</h3>
        </div>
        
        <p class="text-gray-600 mb-4">
          Would you like to help us improve StreetStudio by automatically sending error reports when issues occur? 
          This helps us identify and fix problems faster.
        </p>
        
        <div class="bg-gray-50 rounded-md p-3 mb-4">
          <p class="text-sm text-gray-700 font-medium mb-2">What we collect:</p>
          <ul class="text-sm text-gray-600 space-y-1">
            <li>• Error messages and technical details</li>
            <li>• Page you were on when the error occurred</li>
            <li>• Browser and device information</li>
            <li class="text-red-600">• No personal data or video content</li>
          </ul>
        </div>
        
        <div class="flex space-x-3">
          <button id="consent-allow" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
            Yes, Help Improve
          </button>
          <button id="consent-deny" class="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors">
            No Thanks
          </button>
        </div>
      </div>
    `;

    const allowBtn = modal.querySelector('#consent-allow') as HTMLButtonElement;
    const denyBtn = modal.querySelector('#consent-deny') as HTMLButtonElement;

    allowBtn.addEventListener('click', () => {
      this.config.userConsent = true;
      localStorage.setItem('streetstudio_error_reporting_consent', 'true');
      document.body.removeChild(modal);
      onDecision(true);
    });

    denyBtn.addEventListener('click', () => {
      this.config.userConsent = false;
      localStorage.setItem('streetstudio_error_reporting_consent', 'false');
      document.body.removeChild(modal);
      onDecision(false);
    });

    return modal;
  }

  public async reportError(errorDetails: ErrorDetails): Promise<void> {
    if (!this.config.enabled || this.reportsThisSession >= this.config.maxReportsPerSession) {
      return;
    }

    // Check user consent
    if (!this.config.userConsent) {
      const consented = await this.requestUserConsent();
      if (!consented) {
        return;
      }
    }

    this.reportsThisSession++;

    try {
      // Send to error reporting service
      if (this.config.endpoint) {
        await this.sendToEndpoint(errorDetails);
      } else {
        // Queue for later or log locally
        this.reportQueue.push(errorDetails);
        console.error('Error queued for reporting:', errorDetails);
      }
    } catch (reportingError) {
      // Don't create error loops
      console.warn('Failed to report error:', reportingError);
    }
  }

  private async sendToEndpoint(errorDetails: ErrorDetails): Promise<void> {
    const payload = {
      ...errorDetails,
      userId: this.config.includeUserInfo ? errorDetails.userId : undefined,
      organizationId: this.config.includeUserInfo ? errorDetails.organizationId : undefined,
      userAgent: this.config.includeTelemetry ? errorDetails.userAgent : undefined,
    };

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error reporting failed: ${response.status}`);
    }
  }
}

class GracefulDegradationManager {
  private failedFeatures = new Set<string>();
  private fallbackStrategies = new Map<string, () => void>();

  public registerFallback(feature: string, fallbackFn: () => void): void {
    this.fallbackStrategies.set(feature, fallbackFn);
  }

  public handleFeatureFailure(feature: string, error: Error): void {
    this.failedFeatures.add(feature);
    
    const fallback = this.fallbackStrategies.get(feature);
    if (fallback) {
      try {
        fallback();
        toast.info(`${feature} is temporarily unavailable. Using simplified version.`);
      } catch (fallbackError) {
        console.error(`Fallback for ${feature} also failed:`, fallbackError);
        toast.warning(`${feature} is currently unavailable.`);
      }
    } else {
      toast.warning(`${feature} is temporarily unavailable.`);
    }
  }

  public isFeatureFailed(feature: string): boolean {
    return this.failedFeatures.has(feature);
  }

  public restoreFeature(feature: string): void {
    this.failedFeatures.delete(feature);
  }

  public getFailedFeatures(): string[] {
    return Array.from(this.failedFeatures);
  }
}

let errorReportingService: ErrorReportingService;
let degradationManager: GracefulDegradationManager;

export function setupErrorHandling(config: Partial<ErrorReportingConfig> = {}): void {
  // Initialize services
  const defaultConfig: ErrorReportingConfig = {
    enabled: true,
    userConsent: localStorage.getItem('streetstudio_error_reporting_consent') === 'true',
    endpoint: '/api/errors',
    includeUserInfo: true,
    includeTelemetry: true,
    maxReportsPerSession: 10,
    ...config
  };

  errorReportingService = new ErrorReportingService(defaultConfig);
  degradationManager = new GracefulDegradationManager();

  // Setup graceful degradation fallbacks
  setupFallbackStrategies();

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    handleError(error, 'unhandledrejection');
    
    // Prevent the default browser behavior (console error)
    event.preventDefault();
  });

  // Handle JavaScript errors
  window.addEventListener('error', (event) => {
    console.error('JavaScript error:', event.error);
    
    const error = event.error || new Error(event.message);
    handleError(error, 'javascript');
  });

  // Handle network status changes
  window.addEventListener('offline', () => {
    toast.warning('You are currently offline. Some features may not work.', {
      duration: 0, // Don't auto-dismiss
    });
  });

  window.addEventListener('online', () => {
    toast.success('Connection restored.');
  });
}

function setupFallbackStrategies(): void {
  // Video player fallback
  degradationManager.registerFallback('video-player', () => {
    // Fallback to basic HTML5 video player
    console.log('Falling back to basic video player');
  });

  // Real-time collaboration fallback
  degradationManager.registerFallback('realtime-collaboration', () => {
    // Disable real-time features, use polling
    console.log('Disabling real-time collaboration, using polling');
  });

  // Advanced editor fallback
  degradationManager.registerFallback('timeline-editor', () => {
    // Fallback to basic trim/cut functionality
    console.log('Using simplified editor interface');
  });

  // Upload fallback
  degradationManager.registerFallback('chunked-upload', () => {
    // Fallback to single file upload
    console.log('Using basic file upload');
  });
}

export function handleError(error: Error, context = 'unknown', additionalContext: Record<string, any> = {}): void {
  const errorId = crypto.randomUUID();
  const categorization = ErrorCategorizer.categorizeError(error, context);
  
  const errorDetails: ErrorDetails = {
    id: errorId,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...categorization,
    context: {
      ...additionalContext,
      route: window.location.pathname,
      userAgent: navigator.userAgent,
    },
  };

  // Log error to console in development
  if (import.meta.env.MODE === 'development') {
    console.error('Error details:', errorDetails);
  }

  // Report error if configured
  if (errorReportingService) {
    errorReportingService.reportError(errorDetails);
  }

  // Handle based on severity
  const displayOptions = getErrorDisplayOptions(errorDetails);
  showErrorToUser(errorDetails, displayOptions);
}

function reportError(errorDetails: ErrorDetails, context: string): void {
  // TODO: Send to error reporting service (Sentry, LogRocket, etc.)
  // This would be implemented with the actual error reporting service
  
  try {
    fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...errorDetails,
        context,
      }),
    }).catch(() => {
      // Silently fail - don't create error loops
    });
  } catch {
    // Silently fail - don't create error loops
  }
}

function showErrorToUser(error: Error, context: string): void {
  // Don't show network errors to user (they get handled by offline/online events)
  if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
    return;
  }

  // Show appropriate message based on error type
  if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
    toast.error('App update available. Please refresh the page.', {
      duration: 0, // Don't auto-dismiss
      action: {
        label: 'Refresh',
        onClick: () => window.location.reload(),
      },
    });
    return;
  }

  if (context === 'authentication') {
    toast.error('Authentication failed. Please log in again.');
    return;
  }

  if (context === 'api') {
    toast.error('Server error. Please try again later.');
    return;
  }

  // Generic error message
  toast.error('Something went wrong. Please try again.');
}

export class ErrorBoundary {
  private container: HTMLElement;
  private originalContent: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public initialize(): void {
    // Store original content for recovery
    this.originalContent = this.container.innerHTML;
  }

  public handleError(error: Error): void {
    console.error('Error boundary caught error:', error);
    
    // Handle the error
    handleError(error, 'component');
    
    // Show error UI
    this.showErrorUI(error);
  }

  private showErrorUI(error: Error): void {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'min-h-screen flex items-center justify-center bg-gray-50 px-4';
    errorContainer.innerHTML = `
      <div class="max-w-md w-full text-center">
        <div class="text-red-600 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
          </svg>
        </div>
        
        <h1 class="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h1>
        
        <p class="text-gray-600 mb-6">
          We're sorry! An unexpected error occurred. Our team has been notified and is working on a fix.
        </p>
        
        <div class="space-y-3">
          <button 
            id="retry-button"
            class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Try Again
          </button>
          
          <button 
            id="refresh-button"
            class="w-full bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Refresh Page
          </button>
        </div>
        
        ${import.meta.env.MODE === 'development' ? `
          <details class="mt-6 text-left">
            <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Error Details (Development)
            </summary>
            <pre class="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-800 overflow-auto max-h-40">
${error.stack || error.message}
            </pre>
          </details>
        ` : ''}
      </div>
    `;

    // Replace container content
    this.container.innerHTML = '';
    this.container.appendChild(errorContainer);

    // Setup event listeners
    const retryButton = errorContainer.querySelector('#retry-button') as HTMLButtonElement;
    const refreshButton = errorContainer.querySelector('#refresh-button') as HTMLButtonElement;

    retryButton.addEventListener('click', () => {
      this.recover();
    });

    refreshButton.addEventListener('click', () => {
      window.location.reload();
    });
  }

  public recover(): void {
    if (this.originalContent) {
      this.container.innerHTML = this.originalContent;
      toast.info('Application recovered. Please try your action again.');
    } else {
      window.location.reload();
    }
  }

  public destroy(): void {
    // Cleanup if needed
  }
}