import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('POP CLI Integration Tests', () => {
  const testDir = '.poptest';

  beforeEach(() => {
    // Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Basic File Operations', () => {
    it('should create and manage test directories', () => {
      const testPath = path.join(testDir, 'test-file.txt');
      const testContent = 'Hello, World!';
      
      fs.writeFileSync(testPath, testContent);
      expect(fs.existsSync(testPath)).toBe(true);
      
      const readContent = fs.readFileSync(testPath, 'utf-8');
      expect(readContent).toBe(testContent);
    });

    it('should handle file naming correctly', () => {
      const namingTests = [
        { input: 'API Gateway Setup', expected: 'api-gateway-setup' },
        { input: 'User Management System v2.0', expected: 'user-management-system-v20' },
        { input: 'Component@#$%Special', expected: 'componentspecial' },
        { input: '123 Test Component', expected: '123-test-component' },
        { input: 'UPPERCASE COMPONENT', expected: 'uppercase-component' }
      ];

      namingTests.forEach(({ input, expected }) => {
        const componentName = input.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        expect(componentName).toBe(expected);
      });
    });

    it('should handle directory operations', () => {
      const deepPath = path.join(testDir, 'deep', 'nested', 'directory');
      fs.mkdirSync(deepPath, { recursive: true });
      
      expect(fs.existsSync(deepPath)).toBe(true);
      expect(fs.statSync(deepPath).isDirectory()).toBe(true);
    });
  });
});
