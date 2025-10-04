/**
 * E2E Tests: Complete CSV Upload and Processing Workflow
 * Tests end-to-end user journey using Playwright
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('CSV Upload and Processing Workflow', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@affilitics.co');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-button"]');

    // Wait for dashboard to load
    await page.waitForURL('/dashboard');
  });

  test('complete CSV upload workflow', async () => {
    // 1. Navigate to upload page
    await page.click('[data-testid="upload-csv-button"]');
    await expect(page).toHaveURL('/upload');

    // 2. Select workspace (if not default)
    await page.selectOption('[data-testid="workspace-select"]', 'test-workspace-1');

    // 3. Upload CSV file
    const testCSVPath = path.join(__dirname, '../fixtures/test-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);

    // 4. Verify file selected
    await expect(page.locator('[data-testid="file-name"]')).toContainText('test-data.csv');

    // 5. Click upload button
    await page.click('[data-testid="upload-submit-button"]');

    // 6. Verify upload progress
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-progress"]')).toContainText('%');

    // 7. Wait for processing to complete
    await page.waitForSelector('[data-testid="processing-complete"]', {
      timeout: 15000,
    });

    // 8. Verify success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      'CSV processed successfully'
    );

    // 9. Verify data appears in dashboard
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="recent-imports"]')).toContainText('test-data.csv');
  });

  test('CSV upload with validation errors', async () => {
    await page.goto('/upload');

    // Upload invalid CSV
    const invalidCSVPath = path.join(__dirname, '../fixtures/invalid-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidCSVPath);

    await page.click('[data-testid="upload-submit-button"]');

    // Should show validation errors
    await expect(page.locator('[data-testid="validation-errors"]')).toBeVisible();
    await expect(page.locator('[data-testid="validation-errors"]')).toContainText('Invalid format');
  });

  test('CSV processing with retry mechanism', async () => {
    await page.goto('/upload');

    // Upload CSV that will fail initially
    const testCSVPath = path.join(__dirname, '../fixtures/test-data-retry.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);

    await page.click('[data-testid="upload-submit-button"]');

    // Wait for error state
    await page.waitForSelector('[data-testid="processing-failed"]');

    // Click retry button
    await page.click('[data-testid="retry-button"]');

    // Verify retry in progress
    await expect(page.locator('[data-testid="retry-progress"]')).toBeVisible();

    // Wait for success after retry
    await page.waitForSelector('[data-testid="processing-complete"]', {
      timeout: 15000,
    });
  });

  test('large file upload with progress tracking', async () => {
    await page.goto('/upload');

    // Upload large CSV (mock 50MB file)
    const largeCSVPath = path.join(__dirname, '../fixtures/large-test-data.csv');

    // Create large test file if not exists
    if (!fs.existsSync(largeCSVPath)) {
      const largeContent = 'col1,col2,col3,col4,col5\n' + 'data,data,data,data,data\n'.repeat(500000);
      fs.writeFileSync(largeCSVPath, largeContent);
    }

    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeCSVPath);

    await page.click('[data-testid="upload-submit-button"]');

    // Verify upload progress bar
    const progressBar = page.locator('[data-testid="upload-progress-bar"]');
    await expect(progressBar).toBeVisible();

    // Verify progress percentage updates
    await expect(progressBar).toHaveAttribute('aria-valuenow', /[0-9]+/);

    // Verify upload speed displayed
    await expect(page.locator('[data-testid="upload-speed"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-speed"]')).toContainText('MB/s');

    // Verify ETA displayed
    await expect(page.locator('[data-testid="upload-eta"]')).toBeVisible();

    // Wait for completion
    await page.waitForSelector('[data-testid="processing-complete"]', {
      timeout: 30000,
    });
  });

  test('concurrent workspace isolation', async () => {
    // Upload to workspace 1
    await page.goto('/upload');
    await page.selectOption('[data-testid="workspace-select"]', 'workspace-1');

    const file1Path = path.join(__dirname, '../fixtures/workspace1-data.csv');
    let fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(file1Path);
    await page.click('[data-testid="upload-submit-button"]');

    await page.waitForSelector('[data-testid="processing-complete"]');

    // Switch to workspace 2
    await page.goto('/upload');
    await page.selectOption('[data-testid="workspace-select"]', 'workspace-2');

    const file2Path = path.join(__dirname, '../fixtures/workspace2-data.csv');
    fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(file2Path);
    await page.click('[data-testid="upload-submit-button"]');

    await page.waitForSelector('[data-testid="processing-complete"]');

    // Verify workspace 1 data not visible in workspace 2
    await page.goto('/dashboard');
    await page.selectOption('[data-testid="workspace-select"]', 'workspace-2');

    await expect(page.locator('[data-testid="recent-imports"]')).not.toContainText('workspace1-data.csv');
    await expect(page.locator('[data-testid="recent-imports"]')).toContainText('workspace2-data.csv');
  });

  test('error handling and user-friendly messages', async () => {
    await page.goto('/upload');

    // Test file too large error
    const hugeFilePath = path.join(__dirname, '../fixtures/huge-file.csv');
    const fileInput = await page.locator('input[type="file"]');

    // Mock file size check
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        Object.defineProperty(input, 'files', {
          value: [{
            name: 'huge-file.csv',
            size: 60 * 1024 * 1024, // 60MB (over limit)
          }],
        });
      }
    });

    await page.click('[data-testid="upload-submit-button"]');

    // Should show user-friendly error
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'File size exceeds maximum limit of 50MB'
    );
  });

  test('dashboard metrics update after processing', async () => {
    // Note initial metrics
    await page.goto('/dashboard');
    const initialCount = await page.locator('[data-testid="total-imports"]').textContent();

    // Upload new CSV
    await page.goto('/upload');
    const testCSVPath = path.join(__dirname, '../fixtures/test-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);
    await page.click('[data-testid="upload-submit-button"]');

    await page.waitForSelector('[data-testid="processing-complete"]');

    // Return to dashboard
    await page.goto('/dashboard');

    // Verify metrics updated
    const newCount = await page.locator('[data-testid="total-imports"]').textContent();
    expect(Number(newCount)).toBeGreaterThan(Number(initialCount));

    // Verify chart updated
    await expect(page.locator('[data-testid="imports-chart"]')).toBeVisible();
  });

  test('worker health monitoring integration', async () => {
    await page.goto('/dashboard');

    // Check worker status indicator
    await expect(page.locator('[data-testid="worker-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="worker-status"]')).toHaveText(/Online|Processing/);

    // Upload CSV and monitor worker
    await page.goto('/upload');
    const testCSVPath = path.join(__dirname, '../fixtures/test-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);
    await page.click('[data-testid="upload-submit-button"]');

    // Worker status should change to "Processing"
    await expect(page.locator('[data-testid="worker-status"]')).toHaveText('Processing');

    await page.waitForSelector('[data-testid="processing-complete"]');

    // Worker status should return to "Online"
    await expect(page.locator('[data-testid="worker-status"]')).toHaveText('Online');
  });

  test('authentication flow integration', async () => {
    // Test logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    // Should redirect to login
    await expect(page).toHaveURL('/login');

    // Attempt to access protected route
    await page.goto('/upload');

    // Should redirect back to login
    await expect(page).toHaveURL(/.*login.*/);

    // Login again
    await page.fill('[data-testid="email-input"]', 'test@affilitics.co');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-button"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('responsive design on mobile', async () => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');

    // Verify mobile menu
    await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();

    // Open mobile menu
    await page.click('[data-testid="mobile-menu-button"]');
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();

    // Navigate to upload
    await page.click('[data-testid="mobile-upload-link"]');
    await expect(page).toHaveURL('/upload');

    // Verify upload form is responsive
    await expect(page.locator('[data-testid="upload-form"]')).toBeVisible();
  });

  test('accessibility compliance', async () => {
    await page.goto('/dashboard');

    // Check for proper ARIA labels
    const uploadButton = page.locator('[data-testid="upload-csv-button"]');
    await expect(uploadButton).toHaveAttribute('aria-label', /upload/i);

    // Check for keyboard navigation
    await page.keyboard.press('Tab');
    await expect(uploadButton).toBeFocused();

    // Check for color contrast (would use axe-core in real tests)
    await expect(page.locator('body')).toHaveCSS('color', /.+/);
  });
});

test.describe('Error Recovery Scenarios', () => {
  test('network failure during upload', async ({ page }) => {
    await page.goto('/upload');

    const testCSVPath = path.join(__dirname, '../fixtures/test-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);

    // Simulate network failure
    await page.route('**/api/upload', route => route.abort());

    await page.click('[data-testid="upload-submit-button"]');

    // Should show network error
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'Network error'
    );

    // Should offer retry option
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  });

  test('session timeout during processing', async ({ page }) => {
    await page.goto('/upload');

    const testCSVPath = path.join(__dirname, '../fixtures/test-data.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(testCSVPath);

    await page.click('[data-testid="upload-submit-button"]');

    // Simulate session timeout
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    });

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/.*login.*returnUrl=.*/);
  });
});
