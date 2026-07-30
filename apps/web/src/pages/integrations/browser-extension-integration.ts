/**
 * Browser Extension Communication Interface
 *
 * Provides message passing interface between the web app and the
 * StreetStudio recorder browser extension, extension status detection,
 * and secure authentication handoff.
 *
 * Requirements: 15.4
 */

// --- Types ---

export type Uuid = string;

export type ExtensionStatus = 'installed' | 'not_installed' | 'outdated' | 'disabled';

export type MessageType =
  | 'ping'
  | 'pong'
  | 'auth_handoff'
  | 'auth_ack'
  | 'start_recording'
  | 'stop_recording'
  | 'recording_status'
  | 'recording_complete'
  | 'settings_sync'
  | 'settings_ack'
  | 'error';

export type RecordingMode = 'screen' | 'window' | 'tab' | 'camera';

export interface ExtensionInfo {
  version: string;
  status: ExtensionStatus;
  lastDetectedAt: string;
  capabilities: string[];
}

export interface ExtensionMessage {
  type: MessageType;
  id: string;
  timestamp: string;
  payload?: unknown;
}

export interface AuthHandoffPayload {
  token: string;
  userId: Uuid;
  organizationId: Uuid;
  expiresAt: string;
}

export interface RecordingStartPayload {
  mode: RecordingMode;
  quality: 'low' | 'medium' | 'high';
  audioEnabled: boolean;
  cameraEnabled: boolean;
  projectId?: Uuid;
}

export interface RecordingStatusPayload {
  isRecording: boolean;
  duration: number;
  mode?: RecordingMode;
  isPaused: boolean;
}

export interface RecordingCompletePayload {
  videoId: Uuid;
  duration: number;
  fileSize: number;
  uploadProgress: number;
}

export interface SettingsSyncPayload {
  defaultQuality: 'low' | 'medium' | 'high';
  defaultMode: RecordingMode;
  audioEnabled: boolean;
  cameraEnabled: boolean;
  cursorHighlight: boolean;
  countdownEnabled: boolean;
  countdownSeconds: number;
}

export interface ExtensionMessageHandler {
  (message: ExtensionMessage): void;
}

export interface BrowserExtensionCallbacks {
  onExtensionDetected: (info: ExtensionInfo) => void;
  onExtensionLost: () => void;
  onRecordingStatusChange: (status: RecordingStatusPayload) => void;
  onRecordingComplete: (result: RecordingCompletePayload) => void;
  onAuthRequired: () => Promise<AuthHandoffPayload>;
  onError: (error: string) => void;
}

export interface BrowserExtensionOptions {
  extensionId?: string;
  callbacks?: Partial<BrowserExtensionCallbacks>;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
}

// --- Constants ---

export const DEFAULT_EXTENSION_ID = 'streetstudio-recorder-extension';
export const DEFAULT_PING_INTERVAL_MS = 5000;
export const DEFAULT_PING_TIMEOUT_MS = 2000;
export const MESSAGE_ORIGIN = 'streetstudio-web';
export const EXTENSION_ORIGIN = 'streetstudio-extension';
export const MIN_SUPPORTED_VERSION = '1.0.0';

// --- Utility Functions ---

/**
 * Generate a unique message ID.
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create an extension message.
 */
export function createMessage(type: MessageType, payload?: unknown): ExtensionMessage {
  return {
    type,
    id: generateMessageId(),
    timestamp: new Date().toISOString(),
    payload,
  };
}

/**
 * Compare semantic versions. Returns -1, 0, or 1.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/**
 * Check if the extension version meets minimum requirements.
 */
export function isVersionSupported(version: string): boolean {
  return compareVersions(version, MIN_SUPPORTED_VERSION) >= 0;
}

/**
 * Get extension status display info.
 */
export function getExtensionStatusInfo(status: ExtensionStatus): {
  label: string;
  color: string;
  description: string;
} {
  switch (status) {
    case 'installed':
      return { label: 'Installed', color: 'bg-green-100 text-green-800', description: 'Extension is active and ready' };
    case 'not_installed':
      return { label: 'Not Installed', color: 'bg-gray-100 text-gray-600', description: 'Install the extension to enable recording' };
    case 'outdated':
      return { label: 'Update Available', color: 'bg-yellow-100 text-yellow-800', description: 'Please update the extension' };
    case 'disabled':
      return { label: 'Disabled', color: 'bg-red-100 text-red-800', description: 'Extension is disabled in your browser' };
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-600', description: '' };
  }
}

// --- Communication Service ---

export class BrowserExtensionBridge {
  private extensionId: string;
  private callbacks: Partial<BrowserExtensionCallbacks>;
  private pingIntervalMs: number;
  private pingTimeoutMs: number;
  private extensionInfo: ExtensionInfo | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingResponses: Map<string, { resolve: (msg: ExtensionMessage) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private isListening = false;

  constructor(options: BrowserExtensionOptions = {}) {
    this.extensionId = options.extensionId ?? DEFAULT_EXTENSION_ID;
    this.callbacks = options.callbacks ?? {};
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.pingTimeoutMs = options.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS;
  }

  /**
   * Start listening for extension messages and begin health checks.
   */
  public start(): void {
    if (this.isListening) return;
    this.isListening = true;

    this.messageHandler = (event: MessageEvent) => {
      this.handleIncomingMessage(event);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler);
    }

    this.startPingInterval();
  }

  /**
   * Stop listening and clean up resources.
   */
  public stop(): void {
    this.isListening = false;

    if (this.messageHandler && typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    this.stopPingInterval();
    this.clearPendingResponses();
    this.extensionInfo = null;
  }

  /**
   * Get current extension info.
   */
  public getExtensionInfo(): ExtensionInfo | null {
    return this.extensionInfo;
  }

  /**
   * Get current extension status.
   */
  public getStatus(): ExtensionStatus {
    return this.extensionInfo?.status ?? 'not_installed';
  }

  /**
   * Check if the extension is available and ready.
   */
  public isAvailable(): boolean {
    return this.extensionInfo?.status === 'installed';
  }

  /**
   * Send authentication credentials to the extension.
   */
  public async sendAuthHandoff(payload: AuthHandoffPayload): Promise<boolean> {
    const message = createMessage('auth_handoff', payload);
    try {
      const response = await this.sendAndWait(message);
      return response.type === 'auth_ack';
    } catch {
      return false;
    }
  }

  /**
   * Request the extension to start recording.
   */
  public async startRecording(payload: RecordingStartPayload): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const message = createMessage('start_recording', payload);
    try {
      const response = await this.sendAndWait(message);
      return response.type === 'recording_status' &&
        (response.payload as RecordingStatusPayload)?.isRecording === true;
    } catch {
      return false;
    }
  }

  /**
   * Request the extension to stop recording.
   */
  public async stopRecording(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const message = createMessage('stop_recording');
    try {
      const response = await this.sendAndWait(message);
      return response.type === 'recording_status' &&
        (response.payload as RecordingStatusPayload)?.isRecording === false;
    } catch {
      return false;
    }
  }

  /**
   * Sync settings to the extension.
   */
  public async syncSettings(settings: SettingsSyncPayload): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const message = createMessage('settings_sync', settings);
    try {
      const response = await this.sendAndWait(message);
      return response.type === 'settings_ack';
    } catch {
      return false;
    }
  }

  /**
   * Manually ping the extension to check availability.
   */
  public async ping(): Promise<boolean> {
    const message = createMessage('ping');
    try {
      const response = await this.sendAndWait(message);
      return response.type === 'pong';
    } catch {
      return false;
    }
  }

  // --- Private Methods ---

  private sendMessage(message: ExtensionMessage): void {
    if (typeof window !== 'undefined') {
      window.postMessage(
        { source: MESSAGE_ORIGIN, extensionId: this.extensionId, ...message },
        '*'
      );
    }
  }

  private sendAndWait(message: ExtensionMessage): Promise<ExtensionMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(message.id);
        reject(new Error(`Message ${message.type} timed out`));
      }, this.pingTimeoutMs);

      this.pendingResponses.set(message.id, { resolve, reject, timeout });
      this.sendMessage(message);
    });
  }

  private handleIncomingMessage(event: MessageEvent): void {
    const data = event.data;
    if (!data || data.source !== EXTENSION_ORIGIN) return;
    if (data.extensionId && data.extensionId !== this.extensionId) return;

    const message: ExtensionMessage = {
      type: data.type,
      id: data.id,
      timestamp: data.timestamp ?? new Date().toISOString(),
      payload: data.payload,
    };

    // Check if this is a response to a pending message
    const replyToId = data.replyTo;
    if (replyToId && this.pendingResponses.has(replyToId)) {
      const pending = this.pendingResponses.get(replyToId)!;
      clearTimeout(pending.timeout);
      this.pendingResponses.delete(replyToId);
      pending.resolve(message);
      return;
    }

    // Handle unsolicited messages from extension
    this.handleExtensionEvent(message);
  }

  private handleExtensionEvent(message: ExtensionMessage): void {
    switch (message.type) {
      case 'pong': {
        const payload = message.payload as { version?: string; capabilities?: string[] } | undefined;
        const version = payload?.version ?? '0.0.0';
        const capabilities = payload?.capabilities ?? [];
        const status: ExtensionStatus = isVersionSupported(version) ? 'installed' : 'outdated';

        this.extensionInfo = {
          version,
          status,
          lastDetectedAt: new Date().toISOString(),
          capabilities,
        };
        this.callbacks.onExtensionDetected?.(this.extensionInfo);
        break;
      }
      case 'recording_status':
        if (message.payload) {
          this.callbacks.onRecordingStatusChange?.(message.payload as RecordingStatusPayload);
        }
        break;
      case 'recording_complete':
        if (message.payload) {
          this.callbacks.onRecordingComplete?.(message.payload as RecordingCompletePayload);
        }
        break;
      case 'error':
        this.callbacks.onError?.(String(message.payload ?? 'Unknown error'));
        break;
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.pingIntervalMs);
    // Perform an initial check immediately
    this.performHealthCheck();
  }

  private stopPingInterval(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    const wasAvailable = this.isAvailable();
    const isReachable = await this.ping();

    if (!isReachable && wasAvailable) {
      this.extensionInfo = null;
      this.callbacks.onExtensionLost?.();
    }
  }

  private clearPendingResponses(): void {
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge stopped'));
    }
    this.pendingResponses.clear();
  }
}
