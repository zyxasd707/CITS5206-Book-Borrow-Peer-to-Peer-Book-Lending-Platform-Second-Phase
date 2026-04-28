"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { getRefundsForOrder } from "@/utils/payments";
import { getCurrentUser } from "@/utils/auth";
import { formatLocalDateTime } from "@/utils/datetime";

interface RefundRecord {
  refund_id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderInfo {
  id: string;
  status: string;
  books: Array<{ bookId: string; titleEn: string; titleOr: string; author: string; coverImgUrl: string }>;
  createdAt: string | null;
  canceledAt: string | null;
  totalPaidAmount: number;
  totalRefundedAmount: number;
  depositOrSaleAmount: number;
  ownerIncomeAmount?: number;
  shippingOutFeeAmount: number;
  serviceFeeAmount: number;
  paymentId: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string; bgClassName: string }> = {
  succeeded: { label: "Completed", icon: CheckCircle, className: "text-green-600", bgClassName: "bg-green-50 border-green-200" },
  pending: { label: "Processing", icon: Clock, className: "text-yellow-600", bgClassName: "bg-yellow-50 border-yellow-200" },
  failed: { label: "Failed", icon: XCircle, className: "text-red-600", bgClassName: "bg-red-50 border-red-200" },
};

export default function RefundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const user = await getCurrentUser();
        if (!user?.id) {
          setError("Please log in to view refund details.");
          return;
        }

        // Fetch refunds for this order
        const refundData = await getRefundsForOrder(orderId);
        setRefunds(refundData.refunds);

        // Fetch full order details so pricing fields stay in sync with borrowing page
        const { getOrderById } = await import("@/utils/borrowingOrders");
        const matchedOrder = await getOrderById(orderId);
        if (matchedOrder) {
          setOrder({
            id: matchedOrder.id || matchedOrder.order_id,
            status: matchedOrder.status,
            books: matchedOrder.books.map((b: any) => ({
              bookId: b.book_id || b.bookId,
              titleEn: b.title || b.titleEn,
              titleOr: b.titleOr || "",
              author: b.author || "",
              coverImgUrl: b.cover || b.coverImgUrl || "",
            })),
            createdAt: matchedOrder.createdAt || matchedOrder.create_at,
            canceledAt: matchedOrder.canceledAt || matchedOrder.canceled_at,
            totalPaidAmount: matchedOrder.totalPaidAmount || matchedOrder.total_paid_amount || matchedOrder.total_paid || 0,
            totalRefundedAmount: matchedOrder.totalRefundedAmount || matchedOrder.total_refunded_amount || matchedOrder.total_refunded || 0,
            depositOrSaleAmount: matchedOrder.depositOrSaleAmount || matchedOrder.deposit_or_sale_amount || matchedOrder.deposit || 0,
            ownerIncomeAmount: matchedOrder.ownerIncomeAmount || matchedOrder.owner_income_amount || matchedOrder.owner_income || 0,
            shippingOutFeeAmount: matchedOrder.shippingOutFeeAmount || matchedOrder.shipping_out_fee_amount || matchedOrder.shipping_fee || 0,
            serviceFeeAmount: matchedOrder.serviceFeeAmount || matchedOrder.service_fee_amount || matchedOrder.service_fee || 0,
            paymentId: matchedOrder.payment_id || matchedOrder.paymentId || null,
          });
        }
      } catch (err) {
        console.error("Failed to load refund details:", err);
        setError("Failed to load refund details. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [orderId]);

  const fmtDate = (v?: string | null) => formatLocalDateTime(v, "-");

  const fmtAmount = (amount: number, currency: string) => {
    const dollars = (amount / 100).toFixed(2);
    const sym = currency.toUpperCase() === "AUD" ? "A$" : "$";
    return `${sym}${dollars} ${currency.toUpperCase()}`;
  };

  const fmtDollars = (amount: number) => {
    return `A$${amount.toFixed(2)} AUD`;
  };

  // Build timeline from order + refund data
  const buildTimeline = () => {
    const events: Array<{ label: string; time: string | null; icon: React.ElementType; done: boolean }> = [];

    if (order?.createdAt) {
      events.push({ label: "Order placed", time: order.createdAt, icon: CheckCircle, done: true });
    }

    // Payment is always done if order exists
    if (order) {
      events.push({ label: "Payment completed", time: order.createdAt, icon: CheckCircle, done: true });
    }

    if (order?.canceledAt) {
      events.push({ label: "Order cancelled", time: order.canceledAt, icon: AlertCircle, done: true });
    }

    if (refunds.length > 0) {
      const firstRefund = refunds[refunds.length - 1]; // oldest
      events.push({ label: "Refund initiated", time: firstRefund.created_at, icon: Clock, done: true });

      if (firstRefund.status === "succeeded") {
        events.push({ label: "Refund completed", time: firstRefund.updated_at || firstRefund.created_at, icon: CheckCircle, done: true });
      } else if (firstRefund.status === "failed") {
        events.push({ label: "Refund failed", time: firstRefund.updated_at || firstRefund.created_at, icon: XCircle, done: true });
      } else {
        events.push({ label: "Refund processing", time: null, icon: Clock, done: false });
      }
    }

    return events;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card><div className="p-4 text-gray-600">Loading refund details...</div></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card><div className="p-4 text-red-600">{error}</div></Card>
      </div>
    );
  }

  if (refunds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-black mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Card>
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No refunds found</h3>
            <p className="text-gray-500">This order has no refund records.</p>
          </div>
        </Card>
      </div>
    );
  }

  const primaryRefund = refunds[0]; // most recent
  const statusConfig = STATUS_CONFIG[primaryRefund.status] || STATUS_CONFIG["pending"];
  const StatusIcon = statusConfig.icon;
  const timeline = buildTimeline();

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Back button */}
          <button
            onClick={() => router.push("/refunds")}
            className="flex items-center gap-1 text-gray-500 hover:text-black mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to My Refunds
          </button>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Refund Details</h1>
            <p className="text-gray-500 text-sm">Order ID: {orderId}</p>
          </div>

          {/* Status Banner */}
          <Card className={`p-5 mb-6 border ${statusConfig.bgClassName}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon className={`w-8 h-8 ${statusConfig.className}`} />
                <div>
                  <h2 className={`text-xl font-bold ${statusConfig.className}`}>
                    Refund {statusConfig.label}
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {primaryRefund.reason || "No reason provided"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  {fmtAmount(primaryRefund.amount, primaryRefund.currency)}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Timeline */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Timeline</h3>
                <div className="space-y-0">
                  {timeline.map((event, idx) => {
                    const Icon = event.icon;
                    const isLast = idx === timeline.length - 1;
                    return (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <Icon
                            className={`w-5 h-5 flex-shrink-0 ${
                              event.done ? "text-green-500" : "text-gray-300"
                            }`}
                          />
                          {!isLast && (
                            <div className={`w-0.5 h-8 ${event.done ? "bg-green-200" : "bg-gray-200"}`} />
                          )}
                        </div>
                        <div className="pb-6">
                          <p className={`text-sm font-medium ${event.done ? "text-gray-900" : "text-gray-400"}`}>
                            {event.label}
                          </p>
                          {event.time && (
                            <p className="text-xs text-gray-500">{fmtDate(event.time)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Related Order */}
              {order && (
                <Card className="p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Related Order</h3>
                  <div className="space-y-3">
                    {order.books.map((book, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {book.coverImgUrl ? (
                          <img
                            src={book.coverImgUrl}
                            alt={book.titleEn}
                            className="w-12 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-16 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
                            No Cover
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{book.titleEn}</p>
                          {book.author && <p className="text-sm text-gray-500">{book.author}</p>}
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-black text-black hover:bg-black hover:text-white"
                      onClick={() => router.push(`/borrowing/${orderId}`)}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View Order Details
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Refund Breakdown */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Refund Summary</h3>
                <div className="space-y-2 text-sm">
                  {order && (
                    <>
                      <div className="flex justify-between text-gray-600">
                        <span>Original Payment</span>
                        <span>{fmtDollars(order.totalPaidAmount)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 pl-3">
                        <span>Deposit</span>
                        <span>{fmtDollars(order.depositOrSaleAmount)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 pl-3">
                        <span>Shipping Fee</span>
                        <span>{fmtDollars(order.shippingOutFeeAmount)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 pl-3">
                        <span>Service Fee</span>
                        <span>{fmtDollars(order.serviceFeeAmount)}</span>
                      </div>
                      {(order.ownerIncomeAmount || 0) > 0 && (
                        <div className="flex justify-between text-gray-500 pl-3">
                          <span>Rental Fee</span>
                          <span>{fmtDollars(order.ownerIncomeAmount || 0)}</span>
                        </div>
                      )}
                      <hr className="my-2" />
                    </>
                  )}
                  <div className="flex justify-between font-semibold text-gray-900">
                    <span>Total Refunded</span>
                    <span className="text-green-600">
                      {fmtAmount(primaryRefund.amount, primaryRefund.currency)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Refund Info */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Refund Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Refund ID</span>
                    <span className="text-gray-900 font-mono text-xs">{primaryRefund.refund_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-medium ${statusConfig.className}`}>{statusConfig.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reason</span>
                    <span className="text-gray-900">{primaryRefund.reason || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Initiated</span>
                    <span className="text-gray-900">{fmtDate(primaryRefund.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last Updated</span>
                    <span className="text-gray-900">{fmtDate(primaryRefund.updated_at)}</span>
                  </div>
                </div>
              </Card>

              {/* Multiple refunds for same order */}
              {refunds.length > 1 && (
                <Card className="p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    All Refunds ({refunds.length})
                  </h3>
                  <div className="space-y-3">
                    {refunds.map((r) => {
                      const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG["pending"];
                      return (
                        <div key={r.refund_id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className} ${cfg.bgClassName}`}>
                              {cfg.label}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">{fmtDate(r.created_at)}</span>
                          </div>
                          <span className="font-semibold">{fmtAmount(r.amount, r.currency)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
