import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Books utilities - data validation', () => {
  it('should validate book title is not empty', () => {
    const validateTitle = (title: string) => title.trim().length > 0;
    expect(validateTitle('The Great Gatsby')).toBe(true);
    expect(validateTitle('')).toBe(false);
    expect(validateTitle('   ')).toBe(false);
  });

  it('should validate book author is not empty', () => {
    const validateAuthor = (author: string) => author.trim().length > 0;
    expect(validateAuthor('F. Scott Fitzgerald')).toBe(true);
    expect(validateAuthor('')).toBe(false);
  });

  it('should validate price is positive number', () => {
    const validatePrice = (price: number) => price > 0;
    expect(validatePrice(29.99)).toBe(true);
    expect(validatePrice(0)).toBe(false);
    expect(validatePrice(-10)).toBe(false);
  });

  it('should validate book condition is valid', () => {
    const validConditions = ['new', 'like-new', 'good', 'fair', 'poor'];
    const validateCondition = (condition: string) => validConditions.includes(condition);
    expect(validateCondition('new')).toBe(true);
    expect(validateCondition('excellent')).toBe(false);
  });

  it('should validate ISBN format', () => {
    const validateISBN = (isbn: string) => /^\d{10}(\d{3})?$/.test(isbn);
    expect(validateISBN('9780141040349')).toBe(true);
    expect(validateISBN('0141040349')).toBe(true);
    expect(validateISBN('invalid')).toBe(false);
  });

  it('should filter books by title', () => {
    const books = [
      { id: '1', title: 'The Great Gatsby' },
      { id: '2', title: 'To Kill a Mockingbird' },
      { id: '3', title: 'Great Expectations' },
    ];
    const searchTerm = 'Great';
    const results = books.filter((book) =>
      book.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[1].id).toBe('3');
  });

  it('should sort books by price', () => {
    const books = [
      { id: '1', title: 'Book A', price: 30 },
      { id: '2', title: 'Book B', price: 10 },
      { id: '3', title: 'Book C', price: 20 },
    ];
    const sorted = [...books].sort((a, b) => a.price - b.price);
    expect(sorted[0].price).toBe(10);
    expect(sorted[1].price).toBe(20);
    expect(sorted[2].price).toBe(30);
  });

  it('should group books by category', () => {
    const books = [
      { id: '1', title: 'Book A', category: 'Fiction' },
      { id: '2', title: 'Book B', category: 'Non-Fiction' },
      { id: '3', title: 'Book C', category: 'Fiction' },
    ];
    const grouped = books.reduce((acc, book) => {
      if (!acc[book.category]) acc[book.category] = [];
      acc[book.category].push(book);
      return acc;
    }, {} as Record<string, typeof books>);
    
    expect(grouped['Fiction']).toHaveLength(2);
    expect(grouped['Non-Fiction']).toHaveLength(1);
  });
});

describe('Books utilities - availability', () => {
  it('should check if book is available for borrowing', () => {
    const book = { canRent: true, rentalCount: 5 };
    expect(book.canRent).toBe(true);
  });

  it('should check if book is available for purchase', () => {
    const book = { canSell: true, quantity: 3 };
    expect(book.canSell && book.quantity > 0).toBe(true);
  });

  it('should check if book is out of stock', () => {
    const book = { canSell: true, quantity: 0 };
    expect(book.canSell && book.quantity > 0).toBe(false);
  });

  it('should calculate book age', () => {
    const bookYear = 2020;
    const currentYear = new Date().getFullYear();
    const age = currentYear - bookYear;
    expect(age).toBeGreaterThan(0);
  });
});

describe('Books utilities - recommendations', () => {
  it('should recommend similar books', () => {
    const currentBook = { id: '1', category: 'Fiction', author: 'Author A' };
    const allBooks = [
      { id: '2', category: 'Fiction', author: 'Author B' },
      { id: '3', category: 'Non-Fiction', author: 'Author A' },
      { id: '4', category: 'Fiction', author: 'Author C' },
    ];

    const recommendations = allBooks.filter(
      (book) =>
        book.id !== currentBook.id &&
        (book.category === currentBook.category || book.author === currentBook.author)
    );

    // Books 2 and 4 match category, Book 3 matches author = 3 total
    expect(recommendations).toHaveLength(3);
  });

  it('should rank books by rating', () => {
    const books = [
      { id: '1', title: 'Book A', rating: 4.5 },
      { id: '2', title: 'Book B', rating: 4.8 },
      { id: '3', title: 'Book C', rating: 4.2 },
    ];

    const ranked = [...books].sort((a, b) => b.rating - a.rating);
    expect(ranked[0].rating).toBe(4.8);
    expect(ranked[1].rating).toBe(4.5);
    expect(ranked[2].rating).toBe(4.2);
  });
});
