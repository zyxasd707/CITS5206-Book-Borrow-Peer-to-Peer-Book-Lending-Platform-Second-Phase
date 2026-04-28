"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, RefreshCw, ArrowLeft } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { getUserRefunds } from "@/utils/payments";
import { getCurrentUser } from "@/utils/auth";
import { formatLocalDateTime } from "@/utils/datetime";

type RefundStatus = "succeeded" | "pending" | "failed";

const STATUS_META: Record<string, { label: string; className: string }> = {
  succeeded: { label: "Completed", className: "bg-green-100 text-green-700" },
  pending: { label: "Processing", className: "bg-yellow-100 text-yellow-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

const TYPE_LABELS: Record<string, string> = {
  full: "Full Refund",
  deposit: "Deposit Only",
  shipping: "Shipping Only",
  partial: "Partial Refund",
};

interface RefundItem {
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
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | RefundStatus>("all");
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loadRefunds = async () => {
      try {
        setLoading(true);
        const user = await getCurrentUser();
        if (!user?.id) {
          setError("Please log in to view your refunds.");
          return;
        }
        const data = await getUserRefunds(user.id);
        setRefunds(data.refunds);
      } catch (err) {
        console.error("[Refunds] Failed to load refunds:", err);
        setError("Failed to load refunds. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    loadRefunds();
  }, []);

  const filteredRefunds = useMemo(() => {
    let list = refunds;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const bookMatch = r.order.book_titles.some((t) =>
          t.toLowerCase().includes(q)
        );
        return (
          bookMatch ||
          r.refund_id.toLowerCase().includes(q) ||
          r.order.order_id.toLowerCase().includes(q) ||
          (r.reason && r.reason.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [refunds, statusFilter, search]);

  const countByStatus = (s: RefundStatus) =>
    refunds.filter((r) => r.status === s).length;

  const filterOptions = [
    { value: "all", label: "All", count: refunds.length },
    { value: "pending", label: "Processing", count: countByStatus("pending") },
    { value: "succeeded", label: "Completed", count: countByStatus("succeeded") },
    { value: "failed", label: "Failed", count: countByStatus("failed") },
  ] as const;

  const fmtDate = (v?: string | null) => formatLocalDateTime(v, "-");

  const fmtAmount = (cents: number, currency: string) => {
    const dollars = (cents / 100).toFixed(2);
    const sym = currency.toUpperCase() === "AUD" ? "A$" : "$";
    return `${sym}${dollars} ${currency.toUpperCase()}`;
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-gray-500 hover:text-black mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              My Refunds
            </h1>
            <p className="text-gray-600">
              Track the status of your refund requests
            </p>
          </div>

          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by book title, refund ID, or order ID..."
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
                  variant={statusFilter === option.value ? "default" : "outline"}
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
            <Card>
              <div className="p-4 text-red-600">{error}</div>
            </Card>
          )}
          {loading && (
            <Card>
              <div className="p-4 text-gray-600">Loading refunds...</div>
            </Card>
          )}

          {/* Refund list */}
          {!loading && !error && (
            <div className="space-y-4">
              {filteredRefunds.length === 0 ? (
                <Card>
                  <div className="text-center py-12">
                    <RefreshCw className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No refunds found
                    </h3>
                    <p className="text-gray-500">
                      {refunds.length === 0
                        ? "You don't have any refund records yet."
                        : "Try adjusting filters or search terms."}
                    </p>
                  </div>
                </Card>
              ) : (
                filteredRefunds.map((refund) => {
                  const meta = STATUS_META[refund.status] || STATUS_META["pending"];
                  const bookTitle =
                    refund.order.book_titles.length > 0
                      ? refund.order.book_titles.join(", ")
                      : "Unknown Book";

                  return (
                    <Card
                      key={refund.refund_id}
                      className="p-5 border border-gray-200 rounded-xl hover:shadow-md transition cursor-pointer"
                      onClick={() => router.push(`/refunds/${refund.order.order_id}`)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">
                              {bookTitle}
                            </h3>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          <div className="space-y-1 text-sm text-gray-500">
                            <div>
                              <span className="text-gray-400">Reason: </span>
                              {refund.reason || "N/A"}
                            </div>
                            <div>
                              <span className="text-gray-400">Type: </span>
                              {TYPE_LABELS[refund.refund_type] || refund.refund_type}
                            </div>
                            <div>
                              <span className="text-gray-400">Order: </span>
                              <span
                                className="text-blue-600 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/borrowing/${refund.order.order_id}`);
                                }}
                              >
                                {refund.order.order_id.slice(0, 8)}...
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400">Refunded: </span>
                              {fmtDate(refund.created_at)}
                            </div>
                          </div>
                        </div>

                        {/* Right: Amount */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-2xl font-bold text-gray-900">
                            {fmtAmount(refund.amount, refund.currency)}
                          </div>
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
