/**
 * Client-Side Error Logging and Retry Mechanisms
 * 
 * Implements comprehensive client-side logging with retry logic,
 * background sync, and performance monitoring for error handling.
 */

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  context: Record<string, any>;
  userId?: string;
  organizationId?: string;
  sessionId: string;
  url: string;
  userAgent: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: Error, attempt: number) => boolean;
}

export interface LoggerConfig {
  maxLogSize: number;
  maxRetentionDays: number;
  batchSize: number;
  flushInterval: number;
  enableLocalStorage: boolean;
  enableConsoleOutput: boolean;
  remoteEndpoint?: string;
  retryConfig: RetryConfig;
}

class RetryManager {
  private retryConfig: RetryConfig;

  constructor(config: RetryConfig) {
    this.retryConfig = config;
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customConfig };
    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (attempt === config.maxAttempts) {
          break;
        }

        if (config.retryCondition && !config.retryCondition(lastError, attempt)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );

        console.warn(`${context} failed (attempt ${attempt}), retrying in ${delay}ms:`, lastError.message);

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ClientLogger {
  private config: LoggerConfig;
  private sessionId: string;
  private logBuffer: LogEntry[] = [];
  private flushTimer: number | null = null;
  private retryManager: RetryManager;
  private isOnline = navigator.onLine;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      maxLogSize: 1000,
      maxRetentionDays: 7,
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      enableLocalStorage: true,
      enableConsoleOutput: true,
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        retryCondition: (error, attempt) => {
          // Retry on network errors
          return error.message.includes('fetch') || 
                 error.message.includes('network') ||
                 error.message.includes('timeout');
        },
      },
      ...config,
    };

    this.sessionId = crypto.randomUUID();
    this.retryManager = new RetryManager(this.config.retryConfig);

    this.setupNetworkListeners();
    this.setupPeriodicFlush();
    this.loadStoredLogs();
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.debug('Network connection restored');
      this.flushLogs(); // Try to send queued logs
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.debug('Network connection lost');
    });
  }

  private setupPeriodicFlush(): void {
    this.flushTimer = window.setInterval(() => {
      if (this.logBuffer.length > 0) {
        this.flushLogs();
      }
    }, this.config.flushInterval);
  }

  private loadStoredLogs(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const stored = localStorage.getItem('streetstudio_logs');
      if (stored) {
        const logs: LogEntry[] = JSON.parse(stored);
        
        // Filter out old logs
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.maxRetentionDays);
        
        const validLogs = logs.filter(log => 
          new Date(log.timestamp) > cutoffDate
        );

        this.logBuffer.push(...validLogs);
        
        // Clean up old logs from storage
        if (validLogs.length !== logs.length) {
          this.saveLogsToStorage();
        }
      }
    } catch (error) {
      console.warn('Failed to load stored logs:', error);
    }
  }

  private saveLogsToStorage(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      // Keep only the most recent logs within size limit
      const logsToStore = this.logBuffer.slice(-this.config.maxLogSize);
      localStorage.setItem('streetstudio_logs', JSON.stringify(logsToStore));
    } catch (error) {
      console.warn('Failed to save logs to storage:', error);
      // Clear storage if quota exceeded
      try {
        localStorage.removeItem('streetstudio_logs');
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  public debug(message: string, context: Record<string, any> = {}): void {
    this.log('debug', message, context);
  }

  public info(message: string, context: Record<string, any> = {}): void {
    this.log('info', message, context);
  }

  public warn(message: string, context: Record<string, any> = {}): void {
    this.log('warn', message, context);
  }

  public error(message: string, context: Record<string, any> = {}): void {
    this.log('error', message, context);
  }

  public fatal(message: string, context: Record<string, any> = {}): void {
    this.log('fatal', message, context);
    // Immediate flush for fatal errors
    this.flushLogs();
  }

  private log(level: LogEntry['level'], message: string, context: Record<string, any>): void {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    // Add user context if available
    const authData = this.getAuthContext();
    if (authData) {
      entry.userId = authData.userId;
      entry.organizationId = authData.organizationId;
    }

    // Add to buffer
    this.logBuffer.push(entry);

    // Console output if enabled
    if (this.config.enableConsoleOutput) {
      this.outputToConsole(entry);
    }

    // Manage buffer size
    if (this.logBuffer.length > this.config.maxLogSize) {
      this.logBuffer = this.logBuffer.slice(-this.config.maxLogSize);
    }

    // Save to local storage
    this.saveLogsToStorage();

    // Flush immediately for errors and fatal
    if (level === 'error' || level === 'fatal') {
      this.flushLogs();
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const contextStr = Object.keys(entry.context).length > 0 
      ? JSON.stringify(entry.context) 
      : '';

    switch (entry.level) {
      case 'debug':
        console.debug(`[${timestamp}] ${entry.message}`, contextStr);
        break;
      case 'info':
        console.info(`[${timestamp}] ${entry.message}`, contextStr);
        break;
      case 'warn':
        console.warn(`[${timestamp}] ${entry.message}`, contextStr);
        break;
      case 'error':
      case 'fatal':
        console.error(`[${timestamp}] ${entry.message}`, contextStr);
        break;
    }
  }

  private getAuthContext(): { userId?: string; organizationId?: string } | null {
    try {
      const authData = localStorage.getItem('streetstudio_auth');
      return authData ? JSON.parse(authData) : null;
    } catch {
      return null;
    }
  }

  public async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.config.remoteEndpoint) {
      return;
    }

    // Don't try to send if offline
    if (!this.isOnline) {
      this.debug('Skipping log flush - offline');
      return;
    }

    const logsToSend = this.logBuffer.slice(0, this.config.batchSize);
    
    try {
      await this.retryManager.executeWithRetry(
        async () => {
          await this.sendLogsToServer(logsToSend);
        },
        'Log flush'
      );

      // Remove successfully sent logs
      this.logBuffer = this.logBuffer.slice(logsToSend.length);
      this.saveLogsToStorage();

      this.debug(`Successfully flushed ${logsToSend.length} logs`);
    } catch (error) {
      this.debug(`Failed to flush logs after retries: ${error.message}`);
      // Keep logs in buffer for next attempt
    }
  }

  private async sendLogsToServer(logs: LogEntry[]): Promise<void> {
    const response = await fetch(this.config.remoteEndpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ logs }),
    });

    if (!response.ok) {
      throw new Error(`Log server responded with status ${response.status}`);
    }
  }

  public getLogs(level?: LogEntry['level'], limit?: number): LogEntry[] {
    let logs = [...this.logBuffer];

    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  public getErrorSummary(): { totalErrors: number; recentErrors: LogEntry[] } {
    const errorLogs = this.logBuffer.filter(log => 
      log.level === 'error' || log.level === 'fatal'
    );

    // Get errors from the last hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentErrors = errorLogs.filter(log => 
      new Date(log.timestamp) > oneHourAgo
    );

    return {
      totalErrors: errorLogs.length,
      recentErrors: recentErrors.slice(-10), // Last 10 recent errors
    };
  }

  public clearLogs(): void {
    this.logBuffer = [];
    if (this.config.enableLocalStorage) {
      try {
        localStorage.removeItem('streetstudio_logs');
      } catch (error) {
        console.warn('Failed to clear logs from storage:', error);
      }
    }
    this.info('Logs cleared');
  }

  public exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }

  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    this.flushLogs();
  }
}

// Global logger instance
let globalLogger: ClientLogger | null = null;

export function initializeClientLogger(config: Partial<LoggerConfig> = {}): ClientLogger {
  globalLogger = new ClientLogger(config);
  return globalLogger;
}

export function getLogger(): ClientLogger {
  if (!globalLogger) {
    globalLogger = new ClientLogger();
  }
  return globalLogger;
}

// Convenience functions
export const logger = {
  debug: (message: string, context?: Record<string, any>) => getLogger().debug(message, context || {}),
  info: (message: string, context?: Record<string, any>) => getLogger().info(message, context || {}),
  warn: (message: string, context?: Record<string, any>) => getLogger().warn(message, context || {}),
  error: (message: string, context?: Record<string, any>) => getLogger().error(message, context || {}),
  fatal: (message: string, context?: Record<string, any>) => getLogger().fatal(message, context || {}),
};