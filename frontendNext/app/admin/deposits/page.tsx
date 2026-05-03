"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  AlertTriangle,
  ShieldOff,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import {
  getAdminDeposits,
  DepositSummaryItem,
  AdminListResponse,
} from "@/utils/deposits";
import { formatLocalDateTime } from "@/utils/datetime";

const DEPOSIT_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700" },
  released: { label: "Released", className: "bg-green-100 text-green-700" },
  partially_deducted: { label: "Partially Deducted", className: "bg-orange-100 text-orange-700" },
  forfeited: { label: "Forfeited", className: "bg-red-100 text-red-700" },
  held: { label: "Held", className: "bg-gray-100 text-gray-700" },
};

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  none: { label: "None", className: "bg-gray-100 text-gray-600" },
  light: { label: "Light", className: "bg-yellow-50 text-yellow-700" },
  medium: { label: "Medium", className: "bg-orange-50 text-orange-700" },
  severe: { label: "Severe", className: "bg-red-50 text-red-700" },
};

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

function fmtAmount(cents: number) {
  return `A$${(cents / 100).toFixed(2)}`;
}

function fmtDate(v: string | null) {
  return formatLocalDateTime(v, "-");
}

export default function AdminDepositsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);

  const [items, setItems] = useState<DepositSummaryItem[]>([]);
  const [stats, setStats] = useState<AdminListResponse["stats"]>({
    pendingReviewCount: 0,
    deductedLast30dCents: 0,
    watchlistCount: 0,
    restrictedCount: 0,
  });
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminDeposits({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        search: search || undefined,
        page,
        page_size: pageSize,
      });
      setItems(data.items);
      setStats(data.stats);
      setTotal(data.total);
    } catch (err) {
      console.error("[AdminDeposits] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, search, page]);

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
    if (meAdmin) load();
  }, [meAdmin, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!meAdmin && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Deposits</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deposit Management</h1>
          <p className="text-gray-600">
            Arbitrate damaged-return deposits, track repeat offenders, and manage user restrictions.
          </p>
        </div>
        <Link href="/admin" className="text-sm underline self-center">
          Back to Dashboard
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" /> Pending Review
          </div>
          <div className="text-2xl font-bold text-yellow-700">{stats.pendingReviewCount}</div>
          <div className="text-xs text-gray-400">awaiting admin arbitration</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
            <Wallet className="w-4 h-4" /> Deducted (30d)
          </div>
          <div className="text-2xl font-bold text-orange-700">
            {fmtAmount(stats.deductedLast30dCents)}
          </div>
          <div className="text-xs text-gray-400">last 30 days</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" /> Watchlist
          </div>
          <div className="text-2xl font-bold text-red-700">{stats.watchlistCount}</div>
          <div className="text-xs text-gray-400">users with ≥2 strikes</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-700 text-sm mb-1">
            <ShieldOff className="w-4 h-4" /> Restricted
          </div>
          <div className="text-2xl font-bold text-gray-800">{stats.restrictedCount}</div>
          <div className="text-xs text-gray-400">borrowing blocked</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by order ID, borrower/lender name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSearch(searchInput);
                }
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => {
              setPage(1);
              setSearch(searchInput);
            }}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-1">
            <Filter className="w-4 h-4 inline" /> Status:
          </span>
          {[
            { value: "", label: "All" },
            { value: "pending_review", label: "Pending Review" },
            { value: "released", label: "Released" },
            { value: "partially_deducted", label: "Partially Deducted" },
            { value: "forfeited", label: "Forfeited" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setStatusFilter(opt.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                statusFilter === opt.value ? "bg-black text-white border-black" : "hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-1">Severity:</span>
          {[
            { value: "", label: "All" },
            { value: "none", label: "None" },
            { value: "light", label: "Light" },
            { value: "medium", label: "Medium" },
            { value: "severe", label: "Severe" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setSeverityFilter(opt.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                severityFilter === opt.value ? "bg-black text-white border-black" : "hover:bg-gray-50"
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
          <div className="p-8 text-center text-gray-500">Loading deposits…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No deposits match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Book</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Borrower</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Lender</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Deposit</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Severity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((d) => {
                  const meta =
                    DEPOSIT_STATUS_META[d.depositStatus] ||
                    DEPOSIT_STATUS_META["held"];
                  const sev =
                    SEVERITY_META[d.damageSeverityFinal || "none"] ||
                    SEVERITY_META["none"];
                  return (
                    <tr
                      key={d.orderId}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/deposits/${d.orderId}`)}
                    >
                      <td className="px-4 py-3 max-w-[200px] truncate" title={d.book?.titleEn || ""}>
                        {d.book?.titleEn || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate max-w-[140px]" title={d.borrower.name || ""}>
                          {d.borrower.name || "-"}
                        </div>
                        <div className="text-xs text-gray-400 flex gap-1.5">
                          {d.borrower.damageStrikeCount > 0 && (
                            <span className="px-1.5 rounded bg-red-50 text-red-700 border border-red-100">
                              {d.borrower.damageStrikeCount}× strike
                            </span>
                          )}
                          {d.borrower.isRestricted && (
                            <span className="px-1.5 rounded bg-gray-200 text-gray-700">
                              restricted
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[140px] truncate" title={d.lender.name || ""}>
                        {d.lender.name || "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {fmtAmount(d.depositCents)}
                        {d.depositDeductedCents > 0 && (
                          <div className="text-xs text-red-600">
                            -{fmtAmount(d.depositDeductedCents)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sev.className}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(d.updatedAt)}</td>
                      <td className="px-4 py-3 text-gray-400">
                        <Eye className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} total)
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
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
