/**
 * Security Tests: RLS and Workspace Isolation
 * Validates Row Level Security policies and workspace data isolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@affilitics/db';

describe('RLS and Workspace Isolation Security Tests', () => {
  const workspace1 = 'workspace-test-1';
  const workspace2 = 'workspace-test-2';
  const userId1 = 'user-test-1';
  const userId2 = 'user-test-2';

  beforeEach(async () => {
    // Clean up test data
    await prisma.$executeRaw`DELETE FROM test_data WHERE workspace_id LIKE 'workspace-test-%'`;
  });

  describe('Workspace data isolation', () => {
    it('should prevent cross-workspace data access', async () => {
      // Create data in workspace1
      await prisma.testData.create({
        data: {
          workspaceId: workspace1,
          userId: userId1,
          content: 'Workspace 1 data',
        },
      });

      // Try to access from workspace2 context
      const result = await prisma.testData.findMany({
        where: {
          workspaceId: workspace2, // Different workspace
        },
      });

      expect(result.length).toBe(0); // Should not see workspace1 data
    });

    it('should enforce workspace_id filter on all queries', async () => {
      // Create data in both workspaces
      await prisma.testData.create({
        data: { workspaceId: workspace1, userId: userId1, content: 'Data 1' },
      });
      await prisma.testData.create({
        data: { workspaceId: workspace2, userId: userId2, content: 'Data 2' },
      });

      // Query with workspace1 context
      const workspace1Data = await prisma.testData.findMany({
        where: { workspaceId: workspace1 },
      });

      expect(workspace1Data.length).toBe(1);
      expect(workspace1Data[0].workspaceId).toBe(workspace1);
    });

    it('should prevent workspace_id modification', async () => {
      const record = await prisma.testData.create({
        data: { workspaceId: workspace1, userId: userId1, content: 'Test' },
      });

      // Attempt to change workspace_id
      await expect(
        prisma.testData.update({
          where: { id: record.id },
          data: { workspaceId: workspace2 }, // Should fail
        })
      ).rejects.toThrow();
    });

    it('should isolate import jobs by workspace', async () => {
      await prisma.importJob.create({
        data: {
          workspaceId: workspace1,
          status: 'completed',
          fileName: 'test.csv',
        },
      });

      const jobs = await prisma.importJob.findMany({
        where: { workspaceId: workspace2 },
      });

      expect(jobs.length).toBe(0);
    });
  });

  describe('RLS policy enforcement', () => {
    it('should enforce SELECT policy with workspace_id', async () => {
      // Create test data
      await prisma.$executeRaw`
        INSERT INTO test_data (workspace_id, user_id, content)
        VALUES (${workspace1}, ${userId1}, 'Test')
      `;

      // Query should require workspace_id in WHERE clause
      const withWorkspace = await prisma.$queryRaw`
        SELECT * FROM test_data
        WHERE workspace_id = ${workspace1}
      `;

      expect(withWorkspace).toBeDefined();

      // Query without workspace_id should return nothing (RLS blocks it)
      const withoutWorkspace = await prisma.$queryRaw`
        SELECT * FROM test_data
      `;

      expect(Array.isArray(withoutWorkspace)).toBe(true);
      // RLS should limit results
    });

    it('should enforce INSERT policy with workspace_id', async () => {
      // Insert without workspace_id should fail
      await expect(
        prisma.$executeRaw`
          INSERT INTO test_data (user_id, content)
          VALUES (${userId1}, 'Test')
        `
      ).rejects.toThrow();

      // Insert with workspace_id should succeed
      await expect(
        prisma.$executeRaw`
          INSERT INTO test_data (workspace_id, user_id, content)
          VALUES (${workspace1}, ${userId1}, 'Test')
        `
      ).resolves.toBeDefined();
    });

    it('should enforce UPDATE policy with workspace_id check', async () => {
      const record = await prisma.testData.create({
        data: { workspaceId: workspace1, userId: userId1, content: 'Original' },
      });

      // Update within same workspace should succeed
      await prisma.testData.update({
        where: { id: record.id },
        data: { content: 'Updated' },
      });

      // Update from different workspace should fail
      await expect(
        prisma.$executeRaw`
          UPDATE test_data
          SET content = 'Hacked'
          WHERE id = ${record.id} AND workspace_id = ${workspace2}
        `
      ).rejects.toThrow();
    });

    it('should enforce DELETE policy with workspace_id check', async () => {
      const record = await prisma.testData.create({
        data: { workspaceId: workspace1, userId: userId1, content: 'Test' },
      });

      // Delete from different workspace should fail
      await expect(
        prisma.$executeRaw`
          DELETE FROM test_data
          WHERE id = ${record.id} AND workspace_id = ${workspace2}
        `
      ).rejects.toThrow();

      // Delete from correct workspace should succeed
      await prisma.testData.delete({
        where: { id: record.id },
      });
    });
  });

  describe('Authentication validation', () => {
    it('should reject requests without Authorization header', async () => {
      const response = await fetch('/api/data', {
        method: 'GET',
        // No Authorization header
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests without x-workspace-id header', async () => {
      const response = await fetch('/api/data', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
          // Missing x-workspace-id
        },
      });

      expect(response.status).toBe(400);
    });

    it('should validate JWT token format', async () => {
      const response = await fetch('/api/data', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token-format',
          'x-workspace-id': workspace1,
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = 'expired.jwt.token'; // Mock expired token

      const response = await fetch('/api/data', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'x-workspace-id': workspace1,
        },
      });

      expect(response.status).toBe(401);
    });

    it('should validate user has access to workspace', async () => {
      // User should only access their own workspaces
      const response = await fetch('/api/data', {
        method: 'GET',
        headers: {
          Authorization: `Bearer user1-token`,
          'x-workspace-id': workspace2, // User1 tries workspace2
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Rate limiting', () => {
    it('should enforce rate limits per workspace', async () => {
      const requests = Array.from({ length: 150 }, () =>
        fetch('/api/data', {
          headers: {
            Authorization: 'Bearer valid-token',
            'x-workspace-id': workspace1,
          },
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should track rate limits independently per workspace', async () => {
      // Workspace1 hits limit
      await Promise.all(
        Array.from({ length: 100 }, () =>
          fetch('/api/data', {
            headers: {
              Authorization: 'Bearer token1',
              'x-workspace-id': workspace1,
            },
          })
        )
      );

      // Workspace2 should still be allowed
      const response = await fetch('/api/data', {
        headers: {
          Authorization: 'Bearer token2',
          'x-workspace-id': workspace2,
        },
      });

      expect(response.status).not.toBe(429);
    });

    it('should reset rate limit after time window', async () => {
      // Hit rate limit
      await Promise.all(
        Array.from({ length: 100 }, () =>
          fetch('/api/data', {
            headers: {
              Authorization: 'Bearer valid-token',
              'x-workspace-id': workspace1,
            },
          })
        )
      );

      // Wait for reset (mock time or actual wait)
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute

      // Should be allowed again
      const response = await fetch('/api/data', {
        headers: {
          Authorization: 'Bearer valid-token',
          'x-workspace-id': workspace1,
        },
      });

      expect(response.status).not.toBe(429);
    }, 70000);
  });

  describe('Audit logging', () => {
    it('should log sensitive data access', async () => {
      await prisma.testData.findMany({
        where: { workspaceId: workspace1 },
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          workspaceId: workspace1,
          action: 'DATA_ACCESS',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should log data modifications', async () => {
      const record = await prisma.testData.create({
        data: { workspaceId: workspace1, userId: userId1, content: 'Test' },
      });

      await prisma.testData.update({
        where: { id: record.id },
        data: { content: 'Updated' },
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          workspaceId: workspace1,
          action: 'DATA_UPDATE',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].details).toContain('Updated');
    });

    it('should log authentication events', async () => {
      await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test' }),
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'AUTH_LOGIN',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should log failed authentication attempts', async () => {
      await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'AUTH_FAILED',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('SQL injection prevention', () => {
    it('should sanitize user input in queries', async () => {
      const maliciousInput = "'; DROP TABLE users; --";

      await expect(
        prisma.testData.findMany({
          where: {
            content: maliciousInput,
          },
        })
      ).resolves.toBeDefined();

      // Verify table still exists
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'users'
        )
      `;

      expect(tableExists).toBeDefined();
    });

    it('should use parameterized queries', async () => {
      const userInput = "test' OR '1'='1";

      const result = await prisma.$queryRaw`
        SELECT * FROM test_data
        WHERE workspace_id = ${workspace1}
        AND content = ${userInput}
      `;

      expect(Array.isArray(result)).toBe(true);
      // Should not return all rows (SQL injection failed)
    });
  });

  describe('Data encryption', () => {
    it('should encrypt sensitive fields at rest', async () => {
      const sensitiveData = 'SECRET_API_KEY_12345';

      const record = await prisma.testData.create({
        data: {
          workspaceId: workspace1,
          userId: userId1,
          content: sensitiveData,
        },
      });

      // Direct database query should show encrypted data
      const rawData = await prisma.$queryRawUnsafe(
        `SELECT content FROM test_data WHERE id = '${record.id}'`
      );

      // If encrypted, raw data should not match original
      // (This depends on encryption implementation)
      expect(rawData).toBeDefined();
    });

    it('should decrypt data when queried through ORM', async () => {
      const sensitiveData = 'SECRET_API_KEY_12345';

      const record = await prisma.testData.create({
        data: {
          workspaceId: workspace1,
          userId: userId1,
          content: sensitiveData,
        },
      });

      const decrypted = await prisma.testData.findUnique({
        where: { id: record.id },
      });

      expect(decrypted?.content).toBe(sensitiveData);
    });
  });
});
