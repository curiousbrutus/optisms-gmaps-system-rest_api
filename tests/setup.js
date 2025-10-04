import { beforeAll } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
beforeAll(() => {
  dotenv.config({ path: '.env.test' });
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:'; // Use in-memory database for tests
  process.env.LOG_LEVEL = 'silent';
  process.env.ENABLE_CACHE = 'false';
});
