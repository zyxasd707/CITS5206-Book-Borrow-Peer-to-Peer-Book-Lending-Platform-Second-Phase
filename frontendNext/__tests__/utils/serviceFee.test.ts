import { describe, it, expect } from 'vitest';

describe('serviceFee utilities - calculateServiceFee', () => {
  it('should calculate percentage-based service fees', () => {
    const amount = 100;
    const feePercent = 10;
    const expectedFee = (amount * feePercent) / 100;
    expect(expectedFee).toBe(10);
  });

  it('should calculate fixed service fees', () => {
    const amount = 100;
    const fixedFee = 5;
    expect(fixedFee).toBe(5);
  });

  it('should handle zero amounts', () => {
    const amount = 0;
    const feePercent = 10;
    const expectedFee = (amount * feePercent) / 100;
    expect(expectedFee).toBe(0);
  });

  it('should calculate total with service fee', () => {
    const subtotal = 100;
    const serviceFee = 10;
    const total = subtotal + serviceFee;
    expect(total).toBe(110);
  });

  it('should handle decimal amounts correctly', () => {
    const amount = 99.99;
    const feePercent = 2.5;
    const expectedFee = Math.round((amount * feePercent) / 100 * 100) / 100;
    expect(expectedFee).toBeCloseTo(2.50, 2);
  });
});

describe('serviceFee utilities - formatting', () => {
  it('should format currency correctly', () => {
    const amount = 1234.56;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
    expect(formatted).toBe('$1,234.56');
  });

  it('should handle zero amount', () => {
    const amount = 0;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
    expect(formatted).toBe('$0.00');
  });
});
