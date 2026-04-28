import { describe, it, expect } from 'vitest';

describe('Common Utility Tests', () => {
  describe('Date formatting', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2026-04-28');
      const formatted = date.toISOString().split('T')[0];
      expect(formatted).toBe('2026-04-28');
    });

    it('should handle date parsing', () => {
      const dateString = '2026-04-28';
      const date = new Date(dateString);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(3); // 0-indexed
      expect(date.getDate()).toBe(28);
    });

    it('should calculate days between dates', () => {
      const date1 = new Date('2026-04-28');
      const date2 = new Date('2026-04-30');
      const diffTime = Math.abs(date2.getTime() - date1.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(2);
    });
  });

  describe('Number formatting', () => {
    it('should format large numbers with commas', () => {
      const num = 1000000;
      const formatted = num.toLocaleString('en-US');
      expect(formatted).toBe('1,000,000');
    });

    it('should round to decimal places', () => {
      const num = 3.14159;
      const rounded = Math.round(num * 100) / 100;
      expect(rounded).toBe(3.14);
    });

    it('should handle negative numbers', () => {
      const num = -5.5;
      const rounded = Math.round(num * 10) / 10;
      expect(rounded).toBe(-5.5);
    });
  });

  describe('String utilities', () => {
    it('should trim whitespace', () => {
      const str = '  hello world  ';
      expect(str.trim()).toBe('hello world');
    });

    it('should convert to lowercase', () => {
      const str = 'Hello WORLD';
      expect(str.toLowerCase()).toBe('hello world');
    });

    it('should convert to uppercase', () => {
      const str = 'Hello WORLD';
      expect(str.toUpperCase()).toBe('HELLO WORLD');
    });

    it('should check if string contains substring', () => {
      const str = 'hello world';
      expect(str.includes('world')).toBe(true);
      expect(str.includes('xyz')).toBe(false);
    });

    it('should replace substring', () => {
      const str = 'hello world';
      const replaced = str.replace('world', 'universe');
      expect(replaced).toBe('hello universe');
    });

    it('should split string', () => {
      const str = 'apple,banana,orange';
      const parts = str.split(',');
      expect(parts).toEqual(['apple', 'banana', 'orange']);
    });
  });

  describe('Array utilities', () => {
    it('should filter array', () => {
      const arr = [1, 2, 3, 4, 5];
      const filtered = arr.filter((x) => x > 2);
      expect(filtered).toEqual([3, 4, 5]);
    });

    it('should map array', () => {
      const arr = [1, 2, 3];
      const mapped = arr.map((x) => x * 2);
      expect(mapped).toEqual([2, 4, 6]);
    });

    it('should find element in array', () => {
      const arr = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
      const found = arr.find((x) => x.id === 2);
      expect(found).toEqual({ id: 2, name: 'Jane' });
    });

    it('should check if array includes value', () => {
      const arr = ['apple', 'banana', 'orange'];
      expect(arr.includes('banana')).toBe(true);
      expect(arr.includes('grape')).toBe(false);
    });

    it('should sort array', () => {
      const arr = [3, 1, 4, 1, 5];
      const sorted = [...arr].sort((a, b) => a - b);
      expect(sorted).toEqual([1, 1, 3, 4, 5]);
    });

    it('should remove duplicates from array', () => {
      const arr = [1, 2, 2, 3, 3, 3];
      const unique = [...new Set(arr)];
      expect(unique).toEqual([1, 2, 3]);
    });
  });

  describe('Object utilities', () => {
    it('should merge objects', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 3, c: 4 };
      const merged = { ...obj1, ...obj2 };
      expect(merged).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should check if property exists', () => {
      const obj = { name: 'John', age: 30 };
      expect('name' in obj).toBe(true);
      expect('email' in obj).toBe(false);
    });

    it('should get object keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const keys = Object.keys(obj);
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('should get object values', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const values = Object.values(obj);
      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('Boolean logic', () => {
    it('should handle AND operator', () => {
      expect(true && true).toBe(true);
      expect(true && false).toBe(false);
      expect(false && true).toBe(false);
    });

    it('should handle OR operator', () => {
      expect(true || true).toBe(true);
      expect(true || false).toBe(true);
      expect(false || false).toBe(false);
    });

    it('should handle NOT operator', () => {
      expect(!true).toBe(false);
      expect(!false).toBe(true);
    });
  });
});
