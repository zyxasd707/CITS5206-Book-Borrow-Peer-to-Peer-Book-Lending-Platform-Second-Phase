import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => {
  cleanup();
});

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: any) => {
    return React.createElement('img', props);
  },
}));

// Mock next/navigation - with testable references
const pushMock = vi.fn();
const backMock = vi.fn();
const forwardMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
    forward: forwardMock,
    refresh: refreshMock,
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Export mocks for tests to use
export { pushMock, backMock, forwardMock, refreshMock };
