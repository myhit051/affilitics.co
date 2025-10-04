/**
 * Unit Tests: Error Tracker Service
 * Tests error tracking, notification, and reporting functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorTracker, MonitoringErrorSeverity, MonitoringErrorCategory } from '../../src/services/error-tracker';

// Mock Prisma client
vi.mock('../../src/client', () => ({
  prisma: {
    monitoringError: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

describe('ErrorTracker Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackError', () => {
    it('should track error with all required fields', async () => {
      const errorData = {
        severity: MonitoringErrorSeverity.HIGH,
        category: MonitoringErrorCategory.API,
        message: 'API request failed',
        context: { endpoint: '/api/test' },
      };

      const result = await ErrorTracker.trackError(errorData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.severity).toBe(MonitoringErrorSeverity.HIGH);
    });

    it('should auto-increment occurrence count for duplicate errors', async () => {
      const errorData = {
        severity: MonitoringErrorSeverity.MEDIUM,
        category: MonitoringErrorCategory.WORKER,
        message: 'Worker processing failed',
      };

      await ErrorTracker.trackError(errorData);
      const result = await ErrorTracker.trackError(errorData);

      expect(result.occurrenceCount).toBeGreaterThan(1);
    });

    it('should send notification for critical errors', async () => {
      const notifySpy = vi.spyOn(ErrorTracker, 'notifyError');

      await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.CRITICAL,
        category: MonitoringErrorCategory.DATABASE,
        message: 'Database connection lost',
      });

      expect(notifySpy).toHaveBeenCalled();
    });

    it('should include stack trace when error object provided', async () => {
      const error = new Error('Test error');

      const result = await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.HIGH,
        category: MonitoringErrorCategory.SYSTEM,
        message: 'System error occurred',
        error,
      });

      expect(result.stackTrace).toContain('Error: Test error');
    });
  });

  describe('getErrorStats', () => {
    it('should return error statistics for timeframe', async () => {
      const stats = await ErrorTracker.getErrorStats('24h');

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('topErrors');
    });

    it('should filter by workspace when provided', async () => {
      const stats = await ErrorTracker.getErrorStats('24h', 'workspace-123');

      expect(stats.workspaceId).toBe('workspace-123');
    });

    it('should handle different timeframes correctly', async () => {
      const stats1h = await ErrorTracker.getErrorStats('1h');
      const stats24h = await ErrorTracker.getErrorStats('24h');
      const stats7d = await ErrorTracker.getErrorStats('7d');

      expect(stats1h).toBeDefined();
      expect(stats24h).toBeDefined();
      expect(stats7d).toBeDefined();
    });
  });

  describe('notifyError', () => {
    it('should respect cooldown period for notifications', async () => {
      const errorData = {
        severity: MonitoringErrorSeverity.CRITICAL,
        category: MonitoringErrorCategory.API,
        message: 'Critical API failure',
      };

      const notify1 = await ErrorTracker.notifyError(errorData);
      const notify2 = await ErrorTracker.notifyError(errorData);

      expect(notify1).toBe(true);
      expect(notify2).toBe(false); // Within cooldown
    });

    it('should only notify for high severity errors', async () => {
      const lowSeverity = {
        severity: MonitoringErrorSeverity.LOW,
        category: MonitoringErrorCategory.SYSTEM,
        message: 'Low priority issue',
      };

      const result = await ErrorTracker.notifyError(lowSeverity);
      expect(result).toBe(false);
    });
  });

  describe('resolveError', () => {
    it('should mark error as resolved with resolution notes', async () => {
      const errorId = 'error-123';
      const resolution = 'Database connection restored';

      const result = await ErrorTracker.resolveError(errorId, resolution);

      expect(result.resolved).toBe(true);
      expect(result.resolution).toBe(resolution);
    });

    it('should update resolvedAt timestamp', async () => {
      const errorId = 'error-456';
      const result = await ErrorTracker.resolveError(errorId, 'Fixed');

      expect(result.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('Error severity classification', () => {
    it('should classify CRITICAL errors correctly', () => {
      expect(MonitoringErrorSeverity.CRITICAL).toBe('critical');
    });

    it('should classify HIGH errors correctly', () => {
      expect(MonitoringErrorSeverity.HIGH).toBe('high');
    });

    it('should classify MEDIUM errors correctly', () => {
      expect(MonitoringErrorSeverity.MEDIUM).toBe('medium');
    });

    it('should classify LOW errors correctly', () => {
      expect(MonitoringErrorSeverity.LOW).toBe('low');
    });

    it('should classify INFO errors correctly', () => {
      expect(MonitoringErrorSeverity.INFO).toBe('info');
    });
  });

  describe('Error category classification', () => {
    it('should have all required categories', () => {
      const categories = Object.values(MonitoringErrorCategory);

      expect(categories).toContain('api');
      expect(categories).toContain('database');
      expect(categories).toContain('worker');
      expect(categories).toContain('auth');
      expect(categories).toContain('system');
      expect(categories).toContain('external');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing context gracefully', async () => {
      const result = await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.MEDIUM,
        category: MonitoringErrorCategory.WORKER,
        message: 'Worker error without context',
      });

      expect(result).toBeDefined();
    });

    it('should handle very long error messages', async () => {
      const longMessage = 'x'.repeat(1000);

      const result = await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.LOW,
        category: MonitoringErrorCategory.SYSTEM,
        message: longMessage,
      });

      expect(result.message.length).toBeLessThanOrEqual(1000);
    });

    it('should handle circular references in context', async () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Circular reference

      expect(() => {
        ErrorTracker.trackError({
          severity: MonitoringErrorSeverity.LOW,
          category: MonitoringErrorCategory.SYSTEM,
          message: 'Test',
          context: obj,
        });
      }).not.toThrow();
    });
  });
});
