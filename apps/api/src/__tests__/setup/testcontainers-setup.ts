/**
 * Jest setup for TestContainers integration tests
 * Manages PostgreSQL container lifecycle for database integration tests
 */

import { TestDatabase } from '../utils/test-database';

let testDb: TestDatabase | null = null;

// Setup TestContainers before all tests
beforeAll(async () => {
  console.log('Setting up TestContainers for integration tests...');
  
  testDb = TestDatabase.getInstance();
  await testDb.setup();
  
  console.log('TestContainers setup complete');
}, 120000); // 120 second timeout for container startup

// Reset database before each test for isolation
beforeEach(async () => {
  if (testDb) {
    await testDb.reset();
  }
}, 10000);

// Cleanup TestContainers after all tests
afterAll(async () => {
  console.log('Tearing down TestContainers...');
  
  if (testDb) {
    await testDb.cleanup();
    testDb = null;
  }
  
  await TestDatabase.teardown();
  
  console.log('TestContainers teardown complete');
}, 30000); // 30 second timeout for cleanup

/**
 * Get test database instance for use in tests
 */
export const getTestDb = (): TestDatabase => {
  if (!testDb) {
    throw new Error('Test database not initialized. Ensure testcontainers-setup.ts is included in Jest setup.');
  }
  return testDb;
};