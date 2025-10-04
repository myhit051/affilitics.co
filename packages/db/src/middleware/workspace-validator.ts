/**
 * Workspace Isolation Validation Middleware
 * 
 * Provides comprehensive workspace isolation validation to ensure:
 * - Complete data segregation between workspaces
 * - Proper authentication and authorization checks
 * - Zero tolerance for cross-workspace data access
 * - Audit logging for all workspace access attempts
 */

import { Request, Response, NextFunction } from 'express';
import { SecurityService } from '../services/security-service.js';
import { prisma } from '../index.js';

// Types for workspace validation
export interface WorkspaceValidationRequest extends Request {
  user?: {
    id: string;
    email: string;
    workspaces: Array<{
      workspaceId: string;
      role: string;
      permissions: string[];
    }>;
  };
  workspace?: {
    id: string;
    name: string;
    role: string;
    permissions: string[];
  };
  validationContext?: {
    ipAddress: string;
    userAgent: string;
    requestId: string;
    timestamp: Date;
  };
}

export interface WorkspaceValidationOptions {
  requireWorkspace?: boolean;
  minRole?: 'viewer' | 'member' | 'admin' | 'owner';
  allowedOperations?: string[];
  auditSensitive?: boolean;
  skipValidation?: boolean;
  customValidator?: (req: WorkspaceValidationRequest) => Promise<boolean>;
}

export interface ValidationResult {
  success: boolean;
  user?: any;
  workspace?: any;
  error?: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Core workspace validation middleware
 */
export class WorkspaceValidator {
  private static readonly WORKSPACE_HEADER = 'x-workspace-id';
  private static readonly AUTH_HEADER = 'authorization';
  private static readonly REQUEST_ID_HEADER = 'x-request-id';

  /**
   * Main workspace validation middleware factory
   */
  static createValidator(options: WorkspaceValidationOptions = {}) {
    return async (req: WorkspaceValidationRequest, res: Response, next: NextFunction) => {
      try {
        // Skip validation if explicitly requested (for public endpoints)
        if (options.skipValidation) {
          return next();
        }

        // Generate request context
        const context = WorkspaceValidator.generateRequestContext(req);
        req.validationContext = context;

        // Validate authentication first
        const authResult = await WorkspaceValidator.validateAuthentication(req);
        if (!authResult.success) {
          return WorkspaceValidator.handleValidationFailure(
            res, 
            authResult.error || 'Authentication failed',
            401,
            { context, type: 'authentication_failed' }
          );
        }

        req.user = authResult.user;

        // Validate workspace access if required
        if (options.requireWorkspace !== false) {
          const workspaceResult = await WorkspaceValidator.validateWorkspaceAccess(
            req, 
            options
          );
          
          if (!workspaceResult.success) {
            return WorkspaceValidator.handleValidationFailure(
              res,
              workspaceResult.error || 'Workspace access denied',
              403,
              { 
                context, 
                type: 'workspace_access_denied',
                workspaceId: req.headers[WorkspaceValidator.WORKSPACE_HEADER],
                details: workspaceResult.details
              }
            );
          }

          req.workspace = workspaceResult.workspace;
        }

        // Run custom validation if provided
        if (options.customValidator) {
          const customResult = await options.customValidator(req);
          if (!customResult) {
            return WorkspaceValidator.handleValidationFailure(
              res,
              'Custom validation failed',
              403,
              { context, type: 'custom_validation_failed' }
            );
          }
        }

        // Audit sensitive operations
        if (options.auditSensitive && req.workspace) {
          await WorkspaceValidator.auditWorkspaceAccess(req, options);
        }

        // Add security headers to response
        WorkspaceValidator.addSecurityHeaders(res, req);

        next();
      } catch (error) {
        console.error('Workspace validation error:', error);
        return WorkspaceValidator.handleValidationFailure(
          res,
          'Internal validation error',
          500,
          { 
            context: req.validationContext,
            type: 'validation_error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        );
      }
    };
  }

  /**
   * Validate user authentication
   */
  private static async validateAuthentication(req: WorkspaceValidationRequest): Promise<ValidationResult> {
    const authHeader = req.headers[WorkspaceValidator.AUTH_HEADER] as string;
    
    if (!authHeader) {
      return {
        success: false,
        error: 'No authorization header provided',
        code: 'NO_AUTH_HEADER'
      };
    }

    try {
      const authResult = await SecurityService.validateAuthToken(authHeader);
      
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error || 'Invalid authentication token',
          code: 'INVALID_TOKEN'
        };
      }

      return {
        success: true,
        user: authResult.user
      };
    } catch (error) {
      return {
        success: false,
        error: 'Authentication validation failed',
        code: 'AUTH_VALIDATION_ERROR',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Validate workspace access and permissions
   */
  private static async validateWorkspaceAccess(
    req: WorkspaceValidationRequest,
    options: WorkspaceValidationOptions
  ): Promise<ValidationResult> {
    const workspaceId = req.headers[WorkspaceValidator.WORKSPACE_HEADER] as string;
    
    if (!workspaceId) {
      return {
        success: false,
        error: 'No workspace ID provided in headers',
        code: 'NO_WORKSPACE_ID'
      };
    }

    // Validate workspace ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId)) {
      return {
        success: false,
        error: 'Invalid workspace ID format',
        code: 'INVALID_WORKSPACE_FORMAT'
      };
    }

    if (!req.user) {
      return {
        success: false,
        error: 'User not authenticated',
        code: 'USER_NOT_AUTHENTICATED'
      };
    }

    try {
      // Check if user has access to the workspace
      const validation = await SecurityService.validateWorkspaceAccess(
        req.user.id,
        workspaceId,
        options.minRole
      );

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors[0] || 'Workspace access denied',
          code: 'WORKSPACE_ACCESS_DENIED',
          details: { errors: validation.errors, warnings: validation.warnings }
        };
      }

      // Get workspace details and user's role
      const workspace = await WorkspaceValidator.getWorkspaceDetails(workspaceId, req.user.id);
      
      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found or access denied',
          code: 'WORKSPACE_NOT_FOUND'
        };
      }

      // Validate specific operations if required
      if (options.allowedOperations) {
        const operationAllowed = await WorkspaceValidator.validateOperation(
          workspace,
          req.method,
          req.path,
          options.allowedOperations
        );

        if (!operationAllowed) {
          return {
            success: false,
            error: 'Operation not allowed for current role',
            code: 'OPERATION_NOT_ALLOWED',
            details: { 
              method: req.method, 
              path: req.path, 
              role: workspace.role,
              allowedOperations: options.allowedOperations
            }
          };
        }
      }

      return {
        success: true,
        workspace
      };
    } catch (error) {
      return {
        success: false,
        error: 'Workspace validation failed',
        code: 'WORKSPACE_VALIDATION_ERROR',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Get detailed workspace information for validated user
   */
  private static async getWorkspaceDetails(workspaceId: string, userId: string) {
    try {
      const result = await prisma.workspace.findFirst({
        where: { id: workspaceId },
        include: {
          members: {
            where: { userId },
            select: {
              role: true,
              createdAt: true
            }
          }
        }
      });

      if (!result || result.members.length === 0) {
        return null;
      }

      const member = result.members[0];
      const permissions = WorkspaceValidator.getRolePermissions(member.role);

      return {
        id: result.id,
        name: result.name,
        plan: result.plan,
        role: member.role,
        permissions,
        memberSince: member.createdAt
      };
    } catch (error) {
      console.error('Failed to get workspace details:', error);
      return null;
    }
  }

  /**
   * Validate specific operations based on role and permissions
   */
  private static async validateOperation(
    workspace: any,
    method: string,
    path: string,
    allowedOperations: string[]
  ): Promise<boolean> {
    const operation = `${method.toLowerCase()}_${path.split('/').pop()}`;
    
    // Check if operation is explicitly allowed
    if (allowedOperations.includes(operation)) {
      return true;
    }

    // Check role-based permissions
    const rolePermissions = WorkspaceValidator.getRolePermissions(workspace.role);
    
    // Map HTTP methods to permission requirements
    const methodPermissions: Record<string, string[]> = {
      'GET': ['read'],
      'POST': ['write'],
      'PUT': ['write'],
      'PATCH': ['write'],
      'DELETE': ['delete']
    };

    const requiredPermissions = methodPermissions[method.toUpperCase()] || ['read'];
    
    return requiredPermissions.some(perm => 
      rolePermissions.includes(perm) || rolePermissions.includes('*')
    );
  }

  /**
   * Get permissions for a given role
   */
  private static getRolePermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      viewer: ['read'],
      member: ['read', 'write'],
      admin: ['read', 'write', 'delete', 'manage_users'],
      owner: ['*'] // All permissions
    };

    return permissions[role] || [];
  }

  /**
   * Generate request context for audit and security
   */
  private static generateRequestContext(req: Request) {
    return {
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      requestId: req.get(WorkspaceValidator.REQUEST_ID_HEADER) || 
                 `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      method: req.method,
      path: req.path,
      headers: {
        authorization: req.get('authorization') ? 'Bearer [REDACTED]' : undefined,
        workspace: req.get(WorkspaceValidator.WORKSPACE_HEADER),
        contentType: req.get('content-type')
      }
    };
  }

  /**
   * Audit workspace access for sensitive operations
   */
  private static async auditWorkspaceAccess(
    req: WorkspaceValidationRequest,
    options: WorkspaceValidationOptions
  ) {
    try {
      await SecurityService.auditSecurityEvent(
        'workspace_access',
        req.user?.id,
        req.workspace?.id,
        {
          method: req.method,
          path: req.path,
          role: req.workspace?.role,
          minRole: options.minRole,
          ipAddress: req.validationContext?.ipAddress,
          userAgent: req.validationContext?.userAgent,
          requestId: req.validationContext?.requestId,
          timestamp: req.validationContext?.timestamp
        }
      );
    } catch (error) {
      console.error('Failed to audit workspace access:', error);
    }
  }

  /**
   * Add security headers to response
   */
  private static addSecurityHeaders(res: Response, req: WorkspaceValidationRequest) {
    // Add workspace context headers for downstream services
    if (req.workspace) {
      res.set('X-Workspace-ID', req.workspace.id);
      res.set('X-User-Role', req.workspace.role);
    }
    
    if (req.user) {
      res.set('X-User-ID', req.user.id);
    }

    if (req.validationContext) {
      res.set('X-Request-ID', req.validationContext.requestId);
    }

    // Security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
  }

  /**
   * Handle validation failures with proper error response and audit
   */
  private static async handleValidationFailure(
    res: Response,
    message: string,
    statusCode: number,
    auditData?: any
  ) {
    // Audit the security violation
    if (auditData) {
      try {
        await SecurityService.auditSecurityEvent(
          'validation_failure',
          auditData.context?.userId,
          auditData.workspaceId,
          {
            message,
            statusCode,
            type: auditData.type,
            ipAddress: auditData.context?.ipAddress,
            userAgent: auditData.context?.userAgent,
            requestId: auditData.context?.requestId,
            details: auditData.details
          }
        );
      } catch (error) {
        console.error('Failed to audit validation failure:', error);
      }
    }

    // Return appropriate error response
    return res.status(statusCode).json({
      success: false,
      error: message,
      code: auditData?.type?.toUpperCase() || 'VALIDATION_FAILED',
      timestamp: new Date().toISOString(),
      requestId: auditData?.context?.requestId
    });
  }

  /**
   * Express middleware for API routes that require workspace validation
   */
  static requireWorkspace(options: Omit<WorkspaceValidationOptions, 'requireWorkspace'> = {}) {
    return WorkspaceValidator.createValidator({
      ...options,
      requireWorkspace: true,
      auditSensitive: options.auditSensitive !== false
    });
  }

  /**
   * Express middleware for API routes that require admin access
   */
  static requireAdmin(options: Omit<WorkspaceValidationOptions, 'minRole'> = {}) {
    return WorkspaceValidator.createValidator({
      ...options,
      minRole: 'admin',
      auditSensitive: true
    });
  }

  /**
   * Express middleware for API routes that require owner access
   */
  static requireOwner(options: Omit<WorkspaceValidationOptions, 'minRole'> = {}) {
    return WorkspaceValidator.createValidator({
      ...options,
      minRole: 'owner',
      auditSensitive: true
    });
  }

  /**
   * Express middleware for public routes (no validation)
   */
  static public() {
    return WorkspaceValidator.createValidator({
      skipValidation: true
    });
  }

  /**
   * Validate workspace isolation at the database level
   */
  static async validateDatabaseIsolation(
    workspaceId: string,
    tableName: string,
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  ): Promise<boolean> {
    try {
      // Verify that RLS policies are enforced
      const testQuery = await prisma.$queryRaw`
        SELECT 1 FROM ${tableName} 
        WHERE workspace_id != ${workspaceId} 
        LIMIT 1
      `;

      // If query returns data, RLS is not properly configured
      return Array.isArray(testQuery) && testQuery.length === 0;
    } catch (error) {
      // RLS should block unauthorized access
      return error instanceof Error && error.message.includes('permission denied');
    }
  }
}

// Export convenience functions
export const requireWorkspace = WorkspaceValidator.requireWorkspace;
export const requireAdmin = WorkspaceValidator.requireAdmin;
export const requireOwner = WorkspaceValidator.requireOwner;
export const publicRoute = WorkspaceValidator.public;

// Export types
export type { WorkspaceValidationRequest, WorkspaceValidationOptions, ValidationResult };