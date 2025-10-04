/**
 * Alert Threshold Configuration
 *
 * Defines thresholds for various system metrics that trigger alerts
 * when exceeded. Supports different severity levels and configurable
 * thresholds for production monitoring.
 */

// Alert severity levels
export enum AlertSeverity {
  CRITICAL = 'critical',  // Immediate action required
  WARNING = 'warning',    // Attention needed
  INFO = 'info'          // Informational only
}

// Alert threshold types
export interface ThresholdConfig {
  value: number;
  severity: AlertSeverity;
  enabled: boolean;
  description: string;
}

export interface MetricThresholds {
  critical?: number;
  warning?: number;
  info?: number;
}

// Performance metrics thresholds
export interface PerformanceThresholds {
  apiResponseTime: MetricThresholds;         // milliseconds
  apiErrorRate: MetricThresholds;            // percentage
  csvProcessingTime: MetricThresholds;       // seconds
  csvSuccessRate: MetricThresholds;          // percentage (inverted - alert when below)
  throughput: MetricThresholds;              // jobs per hour (inverted)
}

// System resource thresholds
export interface ResourceThresholds {
  memoryUsage: MetricThresholds;             // percentage
  cpuUsage: MetricThresholds;                // percentage
  storageUsage: MetricThresholds;            // percentage
  activeConnections: MetricThresholds;       // count
  queueLength: MetricThresholds;             // count
}

// Worker service thresholds
export interface WorkerThresholds {
  activeWorkers: MetricThresholds;           // count (inverted - alert when below)
  workerErrorRate: MetricThresholds;         // percentage
  jobFailureRate: MetricThresholds;          // percentage
  processingTime: MetricThresholds;          // seconds
  heartbeatAge: MetricThresholds;            // seconds
}

// Error tracking thresholds
export interface ErrorThresholds {
  totalErrorsPerHour: MetricThresholds;      // count
  criticalErrorsPerHour: MetricThresholds;   // count
  errorRatePercentage: MetricThresholds;     // percentage
  uniqueErrorTypes: MetricThresholds;        // count
}

// Business metrics thresholds
export interface BusinessThresholds {
  workspaceInactivity: MetricThresholds;     // days
  userInactivity: MetricThresholds;          // days
  storageQuota: MetricThresholds;            // percentage
  apiQuota: MetricThresholds;                // percentage
}

// Complete alert configuration
export interface AlertThresholdsConfig {
  performance: PerformanceThresholds;
  resources: ResourceThresholds;
  worker: WorkerThresholds;
  errors: ErrorThresholds;
  business: BusinessThresholds;
}

/**
 * Default alert thresholds for production monitoring
 * These values are based on SLA requirements and production best practices
 */
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdsConfig = {
  // Performance metrics
  performance: {
    // API response time (milliseconds)
    apiResponseTime: {
      critical: 1000,    // > 1 second is critical
      warning: 500,      // > 500ms is warning
      info: 200          // > 200ms is informational
    },

    // API error rate (percentage)
    apiErrorRate: {
      critical: 10,      // > 10% errors is critical
      warning: 5,        // > 5% errors is warning
      info: 1            // > 1% errors is informational
    },

    // CSV processing time per file (seconds)
    csvProcessingTime: {
      critical: 30,      // > 30 seconds is critical for 50MB files
      warning: 15,       // > 15 seconds is warning
      info: 10           // > 10 seconds is informational
    },

    // CSV processing success rate (percentage) - inverted threshold
    csvSuccessRate: {
      critical: 90,      // < 90% success is critical
      warning: 95,       // < 95% success is warning
      info: 98           // < 98% success is informational
    },

    // Processing throughput (jobs per hour) - inverted threshold
    throughput: {
      critical: 10,      // < 10 jobs/hour is critical
      warning: 20,       // < 20 jobs/hour is warning
      info: 30           // < 30 jobs/hour is informational
    }
  },

  // System resources
  resources: {
    // Memory usage (percentage)
    memoryUsage: {
      critical: 90,      // > 90% memory usage is critical
      warning: 75,       // > 75% memory usage is warning
      info: 60           // > 60% memory usage is informational
    },

    // CPU usage (percentage)
    cpuUsage: {
      critical: 90,      // > 90% CPU usage is critical
      warning: 75,       // > 75% CPU usage is warning
      info: 60           // > 60% CPU usage is informational
    },

    // Storage usage (percentage)
    storageUsage: {
      critical: 90,      // > 90% storage usage is critical
      warning: 80,       // > 80% storage usage is warning
      info: 70           // > 70% storage usage is informational
    },

    // Active database connections
    activeConnections: {
      critical: 90,      // > 90 connections is critical (pool limit = 100)
      warning: 70,       // > 70 connections is warning
      info: 50           // > 50 connections is informational
    },

    // Job queue length
    queueLength: {
      critical: 200,     // > 200 queued jobs is critical
      warning: 100,      // > 100 queued jobs is warning
      info: 50           // > 50 queued jobs is informational
    }
  },

  // Worker service
  worker: {
    // Active workers count - inverted threshold
    activeWorkers: {
      critical: 1,       // < 1 active worker is critical
      warning: 2,        // < 2 active workers is warning
      info: 3            // < 3 active workers is informational
    },

    // Worker error rate (percentage)
    workerErrorRate: {
      critical: 15,      // > 15% worker errors is critical
      warning: 10,       // > 10% worker errors is warning
      info: 5            // > 5% worker errors is informational
    },

    // Job failure rate (percentage)
    jobFailureRate: {
      critical: 10,      // > 10% job failures is critical
      warning: 5,        // > 5% job failures is warning
      info: 2            // > 2% job failures is informational
    },

    // Average processing time per job (seconds)
    processingTime: {
      critical: 60,      // > 60 seconds average is critical
      warning: 30,       // > 30 seconds average is warning
      info: 15           // > 15 seconds average is informational
    },

    // Worker heartbeat age (seconds)
    heartbeatAge: {
      critical: 300,     // > 5 minutes without heartbeat is critical
      warning: 120,      // > 2 minutes without heartbeat is warning
      info: 60           // > 1 minute without heartbeat is informational
    }
  },

  // Error tracking
  errors: {
    // Total errors per hour
    totalErrorsPerHour: {
      critical: 100,     // > 100 errors/hour is critical
      warning: 50,       // > 50 errors/hour is warning
      info: 20           // > 20 errors/hour is informational
    },

    // Critical errors per hour
    criticalErrorsPerHour: {
      critical: 5,       // > 5 critical errors/hour is critical alert
      warning: 2,        // > 2 critical errors/hour is warning
      info: 1            // > 1 critical error/hour is informational
    },

    // Error rate as percentage of total requests
    errorRatePercentage: {
      critical: 10,      // > 10% error rate is critical
      warning: 5,        // > 5% error rate is warning
      info: 2            // > 2% error rate is informational
    },

    // Unique error types in a time window
    uniqueErrorTypes: {
      critical: 20,      // > 20 unique error types is critical
      warning: 10,       // > 10 unique error types is warning
      info: 5            // > 5 unique error types is informational
    }
  },

  // Business metrics
  business: {
    // Workspace inactivity (days)
    workspaceInactivity: {
      critical: 90,      // > 90 days inactive is critical
      warning: 60,       // > 60 days inactive is warning
      info: 30           // > 30 days inactive is informational
    },

    // User inactivity (days)
    userInactivity: {
      critical: 60,      // > 60 days inactive is critical
      warning: 30,       // > 30 days inactive is warning
      info: 14           // > 14 days inactive is informational
    },

    // Storage quota usage (percentage)
    storageQuota: {
      critical: 95,      // > 95% quota used is critical
      warning: 85,       // > 85% quota used is warning
      info: 75           // > 75% quota used is informational
    },

    // API quota usage (percentage)
    apiQuota: {
      critical: 95,      // > 95% quota used is critical
      warning: 85,       // > 85% quota used is warning
      info: 75           // > 75% quota used is informational
    }
  }
};

/**
 * Alert Threshold Manager
 */
export class AlertThresholdManager {
  private static config: AlertThresholdsConfig = DEFAULT_ALERT_THRESHOLDS;

  /**
   * Get current threshold configuration
   */
  static getConfig(): AlertThresholdsConfig {
    return this.config;
  }

  /**
   * Update threshold configuration
   */
  static updateConfig(config: Partial<AlertThresholdsConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Check if a metric value exceeds thresholds
   */
  static checkThreshold(
    category: keyof AlertThresholdsConfig,
    metric: string,
    value: number,
    inverted: boolean = false
  ): { exceeded: boolean; severity: AlertSeverity | null; threshold: number | null } {
    const categoryThresholds = this.config[category] as any;
    const metricThresholds = categoryThresholds[metric] as MetricThresholds;

    if (!metricThresholds) {
      return { exceeded: false, severity: null, threshold: null };
    }

    // For inverted thresholds (e.g., success rate, active workers)
    // we alert when the value is BELOW the threshold
    if (inverted) {
      if (metricThresholds.critical !== undefined && value < metricThresholds.critical) {
        return { exceeded: true, severity: AlertSeverity.CRITICAL, threshold: metricThresholds.critical };
      }
      if (metricThresholds.warning !== undefined && value < metricThresholds.warning) {
        return { exceeded: true, severity: AlertSeverity.WARNING, threshold: metricThresholds.warning };
      }
      if (metricThresholds.info !== undefined && value < metricThresholds.info) {
        return { exceeded: true, severity: AlertSeverity.INFO, threshold: metricThresholds.info };
      }
    } else {
      // Normal thresholds - alert when value EXCEEDS threshold
      if (metricThresholds.critical !== undefined && value > metricThresholds.critical) {
        return { exceeded: true, severity: AlertSeverity.CRITICAL, threshold: metricThresholds.critical };
      }
      if (metricThresholds.warning !== undefined && value > metricThresholds.warning) {
        return { exceeded: true, severity: AlertSeverity.WARNING, threshold: metricThresholds.warning };
      }
      if (metricThresholds.info !== undefined && value > metricThresholds.info) {
        return { exceeded: true, severity: AlertSeverity.INFO, threshold: metricThresholds.info };
      }
    }

    return { exceeded: false, severity: null, threshold: null };
  }

  /**
   * Get threshold for a specific metric and severity
   */
  static getThreshold(
    category: keyof AlertThresholdsConfig,
    metric: string,
    severity: 'critical' | 'warning' | 'info'
  ): number | undefined {
    const categoryThresholds = this.config[category] as any;
    const metricThresholds = categoryThresholds[metric] as MetricThresholds;

    if (!metricThresholds) {
      return undefined;
    }

    return metricThresholds[severity];
  }

  /**
   * Reset to default thresholds
   */
  static resetToDefaults(): void {
    this.config = DEFAULT_ALERT_THRESHOLDS;
  }

  /**
   * Validate threshold configuration
   */
  static validateConfig(config: AlertThresholdsConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate that critical thresholds are more severe than warning thresholds
    const validateMetric = (
      category: string,
      metric: string,
      thresholds: MetricThresholds,
      inverted: boolean = false
    ) => {
      if (thresholds.critical !== undefined && thresholds.warning !== undefined) {
        if (inverted) {
          // For inverted thresholds, critical should be less than warning
          if (thresholds.critical > thresholds.warning) {
            errors.push(
              `${category}.${metric}: Critical threshold (${thresholds.critical}) must be less than warning threshold (${thresholds.warning}) for inverted metrics`
            );
          }
        } else {
          // For normal thresholds, critical should be greater than warning
          if (thresholds.critical < thresholds.warning) {
            errors.push(
              `${category}.${metric}: Critical threshold (${thresholds.critical}) must be greater than warning threshold (${thresholds.warning})`
            );
          }
        }
      }

      // All thresholds should be positive
      Object.entries(thresholds).forEach(([severity, value]) => {
        if (value !== undefined && value < 0) {
          errors.push(`${category}.${metric}.${severity}: Threshold must be positive (got ${value})`);
        }
      });
    };

    // Validate performance thresholds
    Object.entries(config.performance).forEach(([metric, thresholds]) => {
      const inverted = ['csvSuccessRate', 'throughput'].includes(metric);
      validateMetric('performance', metric, thresholds, inverted);
    });

    // Validate resource thresholds
    Object.entries(config.resources).forEach(([metric, thresholds]) => {
      validateMetric('resources', metric, thresholds);
    });

    // Validate worker thresholds
    Object.entries(config.worker).forEach(([metric, thresholds]) => {
      const inverted = metric === 'activeWorkers';
      validateMetric('worker', metric, thresholds, inverted);
    });

    // Validate error thresholds
    Object.entries(config.errors).forEach(([metric, thresholds]) => {
      validateMetric('errors', metric, thresholds);
    });

    // Validate business thresholds
    Object.entries(config.business).forEach(([metric, thresholds]) => {
      validateMetric('business', metric, thresholds);
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export for use in monitoring systems
export const getAlertThresholds = () => AlertThresholdManager.getConfig();
export const checkThreshold = (
  category: keyof AlertThresholdsConfig,
  metric: string,
  value: number,
  inverted?: boolean
) => AlertThresholdManager.checkThreshold(category, metric, value, inverted);

// Export inverted metrics list for reference
export const INVERTED_METRICS = {
  performance: ['csvSuccessRate', 'throughput'],
  worker: ['activeWorkers']
};
