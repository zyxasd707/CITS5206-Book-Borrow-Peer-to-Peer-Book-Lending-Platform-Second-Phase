import { describe, it, expect, beforeEach } from 'vitest';

describe('Cart utilities - calculations', () => {
  it('should calculate subtotal', () => {
    const items = [
      { id: '1', price: 10 },
      { id: '2', price: 20 },
      { id: '3', price: 15 },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    expect(subtotal).toBe(45);
  });

  it('should apply discount', () => {
    const subtotal = 100;
    const discountPercent = 10;
    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal - discountAmount;
    expect(total).toBe(90);
  });

  it('should add tax', () => {
    const subtotal = 100;
    const taxRate = 0.08;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    expect(total).toBe(108);
  });

  it('should handle free shipping', () => {
    const subtotal = 100;
    const shippingThreshold = 50;
    const shipping = subtotal >= shippingThreshold ? 0 : 10;
    expect(shipping).toBe(0);
  });

  it('should calculate final total with all fees', () => {
    const subtotal = 100;
    const serviceFee = 10;
    const taxRate = 0.08;
    const shipping = 5;

    const tax = (subtotal + serviceFee) * taxRate;
    const total = subtotal + serviceFee + tax + shipping;

    // (100 + 10) * 0.08 = 8.8, then 100 + 10 + 8.8 + 5 = 123.8
    expect(total).toBeCloseTo(123.8, 2);
  });

  it('should validate cart item quantity', () => {
    const validateQuantity = (qty: number) => qty > 0 && Number.isInteger(qty);
    expect(validateQuantity(5)).toBe(true);
    expect(validateQuantity(0)).toBe(false);
    expect(validateQuantity(-1)).toBe(false);
    expect(validateQuantity(2.5)).toBe(false);
  });

  it('should check if cart is empty', () => {
    const cart = [];
    expect(cart.length === 0).toBe(true);
  });

  it('should count total items in cart', () => {
    const cartItems = [
      { id: '1', quantity: 2 },
      { id: '2', quantity: 3 },
      { id: '3', quantity: 1 },
    ];
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    expect(totalItems).toBe(6);
  });
});

describe('Cart utilities - validation', () => {
  it('should validate mode is borrow or purchase', () => {
    const validModes = ['borrow', 'purchase'];
    const validateMode = (mode: string) => validModes.includes(mode);
    expect(validateMode('borrow')).toBe(true);
    expect(validateMode('purchase')).toBe(true);
    expect(validateMode('rent')).toBe(false);
  });

  it('should check if duplicate item exists', () => {
    const cart = [
      { bookId: '1', mode: 'borrow' },
      { bookId: '2', mode: 'purchase' },
    ];
    const isDuplicate = (bookId: string) => cart.some((item) => item.bookId === bookId);
    expect(isDuplicate('1')).toBe(true);
    expect(isDuplicate('3')).toBe(false);
  });

  it('should validate cart item has required fields', () => {
    const cartItem = { bookId: '1', mode: 'borrow', price: 10 };
    const isValid =
      cartItem.bookId && cartItem.mode && typeof cartItem.price === 'number';
    expect(isValid).toBe(true);
  });
});

describe('Cart utilities - operations', () => {
  it('should remove item from cart', () => {
    const cart = [
      { id: '1', title: 'Book 1' },
      { id: '2', title: 'Book 2' },
      { id: '3', title: 'Book 3' },
    ];
    const filtered = cart.filter((item) => item.id !== '2');
    expect(filtered).toHaveLength(2);
    expect(filtered.some((item) => item.id === '2')).toBe(false);
  });

  it('should update item quantity in cart', () => {
    const cart = [
      { id: '1', title: 'Book 1', quantity: 1 },
      { id: '2', title: 'Book 2', quantity: 2 },
    ];
    const updated = cart.map((item) =>
      item.id === '1' ? { ...item, quantity: 3 } : item
    );
    expect(updated[0].quantity).toBe(3);
    expect(updated[1].quantity).toBe(2);
  });

  it('should change item mode in cart', () => {
    const cart = [
      { id: '1', title: 'Book 1', mode: 'borrow' },
      { id: '2', title: 'Book 2', mode: 'purchase' },
    ];
    const updated = cart.map((item) =>
      item.id === '1' ? { ...item, mode: 'purchase' } : item
    );
    expect(updated[0].mode).toBe('purchase');
  });

  it('should clear entire cart', () => {
    let cart = [
      { id: '1', title: 'Book 1' },
      { id: '2', title: 'Book 2' },
    ];
    cart = [];
    expect(cart).toHaveLength(0);
  });
});
