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

export type AdminOrderUser = {
  id: string | null;
  name: string;
  email?: string | null;
  phone_number?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  is_restricted?: boolean;
  restriction_reason?: string | null;
  damage_strike_count?: number;
  damage_severity_score?: number;
  stripe_account_id?: string | null;
};

export type AdminOrderPaymentSplit = {
  id: number;
  payment_id: string;
  owner: AdminOrderUser;
  connected_account_id: string;
  currency: string;
  deposit_cents: number;
  shipping_cents: number;
  service_fee_cents: number;
  transfer_amount_cents: number;
  transfer_id: string | null;
  transfer_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminOrderRefund = {
  id: number;
  refund_id: string;
  payment_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminOrderDispute = {
  id: number;
  dispute_id: string;
  payment_id: string;
  user: AdminOrderUser;
  reason: string;
  note: string | null;
  status: string;
  deduction_cents: number;
  created_at: string | null;
};

export type AdminOrderComplaint = {
  id: string;
  type: string;
  subject: string | null;
  description: string | null;
  status: string;
  admin_response: string | null;
  damage_severity: string | null;
  evidence_photos: string[];
  complainant: AdminOrderUser;
  respondent: AdminOrderUser | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminOrderReview = {
  id: string;
  rating: number;
  comment: string | null;
  reviewer: AdminOrderUser;
  reviewee: AdminOrderUser;
  created_at: string | null;
};

export type AdminOrderDepositEvidence = {
  id: string;
  submitter: AdminOrderUser;
  submitter_role: string;
  photos: string[];
  claimed_severity: string;
  note: string | null;
  submitted_at: string | null;
};

export type AdminOrderDepositAuditLog = {
  id: string;
  actor: AdminOrderUser | null;
  actor_role: string;
  action: string;
  amount_cents: number | null;
  final_severity: string | null;
  note: string | null;
  created_at: string | null;
};

export type AdminOrderDetails = {
  order: {
    id: string;
    status: string;
    action_type: string;
    created_at: string | null;
    updated_at: string | null;
    start_at: string | null;
    due_at: string | null;
    returned_at: string | null;
    completed_at: string | null;
    canceled_at: string | null;
    notes: string | null;
  };
  people: {
    owner: AdminOrderUser;
    borrower: AdminOrderUser;
    contact: {
      name: string;
      email: string | null;
      phone: string | null;
    };
  };
  books: Array<{
    id: string;
    title_or: string;
    title_en: string | null;
    author: string | null;
    category: string | null;
    condition: string | null;
    status: string | null;
    cover_img_url: string | null;
    can_rent: boolean;
    can_sell: boolean;
    sale_price: number;
    deposit: number;
    max_lending_days: number;
    date_added: string | null;
  }>;
  shipping: {
    method: string | null;
    address: {
      street: string;
      city: string;
      postcode: string;
      country: string;
    };
    outbound: {
      carrier: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
    };
    return: {
      carrier: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
    };
    estimated_delivery_time: number | null;
  };
  payment: {
    payment_id: string | null;
    payment_status: string | null;
    payment_currency: string | null;
    payment_amount_cents: number;
    payment_created_at: string | null;
    payment_updated_at: string | null;
    payment_action_type: string | null;
    deposit_or_sale_amount: number;
    owner_income_amount: number;
    service_fee_amount: number;
    shipping_out_fee_amount: number;
    total_paid_amount: number;
    total_refunded_amount: number;
    late_fee_amount: number;
    damage_fee_amount: number;
  };
  deposit: {
    status: string;
    deducted_cents: number;
    damage_severity_final: string | null;
  };
  payment_splits: AdminOrderPaymentSplit[];
  refunds: AdminOrderRefund[];
  disputes: AdminOrderDispute[];
  complaints: AdminOrderComplaint[];
  reviews: AdminOrderReview[];
  deposit_evidence: AdminOrderDepositEvidence[];
  deposit_audit_logs: AdminOrderDepositAuditLog[];
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

export async function getAdminOrderDetails(orderId: string) {
  const API_URL = getApiUrl();

  const res = await axios.get<AdminOrderDetails>(
    `${API_URL}/api/v1/analytics/orders/${orderId}/details`,
    {
      headers: getAuthHeaders(),
      withCredentials: true,
    }
  );

  return res.data;
}

export default getFinancialMetrics;
