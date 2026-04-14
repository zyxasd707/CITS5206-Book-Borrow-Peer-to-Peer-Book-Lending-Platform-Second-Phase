import axios from "axios";
import { getApiUrl, getToken } from "@/utils/auth";
import type { OrderStatus } from "@/app/types/order";

const API_URL = getApiUrl();

export type Order = {
  order_id: string;
  status: OrderStatus;
  action_type: "borrow" | "purchase";
  total_paid_amount: number;
  shipping_out_tracking_number?: string | null;
  shipping_return_tracking_number?: string | null;
  books: Array<{
    id: string;
    title: string;
    cover?: string;
    author?: string;
  }>;
  create_at: string;
  due_at: string | null;
  completed_at: string | null;
  owner_id: string;
  borrower_id: string;
};

export async function createOrder(checkoutId: string, paymentId: string) {
  const token = getToken();
  const response = await axios.post(
    `${API_URL}/api/v1/orders/`,
    { checkout_id: checkoutId, payment_id: paymentId },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
}

export async function listMyOrders(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<Order[]> {
  const token = getToken();
  const response = await axios.get(`${API_URL}/api/v1/orders/`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      status: params?.status,
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 20,
    },
  });
  return response.data;
}

export async function getOrderById(orderId: string) {
  const token = getToken();
  const res = await axios.get(`${API_URL}/api/v1/orders/${orderId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.data;
}


// Get orders by book ID
export async function getOrdersByBookId(bookId: string): Promise<Order[]> {
  const token = getToken();
  const response = await axios.get(`${API_URL}/api/v1/orders/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Filter orders that contain this book
  const allOrders: Order[] = response.data;
  const filtered = allOrders.filter(order =>
    order.books && order.books.some((book) => book.id === bookId)
  );

  console.log('Book ID:', bookId);
  console.log('All orders:', allOrders.length);
  console.log('Filtered orders:', filtered.length);
  console.log('Sample order books:', allOrders[0]?.books);

  return filtered;
}

export async function confirmBorrowerReceived(orderId: string) {
  const token = getToken();
  const response = await axios.put(
    `${API_URL}/api/v1/orders/${orderId}/borrower-confirm-received`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
}

// Alias functions for different contexts
export const getOrders = listMyOrders;
export const getBorrowingOrders = listMyOrders;
export const getLendingOrders = listMyOrders;
