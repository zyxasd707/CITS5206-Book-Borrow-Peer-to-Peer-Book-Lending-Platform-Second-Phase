import axios from "axios";
import { getApiUrl } from "./auth";

export type FinancialMetricsData = {
  total_transactions: number;
  gross_transaction_value: number;
  platform_revenue: number;
  platform_fee_per_transaction?: number;
  average_transaction_value: number;
  borrow_transactions: number;
  purchase_transactions: number;
  payment_method_distribution: { label: string; value: number }[];
  total_refunds: number;
  total_refund_amount: number;
  refund_rate: number;
  top_earning_users: Array<{
    user_id: string;
    user_name: string;
    earnings: number;
  }>;
  recent_transactions: Array<{
    id: number;
    created_at: string | null;
    status: string | null;
    action_type: string | null;
    total_paid_amount: number;
    owner_name: string;
    borrower_name: string;
  }>;
};

export type PlatformFeeSetting = {
  key: string;
  max_value: number;
};

export type ShippingMetricsData = {
  total_orders: number;
  delivery_orders: number;
  pickup_orders: number;
  delivery_ratio: number;
  pickup_ratio: number;
  missing_tracking_orders: number;
  outbound_tracking_orders: number;
  return_tracking_orders: number;
  average_estimated_delivery_time: number;
  shipping_fee_total: number;
  checkout_summary: {
    checkout_items: number;
    delivery_items: number;
    pickup_items: number;
    shipping_quote_total: number;
    average_estimated_delivery_time: number;
  };
  recent_shipments: Array<{
    id: string;
    status: string | null;
    shipping_method: string | null;
    shipping_out_tracking_number: string | null;
    shipping_return_tracking_number: string | null;
    estimated_delivery_time: number | null;
    shipping_out_fee_amount: number;
    created_at: string | null;
    owner_name: string;
    borrower_name: string;
  }>;
};

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  };
}

export async function getFinancialMetrics(params?: {
  from_date?: string;
  to_date?: string;
}) {
  const API_URL = getApiUrl();

  const res = await axios.get<FinancialMetricsData>(
    `${API_URL}/api/v1/analytics/financial-metrics`,
    {
      params: params || {},
      headers: getAuthHeaders(),
      withCredentials: true,
    }
  );

  return res.data;
}

export async function getPlatformFeeSetting() {
  const API_URL = getApiUrl();

  const res = await axios.get<PlatformFeeSetting>(
    `${API_URL}/api/v1/analytics/platform-fee-setting`,
    {
      headers: getAuthHeaders(),
      withCredentials: true,
    }
  );

  return res.data;
}

export async function updatePlatformFeeSetting(maxValue: number) {
  const API_URL = getApiUrl();

  const res = await axios.put<PlatformFeeSetting>(
    `${API_URL}/api/v1/analytics/platform-fee-setting`,
    null,
    {
      params: {
        max_value: maxValue,
      },
      headers: getAuthHeaders(),
      withCredentials: true,
    }
  );

  return res.data;
}

export async function getShippingMetrics(params?: {
  from_date?: string;
  to_date?: string;
}) {
  const API_URL = getApiUrl();

  const res = await axios.get<ShippingMetricsData>(
    `${API_URL}/api/v1/analytics/shipping-metrics`,
    {
      params: params || {},
      headers: getAuthHeaders(),
      withCredentials: true,
    }
  );

  return res.data;
}

export default getFinancialMetrics;
