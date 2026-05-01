// My borrowing books
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, Package, Clock, AlertTriangle, ArrowDownCircle, ArrowUpCircle, User as UserIcon, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import CoverImg from "../components/ui/CoverImg";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/AsyncState";
import type { OrderStatus } from "@/app/types/order";
import { confirmBorrowerReceived, getBorrowingOrders, type Order } from "@/utils/borrowingOrders";
import { getCurrentUser } from "@/utils/auth";
import { getMyDeposits, type DepositSummaryItem } from "@/utils/deposits";
import { getDepositBadge } from "@/utils/depositBadge";
import { formatLocalDateTime } from "@/utils/datetime";

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", className: "text-amber-600" },
  PENDING_SHIPMENT: { label: "Pending Shipment", className: "text-blue-600" },
  BORROWING: { label: "Borrowing", className: "text-green-600" },
  OVERDUE: { label: "Overdue", className: "text-red-600" },
  RETURNED: { label: "Returned", className: "text-gray-700" },
  COMPLETED: { label: "Completed", className: "text-gray-500" },
  CANCELED: { label: "Canceled", className: "text-gray-400" },
};

const TX_STAGE_META = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", className: "bg-blue-100 text-blue-800" },
  shipped: { label: "Shipped", className: "bg-green-100 text-green-800" },
  canceled: { label: "Canceled", className: "bg-gray-100 text-gray-700" },
} as const;

function getTransactionStage(
  status: OrderStatus,
  shippingOutTrackingNumber?: string | null
): keyof typeof TX_STAGE_META {
  if (status === "PENDING_PAYMENT") return "pending";
  if (shippingOutTrackingNumber) return "shipped";
  if (status === "PENDING_SHIPMENT") return "paid";
  if (status === "CANCELED") return "canceled";
  return "shipped";
}

function getDisplayedStatusMeta(
  status: OrderStatus,
  shippingOutTrackingNumber?: string | null
) {
  if (status === "PENDING_SHIPMENT" && shippingOutTrackingNumber) {
    return { label: "Shipped", className: "text-green-600" };
  }
  return STATUS_META[status];
}

function getEffectiveStatus(order: Order): OrderStatus {
  if (
    order.action_type === "borrow" &&
    order.status === "PENDING_SHIPMENT" &&
    order.shipping_out_tracking_number
  ) {
    return "BORROWING";
  }
  return order.status;
}

export default function OrderListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [usersCache, setUsersCache] = useState<Record<string, any>>({});
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [depositMap, setDepositMap] = useState<Record<string, DepositSummaryItem>>({});
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [apiOrders, user] = await Promise.all([
          getBorrowingOrders(),
          getCurrentUser()
        ]);
        setOrders(apiOrders);
        setCurrentUserId(user?.id || null);

        // Fetch user details for all unique user IDs
        const userIds = new Set<string>();
        apiOrders.forEach(order => {
          if (order.borrower_id) userIds.add(order.borrower_id);
          if (order.owner_id) userIds.add(order.owner_id);
        });

        // Fetch all users in parallel
        const { getUserById } = await import("@/utils/auth");
        const userPromises = Array.from(userIds).map(id => getUserById(id));
        const users = await Promise.all(userPromises);

        // Build users cache
        const cache: Record<string, any> = {};
        users.forEach(u => {
          if (u) cache[u.id] = u;
        });
        setUsersCache(cache);

        // Fetch deposit summaries (covers both borrower- and lender-side rows)
        if (user?.id) {
          try {
            const deposits = await getMyDeposits(user.id);
            const map: Record<string, DepositSummaryItem> = {};
            deposits.forEach((d) => {
              map[d.orderId] = d;
            });
            setDepositMap(map);
          } catch (e) {
            console.error("Failed to load deposit summaries:", e);
          }
        }

      } catch (error) {
        console.error("Failed to load orders:", error);
        setError("Failed to load orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Search and filter
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (statusFilter !== "all") {
      list = list.filter((o) => getEffectiveStatus(o) === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) => {
        const bookMatched = o.books.some((book) =>
          book.title.toLowerCase().includes(q)
        );
        return bookMatched || o.order_id.toLowerCase().includes(q);
      });
    }
    return list;
  }, [orders, statusFilter, search]);

  const countBy = (s: OrderStatus) =>
    orders.filter((o) => getEffectiveStatus(o) === s).length;

  const handleConfirmReceive = async (orderId: string) => {
    try {
      setConfirmingOrderId(orderId);
      await confirmBorrowerReceived(orderId);
      const refreshedOrders = await getBorrowingOrders();
      setOrders(refreshedOrders);
      toast.success("Book received successfully");
    } catch (error) {
      console.error("Failed to confirm receipt:", error);
      toast.error("Failed to confirm receive");
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const filterOptions = [
    {
      value: "PENDING_PAYMENT",
      label: "Pending Payment",
      count: countBy("PENDING_PAYMENT"),
    },
    {
      value: "PENDING_SHIPMENT",
      label: "Pending Shipment",
      count: countBy("PENDING_SHIPMENT"),
    },
    { value: "BORROWING", label: "Borrowing", count: countBy("BORROWING") },
    { value: "OVERDUE", label: "Overdue", count: countBy("OVERDUE") },
    { value: "RETURNED", label: "Returned", count: countBy("RETURNED") },
    { value: "COMPLETED", label: "Completed", count: countBy("COMPLETED") },
    { value: "CANCELED", label: "Canceled", count: countBy("CANCELED") },
    { value: "all", label: "All", count: orders.length },
  ] as const;

  // Format date helper
  const fmtDate = (v?: string) => formatLocalDateTime(v);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                My Borrowing Orders
              </h1>
              <p className="text-gray-600">
                View and manage your borrowing orders
              </p>
            </div>
            <Button
              variant="outline"
              className="flex items-center gap-2 border-black text-black hover:bg-black hover:text-white"
              onClick={() => router.push("/refunds")}
            >
              <RefreshCw className="w-4 h-4" />
              My Refunds
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by book title or order ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    statusFilter === option.value ? "default" : "outline"
                  }
                  onClick={() => setStatusFilter(option.value as any)}
                  className={`flex items-center gap-2 ${
                    statusFilter === option.value
                      ? "bg-black text-white hover:bg-gray-800 border-black"
                      : ""
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {option.label}
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                    {option.count}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Error / Loading */}
          {error && (
            <ErrorState
              title="Failed to load orders"
              description={error}
              onRetry={() => window.location.reload()}
            />
          )}
          {loading && (
            <LoadingState title="Loading orders..." description="Fetching your latest transactions." />
          )}

          {/* Order list */}
          {!loading && !error && (
            <div className="space-y-4">
              {filteredOrders.length === 0 ? (
                <EmptyState
                  title="No orders found"
                  description="Try adjusting filters or search terms."
                />
              ) : (
                filteredOrders.map((order) => {
                  const firstBook = order.books[0];
                  const extra = Math.max(0, order.books.length - 1);
                  const isBorrower =
                    currentUserId !== null && order.borrower_id === currentUserId;
                  const canConfirmReceive =
                    isBorrower &&
                    order.status === "PENDING_SHIPMENT" &&
                    !!order.shipping_out_tracking_number;
                  const meta = getDisplayedStatusMeta(
                    order.status,
                    order.shipping_out_tracking_number
                  );
                  const txStage = getTransactionStage(
                    order.status,
                    order.shipping_out_tracking_number
                  );
                  const txMeta = TX_STAGE_META[txStage];
                  const isOverdue =
                    order.status === "BORROWING" &&
                    order.due_at &&
                    new Date(order.due_at).getTime() < Date.now();
                  const depositSummary = depositMap[order.order_id];
                  const financialBadge = depositSummary
                    ? getDepositBadge({
                        orderStatus: order.status,
                        depositStatus: depositSummary.depositStatus,
                        depositCents: depositSummary.depositCents,
                        depositDeductedCents: depositSummary.depositDeductedCents,
                        isBorrower,
                      })
                    : null;

                  return (
                    <Card
                      key={order.order_id}
                      className="relative overflow-visible flex gap-4 p-4 border border-gray-200 rounded-xl hover:shadow-md transition"
                    >
                      {/* Book cover display */}
                      <div className="relative w-28 h-36 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {firstBook?.cover ? (
                          <CoverImg
                            src={firstBook.cover}
                            title={firstBook.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Cover
                          </div>
                        )}
                        {extra > 0 && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 text-white text-[10px] px-1.5 py-0.5">
                            +{extra}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            {/* Title */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3
                                  className="text-lg font-semibold text-black cursor-pointer hover:underline"
                                  onClick={() =>
                                    router.push(`/borrowing/${order.order_id}`)
                                  }
                                  title={order.books
                                    .map((b) => b.title)
                                    .join(" · ")}
                                >
                                  {firstBook?.title || "Untitled Book"}
                                  {extra > 0 && (
                                    <span className="text-gray-500">
                                      {" "}
                                      + {extra} more
                                    </span>
                                  )}
                                </h3>
                                {/* Lent Out / Borrowed Tag */}
                                {currentUserId && (
                                  order.owner_id === currentUserId ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                      <ArrowUpCircle className="w-3 h-3" />
                                      Lent Out
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                      <ArrowDownCircle className="w-3 h-3" />
                                      Borrowed In
                                    </span>
                                  )
                                )}
                              </div>

                              {/* User Info - Show borrower if lent out, owner if borrowed */}
                              {currentUserId && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <UserIcon className="w-4 h-4" />
                                  {order.owner_id === currentUserId ? (
                                    // Lent out - show borrower
                                    usersCache[order.borrower_id] && (
                                      <span>
                                        Borrower:{" "}
                                        <span className="font-medium text-gray-800">
                                          {usersCache[order.borrower_id].name ||
                                           usersCache[order.borrower_id].username ||
                                           "Unknown"}
                                        </span>
                                      </span>
                                    )
                                  ) : (
                                    // Borrowed - show owner
                                    usersCache[order.owner_id] && (
                                      <span>
                                        Owner:{" "}
                                        <span className="font-medium text-gray-800">
                                          {usersCache[order.owner_id].name ||
                                           usersCache[order.owner_id].username ||
                                           "Unknown"}
                                        </span>
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status */}
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${txMeta.className}`}
                              >
                                Transaction: {txMeta.label}
                              </span>
                              <span
                                className={`text-lg font-medium ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            </div>
                          </div>

                          {/* Financial badge (deposit-state surfacing per BRD §6.7) */}
                          {financialBadge && (
                            <div className="mt-2">
                              {financialBadge.highlight ? (
                                <button
                                  onClick={() =>
                                    router.push(`/deposits/${order.order_id}`)
                                  }
                                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm transition hover:opacity-90 ${financialBadge.className}`}
                                  title="Open deposit detail to claim your refund"
                                >
                                  {financialBadge.label}
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${financialBadge.className}`}
                                >
                                  {financialBadge.label}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Times */}
                          <div className="text-sm text-gray-500 mt-1 flex flex-col gap-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span>Created: {fmtDate(order.create_at)}</span>
                            </div>
                            {order.due_at && (
                              <div className="flex text-black font-medium items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>Due: {fmtDate(order.due_at)}</span>
                                {isOverdue && (
                                  <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                                    <AlertTriangle className="w-4 h-4" />{" "}
                                    Overdue
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {canConfirmReceive && (
                            <Button
                              size="sm"
                              className="bg-green-600 text-white hover:bg-green-700"
                              disabled={confirmingOrderId === order.order_id}
                              onClick={() => handleConfirmReceive(order.order_id)}
                            >
                              {confirmingOrderId === order.order_id
                                ? "Confirming..."
                                : "Confirm Receive"}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-black text-black hover:bg-black hover:text-white"
                            onClick={() =>
                              router.push(`/borrowing/${order.order_id}`)
                            }
                          >
                            View Detail
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-300 text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                            onClick={() =>
                              router.push(
                                `/supports-complaints?orderId=${order.order_id}`
                              )
                            }
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Open Complaint
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
