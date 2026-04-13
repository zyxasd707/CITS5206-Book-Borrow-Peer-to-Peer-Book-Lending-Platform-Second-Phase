// borrowing orders detail
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, Truck, ArrowLeft, AlertTriangle, ExternalLink } from "lucide-react";
import CoverImg from "@/app/components/ui/CoverImg";
import Card from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import Modal from "@/app/components/ui/Modal";
import { toast } from "sonner";
import { getApiUrl, getToken, getCurrentUser } from "@/utils/auth";
import { getReviewsByOrder } from "@/utils/review";
import { getRefundsForOrder, cancelOrderWithRefund } from "@/utils/payments";

import type { OrderStatus, ApiOrder } from "@/app/types/order";
import type { User } from "@/app/types/user";

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", className: "text-amber-600" },
  PENDING_SHIPMENT: { label: "Pending Shipment", className: "text-blue-600" },
  BORROWING: { label: "Borrowing", className: "text-green-600" },
  OVERDUE: { label: "Overdue", className: "text-red-600" },
  RETURNED: { label: "Returned", className: "text-gray-700" },
  COMPLETED: { label: "Completed", className: "text-gray-500" },
  CANCELED: { label: "Canceled", className: "text-gray-400" },
};

const fmtAUD = (amount?: number) =>
  typeof amount === "number" ? `A$ ${amount.toFixed(2)}` : "—";

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

const TX_STAGE_META = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", className: "bg-blue-100 text-blue-800" },
  shipped: { label: "Shipped", className: "bg-green-100 text-green-800" },
  canceled: { label: "Canceled", className: "bg-gray-100 text-gray-700" },
} as const;

const fetchOrderDetails = async (orderId: string): Promise<ApiOrder | null> => {
  try {
    const apiUrl = getApiUrl();
    const token = getToken();

    const response = await fetch(`${apiUrl}/api/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch order: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching order details:", error);
    return null;
  }
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hasReviewedOtherParty, setHasReviewedOtherParty] = useState(false);

  // useState for shipping
  const [shipModalOpen, setShipModalOpen] = useState(false); // control if Modal should display
  const [trackingNumber, setTrackingNumber] = useState(""); // input tracking number
  const [carrier, setCarrier] = useState("AUSPOST"); // default carrier="AUSPOST"
  const [confirmReceiveModalOpen, setConfirmReceiveModalOpen] = useState(false);

  // MVP6: refund state
  const [refunds, setRefunds] = useState<Array<{
    refund_id: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    created_at: string;
    updated_at: string;
  }>>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const [orderData, userData] = await Promise.all([
          fetchOrderDetails(id),
          getCurrentUser(),
        ]);

        if (orderData) {
          setOrder(orderData);

          // MVP6: fetch refund records for this order
          try {
            const refundData = await getRefundsForOrder(id);
            setRefunds(refundData.refunds || []);
          } catch (err) {
            console.error("Failed to fetch refunds:", err);
          }

          // Check if current user has already reviewed the other party in this order
          if (userData) {
            try {
              const reviews = await getReviewsByOrder(id);
              // Check if current user has written a review for this order
              const userReview = reviews.find(
                (review: any) => review.reviewerId === userData.id
              );
              setHasReviewedOtherParty(!!userReview);
            } catch (err) {
              console.error("Failed to check reviews:", err);
            }
          }
        } else {
          setError("Failed to load order details");
        }

        setUser(userData);
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  const statusMeta = useMemo(
    () => (order ? STATUS_META[order.status] : null),
    [order]
  );

  const booksInOrder = useMemo(() => {
    if (!order) return [];
    return order.books.map((book) => ({
      id: book.bookId,
      title: book.titleEn,
      author: book.author,
      coverUrl: book.coverImgUrl || "/images/placeholder-book.png",
      isbn: "",
      publisher: "",
      publishedYear: 0,
      description: "",
      category: "",
      condition: "good" as const,
      language: "en" as const,
      availableForBorrow: false,
      availableForSale: false,
      borrowPrice: { amount: 0 },
      salePrice: { amount: 0 },
      deposit: { amount: 0 },
      ownerId: order.owner.id,
      createdAt: "",
      updatedAt: "",
    }));
  }, [order]);

  const isOverdue =
    order &&
    (order.status === "BORROWING" || order.status === "OVERDUE") &&
    order.dueAt &&
    new Date(order.dueAt).getTime() < Date.now();

  const isOwner = user?.id === order?.owner.id;
  const isBorrower = user?.id === order?.borrower.id;
  const txStage: keyof typeof TX_STAGE_META = useMemo(() => {
    if (!order) return "pending";
    if (order.status === "CANCELED") return "canceled";
    if (order.status === "PENDING_PAYMENT") return "pending";
    if (order.status === "PENDING_SHIPMENT") return "paid";
    if (order.shippingOutTrackingNumber) return "shipped";
    if (["BORROWING", "OVERDUE", "RETURNED", "COMPLETED"].includes(order.status)) {
      return "shipped";
    }
    return "paid";
  }, [order]);

  const handleCancelOrder = async () => {
    if (!user) {
      toast.error("Please login first");
      router.push("/auth");
      return;
    }

    const confirmCancel = window.confirm(
      "Are you sure you want to cancel this order? This action cannot be undone."
    );
    if (!confirmCancel) return;

    try {
      const token = getToken();
      if (!token) {
        toast.error("Authentication required. Please log in again.");
        router.push("/auth");
        return;
      }

      // MVP6: If order is PENDING_SHIPMENT, use refund-cancel endpoint
      if (order?.status === "PENDING_SHIPMENT") {
        try {
          const result = await cancelOrderWithRefund(order.id);
          toast.success(`Order cancelled. Refund of ${(result.amount / 100).toFixed(2)} ${result.currency} initiated.`);
          const updatedOrder = await fetchOrderDetails(id);
          if (updatedOrder) setOrder(updatedOrder);
          // Refresh refund data
          const refundData = await getRefundsForOrder(id);
          setRefunds(refundData.refunds || []);
          return;
        } catch (refundErr) {
          console.error("Refund-cancel failed, falling back:", refundErr);
        }
      }

      const res = await fetch(
        `${getApiUrl()}/api/v1/orders/${order!.id}/cancel`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to cancel order");

      toast.success("Order cancelled successfully");

      const updatedOrder = await fetchOrderDetails(id);
      if (updatedOrder) {
        setOrder(updatedOrder);
      }
    } catch (err) {
      console.error("Cancel order error:", err);
      toast.error("Failed to cancel order");
    }
  };

  const handleAuthRequired = (path: string) => {
    if (!user) {
      toast.error("Please login first");
      router.push("/auth");
      return;
    }
    router.push(path);
  };

  const handleConfirmReceive = async (orderId: string) => {
    try {
      const token = getToken();
      if (!token) {
        toast.error("Please login first");
        router.push("/auth");
        return;
      }

      const res = await fetch(
        `${getApiUrl()}/api/v1/orders/${orderId}/owner-confirm-received`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to confirm receive");

      toast.success("Book received successfully");

      const updatedOrder = await fetchOrderDetails(orderId);
      if (updatedOrder) setOrder(updatedOrder);
    } catch (err) {
      console.error(err);
      toast.error("Failed to confirm receive");
    }
  };

  const handleConfirmShipment = async () => {
    if (!order) return;

    try {
      const token = getToken();
      if (!token) {
        toast.error("Authentication required");
        router.push("/auth");
        return;
      }

      const res = await fetch(
        `${getApiUrl()}/api/v1/orders/${order.id}/confirm-shipment`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tracking_number: trackingNumber,
            carrier: carrier,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to confirm shipment");

      toast.success("Shipment confirmed successfully");

      const updatedOrder = await fetchOrderDetails(order.id);
      if (updatedOrder) {
        setOrder(updatedOrder);
      }

      setShipModalOpen(false); // close Modal
    } catch (err) {
      console.error(err);
      toast.error("Failed to confirm shipment");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <div className="p-6">Loading order details...</div>
        </Card>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <div className="p-6">{error || "Order not found."}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Order ID + Status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Order #{order.id}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {statusMeta && (
            <p className={`mt-1 text-2xl font-bold ${statusMeta.className}`}>
              {statusMeta.label}
            </p>
          )}
        </div>
      </div>

      {/* Section 1 — Order Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Order Info</h2>
          <div className="text-sm text-gray-500 mt-3 flex flex-col gap-1">
            <div>
              Owner:{" "}
              <span className="text-black font-medium">{order.owner.name}</span>
            </div>
            <div>
              Borrower:{" "}
              <span className="text-black font-medium">
                {order.borrower.name}
              </span>
            </div>
            {order.dueAt && (
              <div className="flex text-black font-medium items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>Due: {fmtDate(order.dueAt)}</span>
                {isOverdue && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                    <AlertTriangle className="w-4 h-4" /> Overdue
                  </span>
                )}
              </div>
            )}
            <div className="pt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TX_STAGE_META[txStage].className}`}
              >
                Transaction: {TX_STAGE_META[txStage].label}
              </span>
            </div>
          </div>
        </Card>

        {/* Shipping Info */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Shipping Info</h2>
          <div className="mt-3 text-gray-500 text-sm">
            <div>
              Delivery Method:{" "}
              <span className="font-medium text-black">
                {order.shippingMethod}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <div>
                Contact:{" "}
                <span className="font-medium text-black">
                  {order.contactName}
                </span>
              </div>
              <div>
                Phone:{" "}
                <span className="font-medium text-black">{order.phone}</span>
              </div>
              <div>
                Address:{" "}
                <span className="font-medium text-black">
                  {order.street}, {order.city}, {order.postcode},{" "}
                  {order.country}
                </span>
              </div>
            </div>
            {(order.shippingOutTrackingNumber ||
              order.shippingReturnTrackingNumber) && (
              <div className="mt-2 flex items-center gap-6 flex-wrap">
                {order.shippingOutTrackingNumber && (
                  <span className="inline-flex items-center gap-1">
                    <Truck className="w-4 h-4" /> Outbound:&nbsp;
                    {order.shippingOutTrackingUrl ? (
                      <a
                        className="underline font-medium text-black"
                        href={order.shippingOutTrackingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.shippingOutTrackingNumber}
                      </a>
                    ) : (
                      order.shippingOutTrackingNumber
                    )}
                  </span>
                )}
                {order.shippingReturnTrackingNumber && (
                  <span className="inline-flex items-center gap-1">
                    <Truck className="w-4 h-4" /> Return:&nbsp;
                    {order.shippingReturnTrackingUrl ? (
                      <a
                        className="underline"
                        href={order.shippingReturnTrackingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.shippingReturnTrackingNumber}
                      </a>
                    ) : (
                      order.shippingReturnTrackingNumber
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Section 2 — Books */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Books in this order</h2>
        {booksInOrder.length === 0 ? (
          <div className="text-sm text-gray-600">No books found.</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {booksInOrder.map((b) => (
              <div key={b.id} className="border rounded-lg p-3 w-48">
                <CoverImg
                  src={b.coverUrl}
                  title={b.title}
                  className="w-full h-32 object-cover rounded mb-2"
                />
                <h4 className="font-medium text-sm truncate">{b.title}</h4>
                <p className="text-xs text-gray-600 truncate">{b.author}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Section 3 - Pricing */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-base font-semibold mb-3">Pricing</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Deposit/Sale Amount</span>
              <span className="font-medium">
                {fmtAUD(order.depositOrSaleAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Service Fee</span>
              <span className="font-medium">
                {fmtAUD(order.serviceFeeAmount)}
              </span>
            </div>
            {order.shippingOutFeeAmount > 0 && (
              <div className="flex justify-between">
                <span>Outbound Shipping</span>
                <span className="font-medium">
                  {fmtAUD(order.shippingOutFeeAmount)}
                </span>
              </div>
            )}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between text-sm">
            <span>Total Paid</span>
            <span className="font-semibold text-black">
              {fmtAUD(order.totalPaidAmount)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-base font-semibold mb-3">Settlement</h3>
          <div className="space-y-2 text-sm">
            {order.lateFeeAmount > 0 && (
              <div className="flex justify-between">
                <span>Late Fee</span>
                <span className="font-medium">
                  {fmtAUD(order.lateFeeAmount)}
                </span>
              </div>
            )}
            {order.damageFeeAmount > 0 && (
              <div className="flex justify-between">
                <span>Damage Fee</span>
                <span className="font-medium">
                  {fmtAUD(order.damageFeeAmount)}
                </span>
              </div>
            )}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between text-sm">
            <span>Total Refunded</span>
            <span className="font-semibold text-black">
              {fmtAUD(order.totalRefundedAmount)}
            </span>
          </div>
        </Card>
      </div>

      {/* Section: Refund Status (MVP6 F1) */}
      {refunds.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
              Refund Status
            </h3>
            {(() => {
              const latestStatus = refunds[0]?.status;
              if (latestStatus === "succeeded" || latestStatus === "refunded") {
                return (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Refund Completed
                  </span>
                );
              }
              if (latestStatus === "failed") {
                return (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                    Refund Failed
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Processing...
                </span>
              );
            })()}
          </div>

          <div className="border-t" />

          <div className="p-4 space-y-4">
            {refunds.map((r) => (
              <div key={r.refund_id} className="flex items-start justify-between gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${
                      r.status === "succeeded" || r.status === "refunded"
                        ? "bg-green-500"
                        : r.status === "failed"
                        ? "bg-red-500"
                        : "bg-amber-500 animate-pulse"
                    }`} />
                    <span className="text-sm font-semibold capitalize">{r.status}</span>
                  </div>
                  {r.reason && (
                    <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold">
                    {(r.amount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 uppercase">{r.currency}</p>
                </div>
              </div>
            ))}
          </div>

          {refunds[0]?.status === "failed" && (
            <div className="border-t p-4 bg-red-50">
              <p className="text-sm text-red-700">
                Your refund could not be processed. Please contact support for assistance.
              </p>
            </div>
          )}

          <div className="border-t p-4">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-black text-black hover:bg-black hover:text-white"
              onClick={() => router.push(`/refunds/${id}`)}
            >
              <ExternalLink className="w-4 h-4" />
              View Refund Details
            </Button>
          </div>
        </Card>
      )}

      {/* Section 4 — Actions */}
      <Card className="p-4">
        <h3 className="text-base font-semibold mb-3">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {isBorrower &&
            (order.status === "BORROWING" ||
              order.status === "RETURNED" ||
              order.status === "OVERDUE") && (
              <Button
                className="bg-black text-white hover:bg-gray-800"
                onClick={() => setShipModalOpen(true)}
              >
                {order.shippingReturnTrackingNumber
                  ? "Update Return"
                  : "Return"}
              </Button>
            )}

          {(isBorrower || isOwner) && (order.status === "PENDING_PAYMENT" || order.status === "PENDING_SHIPMENT") && (
            <Button
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50"
              onClick={handleCancelOrder}
            >
              Cancel Order
            </Button>
          )}

          {isOwner && order.status === "PENDING_SHIPMENT" && (
            <Button
              className="bg-black text-white hover:bg-gray-800"
              onClick={() => setShipModalOpen(true)}
            >
              {order.shippingOutTrackingNumber ? "Update Shipment" : "Ship"}
            </Button>
          )}

          {order.status !== "COMPLETED" && order.status !== "CANCELED" && (
            <Button
              variant="outline"
              className="border-black text-black hover:bg-black hover:text-white"
              onClick={() => {
                const otherEmail = isBorrower ? order.owner.email : order.borrower.email;
                handleAuthRequired(`/message?to=${encodeURIComponent(otherEmail)}`);
              }}
            >
              Message
            </Button>
          )}

          {order.status !== "COMPLETED" &&
            order.status !== "PENDING_PAYMENT" && (
              <Button
                variant="outline"
                className="border-black text-black hover:bg-black hover:text-white"
                onClick={() =>
                  handleAuthRequired(`/complain?orderId=${order.id}`)
                }
              >
                Support
              </Button>
            )}

          {order.status === "COMPLETED" && !hasReviewedOtherParty && (
            <Button
              className="bg-black text-white hover:bg-gray-800"
              onClick={() =>
                handleAuthRequired(`/borrowing/${order.id}/review`)
              }
            >
              Write Review
            </Button>
          )}

          {!user && (
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => router.push("/auth")}
            >
              Login to View Actions
            </Button>
          )}
          {isOwner && order.status === "RETURNED" && (
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => setConfirmReceiveModalOpen(true)}
            >
              Confirm Receive Book
            </Button>
          )}
        </div>
      </Card>

      {/* Section 5 — More Details */}
      <Card className="p-4">
        <h3 className="text-base font-semibold mb-2">More Details</h3>
        <div className="grid md:grid-cols-2 text-sm gap-y-1">
          <div>
            Order ID: <span className="font-medium">{order.id}</span>
          </div>
          <div>
            Status:{" "}
            <span className="font-medium">
              {STATUS_META[order.status].label}
            </span>
          </div>
          <div>
            Action Type: <span className="font-medium">{order.actionType}</span>
          </div>
          <div>
            Created:{" "}
            <span className="font-medium">{fmtDate(order.createdAt)}</span>
          </div>
          <div>
            Updated:{" "}
            <span className="font-medium">{fmtDate(order.updatedAt)}</span>
          </div>
          {order.startAt && (
            <div>
              Start Borrowing:{" "}
              <span className="font-medium">{fmtDate(order.startAt)}</span>
            </div>
          )}
          {order.dueAt && (
            <div>
              Due: <span className="font-medium">{fmtDate(order.dueAt)}</span>
            </div>
          )}
          {order.returnedAt && (
            <div>
              Returned:{" "}
              <span className="font-medium">{fmtDate(order.returnedAt)}</span>
            </div>
          )}
          {order.completedAt && (
            <div>
              Completed:{" "}
              <span className="font-medium">{fmtDate(order.completedAt)}</span>
            </div>
          )}
          {order.canceledAt && (
            <div>
              Canceled:{" "}
              <span className="font-medium">{fmtDate(order.canceledAt)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Ship Modal */}
      <Modal
        isOpen={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title={
          isOwner && order?.status === "PENDING_SHIPMENT"
            ? "Confirm Outbound Shipment"
            : "Confirm Return Shipment"
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Carrier</label>
            <select
              className="border rounded w-full p-2"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              <option value="AUSPOST">AUSPOST</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Tracking Number
            </label>
            <input
              type="text"
              className="border rounded w-full p-2"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShipModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmShipment}
              disabled={!trackingNumber.trim()}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmReceiveModalOpen}
        onClose={() => setConfirmReceiveModalOpen(false)}
        title="Confirm Receive Book"
      >
        <div className="space-y-4">
          <p>
            Are you sure you have received the returned books? This action will
            mark the order as COMPLETED and trigger refund if applicable.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmReceiveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleConfirmReceive(order!.id);
                setConfirmReceiveModalOpen(false);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
