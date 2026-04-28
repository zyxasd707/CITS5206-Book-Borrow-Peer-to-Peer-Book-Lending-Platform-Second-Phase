# Frontend Unit Testing Guide

This guide explains how to write and run unit tests for the BookHive frontend using Vitest.

## Setup Complete ✅

The frontend testing infrastructure is now configured with:
- **Vitest**: Modern, fast unit testing framework
- **@testing-library/react**: React component testing utilities
- **jsdom & happy-dom**: DOM environment simulation
- **TypeScript**: Full type safety in tests

## Available Commands

```bash
# Run tests in watch mode (rerun on file changes)
npm run test

# Run tests once and generate coverage report
npm run test:run
npm run test:coverage

# Launch interactive UI for test results
npm run test:ui
```

## File Structure

Test files follow this structure:
```
frontendNext/
├── __tests__/
│   ├── lib/
│   │   └── utils.test.ts
│   ├── utils/
│   │   └── profileValidation.test.ts
│   ├── store/
│   │   └── cartStore.test.ts
│   └── components/          # UI component tests
│       └── MyComponent.test.tsx
├── utils/                   # Actual utility files
├── lib/                     # Library utilities
└── app/
    ├── store/              # Zustand stores
    └── components/         # React components
```

## Test Patterns

### 1. Testing Utility Functions

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/utils/myFunction';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge cases', () => {
    expect(myFunction('')).toBe(null);
  });
});
```

### 2. Testing with Setup/Teardown

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should work', () => {
    // Test code
  });
});
```

### 3. Mocking Dependencies

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/api', () => ({
  fetchData: vi.fn(),
}));

import { fetchData } from '@/utils/api';

describe('MyComponent', () => {
  it('should call API', async () => {
    (fetchData as any).mockResolvedValueOnce({ data: 'test' });
    
    // Your test code
    
    expect(fetchData).toHaveBeenCalled();
  });
});
```

### 4. Testing Zustand Stores

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from '@/app/store/myStore';

describe('useMyStore', () => {
  beforeEach(() => {
    // Reset store state
    useMyStore.setState({ /* initial state */ });
  });

  it('should update state', () => {
    useMyStore.setState({ count: 5 });
    expect(useMyStore.getState().count).toBe(5);
  });
});
```

### 5. Testing React Components

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from '@/app/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Common Assertions

```typescript
// Equality
expect(value).toBe(5);
expect(value).toEqual({ id: 1 });

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Strings
expect(text).toContain('substring');
expect(text).toMatch(/pattern/);

// Arrays
expect(arr).toHaveLength(3);
expect(arr).toContain(item);

// Objects
expect(obj).toHaveProperty('name');
expect(obj).toMatchObject({ id: 1 });

// Exceptions
expect(() => throwError()).toThrow();
```

## Writing New Tests

1. **Identify what to test**: Utility functions, stores, components
2. **Create test file**: Place in `__tests__/` with `.test.ts` or `.test.tsx` suffix
3. **Import and describe**: Use `describe()` blocks to organize tests
4. **Write test cases**: Use `it()` for individual test cases
5. **Assert expectations**: Use `expect()` to verify behavior

### Example: Adding Tests for a Utility

**File**: `frontendNext/utils/myUtil.ts`
```typescript
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**Test File**: `frontendNext/__tests__/utils/myUtil.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from '@/utils/myUtil';

describe('calculateTotal', () => {
  it('should sum all item prices', () => {
    const items = [
      { id: '1', price: 10 },
      { id: '2', price: 20 },
    ];
    expect(calculateTotal(items)).toBe(30);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

## Best Practices

✅ **DO:**
- Test behavior, not implementation
- Keep tests focused and readable
- Use descriptive test names
- Mock external dependencies
- Test edge cases and error scenarios
- Use `beforeEach`/`afterEach` for setup/cleanup

❌ **DON'T:**
- Test framework code (testing library, zustand)
- Mock what you don't need to mock
- Write overly complex tests
- Skip error case testing
- Hardcode timestamps or random values

## Coverage Targets

Generate coverage reports:
```bash
npm run test:coverage
```

Recommended coverage:
- **Statements**: 70%+
- **Branches**: 70%+
- **Functions**: 80%+
- **Lines**: 70%+

## Troubleshooting

### Tests not found
```bash
# Make sure files end with .test.ts or .test.tsx
# Check __tests__/ directory structure
```

### Module resolution errors
```typescript
// Check tsconfig.json has correct paths configured
// Make sure vitest.config.ts has matching alias
```

### Next.js specific issues
- Next components should be mocked in `vitest.setup.ts`
- Dynamic imports may need special handling
- API routes cannot be tested like regular functions

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Zustand Testing](https://github.com/pmndrs/zustand#testing)
