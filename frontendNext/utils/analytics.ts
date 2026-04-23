import axios from "axios";
import { getApiUrl } from "./auth";

export type FinancialMetricsData = {
  total_transactions: number;
  gross_transaction_value: number;
  platform_revenue: number;
  average_transaction_value: number;
  borrow_transactions: number;
  purchase_transactions: number;
  payment_method_distribution: { label: string; value: number }[];
  total_refunds: number;
  total_refund_amount: number;
  refund_rate: number;
  top_earning_users: Array<{ user_id: string; user_name: string; earnings: number }>;
  recent_transactions: Array<{
    id: string;
    created_at: string | null;
    status: string | null;
    action_type: string | null;
    total_paid_amount: number;
    owner_name: string;
    borrower_name: string;
  }>;
};

export async function getFinancialMetrics(params?: { from_date?: string; to_date?: string }) {
  const API_URL = getApiUrl();

  const res = await axios.get(`${API_URL}/api/v1/analytics/financial-metrics`, {
    params: params || {},
    headers: {
      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    },
    withCredentials: true,
  });

  return res.data;
}

export default getFinancialMetrics;
