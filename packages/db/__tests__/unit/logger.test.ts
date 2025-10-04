/**
 * Unit Tests: Logger Service
 * Tests structured logging functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { log, Logger, LogLevel } from '../../src/services/logger';

describe('Logger Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Log levels', () => {
    it('should log DEBUG level messages', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      log.debug('Debug message', { test: true });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log INFO level messages', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      log.info('Info message', { test: true });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log WARN level messages', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      log.warn('Warning message', { test: true });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log ERROR level messages', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      log.error('Error message', new Error('test'), { test: true });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log FATAL level messages', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      log.fatal('Fatal message', new Error('critical'), { test: true });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Child logger', () => {
    it('should create child logger with context', () => {
      const child = Logger.child({
        service: 'test-service',
        workspaceId: 'ws-123',
      });

      expect(child).toBeDefined();
      expect(child.info).toBeDefined();
    });

    it('should inherit parent context', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const child = Logger.child({
        service: 'test-service',
      });

      child.info('Test message');

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test-service');
    });

    it('should merge child and parent context', () => {
      const parent = Logger.child({ service: 'parent' });
      const child = parent.child({ requestId: 'req-123' });

      const consoleSpy = vi.spyOn(console, 'log');
      child.info('Test');

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('parent');
      expect(logCall).toContain('req-123');
    });
  });

  describe('Structured logging format', () => {
    it('should output JSON-formatted logs', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      log.info('Test message', { data: 'value' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('timestamp');
    });

    it('should include context in log output', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      log.info('Test', { userId: '123', action: 'login' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.context).toHaveProperty('userId', '123');
      expect(parsed.context).toHaveProperty('action', 'login');
    });

    it('should format error stack traces correctly', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const error = new Error('Test error');

      log.error('Error occurred', error);

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.error).toHaveProperty('message', 'Test error');
      expect(parsed.error).toHaveProperty('stack');
    });
  });

  describe('Log filtering and querying', () => {
    it('should filter logs by level', async () => {
      log.info('Info 1');
      log.error('Error 1', new Error());
      log.info('Info 2');

      const errorLogs = await Logger.query({ level: LogLevel.ERROR });
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it('should filter logs by timeframe', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600000);

      const logs = await Logger.query({
        startTime: hourAgo,
        endTime: now,
      });

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter logs by workspace', async () => {
      const workspaceLogger = Logger.child({ workspaceId: 'ws-123' });
      workspaceLogger.info('Workspace log');

      const logs = await Logger.query({ workspaceId: 'ws-123' });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should filter logs by service', async () => {
      const serviceLogger = Logger.child({ service: 'csv-worker' });
      serviceLogger.info('Service log');

      const logs = await Logger.query({ service: 'csv-worker' });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Log retention and cleanup', () => {
    it('should clean up old logs', async () => {
      const retentionDays = 30;
      const result = await Logger.cleanup(retentionDays);

      expect(result).toHaveProperty('deletedCount');
    });

    it('should not delete recent logs during cleanup', async () => {
      log.info('Recent log');

      const result = await Logger.cleanup(30);

      const recentLogs = await Logger.query({
        startTime: new Date(Date.now() - 3600000),
      });

      expect(recentLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined context gracefully', () => {
      expect(() => log.info('Message', undefined)).not.toThrow();
    });

    it('should handle null values in context', () => {
      expect(() => log.info('Message', { value: null })).not.toThrow();
    });

    it('should handle circular references in context', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      expect(() => log.info('Message', obj)).not.toThrow();
    });

    it('should handle very large context objects', () => {
      const largeContext = {
        data: new Array(1000).fill({ key: 'value' }),
      };

      expect(() => log.info('Message', largeContext)).not.toThrow();
    });

    it('should handle special characters in messages', () => {
      const specialChars = 'Message with "quotes" and \n newlines \t tabs';

      expect(() => log.info(specialChars)).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle high volume logging efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        log.info(`Message ${i}`, { index: i });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });

    it('should batch log writes for performance', async () => {
      const logs = Array.from({ length: 100 }, (_, i) => ({
        level: LogLevel.INFO,
        message: `Batch message ${i}`,
      }));

      const start = Date.now();
      await Logger.batchWrite(logs);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // Batching should be fast
    });
  });
});
