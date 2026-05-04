"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Filter,
  RefreshCw,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock3,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  FileText,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import { getAdminRefunds, manualAdminRefund } from "@/utils/payments";
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
  unknown: "Unknown",
};

const TRIGGER_LABELS: Record<string, string> = {
  user_cancel: "User Cancel",
  timeout: "Timeout",
  admin_manual: "Admin Manual",
  payment_flow: "Payment Flow",
  unknown: "Unknown",
};

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

interface AdminRefundItem {
  refund_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  refund_type: string;
  trigger: string;
  created_at: string | null;
  updated_at: string | null;
  order: {
    order_id: string;
    status: string;
    book_titles: string[];
  } | null;
  borrower: { user_id: string; name: string; email: string } | null;
  lender: { user_id: string; name: string; email: string } | null;
  disputes: Array<{
    dispute_id: string;
    reason: string;
    status: string;
    created_at: string | null;
  }>;
}

interface KPI {
  total_count: number;
  total_amount: number;
  succeeded_count: number;
  failed_count: number;
  pending_count: number;
  success_rate: number;
}

interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatRefundAmount(cents: number, currency: string) {
  const dollars = (cents / 100).toFixed(2);
  const sym = currency?.toUpperCase() === "AUD" ? "A$" : "$";
  return `${sym}${dollars}`;
}

function buildRefundReportRows(refunds: AdminRefundItem[]) {
  return refunds.map((refund) => ({
    "Refund ID": refund.refund_id,
    "Payment ID": refund.payment_id,
    "Order ID": refund.order?.order_id || "-",
    Books: refund.order?.book_titles?.join("; ") || "-",
    Borrower: refund.borrower?.name || "-",
    "Borrower Email": refund.borrower?.email || "-",
    Lender: refund.lender?.name || "-",
    "Lender Email": refund.lender?.email || "-",
    Amount: formatRefundAmount(refund.amount, refund.currency),
    Status: STATUS_META[refund.status]?.label || refund.status || "-",
    Type: TYPE_LABELS[refund.refund_type] || refund.refund_type || "-",
    Trigger: TRIGGER_LABELS[refund.trigger] || refund.trigger || "-",
    Reason: refund.reason || "-",
    "Created At": formatLocalDateTime(refund.created_at, "-"),
    "Updated At": formatLocalDateTime(refund.updated_at, "-"),
    Disputes: refund.disputes.map((item) => `${item.reason} (${item.status})`).join("; ") || "-",
  }));
}

function exportRefundsCsv(refunds: AdminRefundItem[]) {
  const rows = buildRefundReportRows(refunds);
  const headers = [
    "Refund ID",
    "Payment ID",
    "Order ID",
    "Books",
    "Borrower",
    "Borrower Email",
    "Lender",
    "Lender Email",
    "Amount",
    "Status",
    "Type",
    "Trigger",
    "Reason",
    "Created At",
    "Updated At",
    "Disputes",
  ];
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")),
  ].join("\n");

  downloadTextFile("bookborrow-refund-report.csv", csv, "text/csv;charset=utf-8");
}

function exportRefundsPdf(refunds: AdminRefundItem[]) {
  const rows = buildRefundReportRows(refunds);
  const headers = ["Refund ID", "Order ID", "Books", "Borrower", "Lender", "Amount", "Status", "Type", "Trigger", "Created At"];
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          ${headers.map((header) => `<td>${escapeHtml(row[header as keyof typeof row])}</td>`).join("")}
        </tr>
      `
    )
    .join("");

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.title = "BookBorrow refund PDF export";

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>BookBorrow Refund Report</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .meta { color: #4b5563; margin: 0 0 24px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; font-size: 11px; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f9fafb; }
          @media print { body { margin: 14mm; } }
        </style>
      </head>
      <body>
        <h1>BookBorrow Refund Report</h1>
        <p class="meta">${rows.length} refund(s) | Generated ${escapeHtml(new Date().toLocaleString())}</p>
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;

  document.body.appendChild(iframe);
  const iframeDocument = iframe.contentWindow?.document;
  if (!iframeDocument || !iframe.contentWindow) {
    iframe.remove();
    alert("Unable to prepare the PDF export. Please try again.");
    return;
  }

  iframeDocument.open();
  iframeDocument.write(html);
  iframeDocument.close();
  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 100);
}

export default function AdminRefundsPage() {
  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [refunds, setRefunds] = useState<AdminRefundItem[]>([]);
  const [kpi, setKpi] = useState<KPI>({
    total_count: 0, total_amount: 0, succeeded_count: 0,
    failed_count: 0, pending_count: 0, success_rate: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, page_size: 20, total: 0, total_pages: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);

  // Manual refund modal
  const [showManualRefund, setShowManualRefund] = useState(false);
  const [manualOrderId, setManualOrderId] = useState("");
  const [manualRefundType, setManualRefundType] = useState("full");
  const [manualReason, setManualReason] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [reportExporting, setReportExporting] = useState(false);

  const router = useRouter();

  const loadRefunds = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminRefunds({
        status_filter: statusFilter || undefined,
        refund_type: typeFilter || undefined,
        search: search || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: 20,
      });
      setRefunds(data.refunds);
      setKpi(data.kpi);
      setPagination(data.pagination);
    } catch (err) {
      console.error("[AdminRefunds] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search, sortBy, sortOrder, page]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        setMeAdmin(isAdminLikeUser(me));
      } catch {
        setMeAdmin(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (meAdmin) loadRefunds();
  }, [meAdmin, loadRefunds]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleManualRefund = async () => {
    if (!manualOrderId.trim()) {
      alert("Please enter an Order ID.");
      return;
    }
    try {
      setManualSubmitting(true);
      await manualAdminRefund({
        order_id: manualOrderId.trim(),
        refund_type: manualRefundType,
        reason: manualReason.trim() || "Admin manual refund",
      });
      alert("Manual refund issued successfully!");
      setShowManualRefund(false);
      setManualOrderId("");
      setManualReason("");
      loadRefunds();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err.message || "Unknown error";
      alert(`Failed to issue refund: ${detail}`);
    } finally {
      setManualSubmitting(false);
    }
  };

  const fmtAmount = formatRefundAmount;

  const fmtDate = (v?: string | null) => formatLocalDateTime(v, "-");

  const loadRefundReportRows = async () => {
    if (pagination.total <= refunds.length) return refunds;
    setReportExporting(true);
    try {
      const data = await getAdminRefunds({
        status_filter: statusFilter || undefined,
        refund_type: typeFilter || undefined,
        search: search || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page: 1,
        page_size: Math.max(pagination.total, 20),
      });
      return data.refunds as AdminRefundItem[];
    } finally {
      setReportExporting(false);
    }
  };

  const handleExportRefundCsv = async () => {
    const rows = await loadRefundReportRows();
    exportRefundsCsv(rows);
  };

  const handleExportRefundPdf = async () => {
    const rows = await loadRefundReportRows();
    exportRefundsPdf(rows);
  };

  if (!meAdmin && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Refunds</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Refund Management</h1>
          <p className="text-gray-600">Monitor and manage all refunds across the platform.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportRefundCsv}
            disabled={refunds.length === 0 || reportExporting}
            className="px-4 py-2 border bg-white rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleExportRefundPdf}
            disabled={refunds.length === 0 || reportExporting}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm flex items-center gap-1 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> Export PDF
          </button>
          <button
            onClick={() => setShowManualRefund(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Manual Refund
          </button>
          <Link href="/admin" className="text-sm underline self-center">
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="w-4 h-4" /> Total Refunded
          </div>
          <div className="text-2xl font-bold">{fmtAmount(kpi.total_amount, "usd")}</div>
          <div className="text-xs text-gray-400">{kpi.total_count} refunds</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
            <CheckCircle2 className="w-4 h-4" /> Succeeded
          </div>
          <div className="text-2xl font-bold text-green-700">{kpi.succeeded_count}</div>
          <div className="text-xs text-gray-400">{kpi.success_rate}% success rate</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
            <Clock3 className="w-4 h-4" /> Pending
          </div>
          <div className="text-2xl font-bold text-yellow-700">{kpi.pending_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
            <XCircle className="w-4 h-4" /> Failed
          </div>
          <div className="text-2xl font-bold text-red-700">{kpi.failed_count}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by refund ID, order ID, user name, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
          >
            Search
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-1">
            <Filter className="w-4 h-4 inline" /> Status:
          </span>
          {[
            { value: "", label: "All" },
            { value: "succeeded", label: "Completed" },
            { value: "pending", label: "Processing" },
            { value: "failed", label: "Failed" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                statusFilter === opt.value ? "bg-black text-white border-black" : "hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-1">Type:</span>
          {[
            { value: "", label: "All Types" },
            { value: "full", label: "Full" },
            { value: "deposit", label: "Deposit" },
            { value: "shipping", label: "Shipping" },
            { value: "partial", label: "Partial" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setTypeFilter(opt.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                typeFilter === opt.value ? "bg-black text-white border-black" : "hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading refunds...</div>
        ) : refunds.length === 0 ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No refunds found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Book</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Borrower</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Lender</th>
                  <th
                    className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => toggleSort("amount")}
                  >
                    <span className="flex items-center gap-1">
                      Amount <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Trigger</th>
                  <th
                    className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => toggleSort("created_at")}
                  >
                    <span className="flex items-center gap-1">
                      Date <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {refunds.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META["pending"];
                  const bookTitle = r.order?.book_titles?.join(", ") || "N/A";
                  return (
                    <tr
                      key={r.refund_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/refunds/${r.refund_id}`)}
                    >
                      <td className="px-4 py-3 max-w-[180px] truncate" title={bookTitle}>
                        {bookTitle}
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate max-w-[120px]" title={r.borrower?.name}>
                          {r.borrower?.name || "-"}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{r.borrower?.email || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate max-w-[120px]" title={r.lender?.name}>
                          {r.lender?.name || "-"}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{r.lender?.email || ""}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{fmtAmount(r.amount, r.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{TYPE_LABELS[r.refund_type] || r.refund_type}</td>
                      <td className="px-4 py-3 text-xs">{TRIGGER_LABELS[r.trigger] || r.trigger}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Refund Modal */}
      {showManualRefund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Issue Manual Refund</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
              <input
                type="text"
                value={manualOrderId}
                onChange={(e) => setManualOrderId(e.target.value)}
                placeholder="Enter order ID..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Refund Type</label>
              <select
                value={manualRefundType}
                onChange={(e) => setManualRefundType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="full">Full Refund (Deposit + Shipping)</option>
                <option value="deposit">Deposit Only</option>
                <option value="shipping">Shipping Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Reason for refund..."
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowManualRefund(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleManualRefund}
                disabled={manualSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {manualSubmitting ? "Processing..." : "Issue Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
