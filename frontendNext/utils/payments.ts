//payments.ts
import axios from "axios";
import { getApiUrl } from "./auth";

const API_URL = getApiUrl();

export async function initiatePayment(payload: {
  user_id: string;
  amount?: number;        // total price in cents
  currency?: string;     // e.g. "aud"
  purchase?: number;      // in cents
  deposit?: number;      // in cents
  shipping_fee?: number; // in cents
  service_fee?: number;  // in cents
  donation?: number;     // in cents
  checkout_id: string;
  lender_account_id: string;
}) {
  const res = await axios.post(`${API_URL}/payment_gateway/payment/initiate`, payload, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    },
    withCredentials: true,
  });
  console.log("[initiatePayment] response ->", res);

  return res.data as {
    message: string;
    payment_id: string;
    client_secret: string;
    status: string;
    lender_account_id: string;
    amount?: number;
    currency: string;
  };
}

// Create a Stripe Express account and get onboarding link
export async function createExpressAccount(email: string) {
  const res = await axios.post(
    `${API_URL}/payment_gateway/accounts/express`,
    { email },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Idempotency-Key": `acct-create-${email}`,
      },
      withCredentials: true,
    }
  );
  return res.data as { account_id: string; onboarding_url: string };
}


// Distribute the shipping fee to the owner（Stripe Connect Transfer）
export async function distributeShippingFee(
  paymentId: string,
  lenderAccountId: string,      // e.g "acct_123..."
) {
  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/distribute_shipping_fee/${paymentId}`,
    { lender_account_id: lenderAccountId },
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Idempotency-Key": `shipfee-${paymentId}-${lenderAccountId}`, // Prevent Duplicate
      },
      withCredentials: true,
    }
  );
  return res.data as {
    message: string;
    transfer_id: string;
    amount: number;     // cents
    currency: string;   // "aud"
    destination: string;
  };
}

// refund payment
export async function refundPayment(
  paymentId: string,
  opts?: { amount_cents?: number; reason?: string } // partial refunds in the future
) {
  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/refund/${paymentId}`,
    { reason: opts?.reason },
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Idempotency-Key": `refund-${paymentId}-${opts?.amount_cents ?? "full"}`,
      },
      withCredentials: true,
    }
  );
  return res.data as {
    payment_id: string;
    refund_id: string;
    status: "succeeded" | "pending" | "failed" | string;
    amount_refunded: number; // cents
    currency: string;        // e.g. "aud"
    reason?: string | null;
  };
}

// Create a new payment dispute (user-initiated)
export async function createPaymentDispute(
  paymentId: string,
  data: {
    user_id: string;
    reason: string;
    note?: string;
  }
) {
  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/dispute/create/${paymentId}`,
    {
      payment_id: paymentId,
      ...data,
    },
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
      withCredentials: true,
    }
  );
  return res.data;
}

// Handle or resolve existing dispute (admin action)
export async function handlePaymentDispute(
  paymentId: string,
  data: {
    action: "adjust" | "overrule";
    note?: string;
    deduction?: number; // amount in AUD
  }
) {
  console.log("handlePaymentDispute payload:", paymentId, data);

  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/dispute/handle/${paymentId}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
      withCredentials: true,
    }
  );
  return res.data;
}


// MVP6: Get refund records for an order
export async function getRefundsForOrder(orderId: string) {
  const res = await axios.get(
    `${API_URL}/payment_gateway/payment/refunds/${orderId}`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      withCredentials: true,
    }
  );
  return res.data as {
    order_id: string;
    refunds: Array<{
      refund_id: string;
      amount: number;
      currency: string;
      status: string;
      reason: string | null;
      created_at: string;
      updated_at: string;
    }>;
  };
}

// MVP6: Cancel order with automatic refund
export async function cancelOrderWithRefund(orderId: string) {
  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/refund/cancel/${orderId}`,
    {},
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      withCredentials: true,
    }
  );
  return res.data as {
    order_id: string;
    refund_id: string;
    amount: number;
    currency: string;
    status: string;
  };
}

// MVP6: Get all refunds for a user
export async function getUserRefunds(userId: string) {
  const res = await axios.get(
    `${API_URL}/payment_gateway/refunds/user/${userId}`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      withCredentials: true,
    }
  );
  return res.data as {
    user_id: string;
    refunds: Array<{
      refund_id: string;
      amount: number;
      currency: string;
      status: string;
      reason: string | null;
      refund_type: string;
      created_at: string | null;
      updated_at: string | null;
      order: {
        order_id: string;
        status: string;
        book_titles: string[];
        created_at: string | null;
        canceled_at: string | null;
      };
      timeline: Array<{
        event: string;
        actor: string;
        message: string;
        timestamp: string | null;
      }>;
    }>;
  };
}

// Execute compensation transfer after dispute resolved
export async function compensatePayment(
  paymentId: string,
  destination: string // Stripe connected account ID
) {
  console.log("🚀 Trigger compensatePayment:", { paymentId, destination });

  const res = await axios.post(
    `${API_URL}/payment_gateway/payment/compensate/${paymentId}?destination=${encodeURIComponent(destination)}`,
    {},
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
      withCredentials: true,
    }
  );

  console.log("Compensation API response:", res.data);
  return res.data as {
    message: string;
    transfer_id?: string;
    amount?: number;
    currency?: string;
    destination: string;
  };
}
