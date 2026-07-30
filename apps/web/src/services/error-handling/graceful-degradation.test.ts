/**
 * Unit Tests: Graceful Degradation Service
 * 
 * Tests feature detection, fallback execution, and user notification
 * for unavailable features.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GracefulDegradationService, type FeatureCheck } from './graceful-degradation.js';

// Mock toast
vi.mock('../../utils/toast.js', () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GracefulDegradationService', () => {
  let service: GracefulDegradationService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    service?.destroy();
  });

  describe('initialize', () => {
    it('checks all features on initialization', async () => {
      const features: FeatureCheck[] = [
        { name: 'feature-a', description: 'Feature A', check: () => true, critical: false },
        { name: 'feature-b', description: 'Feature B', check: () => false, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(service.isFeatureAvailable('feature-a')).toBe(true);
      expect(service.isFeatureAvailable('feature-b')).toBe(false);
    });

    it('handles async feature checks', async () => {
      const features: FeatureCheck[] = [
        {
          name: 'async-feature',
          description: 'Async Feature',
          check: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return true;
          },
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(service.isFeatureAvailable('async-feature')).toBe(true);
    });

    it('handles feature check failures gracefully', async () => {
      const features: FeatureCheck[] = [
        {
          name: 'failing-feature',
          description: 'Failing Feature',
          check: () => { throw new Error('Check failed'); },
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(service.isFeatureAvailable('failing-feature')).toBe(false);
    });
  });

  describe('feature status', () => {
    it('returns feature state with details', async () => {
      const features: FeatureCheck[] = [
        {
          name: 'test-feature',
          description: 'Test Feature Description',
          check: () => true,
          critical: true,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      const state = service.getFeatureStatus('test-feature');
      expect(state).toBeDefined();
      expect(state!.name).toBe('test-feature');
      expect(state!.status).toBe('available');
      expect(state!.description).toBe('Test Feature Description');
      expect(state!.critical).toBe(true);
      expect(state!.lastChecked).toBeTruthy();
    });

    it('returns undefined for unknown features', () => {
      service = new GracefulDegradationService({ features: [], notifyUser: false });
      expect(service.getFeatureStatus('nonexistent')).toBeUndefined();
    });

    it('returns all feature states', async () => {
      const features: FeatureCheck[] = [
        { name: 'a', description: 'A', check: () => true, critical: false },
        { name: 'b', description: 'B', check: () => false, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      const states = service.getAllFeatureStates();
      expect(states).toHaveLength(2);
    });

    it('returns unavailable features', async () => {
      const features: FeatureCheck[] = [
        { name: 'available', description: 'Available', check: () => true, critical: false },
        { name: 'unavailable-1', description: 'Unavailable 1', check: () => false, critical: false },
        { name: 'unavailable-2', description: 'Unavailable 2', check: () => false, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      const unavailable = service.getUnavailableFeatures();
      expect(unavailable).toHaveLength(2);
      expect(unavailable.map(f => f.name)).toContain('unavailable-1');
      expect(unavailable.map(f => f.name)).toContain('unavailable-2');
    });
  });

  describe('fallback execution', () => {
    it('executes fallback when feature is unavailable', async () => {
      const fallback = vi.fn();
      const features: FeatureCheck[] = [
        {
          name: 'fallback-feature',
          description: 'Feature with fallback',
          check: () => false,
          fallback,
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('does not execute fallback when feature is available', async () => {
      const fallback = vi.fn();
      const features: FeatureCheck[] = [
        {
          name: 'available-feature',
          description: 'Available Feature',
          check: () => true,
          fallback,
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(fallback).not.toHaveBeenCalled();
    });

    it('handles fallback execution errors gracefully', async () => {
      const fallback = vi.fn(() => { throw new Error('Fallback failed'); });
      const features: FeatureCheck[] = [
        {
          name: 'bad-fallback',
          description: 'Bad Fallback',
          check: () => false,
          fallback,
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      // Should not throw
      await service.initialize();

      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('user notification', () => {
    it('shows toast when feature is unavailable and notifyUser is true', async () => {
      const { toast } = await import('../../utils/toast.js');
      const features: FeatureCheck[] = [
        {
          name: 'notify-feature',
          description: 'Notify Feature',
          check: () => false,
          userMessage: 'This feature is unavailable.',
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: true });
      await service.initialize();

      expect(toast.warning).toHaveBeenCalledWith('This feature is unavailable.', { duration: 8000 });
    });

    it('does not show toast when notifyUser is false', async () => {
      const { toast } = await import('../../utils/toast.js');
      const features: FeatureCheck[] = [
        {
          name: 'silent-feature',
          description: 'Silent Feature',
          check: () => false,
          userMessage: 'This feature is unavailable.',
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      await service.initialize();

      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('does not show toast when feature has no userMessage', async () => {
      const { toast } = await import('../../utils/toast.js');
      const features: FeatureCheck[] = [
        {
          name: 'no-message-feature',
          description: 'No Message Feature',
          check: () => false,
          critical: false,
        },
      ];

      service = new GracefulDegradationService({ features, notifyUser: true });
      await service.initialize();

      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('calls onFeatureUnavailable when feature is unavailable', async () => {
      const onFeatureUnavailable = vi.fn();
      const features: FeatureCheck[] = [
        { name: 'unavail', description: 'Unavail', check: () => false, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false, onFeatureUnavailable });
      await service.initialize();

      expect(onFeatureUnavailable).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'unavail', status: 'unavailable' })
      );
    });
  });

  describe('registerFeature', () => {
    it('registers and checks a new feature at runtime', async () => {
      service = new GracefulDegradationService({ features: [], notifyUser: false });
      await service.initialize();

      service.registerFeature({
        name: 'dynamic-feature',
        description: 'Dynamic Feature',
        check: () => true,
        critical: false,
      });

      // Give async check time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(service.isFeatureAvailable('dynamic-feature')).toBe(true);
    });
  });

  describe('onFeatureChange', () => {
    it('notifies listeners on feature status change', async () => {
      const listener = vi.fn();
      const features: FeatureCheck[] = [
        { name: 'watched-feature', description: 'Watched', check: () => true, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      service.onFeatureChange('watched-feature', listener);
      await service.initialize();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'watched-feature', status: 'available' })
      );
    });

    it('returns unsubscribe function', async () => {
      const listener = vi.fn();
      const features: FeatureCheck[] = [
        { name: 'test', description: 'Test', check: () => true, critical: false },
      ];

      service = new GracefulDegradationService({ features, notifyUser: false });
      const unsubscribe = service.onFeatureChange('test', listener);
      
      unsubscribe();
      await service.initialize();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('cleans up resources', () => {
      service = new GracefulDegradationService({ features: [], notifyUser: false, checkInterval: 5000 });
      // Should not throw
      service.destroy();
    });
  });
});
