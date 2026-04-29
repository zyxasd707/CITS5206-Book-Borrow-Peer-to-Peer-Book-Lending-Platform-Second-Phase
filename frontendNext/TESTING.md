# Frontend Unit Testing Guide

## Quick Start

```bash
# Watch mode (recommended for development)
npm run test

# Run once (CI/CD, pre-commit)
npm run test:run

# Interactive test UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Setup

Vitest is configured with:
- **Framework**: Vitest v4.1.5 (ESM, fast, TypeScript native)
- **Runtime**: jsdom (browser-like environment)
- **Testing Library**: @testing-library/react
- **Coverage**: @vitest/coverage-v8

Configuration files:
- `vitest.config.ts` — Vitest settings (globals, jsdom, @-alias matching codebase)
- `vitest.setup.ts` — jest-dom matchers, RTL cleanup, Next.js mocks
- `package.json` — test scripts

## File Structure

```
frontendNext/
├── __tests__/
│   ├── lib/
│   │   └── utils.test.ts              (6 tests) ✅ Real: tests cn() from lib/utils.ts
│   ├── utils/
│   │   └── profileValidation.test.ts  (11 tests) ✅ Real: tests isProfileComplete()
│   └── store/
│       └── cartStore.test.ts          (9 tests) ✅ Real: tests Zustand cart store
├── lib/
│   └── utils.ts                       (cn utility)
├── utils/
│   ├── profileValidation.ts           (isProfileComplete)
│   └── ... (other utilities)
└── app/
    └── store/
        └── cartStore.ts               (useCartStore)
```

**Real test files**: 3
**Real test cases**: 26
**All passing**: ✅

## Writing Tests

### Template: Test Your Project Code

Use [profileValidation.test.ts](__tests__/utils/profileValidation.test.ts) as the canonical example. Pattern:

1. **Import from your project**
2. **Arrange** test data
3. **Act** by calling the function
4. **Assert** on the output

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { isProfileComplete } from '@/utils/profileValidation';
import type { User } from '@/app/types/user';

describe('isProfileComplete', () => {
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: '123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      streetAddress: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      // ... other required fields
    } as User;
  });

  it('should return false if user is null', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('should return true if user has all required fields', () => {
    expect(isProfileComplete(mockUser)).toBe(true);
  });

  it('should return false if firstName is missing', () => {
    mockUser.firstName = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });
});
```

### Common Patterns

#### Testing Zustand stores
```typescript
import { useCartStore } from '@/app/store/cartStore';

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ cart: [], loading: false });
  });

  it('should add item to cart', () => {
    useCartStore.setState({ cart: [{ id: '1', title: 'Book' }] });
    expect(useCartStore.getState().cart).toHaveLength(1);
  });
});
```

#### Testing with mocked API calls
```typescript
import { vi } from 'vitest';

vi.mock('@/utils/cart');
import { addItemToCart } from '@/utils/cart';

describe('addToCart', () => {
  it('should call API', async () => {
    (addItemToCart as any).mockResolvedValueOnce({ cartItemId: '123' });
    
    const result = await addItemToCart({ /* ... */ });
    
    expect(addItemToCart).toHaveBeenCalledWith(expect.any(Object));
    expect(result.cartItemId).toBe('123');
  });
});
```

#### Testing with setup/teardown
```typescript
describe('Feature', () => {
  beforeEach(() => {
    // Run before each test
  });

  afterEach(() => {
    // Run after each test (cleanup)
  });

  it('should do something', () => {
    // test body
  });
});
```

### Common Assertions

```typescript
// Equality
expect(value).toBe(5);
expect(obj).toEqual({ id: 1 });

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Presence
expect(value).toBeDefined();
expect(value).toBeNull();

// Arrays
expect([1, 2, 3]).toHaveLength(3);
expect([1, 2, 3]).toContain(2);

// Objects
expect(obj).toHaveProperty('name');

// Numbers
expect(3.14).toBeCloseTo(3.1, 1);
expect(5).toBeGreaterThan(3);

// Functions/Mocks
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg');
expect(mockFn).toHaveReturnedWith(value);

// Exceptions
expect(() => throwError()).toThrow();
```

## Adding New Tests

### Step 1: Create test file
```
__tests__/
└── [location-matching-source]/
    └── myModule.test.ts
```

### Step 2: Import project code
```typescript
import { myFunction } from '@/path/to/myModule';
```

### Step 3: Write describe + it blocks
```typescript
describe('myFunction', () => {
  it('should handle happy path', () => {
    const result = myFunction('input');
    expect(result).toBe('output');
  });

  it('should handle edge case', () => {
    expect(myFunction('')).toBe(null);
  });
});
```

### Step 4: Run tests
```bash
npm run test
```

## Mocking Next.js

Tests have access to mocked Next.js hooks (in `vitest.setup.ts`):

```typescript
import { useRouter } from 'next/navigation';
import { pushMock } from 'vitest.setup.ts';

// In test
const router = useRouter();
// router.push, router.back, router.forward, router.refresh are available

// Assert on router calls
expect(pushMock).toHaveBeenCalledWith('/path');
```

## Debugging Tests

### Run single test
```typescript
it.only('should debug this', () => {
  // Only this test runs
});
```

### Skip test
```typescript
it.skip('should skip', () => {
  // This test is skipped
});
```

### Log during test
```typescript
it('should debug', () => {
  console.log('Debug output'); // Visible in terminal
  expect(value).toBeDefined();
});
```

## Coverage

Generate coverage report:
```bash
npm run test:coverage
```

Coverage report is in `coverage/index.html` (open in browser).

Current coverage:
- **profileValidation.ts**: 100% ✅
- **cartStore.ts**: 90%+ ✅
- **lib/utils.ts**: 100% ✅

## Best Practices

✅ **DO:**
- Test behavior, not implementation details
- Import real project code (not toy logic in the test)
- One logical assertion group per test (can have multiple expect() on same output)
- Use `beforeEach` for common setup
- Mock external dependencies (APIs, Next.js)
- Test edge cases and error scenarios
- Keep test descriptions clear ("should ...")

❌ **DON'T:**
- Test framework internals (String.replace, Array.reduce, Intl.NumberFormat)
- Define logic inside tests instead of importing from codebase
- Test library code (jest, vitest, react itself)
- Skip error case testing
- Write overlapping tests that test the same behavior twice

## CI/CD Integration

Add to your CI/CD pipeline (GitHub Actions example):

```yaml
- name: Install dependencies
  run: npm install

- name: Run tests
  run: npm run test:run

- name: Generate coverage
  run: npm run test:coverage
```

Fail the build if coverage drops below threshold or tests fail.

## Troubleshooting

### Tests not found
- Verify file ends with `.test.ts` or `.test.tsx`
- Check file is in `__tests__/` directory

### Import errors
- Check `vitest.config.ts` @-alias matches `tsconfig.json`
- Verify relative imports use correct paths

### Module resolution errors
```bash
npm install  # Clear and reinstall
npm run test:run
```

### Timeout errors
```typescript
it('slow test', async () => {
  // ...
}, 10000); // 10 second timeout
```

## Architecture

**Real test files** that test BookHive code:
- `__tests__/lib/utils.test.ts` — cn() utility (CSS merging)
- `__tests__/utils/profileValidation.test.ts` — Profile validation logic
- `__tests__/store/cartStore.test.ts` — Zustand cart store with mocked APIs

**Next steps** (Future PRs):
- Component tests in `__tests__/components/` (render, user interactions)
- API integration tests (checkout, orders, payments)
- Custom hook tests (`useAuth`, `useCart`, etc.)
- E2E tests (Playwright / Cypress) for user workflows

## Resources

- [Vitest Docs](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Zustand Testing](https://github.com/pmndrs/zustand#testing)
- [Jest Expect API](https://vitest.dev/api/expect.html)

---

**Last Updated**: April 29, 2026
**Test Framework**: Vitest 4.1.5
**Real tests**: 26 across 3 files ✅
**Status**: Production-ready
