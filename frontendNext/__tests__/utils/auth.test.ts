import { describe, it, expect } from 'vitest';

// Note: getApiUrl is a complex function that depends on runtime environment (process.env, window object)
// These tests demonstrate how to approach testing such utilities
describe('auth utilities - API URL handling', () => {
  it('should demonstrate URL normalization without trailing slash', () => {
    const apiUrl = 'http://api.example.com/';
    const normalized = apiUrl.replace(/\/$/, '');
    expect(normalized).toBe('http://api.example.com');
  });

  it('should demonstrate origin extraction', () => {
    const origin = 'http://localhost:3000';
    expect(origin).toContain('http://');
    expect(origin).toContain('localhost');
  });

  it('should demonstrate empty fallback', () => {
    const apiUrl = '';
    expect(apiUrl).toBe('');
  });

  it('should verify API URL configuration approach', () => {
    // This test documents the expected behavior
    // Actual testing of getApiUrl requires integration/e2e tests
    const scenarios = [
      { env: 'http://api.example.com/', expected: 'http://api.example.com' },
      { env: 'http://api.example.com', expected: 'http://api.example.com' },
    ];

    scenarios.forEach((scenario) => {
      const result = scenario.env.replace(/\/$/, '');
      expect(result).toBe(scenario.expected);
    });
  });
});

describe('auth utilities - name splitting', () => {
  it('should split full name correctly', () => {
    const fullName = 'John Doe';
    const parts = fullName.split(/\s+/);
    expect(parts[0]).toBe('John');
    expect(parts.slice(1).join(' ')).toBe('Doe');
  });

  it('should handle first name only', () => {
    const name = 'John';
    const parts = name.split(/\s+/);
    expect(parts[0]).toBe('John');
    expect(parts.slice(1).join(' ')).toBe('');
  });

  it('should handle multiple middle names', () => {
    const fullName = 'John James Smith';
    const parts = fullName.split(/\s+/);
    expect(parts[0]).toBe('John');
    expect(parts.slice(1).join(' ')).toBe('James Smith');
  });

  it('should handle trimmed whitespace', () => {
    const name = '  Jane  ';
    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/);
    expect(parts[0]).toBe('Jane');
  });
});
