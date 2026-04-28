# Frontend Unit Testing - Quick Reference

## Quick Start

```bash
# Watch mode (during development)
npm run test

# Run once
npm run test:run

# Interactive UI
npm run test:ui

# With coverage
npm run test:coverage
```

## Writing Your First Test

### File Structure
```
frontendNext/
├── __tests__/
│   ├── utils/
│   │   └── myUtil.test.ts
│   ├── store/
│   │   └── myStore.test.ts
│   ├── components/
│   │   └── MyComponent.test.tsx
│   └── lib/
│       └── helper.test.ts
├── utils/
│   └── myUtil.ts
└── app/
    └── store/
        └── myStore.ts
```

### Basic Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature name', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

## Common Assertions

```typescript
// Equality
expect(value).toBe(5);
expect(obj).toEqual({ id: 1 });

// Truthiness  
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// String matching
expect(text).toContain('substring');
expect(text).toMatch(/pattern/);
expect(text).toHaveLength(5);

// Arrays
expect([1,2,3]).toHaveLength(3);
expect([1,2,3]).toContain(2);
expect([1,2,3]).toEqual(expect.arrayContaining([2, 1]));

// Objects
expect(obj).toHaveProperty('name');
expect(obj).toMatchObject({ id: 1 });
expect(obj).toEqual(expect.objectContaining({ id: 1 }));

// Numbers
expect(3.14).toBeCloseTo(3.1, 1);
expect(5).toBeGreaterThan(3);
expect(5).toBeLessThan(10);
expect(5).toBeGreaterThanOrEqual(5);

// Exceptions
expect(() => throwError()).toThrow();
expect(() => throwError()).toThrow('error message');

// Functions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveReturnedWith(value);
```

## Testing Patterns

### 1. Testing Utility Functions

```typescript
import { isValidEmail } from '@/utils/validation';

describe('isValidEmail', () => {
  it('should return true for valid email', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
  });

  it('should return false for invalid email', () => {
    expect(isValidEmail('invalid')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null as any)).toBe(false);
  });
});
```

### 2. Testing with Setup/Teardown

```typescript
import { beforeEach, afterEach } from 'vitest';

describe('Feature', () => {
  let testData: any;

  beforeEach(() => {
    testData = createTestData();
  });

  afterEach(() => {
    cleanup();
  });

  it('should work with test data', () => {
    expect(testData.value).toBeDefined();
  });
});
```

### 3. Testing with Mocks

```typescript
import { vi } from 'vitest';

vi.mock('@/utils/api');
import { fetchData } from '@/utils/api';

describe('Component using API', () => {
  it('should call API', async () => {
    (fetchData as any).mockResolvedValueOnce({ data: 'test' });
    
    const result = await fetchData();
    
    expect(fetchData).toHaveBeenCalled();
    expect(result).toEqual({ data: 'test' });
  });
});
```

### 4. Testing Zustand Stores

```typescript
import { useMyStore } from '@/app/store/myStore';

describe('useMyStore', () => {
  beforeEach(() => {
    useMyStore.setState({ count: 0 });
  });

  it('should increment', () => {
    expect(useMyStore.getState().count).toBe(0);
    
    useMyStore.getState().increment();
    
    expect(useMyStore.getState().count).toBe(1);
  });
});
```

### 5. Testing React Components

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from '@/app/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should handle clicks', async () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### 6. Testing Async Functions

```typescript
import { describe, it, expect } from 'vitest';

describe('async function', () => {
  it('should handle async operations', async () => {
    const result = await fetchData();
    expect(result).toBeDefined();
  });

  it('should handle errors', async () => {
    await expect(failingFunction()).rejects.toThrow('error message');
  });
});
```

## Test Organization Tips

### Group related tests
```typescript
describe('Cart functionality', () => {
  describe('adding items', () => {
    it('should add single item', () => {});
    it('should prevent duplicates', () => {});
  });

  describe('removing items', () => {
    it('should remove item', () => {});
  });
});
```

### Test one thing per test
```typescript
// ❌ Bad - testing multiple things
it('should add item and update total', () => {
  addItem(book);
  expect(cart).toContain(book);
  expect(total).toBe(50);
});

// ✅ Good - single responsibility
it('should add item to cart', () => {
  addItem(book);
  expect(cart).toContain(book);
});

it('should update total when item added', () => {
  addItem(book);
  expect(total).toBe(50);
});
```

### Use descriptive names
```typescript
// ❌ Bad
it('works', () => {});
it('test', () => {});

// ✅ Good
it('should calculate shipping cost for standard delivery', () => {});
it('should validate email format with international characters', () => {});
```

## Debugging Tests

### Run single test
```typescript
it.only('should run only this test', () => {
  // only this test runs
});
```

### Skip test
```typescript
it.skip('should skip this test', () => {
  // this test is skipped
});
```

### Debug in test
```typescript
it('should debug', () => {
  const result = myFunction();
  console.log('Result:', result); // visible in terminal
  expect(result).toBeDefined();
});
```

### Inspect state
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

it('should inspect store state', () => {
  const state = useStore.getState();
  console.log('Store state:', state);
  expect(state).toBeDefined();
});
```

## Coverage Commands

```bash
# Generate HTML coverage report
npm run test:coverage

# Open coverage report
open coverage/index.html
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:run
      - run: npm run test:coverage
```

## Common Issues & Solutions

### Tests timing out
```typescript
// Increase timeout for specific test
it('should wait for async', async () => {
  const result = await slowFunction();
  expect(result).toBeDefined();
}, 10000); // 10 second timeout
```

### Module resolution errors
- Check `vitest.config.ts` alias matches `tsconfig.json`
- Verify import paths use `@/` prefix
- Clear node_modules and reinstall

### Mock not working
```typescript
// Mock must be before import
vi.mock('@/utils/api');
import { apiFunction } from '@/utils/api';
```

### Async state updates
```typescript
import { waitFor } from '@testing-library/react';

it('should update state', async () => {
  updateState();
  
  await waitFor(() => {
    expect(state).toBe('updated');
  });
});
```

## Performance Tips

- Keep test files small and focused
- Use `beforeEach` for common setup
- Mock heavy external dependencies
- Don't test framework code
- Test behavior, not implementation

## Resources

- [Vitest Docs](https://vitest.dev)
- [Testing Library Docs](https://testing-library.com)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
