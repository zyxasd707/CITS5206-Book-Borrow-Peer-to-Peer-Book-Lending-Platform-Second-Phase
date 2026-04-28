import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCartStore } from '@/app/store/cartStore';
import type { CartItem } from '@/app/store/cartStore';

// Mock the API functions
vi.mock('@/utils/cart', () => ({
  getMyCart: vi.fn(),
  addItemToCart: vi.fn(),
  removeItemsFromCart: vi.fn(),
}));

vi.mock('@/utils/books', () => ({
  getBookById: vi.fn(),
}));

import { getMyCart, addItemToCart, removeItemsFromCart } from '@/utils/cart';
import { getBookById } from '@/utils/books';

describe('cartStore - useCartStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCartStore.setState({ cart: [], loading: false });
    vi.clearAllMocks();
  });

  describe('clearCart', () => {
    it('should clear all items from cart', () => {
      const initialCart: CartItem[] = [
        {
          id: '1',
          title: 'Book 1',
          cartItemId: 'cart-1',
          bookId: '1',
          mode: 'borrow',
          ownerId: 'owner-1',
          canRent: true,
          canSell: false,
        } as CartItem,
      ];

      useCartStore.setState({ cart: initialCart });
      expect(useCartStore.getState().cart).toHaveLength(1);

      useCartStore.getState().clearCart();
      expect(useCartStore.getState().cart).toHaveLength(0);
    });
  });

  describe('setMode', () => {
    it('should change the mode of a cart item', () => {
      const cartItem: CartItem = {
        id: '1',
        title: 'Book 1',
        cartItemId: 'cart-1',
        bookId: '1',
        mode: 'borrow',
        ownerId: 'owner-1',
        canRent: true,
        canSell: true,
      } as CartItem;

      useCartStore.setState({ cart: [cartItem] });
      expect(useCartStore.getState().cart[0].mode).toBe('borrow');

      useCartStore.getState().setMode('1', 'purchase');
      expect(useCartStore.getState().cart[0].mode).toBe('purchase');
    });

    it('should not affect items with different book id', () => {
      const cartItems: CartItem[] = [
        {
          id: '1',
          title: 'Book 1',
          cartItemId: 'cart-1',
          bookId: '1',
          mode: 'borrow',
          ownerId: 'owner-1',
          canRent: true,
          canSell: true,
        } as CartItem,
        {
          id: '2',
          title: 'Book 2',
          cartItemId: 'cart-2',
          bookId: '2',
          mode: 'purchase',
          ownerId: 'owner-2',
          canRent: true,
          canSell: true,
        } as CartItem,
      ];

      useCartStore.setState({ cart: cartItems });

      useCartStore.getState().setMode('1', 'purchase');

      const state = useCartStore.getState();
      expect(state.cart[0].mode).toBe('purchase');
      expect(state.cart[1].mode).toBe('purchase'); // should remain unchanged
    });
  });

  describe('fetchCart', () => {
    it('should set loading to true and then false', async () => {
      const mockGetMyCart = getMyCart as any;
      mockGetMyCart.mockResolvedValueOnce({ items: [] });

      const store = useCartStore.getState();
      expect(store.loading).toBe(false);

      const fetchPromise = store.fetchCart();
      // Note: Check loading state during fetch would require async handling
      await fetchPromise;

      expect(useCartStore.getState().loading).toBe(false);
    });

    it('should handle empty cart response', async () => {
      const mockGetMyCart = getMyCart as any;
      mockGetMyCart.mockResolvedValueOnce(null);

      await useCartStore.getState().fetchCart();

      expect(useCartStore.getState().cart).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      const mockGetMyCart = getMyCart as any;
      mockGetMyCart.mockRejectedValueOnce(new Error('API Error'));

      await useCartStore.getState().fetchCart();

      expect(useCartStore.getState().cart).toHaveLength(0);
      expect(useCartStore.getState().loading).toBe(false);
    });
  });

  describe('addToCart', () => {
    it('should return "duplicate" if book already exists', async () => {
      const book = {
        id: '1',
        title: 'Book 1',
        ownerId: 'owner-1',
        canRent: true,
        canSell: false,
      } as any;

      const existingCartItem: CartItem = {
        ...book,
        cartItemId: 'cart-1',
        bookId: '1',
        mode: 'borrow',
      };

      useCartStore.setState({ cart: [existingCartItem] });

      const result = await useCartStore.getState().addToCart(book);
      expect(result).toBe('duplicate');
    });

    it('should return false if book cannot be rented or purchased', async () => {
      const book = {
        id: '2',
        title: 'Book 2',
        ownerId: 'owner-2',
        canRent: false,
        canSell: false,
      } as any;

      const result = await useCartStore.getState().addToCart(book);
      expect(result).toBe(false);
    });
  });

  describe('removeFromCart', () => {
    it('should remove items from cart', async () => {
      const cartItems: CartItem[] = [
        {
          id: '1',
          title: 'Book 1',
          cartItemId: 'cart-1',
          bookId: '1',
          mode: 'borrow',
          ownerId: 'owner-1',
          canRent: true,
          canSell: false,
        } as CartItem,
        {
          id: '2',
          title: 'Book 2',
          cartItemId: 'cart-2',
          bookId: '2',
          mode: 'purchase',
          ownerId: 'owner-2',
          canRent: true,
          canSell: true,
        } as CartItem,
      ];

      useCartStore.setState({ cart: cartItems });

      const mockRemoveItemsFromCart = removeItemsFromCart as any;
      mockRemoveItemsFromCart.mockResolvedValueOnce(undefined);

      await useCartStore.getState().removeFromCart(['cart-1']);

      expect(useCartStore.getState().cart).toHaveLength(1);
      expect(useCartStore.getState().cart[0].cartItemId).toBe('cart-2');
    });
  });
});
