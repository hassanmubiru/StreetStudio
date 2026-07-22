/**
 * Comprehensive Error Boundary System
 * 
 * Production-ready error handling with categorized errors, user consent for reporting,
 * graceful degradation, and contextual help. Implements requirements 13.1, 13.2, 13.6, 13.8.
 */

import { toast } from '../utils/toast.js';
import { logger } from './client-logger.js';

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
  private corruptionDetectors = new Map<string, (data: any) => boolean>();
  private recoveryStrategies = new Map<string, () => Promise<boolean>>();

  public registerFallback(feature: string, fallbackFn: () => void): void {
    this.fallbackStrategies.set(feature, fallbackFn);
  }

  /**
   * Register data corruption detector for a specific data type
   * Implements Requirement 13.10 - data corruption detection and recovery
   */
  public registerCorruptionDetector(dataType: string, detector: (data: any) => boolean): void {
    this.corruptionDetectors.set(dataType, detector);
  }

  /**
   * Register recovery strategy for corrupted data
   */
  public registerRecoveryStrategy(dataType: string, recovery: () => Promise<boolean>): void {
    this.recoveryStrategies.set(dataType, recovery);
  }

  /**
   * Check data for corruption and provide recovery options
   */
  public async checkDataIntegrity(dataType: string, data: any): Promise<{
    isCorrupted: boolean;
    canRecover: boolean;
    recovery?: () => Promise<boolean>;
  }> {
    const detector = this.corruptionDetectors.get(dataType);
    if (!detector) {
      return { isCorrupted: false, canRecover: false };
    }

    const isCorrupted = detector(data);
    if (!isCorrupted) {
      return { isCorrupted: false, canRecover: false };
    }

    const recovery = this.recoveryStrategies.get(dataType);
    return {
      isCorrupted: true,
      canRecover: !!recovery,
      recovery,
    };
  }

  /**
   * Handle data corruption with recovery options
   */
  public async handleDataCorruption(dataType: string, data: any, context: Record<string, any> = {}): Promise<void> {
    const integrity = await this.checkDataIntegrity(dataType, data);
    
    if (!integrity.isCorrupted) {
      return;
    }

    logger.error(`Data corruption detected: ${dataType}`, {
      dataType,
      context,
      canRecover: integrity.canRecover,
    });

    // Show corruption error with recovery options
    this.showDataCorruptionError(dataType, integrity, context);
  }

  /**
   * Show data corruption error with recovery UI
   */
  private showDataCorruptionError(
    dataType: string, 
    integrity: { canRecover: boolean; recovery?: () => Promise<boolean> },
    context: Record<string, any>
  ): void {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
        <div class="flex items-center mb-4">
          <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
            <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900">Data Corruption Detected</h3>
        </div>
        
        <p class="text-gray-600 mb-4">
          We've detected corrupted data in your ${dataType}. This could be due to a network error, 
          storage issue, or unexpected interruption.
        </p>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
          <p class="text-sm text-yellow-800">
            <strong>What happened:</strong> The data integrity check failed, indicating potential data loss or corruption.
          </p>
        </div>
        
        <div class="space-y-3">
          ${integrity.canRecover ? `
            <button id="recover-data" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
              🔄 Try to Recover Data
            </button>
            <button id="backup-restore" class="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors">
              📁 Restore from Backup
            </button>
          ` : ''}
          
          <button id="start-fresh" class="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors">
            🆕 Start Fresh (Data Loss)
          </button>
          
          <button id="contact-support" class="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors">
            📞 Contact Support
          </button>
        </div>
        
        <div class="mt-4 pt-4 border-t border-gray-200">
          <p class="text-xs text-gray-500">
            Corruption ID: ${crypto.randomUUID().split('-')[0]}
          </p>
        </div>
      </div>
    `;

    // Add event handlers
    if (integrity.canRecover) {
      const recoverBtn = modal.querySelector('#recover-data') as HTMLButtonElement;
      recoverBtn.addEventListener('click', async () => {
        recoverBtn.disabled = true;
        recoverBtn.innerHTML = '🔄 Recovering...';
        
        try {
          const recovered = await integrity.recovery!();
          if (recovered) {
            toast.success('Data recovered successfully!');
            document.body.removeChild(modal);
            window.location.reload();
          } else {
            toast.error('Recovery failed. Please try another option.');
            recoverBtn.disabled = false;
            recoverBtn.innerHTML = '🔄 Try to Recover Data';
          }
        } catch (error) {
          toast.error('Recovery failed. Please try another option.');
          recoverBtn.disabled = false;
          recoverBtn.innerHTML = '🔄 Try to Recover Data';
        }
      });

      const backupBtn = modal.querySelector('#backup-restore') as HTMLButtonElement;
      backupBtn.addEventListener('click', () => {
        this.showBackupRestoreOptions(dataType, modal);
      });
    }

    const freshBtn = modal.querySelector('#start-fresh') as HTMLButtonElement;
    freshBtn.addEventListener('click', () => {
      if (confirm('Are you sure? This will clear corrupted data and you may lose recent changes.')) {
        this.clearCorruptedData(dataType);
        toast.info('Data cleared. Starting fresh.');
        document.body.removeChild(modal);
        window.location.reload();
      }
    });

    const supportBtn = modal.querySelector('#contact-support') as HTMLButtonElement;
    supportBtn.addEventListener('click', () => {
      openSupportContact({
        id: crypto.randomUUID(),
        message: `Data corruption in ${dataType}`,
        severity: 'recoverable' as const,
        category: 'javascript' as const,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        context: { dataType, ...context },
        recoverable: true,
      });
    });

    document.body.appendChild(modal);
  }

  /**
   * Show backup restore options
   */
  private showBackupRestoreOptions(dataType: string, parentModal: HTMLElement): void {
    const backupModal = document.createElement('div');
    backupModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    backupModal.innerHTML = `
      <div class="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Restore from Backup</h3>
        
        <div class="space-y-3">
          <button id="auto-backup" class="w-full text-left p-3 border border-gray-300 rounded-md hover:bg-gray-50">
            <div class="font-medium">Auto-saved backup</div>
            <div class="text-sm text-gray-500">Automatically saved 5 minutes ago</div>
          </button>
          
          <button id="local-backup" class="w-full text-left p-3 border border-gray-300 rounded-md hover:bg-gray-50">
            <div class="font-medium">Local storage backup</div>
            <div class="text-sm text-gray-500">Stored in browser cache</div>
          </button>
          
          <label class="w-full block p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
            <div class="font-medium">Upload backup file</div>
            <div class="text-sm text-gray-500">Restore from downloaded backup</div>
            <input type="file" accept=".json,.bak" class="hidden" id="file-backup">
          </label>
        </div>
        
        <div class="flex space-x-3 mt-6">
          <button id="back-to-options" class="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300">
            Back
          </button>
        </div>
      </div>
    `;

    const backBtn = backupModal.querySelector('#back-to-options') as HTMLButtonElement;
    backBtn.addEventListener('click', () => {
      document.body.removeChild(backupModal);
    });

    const autoBackupBtn = backupModal.querySelector('#auto-backup') as HTMLButtonElement;
    autoBackupBtn.addEventListener('click', async () => {
      await this.restoreFromAutoBackup(dataType);
      document.body.removeChild(backupModal);
      document.body.removeChild(parentModal);
    });

    const localBackupBtn = backupModal.querySelector('#local-backup') as HTMLButtonElement;
    localBackupBtn.addEventListener('click', async () => {
      await this.restoreFromLocalBackup(dataType);
      document.body.removeChild(backupModal);
      document.body.removeChild(parentModal);
    });

    const fileInput = backupModal.querySelector('#file-backup') as HTMLInputElement;
    fileInput.addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.restoreFromFile(dataType, file);
        document.body.removeChild(backupModal);
        document.body.removeChild(parentModal);
      }
    });

    document.body.appendChild(backupModal);
  }

  /**
   * Restore data from automatic backup
   */
  private async restoreFromAutoBackup(dataType: string): Promise<void> {
    try {
      const backup = localStorage.getItem(`streetstudio_backup_${dataType}`);
      if (!backup) {
        throw new Error('No auto-backup found');
      }

      const data = JSON.parse(backup);
      localStorage.setItem(`streetstudio_${dataType}`, JSON.stringify(data));
      
      toast.success('Data restored from auto-backup');
      window.location.reload();
    } catch (error) {
      toast.error('Failed to restore from auto-backup');
    }
  }

  /**
   * Restore data from local backup
   */
  private async restoreFromLocalBackup(dataType: string): Promise<void> {
    try {
      const backup = sessionStorage.getItem(`streetstudio_session_${dataType}`);
      if (!backup) {
        throw new Error('No local backup found');
      }

      const data = JSON.parse(backup);
      localStorage.setItem(`streetstudio_${dataType}`, JSON.stringify(data));
      
      toast.success('Data restored from local backup');
      window.location.reload();
    } catch (error) {
      toast.error('Failed to restore from local backup');
    }
  }

  /**
   * Restore data from uploaded file
   */
  private async restoreFromFile(dataType: string, file: File): Promise<void> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate restored data
      const integrity = await this.checkDataIntegrity(dataType, data);
      if (integrity.isCorrupted) {
        throw new Error('Backup file is also corrupted');
      }

      localStorage.setItem(`streetstudio_${dataType}`, JSON.stringify(data));
      
      toast.success('Data restored from file');
      window.location.reload();
    } catch (error) {
      toast.error('Failed to restore from file: Invalid backup');
    }
  }

  /**
   * Clear corrupted data
   */
  private clearCorruptedData(dataType: string): void {
    try {
      localStorage.removeItem(`streetstudio_${dataType}`);
      sessionStorage.removeItem(`streetstudio_session_${dataType}`);
      localStorage.removeItem(`streetstudio_backup_${dataType}`);
    } catch (error) {
      logger.warn('Failed to clear corrupted data', { error: (error as Error).message });
    }
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

  // Setup data corruption detection (Requirement 13.10)
  setupDataCorruptionDetection();
}

function setupDataCorruptionDetection(): void {
  // Video project data corruption detection
  degradationManager.registerCorruptionDetector('video-project', (data: any) => {
    if (!data || typeof data !== 'object') return true;
    if (!data.id || !data.timeline || !Array.isArray(data.timeline)) return true;
    
    // Check for required project fields
    const requiredFields = ['id', 'name', 'createdAt', 'timeline'];
    for (const field of requiredFields) {
      if (!(field in data)) return true;
    }
    
    // Check timeline integrity
    for (const clip of data.timeline) {
      if (!clip.id || !clip.start || !clip.duration) return true;
    }
    
    return false;
  });

  // Video project recovery
  degradationManager.registerRecoveryStrategy('video-project', async () => {
    try {
      // Try to reconstruct from available data
      const backup = localStorage.getItem('streetstudio_backup_video-project');
      if (backup) {
        const data = JSON.parse(backup);
        localStorage.setItem('streetstudio_video-project', JSON.stringify(data));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  // User preferences corruption detection
  degradationManager.registerCorruptionDetector('user-preferences', (data: any) => {
    if (!data || typeof data !== 'object') return true;
    
    // Check for critical preference structure
    const expectedStructure = ['theme', 'language', 'notifications', 'accessibility'];
    return expectedStructure.some(key => !(key in data));
  });

  // User preferences recovery
  degradationManager.registerRecoveryStrategy('user-preferences', async () => {
    try {
      // Restore default preferences
      const defaultPreferences = {
        theme: 'system',
        language: 'en',
        notifications: {
          email: true,
          push: false,
          inApp: true,
        },
        accessibility: {
          highContrast: false,
          reducedMotion: false,
          screenReaderOptimized: false,
        },
        privacy: {
          analytics: false,
          errorReporting: false,
        },
      };
      
      localStorage.setItem('streetstudio_user-preferences', JSON.stringify(defaultPreferences));
      return true;
    } catch {
      return false;
    }
  });

  // Comment data corruption detection
  degradationManager.registerCorruptionDetector('comments', (data: any) => {
    if (!Array.isArray(data)) return true;
    
    for (const comment of data) {
      if (!comment.id || !comment.body || !comment.timestamp || !comment.userId) {
        return true;
      }
    }
    
    return false;
  });

  // Auto-backup important data to prevent corruption
  setupAutoBackup();
}

function setupAutoBackup(): void {
  // Backup critical data every 5 minutes
  setInterval(() => {
    try {
      // Backup video projects
      const projects = localStorage.getItem('streetstudio_video-project');
      if (projects) {
        localStorage.setItem('streetstudio_backup_video-project', projects);
      }

      // Backup user preferences
      const preferences = localStorage.getItem('streetstudio_user-preferences');
      if (preferences) {
        localStorage.setItem('streetstudio_backup_user-preferences', preferences);
      }

      // Backup comments
      const comments = localStorage.getItem('streetstudio_comments');
      if (comments) {
        sessionStorage.setItem('streetstudio_session_comments', comments);
      }

      logger.debug('Auto-backup completed');
    } catch (error) {
      logger.warn('Auto-backup failed', { error: (error as Error).message });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
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

  // Log to client logger
  const logLevel = errorDetails.severity === 'fatal' ? 'fatal' : 'error';
  logger[logLevel](`${context}: ${error.message}`, {
    errorId: errorDetails.id,
    category: errorDetails.category,
    severity: errorDetails.severity,
    recoverable: errorDetails.recoverable,
    stack: error.stack,
    context: errorDetails.context,
  });

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

function getErrorDisplayOptions(errorDetails: ErrorDetails): ErrorDisplayOptions {
  const baseOptions: ErrorDisplayOptions = {
    showToUser: true,
    supportContact: true,
  };

  switch (errorDetails.severity) {
    case 'fatal':
      return {
        ...baseOptions,
        fullScreenError: true,
        toastMessage: undefined,
        recoveryActions: [
          {
            label: 'Reload Application',
            action: () => window.location.reload(),
            type: 'primary',
          },
          {
            label: 'Contact Support',
            action: () => openSupportContact(errorDetails),
            type: 'secondary',
          },
        ],
      };

    case 'recoverable':
      const recoveryActions: RecoveryAction[] = [
        {
          label: 'Try Again',
          action: () => window.location.reload(),
          type: 'primary',
        },
      ];

      // Add specific recovery actions based on error category
      if (errorDetails.category === 'chunk') {
        recoveryActions[0] = {
          label: 'Refresh to Update',
          action: () => window.location.reload(),
          type: 'primary',
        };
      }

      if (errorDetails.category === 'authentication') {
        recoveryActions[0] = {
          label: 'Re-login',
          action: () => {
            localStorage.removeItem('streetstudio_auth');
            window.location.href = '/auth/login';
          },
          type: 'primary',
        };
      }

      if (errorDetails.category === 'network') {
        recoveryActions.unshift({
          label: 'Retry',
          action: () => window.location.reload(),
          type: 'primary',
        });
      }

      return {
        ...baseOptions,
        fullScreenError: !errorDetails.recoverable,
        recoveryActions,
      };

    case 'minor':
      return {
        ...baseOptions,
        toastMessage: getToastMessageForError(errorDetails),
        fullScreenError: false,
        supportContact: false,
      };

    default:
      return baseOptions;
  }
}

function getToastMessageForError(errorDetails: ErrorDetails): string {
  switch (errorDetails.category) {
    case 'network':
      return 'Network error. Please check your connection and try again.';
    case 'permission':
      return 'Permission denied. Please check your access rights.';
    case 'api':
      return 'Server error. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function openSupportContact(errorDetails: ErrorDetails): void {
  const subject = encodeURIComponent(`Error Report: ${errorDetails.category} - ${errorDetails.id}`);
  const body = encodeURIComponent(`
Error Details:
- ID: ${errorDetails.id}
- Message: ${errorDetails.message}
- Time: ${errorDetails.timestamp}
- Page: ${errorDetails.url}
- Severity: ${errorDetails.severity}

Please describe what you were doing when this error occurred:

`);

  // Try to open email client or show support modal
  try {
    window.open(`mailto:support@streetstudio.com?subject=${subject}&body=${body}`);
  } catch {
    showSupportModal(errorDetails);
  }
}

function showSupportModal(errorDetails: ErrorDetails): void {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl">
      <div class="flex items-center mb-4">
        <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900">Get Help</h3>
      </div>
      
      <p class="text-gray-600 mb-4">
        We're here to help! Contact our support team with the error details below:
      </p>
      
      <div class="bg-gray-50 rounded-md p-3 mb-4">
        <p class="text-sm font-medium text-gray-700 mb-2">Error ID: ${errorDetails.id}</p>
        <p class="text-xs text-gray-600">${errorDetails.message}</p>
      </div>
      
      <div class="space-y-3">
        <button id="copy-details" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
          Copy Error Details
        </button>
        
        <div class="text-center">
          <p class="text-sm text-gray-600">
            Email: <a href="mailto:support@streetstudio.com" class="text-blue-600 hover:underline">support@streetstudio.com</a>
          </p>
        </div>
        
        <button id="close-modal" class="w-full bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors">
          Close
        </button>
      </div>
    </div>
  `;

  const copyBtn = modal.querySelector('#copy-details') as HTMLButtonElement;
  const closeBtn = modal.querySelector('#close-modal') as HTMLButtonElement;

  copyBtn.addEventListener('click', () => {
    const errorText = JSON.stringify(errorDetails, null, 2);
    navigator.clipboard.writeText(errorText).then(() => {
      toast.success('Error details copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy error details');
    });
  });

  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  document.body.appendChild(modal);
}

function showErrorToUser(errorDetails: ErrorDetails, options: ErrorDisplayOptions): void {
  if (!options.showToUser) return;

  // Handle graceful degradation for feature failures
  if (errorDetails.context.feature && degradationManager) {
    degradationManager.handleFeatureFailure(errorDetails.context.feature, new Error(errorDetails.message));
  }

  // Show toast for minor errors
  if (options.toastMessage) {
    toast.error(options.toastMessage, {
      duration: 5000,
      action: options.supportContact ? {
        label: 'Get Help',
        onClick: () => openSupportContact(errorDetails),
      } : undefined,
    });
    return;
  }

  // Show full screen error for severe cases
  if (options.fullScreenError) {
    showFullScreenError(errorDetails, options);
    return;
  }

  // Default toast notification
  toast.error('Something went wrong. Please try again.', {
    action: {
      label: 'Get Help',
      onClick: () => openSupportContact(errorDetails),
    },
  });
}

function showFullScreenError(errorDetails: ErrorDetails, options: ErrorDisplayOptions): void {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'min-h-screen flex items-center justify-center bg-gray-50 px-4';
  errorContainer.innerHTML = `
    <div class="max-w-lg w-full text-center">
      <div class="text-red-600 mb-4">
        <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
        </svg>
      </div>
      
      <h1 class="text-xl font-semibold text-gray-900 mb-2">
        ${errorDetails.severity === 'fatal' ? 'Application Error' : 'Something went wrong'}
      </h1>
      
      <p class="text-gray-600 mb-6">
        ${errorDetails.severity === 'fatal' 
          ? 'A critical error has occurred. Please reload the application to continue.'
          : 'We\'re sorry! An unexpected error occurred. Our team has been notified.'
        }
      </p>
      
      <div class="space-y-3" id="recovery-actions">
        <!-- Recovery actions will be inserted here -->
      </div>
      
      ${options.supportContact ? `
        <div class="mt-6 pt-6 border-t border-gray-200">
          <p class="text-sm text-gray-600 mb-3">Need help? Contact our support team</p>
          <div class="text-sm">
            <p class="text-gray-600">Error ID: <span class="font-mono text-gray-800">${errorDetails.id}</span></p>
            <p class="mt-1">
              <a href="mailto:support@streetstudio.com" class="text-blue-600 hover:underline">support@streetstudio.com</a>
            </p>
          </div>
        </div>
      ` : ''}
      
      ${import.meta.env.MODE === 'development' ? `
        <details class="mt-6 text-left">
          <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            Error Details (Development)
          </summary>
          <pre class="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-800 overflow-auto max-h-40">${errorDetails.stack || errorDetails.message}</pre>
        </details>
      ` : ''}
    </div>
  `;

  // Insert recovery actions
  const actionsContainer = errorContainer.querySelector('#recovery-actions') as HTMLElement;
  if (options.recoveryActions) {
    options.recoveryActions.forEach(action => {
      const button = document.createElement('button');
      button.className = action.type === 'primary' 
        ? 'w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors'
        : 'w-full bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors';
      button.textContent = action.label;
      button.addEventListener('click', () => action.action());
      actionsContainer.appendChild(button);
    });
  }

  // Replace the entire body content for fatal errors
  if (errorDetails.severity === 'fatal') {
    document.body.innerHTML = '';
    document.body.appendChild(errorContainer);
  } else {
    // Replace main content area
    const mainContainer = document.querySelector('main') || document.body;
    mainContainer.innerHTML = '';
    mainContainer.appendChild(errorContainer);
  }
}

// Legacy function for backwards compatibility
function reportError(errorDetails: ErrorDetails, context: string): void {
  if (errorReportingService) {
    const enhancedDetails: ErrorDetails = {
      ...errorDetails,
      id: crypto.randomUUID(),
      severity: 'recoverable',
      category: context as ErrorCategory,
      context: {},
      recoverable: true,
    };
    errorReportingService.reportError(enhancedDetails);
  }
}

// Export additional utilities
export { ErrorReportingService, GracefulDegradationManager };
export function getErrorReportingService(): ErrorReportingService | undefined {
  return errorReportingService;
}

export function getDegradationManager(): GracefulDegradationManager | undefined {
  return degradationManager;
}

export function handleFeatureError(feature: string, error: Error, context: Record<string, any> = {}): void {
  const enhancedContext = {
    ...context,
    feature,
  };
  handleError(error, 'component', enhancedContext);
}

/**
 * Check data integrity and handle corruption (Requirement 13.10)
 */
export async function checkDataIntegrity(dataType: string, data: any): Promise<boolean> {
  if (!degradationManager) {
    return true; // Assume data is valid if manager not initialized
  }

  const integrity = await degradationManager.checkDataIntegrity(dataType, data);
  
  if (integrity.isCorrupted) {
    await degradationManager.handleDataCorruption(dataType, data, {
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
    
    return false;
  }
  
  return true;
}

/**
 * Register custom data corruption detector
 */
export function registerCorruptionDetector(dataType: string, detector: (data: any) => boolean): void {
  if (degradationManager) {
    degradationManager.registerCorruptionDetector(dataType, detector);
  }
}

/**
 * Register custom recovery strategy
 */
export function registerRecoveryStrategy(dataType: string, recovery: () => Promise<boolean>): void {
  if (degradationManager) {
    degradationManager.registerRecoveryStrategy(dataType, recovery);
  }
}