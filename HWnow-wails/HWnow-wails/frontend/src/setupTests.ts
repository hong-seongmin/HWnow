// Jest setup file for widget sizing tests

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Capture console output during tests
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

// Global test utilities
global.console = {
  ...console,
  // Keep error and warn for important feedback
  error: console.error,
  warn: console.warn,
  log: jest.fn(),
};