import { describe, it, expect, beforeEach } from 'vitest';
import { isProfileComplete } from '@/utils/profileValidation';
import type { User } from '@/app/types/user';

describe('profileValidation - isProfileComplete', () => {
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
      phone: '555-1234',
      createdAt: new Date(),
      updatedAt: new Date(),
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

  it('should return false if lastName is missing', () => {
    mockUser.lastName = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return false if email is missing', () => {
    mockUser.email = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return false if streetAddress is missing', () => {
    mockUser.streetAddress = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return false if city is missing', () => {
    mockUser.city = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return false if state is missing', () => {
    mockUser.state = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return false if zipCode is missing', () => {
    mockUser.zipCode = '';
    expect(isProfileComplete(mockUser)).toBe(false);
  });

  it('should return true even if optional fields like phone are missing', () => {
    mockUser.phone = '';
    expect(isProfileComplete(mockUser)).toBe(true);
  });

  it('should return false if user is undefined', () => {
    expect(isProfileComplete(undefined as any)).toBe(false);
  });
});
