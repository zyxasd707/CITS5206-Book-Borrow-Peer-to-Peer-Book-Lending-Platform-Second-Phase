"use client";

// /admin/complaints — master arbitration console (Phase A.4).
// KPI cards + tabs (All / Pending / Financial / Non-financial) + search.
// Row click drills into /admin/complaints/[id].

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DollarSign,
  Filter,
  MessageSquareWarning,
  Search,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import { getComplaints, type Complaint } from "@/utils/complaints";

type TabKey = "all" | "pending" | "financial" | "non-financial";

const FINANCIAL_TYPES: ReadonlyArray<Complaint["type"]> = [
  "book-condition",
  "overdue",
  "damage-on-return",
];

const STATUS_META: Record<Complaint["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700" },
  investigating: { label: "Investigating", className: "bg-orange-100 text-orange-700" },
  resolved: { label: "Resolved", className: "bg-green-100 text-green-700" },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-700" },
};

const TYPE_LABELS: Record<Complaint["type"], string> = {
  "book-condition": "Book Condition",
  delivery: "Delivery",
  "user-behavior": "User Behavior",
  other: "Other",
  overdue: "Overdue",
  "damage-on-return": "Damage on Return",
};

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

function isFinancial(c: Complaint) {
  return FINANCIAL_TYPES.includes(c.type);
}

function isOpen(c: Complaint) {
  return c.status === "pending" || c.status === "investigating";
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function AdminComplaintsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

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
    if (!meAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const data = await getComplaints("admin");
        setComplaints(data);
      } catch (err) {
        console.error("[AdminComplaints] Failed to load:", err);
        setComplaints([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [meAdmin]);

  const kpi = useMemo(() => {
    const now = Date.now();
    const pending = complaints.filter((c) => c.status === "pending").length;
    const investigating = complaints.filter((c) => c.status === "investigating").length;
    const openFinancial = complaints.filter((c) => isOpen(c) && isFinancial(c)).length;
    const resolved30d = complaints.filter((c) => {
      if (c.status !== "resolved" && c.status !== "closed") return false;
      const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return now - t <= THIRTY_DAYS_MS;
    }).length;
    return { pending, investigating, openFinancial, resolved30d };
  }, [complaints]);

  const filtered = useMemo(() => {
    let list = complaints;
    if (tab === "pending") list = list.filter((c) => c.status === "pending");
    else if (tab === "financial") list = list.filter(isFinancial);
    else if (tab === "non-financial") list = list.filter((c) => !isFinancial(c));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const haystack = [c.subject, c.description, c.id, c.orderId || "", c.complainantId, c.respondentId || ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return list;
  }, [complaints, tab, search]);

  if (!meAdmin && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Complaints</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: complaints.length },
    { key: "pending", label: "Pending Triage", count: kpi.pending },
    {
      key: "financial",
      label: "Financial",
      count: complaints.filter(isFinancial).length,
    },
    {
      key: "non-financial",
      label: "Non-financial",
      count: complaints.filter((c) => !isFinancial(c)).length,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Complaint Arbitration</h1>
          <p className="text-gray-600">
            Master view of all complaints. Drill down to deposit / refund subviews when financial action is needed.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/admin/deposits" className="underline text-gray-600 hover:text-black">
            Deposits queue
          </Link>
          <Link href="/admin/refunds" className="underline text-gray-600 hover:text-black">
            Refunds ledger
          </Link>
          <Link href="/admin" className="underline">
            Dashboard
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
            <Clock3 className="w-4 h-4" /> Pending Triage
          </div>
          <div className="text-2xl font-bold text-yellow-700">{kpi.pending}</div>
          <div className="text-xs text-gray-400">awaiting first review</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" /> Investigating
          </div>
          <div className="text-2xl font-bold text-orange-700">{kpi.investigating}</div>
          <div className="text-xs text-gray-400">actively being handled</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
            <DollarSign className="w-4 h-4" /> Open Financial
          </div>
          <div className="text-2xl font-bold text-red-700">{kpi.openFinancial}</div>
          <div className="text-xs text-gray-400">money on the line</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
            <CheckCircle2 className="w-4 h-4" /> Resolved (30d)
          </div>
          <div className="text-2xl font-bold text-green-700">{kpi.resolved30d}</div>
          <div className="text-xs text-gray-400">last 30 days</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by subject, description, complaint ID, order ID, or user ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setSearch(searchInput)}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-1">
            <Filter className="w-4 h-4 inline" /> View:
          </span>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                tab === t.key ? "bg-black text-white border-black" : "hover:bg-gray-50"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-80">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
          <MessageSquareWarning className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">
            Complaint Queue ({filtered.length})
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading complaints…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No complaints match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => {
                  const meta = STATUS_META[c.status];
                  const financial = isFinancial(c);
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/complaints/${c.id}`)}
                    >
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="font-medium truncate" title={c.subject}>
                          {c.subject}
                        </div>
                        <div className="text-xs text-gray-500 truncate" title={c.description}>
                          {c.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full font-medium ${
                            financial
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : "bg-gray-50 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {TYPE_LABELS[c.type] || c.type}
                          {financial && " · 💰"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate" title={c.orderId || ""}>
                        {c.orderId ? c.orderId.slice(0, 12) + "…" : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(c.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
