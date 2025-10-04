/**
 * Environment Configuration Service
 * 
 * Manages application configuration with environment variable validation,
 * type safety, and runtime configuration management for production readiness.
 */

// Configuration types for type safety
export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  enableLogging: boolean;
}

export interface RedisConfig {
  url: string;
  maxRetries: number;
  retryDelay: number;
  keyPrefix: string;
}

export interface WorkerConfig {
  maxConcurrency: number;
  jobTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  heartbeatInterval: number;
  healthCheckInterval: number;
}

export interface SecurityConfig {
  jwtSecret: string;
  sessionTimeout: number;
  bcryptRounds: number;
  rateLimitWindow: number;
  rateLimitMax: number;
  corsOrigins: string[];
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  metricsPort: number;
  errorReporting: boolean;
  logLevel: string;
  alertWebhooks: string[];
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: DatabaseConfig;
  redis: RedisConfig;
  worker: WorkerConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
}

// Environment variable validation
const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value || defaultValue!;
};

const getEnvNumber = (name: string, defaultValue?: number): number => {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  const parsed = parseInt(value || defaultValue!.toString(), 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
};

const getEnvBoolean = (name: string, defaultValue: boolean = false): boolean => {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

const getEnvArray = (name: string, defaultValue: string[] = []): string[] => {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(Boolean);
};

// Load and validate configuration
export const loadConfig = (): AppConfig => {
  try {
    const config: AppConfig = {
      nodeEnv: getEnvVar('NODE_ENV', 'development'),
      port: getEnvNumber('PORT', 3000),
      
      database: {
        url: getEnvVar('DATABASE_URL'),
        maxConnections: getEnvNumber('DB_MAX_CONNECTIONS', 10),
        connectionTimeout: getEnvNumber('DB_CONNECTION_TIMEOUT', 10000),
        queryTimeout: getEnvNumber('DB_QUERY_TIMEOUT', 60000),
        enableLogging: getEnvBoolean('DB_ENABLE_LOGGING', false),
      },
      
      redis: {
        url: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
        maxRetries: getEnvNumber('REDIS_MAX_RETRIES', 3),
        retryDelay: getEnvNumber('REDIS_RETRY_DELAY', 1000),
        keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'affilitics:'),
      },
      
      worker: {
        maxConcurrency: getEnvNumber('WORKER_MAX_CONCURRENCY', 5),
        jobTimeout: getEnvNumber('WORKER_JOB_TIMEOUT', 300000), // 5 minutes
        retryAttempts: getEnvNumber('WORKER_RETRY_ATTEMPTS', 3),
        retryDelay: getEnvNumber('WORKER_RETRY_DELAY', 5000),
        heartbeatInterval: getEnvNumber('WORKER_HEARTBEAT_INTERVAL', 30000),
        healthCheckInterval: getEnvNumber('WORKER_HEALTH_CHECK_INTERVAL', 60000),
      },
      
      security: {
        jwtSecret: getEnvVar('JWT_SECRET', 'dev-secret-change-in-production'),
        sessionTimeout: getEnvNumber('SESSION_TIMEOUT', 3600000), // 1 hour
        bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),
        rateLimitWindow: getEnvNumber('RATE_LIMIT_WINDOW', 900000), // 15 minutes
        rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
        corsOrigins: getEnvArray('CORS_ORIGINS', ['http://localhost:3000']),
      },
      
      monitoring: {
        enableMetrics: getEnvBoolean('ENABLE_METRICS', true),
        metricsPort: getEnvNumber('METRICS_PORT', 9090),
        errorReporting: getEnvBoolean('ERROR_REPORTING', false),
        logLevel: getEnvVar('LOG_LEVEL', 'info'),
        alertWebhooks: getEnvArray('ALERT_WEBHOOKS', []),
      },
    };

    // Validate critical configuration
    validateConfig(config);
    
    return config;
  } catch (error) {
    console.error('Configuration loading failed:', error);
    throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Configuration validation
const validateConfig = (config: AppConfig): void => {
  // Validate database URL format
  if (!config.database.url.startsWith('postgresql://') && !config.database.url.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  // Validate JWT secret in production
  if (config.nodeEnv === 'production' && config.security.jwtSecret === 'dev-secret-change-in-production') {
    throw new Error('JWT_SECRET must be set to a secure value in production');
  }

  // Validate worker configuration
  if (config.worker.maxConcurrency < 1) {
    throw new Error('WORKER_MAX_CONCURRENCY must be at least 1');
  }

  if (config.worker.retryAttempts < 0) {
    throw new Error('WORKER_RETRY_ATTEMPTS must be 0 or greater');
  }

  // Validate security configuration
  if (config.security.bcryptRounds < 10) {
    throw new Error('BCRYPT_ROUNDS must be at least 10 for security');
  }

  // Validate log level
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.monitoring.logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
};

// Singleton configuration instance
let configInstance: AppConfig | null = null;

export const getConfig = (): AppConfig => {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
};

// Helper functions for accessing specific config sections
export const getDatabaseConfig = (): DatabaseConfig => getConfig().database;
export const getRedisConfig = (): RedisConfig => getConfig().redis;
export const getWorkerConfig = (): WorkerConfig => getConfig().worker;
export const getSecurityConfig = (): SecurityConfig => getConfig().security;
export const getMonitoringConfig = (): MonitoringConfig => getConfig().monitoring;

// Environment detection helpers
export const isProduction = (): boolean => getConfig().nodeEnv === 'production';
export const isDevelopment = (): boolean => getConfig().nodeEnv === 'development';
export const isTest = (): boolean => getConfig().nodeEnv === 'test';

// Configuration update for testing
export const resetConfig = (): void => {
  configInstance = null;
};

// Health check for configuration
export const validateConfiguration = (): { valid: boolean; errors: string[] } => {
  try {
    const config = getConfig();
    validateConfig(config);
    return { valid: true, errors: [] };
  } catch (error) {
    return { 
      valid: false, 
      errors: [error instanceof Error ? error.message : 'Unknown configuration error'] 
    };
  }
};

// Configuration export for external monitoring
export const getConfigForHealth = () => {
  const config = getConfig();
  return {
    nodeEnv: config.nodeEnv,
    database: {
      connected: true, // This will be enhanced with actual connection status
      maxConnections: config.database.maxConnections,
    },
    worker: {
      maxConcurrency: config.worker.maxConcurrency,
      heartbeatInterval: config.worker.heartbeatInterval,
    },
    monitoring: {
      enabled: config.monitoring.enableMetrics,
      logLevel: config.monitoring.logLevel,
    },
  };
};