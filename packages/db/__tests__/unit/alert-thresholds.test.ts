/**
 * Unit Tests: Alert Thresholds Configuration
 * Tests threshold validation and checking logic
 */

import { describe, it, expect } from 'vitest';
import {
  ALERT_THRESHOLDS,
  checkThreshold,
  validateThresholdConfig,
  AlertSeverity,
} from '../../src/config/alert-thresholds';

describe('Alert Thresholds Configuration', () => {
  describe('Threshold definitions', () => {
    it('should have performance thresholds defined', () => {
      expect(ALERT_THRESHOLDS.performance).toBeDefined();
      expect(ALERT_THRESHOLDS.performance.apiResponseTime).toBeDefined();
      expect(ALERT_THRESHOLDS.performance.csvProcessingTime).toBeDefined();
    });

    it('should have error rate thresholds defined', () => {
      expect(ALERT_THRESHOLDS.errors).toBeDefined();
      expect(ALERT_THRESHOLDS.errors.errorRate).toBeDefined();
      expect(ALERT_THRESHOLDS.errors.criticalErrors).toBeDefined();
    });

    it('should have system resource thresholds defined', () => {
      expect(ALERT_THRESHOLDS.system).toBeDefined();
      expect(ALERT_THRESHOLDS.system.memoryUsage).toBeDefined();
      expect(ALERT_THRESHOLDS.system.cpuUsage).toBeDefined();
      expect(ALERT_THRESHOLDS.system.diskUsage).toBeDefined();
    });

    it('should have worker thresholds defined', () => {
      expect(ALERT_THRESHOLDS.worker).toBeDefined();
      expect(ALERT_THRESHOLDS.worker.activeWorkers).toBeDefined();
      expect(ALERT_THRESHOLDS.worker.queueLength).toBeDefined();
      expect(ALERT_THRESHOLDS.worker.processingFailureRate).toBeDefined();
    });

    it('should have business metric thresholds defined', () => {
      expect(ALERT_THRESHOLDS.business).toBeDefined();
      expect(ALERT_THRESHOLDS.business.successRate).toBeDefined();
      expect(ALERT_THRESHOLDS.business.activeWorkspaces).toBeDefined();
    });
  });

  describe('checkThreshold function', () => {
    it('should detect when API response time exceeds warning threshold', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 600);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect when API response time exceeds critical threshold', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 1100);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should not trigger alert when below threshold', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 100);

      expect(result.exceeded).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('should handle inverted thresholds (success rate)', () => {
      const result = checkThreshold('business', 'successRate', 0.85);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should handle inverted thresholds (active workers)', () => {
      const result = checkThreshold('worker', 'activeWorkers', 1);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should return threshold values in result', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 600);

      expect(result.thresholds).toBeDefined();
      expect(result.thresholds.warning).toBe(500);
      expect(result.thresholds.critical).toBe(1000);
    });
  });

  describe('Threshold validation', () => {
    it('should validate correct threshold configuration', () => {
      const config = {
        warning: 500,
        critical: 1000,
        unit: 'ms',
        inverted: false,
      };

      const result = validateThresholdConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid threshold order', () => {
      const config = {
        warning: 1000,
        critical: 500, // Critical should be > warning for normal thresholds
        unit: 'ms',
        inverted: false,
      };

      const result = validateThresholdConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate inverted threshold order', () => {
      const config = {
        warning: 0.9,
        critical: 0.8, // For inverted, critical < warning is correct
        unit: 'percentage',
        inverted: true,
      };

      const result = validateThresholdConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should detect missing required fields', () => {
      const config = {
        warning: 500,
        // Missing critical
        unit: 'ms',
      };

      const result = validateThresholdConfig(config as any);
      expect(result.valid).toBe(false);
    });
  });

  describe('Performance thresholds', () => {
    it('should have correct API response time thresholds', () => {
      const threshold = ALERT_THRESHOLDS.performance.apiResponseTime;

      expect(threshold.warning).toBe(500);
      expect(threshold.critical).toBe(1000);
      expect(threshold.unit).toBe('ms');
      expect(threshold.inverted).toBe(false);
    });

    it('should have correct CSV processing time thresholds', () => {
      const threshold = ALERT_THRESHOLDS.performance.csvProcessingTime;

      expect(threshold.warning).toBe(8000);
      expect(threshold.critical).toBe(10000);
      expect(threshold.unit).toBe('ms');
    });

    it('should trigger alert for slow database queries', () => {
      const result = checkThreshold('performance', 'dbQueryTime', 600);
      expect(result.exceeded).toBe(true);
    });
  });

  describe('Error rate thresholds', () => {
    it('should detect high error rate (warning)', () => {
      const result = checkThreshold('errors', 'errorRate', 0.06);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect critical error rate', () => {
      const result = checkThreshold('errors', 'errorRate', 0.11);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should have threshold for critical errors', () => {
      const threshold = ALERT_THRESHOLDS.errors.criticalErrors;

      expect(threshold.warning).toBe(1);
      expect(threshold.critical).toBe(5);
    });
  });

  describe('System resource thresholds', () => {
    it('should detect high memory usage (warning)', () => {
      const result = checkThreshold('system', 'memoryUsage', 0.76);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect critical memory usage', () => {
      const result = checkThreshold('system', 'memoryUsage', 0.91);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should detect high CPU usage', () => {
      const result = checkThreshold('system', 'cpuUsage', 0.81);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect high disk usage', () => {
      const result = checkThreshold('system', 'diskUsage', 0.86);

      expect(result.exceeded).toBe(true);
    });
  });

  describe('Worker service thresholds', () => {
    it('should detect insufficient active workers (warning)', () => {
      const result = checkThreshold('worker', 'activeWorkers', 1);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect critical worker shortage', () => {
      const result = checkThreshold('worker', 'activeWorkers', 0);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should detect long queue length', () => {
      const result = checkThreshold('worker', 'queueLength', 60);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect high processing failure rate', () => {
      const result = checkThreshold('worker', 'processingFailureRate', 0.11);

      expect(result.exceeded).toBe(true);
    });
  });

  describe('Business metric thresholds', () => {
    it('should detect low success rate (inverted)', () => {
      const result = checkThreshold('business', 'successRate', 0.89);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should detect critically low success rate', () => {
      const result = checkThreshold('business', 'successRate', 0.79);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should have threshold for active workspaces', () => {
      const threshold = ALERT_THRESHOLDS.business.activeWorkspaces;
      expect(threshold).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle exact threshold values', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 500);

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.WARNING);
    });

    it('should handle zero values', () => {
      const result = checkThreshold('worker', 'activeWorkers', 0);
      expect(result.exceeded).toBe(true);
    });

    it('should handle very large values', () => {
      const result = checkThreshold('performance', 'apiResponseTime', 999999);
      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should handle negative values gracefully', () => {
      const result = checkThreshold('performance', 'apiResponseTime', -1);
      expect(result.exceeded).toBe(false);
    });

    it('should handle invalid category gracefully', () => {
      expect(() => {
        checkThreshold('invalid' as any, 'metric', 100);
      }).toThrow();
    });

    it('should handle invalid metric gracefully', () => {
      expect(() => {
        checkThreshold('performance', 'invalidMetric' as any, 100);
      }).toThrow();
    });
  });

  describe('Threshold comparison logic', () => {
    it('should use > for normal thresholds', () => {
      const result1 = checkThreshold('performance', 'apiResponseTime', 500);
      const result2 = checkThreshold('performance', 'apiResponseTime', 501);

      expect(result1.exceeded).toBe(true);
      expect(result2.exceeded).toBe(true);
    });

    it('should use < for inverted thresholds', () => {
      const result1 = checkThreshold('business', 'successRate', 0.9);
      const result2 = checkThreshold('business', 'successRate', 0.89);

      expect(result1.exceeded).toBe(false);
      expect(result2.exceeded).toBe(true);
    });
  });
});
