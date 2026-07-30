/**
 * Audit Logging Service
 *
 * Client-side audit log service that captures administrative actions
 * (member invite, role change, key creation) with timestamps and
 * sends to backend.
 *
 * Requirements: 8.9
 */

export type AuditAction =
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'member.suspended'
  | 'member.reactivated'
  | 'team.created'
  | 'team.deleted'
  | 'team.member_added'
  | 'team.member_removed'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'api_key.rotated'
  | 'api_key.deleted'
  | 'organization.settings_changed'
  | 'organization.branding_updated'
  | 'organization.security_policy_changed'
  | 'project.created'
  | 'project.deleted'
  | 'project.permissions_changed'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'webhook.updated'
  | 'sso.configured'
  | 'sso.disabled'
  | 'billing.plan_changed'
  | 'data.exported'
  | 'data.deleted';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  organizationId: string;
  timestamp: string;
  details: Record<string, unknown>;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLoggerConfig {
  /** Backend endpoint to send audit logs to */
  endpoint: string;
  /** Organization ID for context */
  organizationId: string;
  /** Current actor information */
  actor: { id: string; name: string };
  /** Maximum number of entries to batch before flushing */
  batchSize?: number;
  /** Flush interval in milliseconds */
  flushIntervalMs?: number;
  /** Whether to persist unsent logs to localStorage */
  persistUnsent?: boolean;
  /** Callback on flush errors */
  onError?: (error: Error, entries: AuditLogEntry[]) => void;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL = 5000;
const STORAGE_KEY = 'streetstudio_audit_log_queue';

/**
 * Client-side audit logger that batches and sends administrative action logs
 * to the backend.
 */
export class AuditLogger {
  private config: Required<Omit<AuditLoggerConfig, 'onError'>> & { onError?: AuditLoggerConfig['onError'] };
  private queue: AuditLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private destroyed = false;

  constructor(config: AuditLoggerConfig) {
    this.config = {
      endpoint: config.endpoint,
      organizationId: config.organizationId,
      actor: config.actor,
      batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL,
      persistUnsent: config.persistUnsent ?? true,
      onError: config.onError,
    };

    // Restore any unsent logs from storage
    if (this.config.persistUnsent) {
      this.restoreFromStorage();
    }

    // Start periodic flush
    this.startFlushTimer();
  }

  /**
   * Log an administrative action.
   */
  public log(
    action: AuditAction,
    details: Record<string, unknown> = {},
    target?: { type: string; id: string; name?: string }
  ): AuditLogEntry {
    if (this.destroyed) {
      throw new Error('AuditLogger has been destroyed');
    }

    const entry: AuditLogEntry = {
      id: generateId(),
      action,
      actorId: this.config.actor.id,
      actorName: this.config.actor.name,
      organizationId: this.config.organizationId,
      timestamp: new Date().toISOString(),
      details,
      targetType: target?.type,
      targetId: target?.id,
      targetName: target?.name,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    this.queue.push(entry);

    // Persist to storage for crash recovery
    if (this.config.persistUnsent) {
      this.persistToStorage();
    }

    // Flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }

    return entry;
  }

  /**
   * Log a member invitation action.
   */
  public logMemberInvite(email: string, role: string, inviteeId?: string): AuditLogEntry {
    return this.log(
      'member.invited',
      { email, role },
      inviteeId ? { type: 'member', id: inviteeId, name: email } : undefined
    );
  }

  /**
   * Log a role change action.
   */
  public logRoleChange(memberId: string, memberName: string, oldRole: string, newRole: string): AuditLogEntry {
    return this.log(
      'member.role_changed',
      { oldRole, newRole },
      { type: 'member', id: memberId, name: memberName }
    );
  }

  /**
   * Log an API key creation action.
   */
  public logKeyCreation(keyId: string, keyName: string, scopes: string[]): AuditLogEntry {
    return this.log(
      'api_key.created',
      { scopes, keyName },
      { type: 'api_key', id: keyId, name: keyName }
    );
  }

  /**
   * Log an API key revocation action.
   */
  public logKeyRevocation(keyId: string, keyName: string): AuditLogEntry {
    return this.log(
      'api_key.revoked',
      { keyName },
      { type: 'api_key', id: keyId, name: keyName }
    );
  }

  /**
   * Log an organization settings change.
   */
  public logSettingsChange(settingName: string, oldValue: unknown, newValue: unknown): AuditLogEntry {
    return this.log(
      'organization.settings_changed',
      { settingName, oldValue, newValue }
    );
  }

  /**
   * Force an immediate flush of queued log entries.
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries: batch }),
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error(`Audit log flush failed: ${response.status} ${response.statusText}`);
      }

      // Update storage after successful flush
      if (this.config.persistUnsent) {
        this.persistToStorage();
      }
    } catch (error) {
      // Put entries back in queue for retry
      this.queue.unshift(...batch);

      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)), batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Get current queued entries (for inspection/testing).
   */
  public getQueue(): ReadonlyArray<AuditLogEntry> {
    return [...this.queue];
  }

  /**
   * Get the number of pending entries.
   */
  public getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Update the actor information (e.g., after context switch).
   */
  public setActor(actor: { id: string; name: string }): void {
    this.config.actor = actor;
  }

  /**
   * Update the organization context.
   */
  public setOrganization(organizationId: string): void {
    this.config.organizationId = organizationId;
  }

  /**
   * Destroy the logger, flushing any remaining entries.
   */
  public async destroy(): Promise<void> {
    this.destroyed = true;
    this.stopFlushTimer();

    // Final flush attempt
    if (this.queue.length > 0) {
      await this.flush();
    }

    // Persist any remaining entries
    if (this.config.persistUnsent && this.queue.length > 0) {
      this.persistToStorage();
    }

    this.queue = [];
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private persistToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full or unavailable - silently fail
    }
  }

  private restoreFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const entries = JSON.parse(stored) as AuditLogEntry[];
        if (Array.isArray(entries)) {
          this.queue.push(...entries);
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Invalid data - clear it
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
