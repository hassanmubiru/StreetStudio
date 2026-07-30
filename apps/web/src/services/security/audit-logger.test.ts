/**
 * Unit Tests: Audit Logger
 *
 * Tests audit log entry creation, batching, flushing to backend,
 * persistence, and convenience methods for common admin actions.
 *
 * Validates: Requirements 8.9
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditLogger, type AuditLoggerConfig } from './audit-logger.js';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  let fetchMock: ReturnType<typeof vi.fn>;

  const defaultConfig: AuditLoggerConfig = {
    endpoint: '/api/audit-logs',
    organizationId: 'org-123',
    actor: { id: 'user-456', name: 'John Doe' },
    batchSize: 5,
    flushIntervalMs: 60000, // Long interval so we can manually control flushing
    persistUnsent: false,
  };

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock;
    localStorage.clear();
    logger = new AuditLogger(defaultConfig);
  });

  afterEach(async () => {
    await logger.destroy();
    vi.restoreAllMocks();
  });

  describe('log', () => {
    it('creates an audit entry with correct structure', () => {
      const entry = logger.log('member.invited', { email: 'test@example.com', role: 'editor' });

      expect(entry.id).toBeTruthy();
      expect(entry.action).toBe('member.invited');
      expect(entry.actorId).toBe('user-456');
      expect(entry.actorName).toBe('John Doe');
      expect(entry.organizationId).toBe('org-123');
      expect(entry.timestamp).toBeTruthy();
      expect(entry.details).toEqual({ email: 'test@example.com', role: 'editor' });
    });

    it('includes target information when provided', () => {
      const entry = logger.log(
        'member.role_changed',
        { oldRole: 'viewer', newRole: 'editor' },
        { type: 'member', id: 'member-789', name: 'Jane Doe' }
      );

      expect(entry.targetType).toBe('member');
      expect(entry.targetId).toBe('member-789');
      expect(entry.targetName).toBe('Jane Doe');
    });

    it('adds entry to the queue', () => {
      logger.log('team.created', { teamName: 'Engineering' });
      expect(logger.getPendingCount()).toBe(1);
    });

    it('includes userAgent in entry', () => {
      const entry = logger.log('api_key.created', { keyName: 'test-key' });
      expect(entry.userAgent).toBeTruthy();
    });

    it('throws if logger has been destroyed', async () => {
      await logger.destroy();
      expect(() => logger.log('member.invited', {})).toThrow('AuditLogger has been destroyed');
    });
  });

  describe('convenience methods', () => {
    it('logMemberInvite logs with correct action and details', () => {
      const entry = logger.logMemberInvite('new@example.com', 'editor', 'member-new');

      expect(entry.action).toBe('member.invited');
      expect(entry.details).toEqual({ email: 'new@example.com', role: 'editor' });
      expect(entry.targetType).toBe('member');
      expect(entry.targetId).toBe('member-new');
    });

    it('logMemberInvite works without inviteeId', () => {
      const entry = logger.logMemberInvite('new@example.com', 'viewer');
      expect(entry.action).toBe('member.invited');
      expect(entry.targetType).toBeUndefined();
    });

    it('logRoleChange logs role transitions', () => {
      const entry = logger.logRoleChange('m-1', 'Alice', 'viewer', 'admin');

      expect(entry.action).toBe('member.role_changed');
      expect(entry.details).toEqual({ oldRole: 'viewer', newRole: 'admin' });
      expect(entry.targetId).toBe('m-1');
      expect(entry.targetName).toBe('Alice');
    });

    it('logKeyCreation logs API key creation', () => {
      const entry = logger.logKeyCreation('key-1', 'My Key', ['read:videos', 'write:videos']);

      expect(entry.action).toBe('api_key.created');
      expect(entry.details).toEqual({ scopes: ['read:videos', 'write:videos'], keyName: 'My Key' });
      expect(entry.targetId).toBe('key-1');
    });

    it('logKeyRevocation logs key revocation', () => {
      const entry = logger.logKeyRevocation('key-1', 'Old Key');

      expect(entry.action).toBe('api_key.revoked');
      expect(entry.details).toEqual({ keyName: 'Old Key' });
      expect(entry.targetId).toBe('key-1');
    });

    it('logSettingsChange logs organization setting changes', () => {
      const entry = logger.logSettingsChange('defaultRole', 'viewer', 'editor');

      expect(entry.action).toBe('organization.settings_changed');
      expect(entry.details).toEqual({ settingName: 'defaultRole', oldValue: 'viewer', newValue: 'editor' });
    });
  });

  describe('batch flushing', () => {
    it('flushes automatically when batch size is reached', async () => {
      for (let i = 0; i < 5; i++) {
        logger.log('team.created', { index: i });
      }

      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/audit-logs', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('sends entries in correct format', async () => {
      logger.log('member.invited', { email: 'a@b.com' });
      await logger.flush();

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].action).toBe('member.invited');
    });

    it('clears queue after successful flush', async () => {
      logger.log('team.created', {});
      await logger.flush();
      expect(logger.getPendingCount()).toBe(0);
    });

    it('puts entries back in queue on flush failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      logger.log('team.created', {});
      await logger.flush();

      expect(logger.getPendingCount()).toBe(1);
    });

    it('calls onError when flush fails', async () => {
      const onError = vi.fn();
      const errorLogger = new AuditLogger({ ...defaultConfig, onError });

      fetchMock.mockRejectedValueOnce(new Error('Server down'));
      errorLogger.log('team.created', {});
      await errorLogger.flush();

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array)
      );

      await errorLogger.destroy();
    });

    it('does not flush when queue is empty', async () => {
      await logger.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not flush concurrently', async () => {
      logger.log('team.created', {});
      logger.log('team.deleted', {});

      // Start two flushes simultaneously
      const flush1 = logger.flush();
      const flush2 = logger.flush();
      await Promise.all([flush1, flush2]);

      // Only one fetch should have been made
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistence', () => {
    it('persists entries to localStorage when configured', () => {
      const persistLogger = new AuditLogger({ ...defaultConfig, persistUnsent: true });
      persistLogger.log('member.invited', { email: 'test@test.com' });

      const stored = localStorage.getItem('streetstudio_audit_log_queue');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('member.invited');

      // Clean up without triggering destroy's flush
      persistLogger.setActor({ id: 'cleanup', name: 'cleanup' });
    });

    it('restores entries from localStorage on construction', () => {
      const existingEntries = [
        { id: '1', action: 'team.created', actorId: 'u-1', actorName: 'Test', organizationId: 'org-1', timestamp: new Date().toISOString(), details: {} },
      ];
      localStorage.setItem('streetstudio_audit_log_queue', JSON.stringify(existingEntries));

      const restoredLogger = new AuditLogger({ ...defaultConfig, persistUnsent: true });
      expect(restoredLogger.getPendingCount()).toBe(1);
    });

    it('clears localStorage after restoring entries', () => {
      localStorage.setItem('streetstudio_audit_log_queue', JSON.stringify([{ id: '1' }]));
      new AuditLogger({ ...defaultConfig, persistUnsent: true });
      expect(localStorage.getItem('streetstudio_audit_log_queue')).toBeNull();
    });
  });

  describe('context updates', () => {
    it('setActor updates actor for subsequent logs', () => {
      logger.setActor({ id: 'new-user', name: 'New Person' });
      const entry = logger.log('team.created', {});
      expect(entry.actorId).toBe('new-user');
      expect(entry.actorName).toBe('New Person');
    });

    it('setOrganization updates organization for subsequent logs', () => {
      logger.setOrganization('org-new');
      const entry = logger.log('team.created', {});
      expect(entry.organizationId).toBe('org-new');
    });
  });

  describe('getQueue', () => {
    it('returns a copy of the current queue', () => {
      logger.log('team.created', {});
      logger.log('member.invited', {});
      const queue = logger.getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0]!.action).toBe('team.created');
      expect(queue[1]!.action).toBe('member.invited');
    });

    it('returns an independent copy', () => {
      logger.log('team.created', {});
      const queue = logger.getQueue();
      (queue as any).push({ fake: true });
      expect(logger.getPendingCount()).toBe(1);
    });
  });

  describe('destroy', () => {
    it('flushes remaining entries', async () => {
      logger.log('team.created', {});
      await logger.destroy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('prevents further logging after destroy', async () => {
      await logger.destroy();
      expect(() => logger.log('team.created', {})).toThrow();
    });
  });
});
