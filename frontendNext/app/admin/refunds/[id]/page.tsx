"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  User,
  Clock,
  AlertTriangle,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import { getAdminRefundDetail, retryRefund } from "@/utils/payments";

const STATUS_META: Record<string, { label: string; className: string; icon: string }> = {
  succeeded: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200", icon: "check" },
  pending: { label: "Processing", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "clock" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 border-red-200", icon: "alert" },
};

const TYPE_LABELS: Record<string, string> = {
  full: "Full Refund",
  deposit: "Deposit Only",
  shipping: "Shipping Only",
  partial: "Partial Refund",
  unknown: "Unknown",
};

const TRIGGER_LABELS: Record<string, string> = {
  user_cancel: "User Cancel",
  timeout: "Auto Timeout",
  admin_manual: "Admin Manual",
  payment_flow: "Payment Flow",
  unknown: "Unknown",
};

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

export default function AdminRefundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const refundId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        const isAdmin = isAdminLikeUser(me);
        setMeAdmin(isAdmin);
        if (isAdmin) {
          const data = await getAdminRefundDetail(refundId);
          setDetail(data);
        }
      } catch (err) {
        console.error("[AdminRefundDetail] Failed to load:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [refundId]);

  const handleRetry = async () => {
    if (!confirm("Are you sure you want to retry this failed refund?")) return;
    try {
      setRetrying(true);
      const result = await retryRefund(refundId);
      alert(`Refund retry initiated! New status: ${result.status}`);
      // Reload detail
      const data = await getAdminRefundDetail(result.new_refund_id);
      setDetail(data);
      // Update URL to new refund ID
      router.replace(`/admin/refunds/${result.new_refund_id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || "Unknown error";
      alert(`Retry failed: ${msg}`);
    } finally {
      setRetrying(false);
    }
  };

  const fmtAmount = (cents: number, currency?: string) => {
    const dollars = (cents / 100).toFixed(2);
    const sym = currency?.toUpperCase() === "AUD" ? "A$" : "$";
    return `${sym}${dollars}`;
  };

  const fmtDate = (v?: string | null) => {
    if (!v) return "-";
    try {
      return new Date(v).toLocaleString();
    } catch {
      return "-";
    }
  };

  if (loading) {
    return <div className="p-6">Loading refund details...</div>;
  }

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Refund Detail</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Refund Not Found</h1>
        <Link href="/admin/refunds" className="text-blue-600 underline">Back to Refund List</Link>
      </div>
    );
  }

  const meta = STATUS_META[detail.status] || STATUS_META["pending"];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/admin/refunds")}
            className="flex items-center gap-1 text-gray-500 hover:text-black mb-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Refund List
          </button>
          <h1 className="text-2xl font-bold">Refund Detail</h1>
        </div>
        {detail.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-red-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Retry Refund"}
          </button>
        )}
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl border p-4 ${meta.className}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-bold">{meta.label}</span>
            <span className="ml-3 text-sm opacity-80">{TYPE_LABELS[detail.refund_type] || detail.refund_type}</span>
          </div>
          <div className="text-3xl font-bold">{fmtAmount(detail.amount, detail.currency)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stripe IDs */}
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Stripe Information
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Refund ID</span>
              <span className="font-mono text-xs">{detail.refund_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Intent ID</span>
              <span className="font-mono text-xs">{detail.payment_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Currency</span>
              <span>{detail.currency?.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Reason</span>
              <span>{detail.reason || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Trigger</span>
              <span>{TRIGGER_LABELS[detail.trigger] || detail.trigger}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Created</span>
              <span>{fmtDate(detail.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Updated</span>
              <span>{fmtDate(detail.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Payment Breakdown */}
        {detail.payment && (
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" /> Payment Breakdown
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Original Payment</span>
                <span className="font-semibold">{fmtAmount(detail.payment.amount, detail.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit</span>
                <span>{fmtAmount(detail.payment.deposit || 0, detail.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping Fee</span>
                <span>{fmtAmount(detail.payment.shipping_fee || 0, detail.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Service Fee</span>
                <span>{fmtAmount(detail.payment.service_fee || 0, detail.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payment Status</span>
                <span className="font-medium">{detail.payment.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Action Type</span>
                <span>{detail.payment.action_type}</span>
              </div>
              {detail.payment_split && (
                <>
                  <hr />
                  <div className="flex justify-between">
                    <span className="text-gray-500">Split: Deposit</span>
                    <span>{fmtAmount(detail.payment_split.deposit_cents, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Split: Shipping</span>
                    <span>{fmtAmount(detail.payment_split.shipping_cents, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Split: Service Fee</span>
                    <span>{fmtAmount(detail.payment_split.service_fee_cents, detail.currency)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Borrower */}
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> Borrower
          </h2>
          {detail.borrower ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{detail.borrower.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span>{detail.borrower.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">User ID</span>
                <span className="font-mono text-xs">{detail.borrower.user_id}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No borrower information available.</p>
          )}
        </div>

        {/* Lender */}
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> Lender
          </h2>
          {detail.lender ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{detail.lender.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span>{detail.lender.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">User ID</span>
                <span className="font-mono text-xs">{detail.lender.user_id}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No lender information available.</p>
          )}
        </div>
      </div>

      {/* Order Info */}
      {detail.order && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" /> Related Order
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">Order ID</span>
              <span className="font-mono text-xs">{detail.order.order_id}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Status</span>
              <span className="font-medium">{detail.order.status}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Books</span>
              <span>{detail.order.book_titles?.join(", ") || "N/A"}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Created</span>
              <span>{fmtDate(detail.order.created_at)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disputes */}
      {detail.disputes && detail.disputes.length > 0 && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Related Disputes ({detail.disputes.length})
          </h2>
          <div className="space-y-2">
            {detail.disputes.map((d: any) => (
              <div key={d.dispute_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-gray-500">{d.dispute_id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    d.status === "resolved" ? "bg-green-100 text-green-700"
                    : d.status === "open" ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
                  }`}>
                    {d.status}
                  </span>
                </div>
                <p className="text-gray-700">{d.reason}</p>
                {d.note && <p className="text-gray-500 text-xs mt-1">Note: {d.note}</p>}
                {d.deduction > 0 && (
                  <p className="text-xs text-red-600 mt-1">Deduction: {fmtAmount(d.deduction, detail.currency)}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{fmtDate(d.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Timeline */}
      {detail.timeline && detail.timeline.length > 0 && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" /> Audit Timeline
          </h2>
          <div className="relative pl-6">
            {detail.timeline.map((log: any, i: number) => (
              <div key={i} className="relative pb-4 last:pb-0">
                {/* Timeline line */}
                {i < detail.timeline.length - 1 && (
                  <div className="absolute left-[-16px] top-3 w-px h-full bg-gray-200" />
                )}
                {/* Timeline dot */}
                <div className="absolute left-[-20px] top-1.5 w-2 h-2 rounded-full bg-gray-400" />
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{log.event}</span>
                    <span className="text-xs text-gray-400">by {log.actor || "system"}</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-0.5">{log.message}</p>
                  <p className="text-gray-400 text-xs">{fmtDate(log.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
