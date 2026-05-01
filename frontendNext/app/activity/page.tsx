"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ListTodo,
  MessageSquare,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Card from "../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/AsyncState";
import { getCurrentUser } from "@/utils/auth";
import { getMyDeposits } from "@/utils/deposits";
import { getUserRefunds } from "@/utils/payments";
import { getComplaints } from "@/utils/complaints";
import {
  buildActivityBuckets,
  fmtAud,
  type ActiveItem,
  type ActivityBuckets,
  type AwaitingItem,
  type HistoryItem,
  type UserRefundItem,
} from "@/utils/activity";

type TabKey = "awaiting" | "active" | "history";

const TABS: { key: TabKey; label: string; icon: typeof ListTodo }[] = [
  { key: "awaiting", label: "Awaiting My Action", icon: ListTodo },
  { key: "active", label: "Active Refunds & Arbitrations", icon: RefreshCw },
  { key: "history", label: "History", icon: CheckCircle2 },
];

export default function ActivityPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("awaiting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<ActivityBuckets | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const user = await getCurrentUser();
        if (!user?.id) {
          router.push("/login");
          return;
        }
        // Fetch the three data sources in parallel; each falls back to an
        // empty list so a single upstream outage doesn't blank the page.
        const [deposits, refundsRes, complaints] = await Promise.all([
          getMyDeposits(user.id, { includeHeld: true }).catch(() => []),
          getUserRefunds(user.id).catch(() => ({ refunds: [] as UserRefundItem[] })),
          getComplaints("mine").catch(() => []),
        ]);
        const result = await buildActivityBuckets({
          currentUserId: user.id,
          deposits,
          refunds: (refundsRes.refunds || []) as UserRefundItem[],
          complaints,
        });
        if (!cancelled) setBuckets(result);
      } catch (e) {
        console.error("[Activity] load failed:", e);
        if (!cancelled) setError("Failed to load activity. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const counts = useMemo(
    () => ({
      awaiting: buckets?.awaiting.length ?? 0,
      active: buckets?.active.length ?? 0,
      history: buckets?.history.length ?? 0,
    }),
    [buckets]
  );

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Activity & Issues</h1>
            <p className="text-gray-600">
              Your refund, deposit, and arbitration tasks across borrowing and lending —
              consolidated. Full complaint browsing and creation lives in{" "}
              <a className="text-blue-600 hover:underline" href="/supports-complaints">
                Supports & Complaints
              </a>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    isActive
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                  <span
                    className={`ml-1 inline-flex items-center justify-center min-w-5 h-5 rounded-full text-xs ${
                      isActive ? "bg-white/20" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <ErrorState
              title="Failed to load activity"
              description={error}
              onRetry={() => window.location.reload()}
            />
          )}
          {loading && (
            <LoadingState
              title="Loading activity..."
              description="Consolidating your deposits, refunds, and complaints."
            />
          )}

          {!loading && !error && buckets && (
            <>
              {tab === "awaiting" && <AwaitingTab items={buckets.awaiting} />}
              {tab === "active" && <ActiveTab items={buckets.active} />}
              {tab === "history" && <HistoryTab items={buckets.history} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AwaitingTab({ items }: { items: AwaitingItem[] }) {
  const router = useRouter();
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on you"
        description="You're all caught up. New tasks will appear here when admin or the other party needs your input."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "deposit-refund-ready") {
          return (
            <button
              key={item.key}
              onClick={() => router.push(`/deposits/${item.orderId}`)}
              className="w-full text-left rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition p-4 flex items-start gap-3"
            >
              <Wallet className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="inline-flex items-center rounded-full bg-emerald-600 text-white px-2 py-0.5 text-xs font-semibold animate-pulse">
                    ✋ Action required
                  </span>
                  <span className="text-emerald-900 font-semibold">
                    Click to claim your {fmtAud(item.refundableCents)} deposit refund
                  </span>
                </div>
                <div className="text-sm text-emerald-900 truncate">
                  {item.bookTitle} · with {item.counterparty}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-700 mt-1 shrink-0" />
            </button>
          );
        }
        if (item.kind === "deposit-counter-evidence") {
          return (
            <button
              key={item.key}
              onClick={() => router.push(`/deposits/${item.orderId}`)}
              className="w-full text-left rounded-xl border border-yellow-300 bg-yellow-50 hover:bg-yellow-100 transition p-4 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="inline-flex items-center rounded-full bg-yellow-200 text-yellow-900 px-2 py-0.5 text-xs font-semibold">
                    Counter-evidence window
                  </span>
                  <span className="text-yellow-900 font-semibold">
                    Submit your side before the 7-day window closes
                  </span>
                </div>
                <div className="text-sm text-yellow-900 truncate">
                  {item.bookTitle} · {fmtAud(item.depositCents)} deposit at stake · with{" "}
                  {item.counterparty}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-yellow-700 mt-1 shrink-0" />
            </button>
          );
        }
        return (
          <button
            key={item.key}
            onClick={() => router.push(`/supports-complaints/${item.complaintId}`)}
            className="w-full text-left rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 transition p-4 flex items-start gap-3"
          >
            <MessageSquare className="w-5 h-5 text-blue-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-blue-200 text-blue-900 px-2 py-0.5 text-xs font-semibold">
                  Admin investigating
                </span>
                <span className="text-blue-900 font-semibold">
                  Open the complaint and reply to admin
                </span>
              </div>
              <div className="text-sm text-blue-900 truncate">{item.subject}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function ActiveTab({ items }: { items: ActiveItem[] }) {
  const router = useRouter();
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing in progress"
        description="There are no deposits under review or refunds being processed right now."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "deposit-in-review") {
          const statusLabel =
            item.depositStatus === "pending_review" ? "Pending Review" : "Refund Ready";
          const roleLabel = item.role === "borrower" ? "I borrowed" : "I lent";
          return (
            <Card
              key={item.key}
              className="border border-gray-200 hover:shadow-md transition"
              onClick={() => router.push(`/deposits/${item.orderId}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      {statusLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-700">
                      {roleLabel}
                    </span>
                  </div>
                  <div className="font-medium truncate">{item.bookTitle}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {fmtAud(item.depositCents)} at stake · with {item.counterparty}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
              </div>
            </Card>
          );
        }
        return (
          <Card
            key={item.key}
            className="border border-gray-200 hover:shadow-md transition"
            onClick={() => router.push(`/refunds/${item.orderId}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Refund processing
                  </span>
                </div>
                <div className="font-medium truncate">{item.bookTitle}</div>
                <div className="text-xs text-gray-500">
                  Refund ID: {item.refundId.slice(0, 8)}…
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold">{fmtAud(item.amountCents)}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function HistoryTab({ items }: { items: HistoryItem[] }) {
  const router = useRouter();
  if (items.length === 0) {
    return (
      <EmptyState
        title="No closed items yet"
        description="Released deposits and completed refunds will show up here once they finalize."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "deposit-finalized") {
          const refundable = item.depositCents - item.depositDeductedCents;
          let badge: { label: string; className: string };
          switch (item.depositStatus) {
            case "released":
              badge = { label: "Released", className: "bg-emerald-100 text-emerald-700" };
              break;
            case "partially_deducted":
              badge = {
                label: "Partially Deducted",
                className: "bg-orange-100 text-orange-700",
              };
              break;
            default:
              badge = { label: "Forfeited", className: "bg-red-100 text-red-700" };
          }
          const summary =
            item.depositStatus === "released"
              ? `Refunded ${fmtAud(item.depositCents)}`
              : item.depositStatus === "partially_deducted"
              ? `Refunded ${fmtAud(refundable)} of ${fmtAud(item.depositCents)}`
              : `Forfeited ${fmtAud(item.depositCents)}`;
          return (
            <Card
              key={item.key}
              className="border border-gray-200 hover:shadow-md transition"
              onClick={() => router.push(`/deposits/${item.orderId}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-700">
                      {item.role === "borrower" ? "I borrowed" : "I lent"}
                    </span>
                  </div>
                  <div className="font-medium truncate">{item.bookTitle}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {summary} · with {item.counterparty}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
              </div>
            </Card>
          );
        }
        return (
          <Card
            key={item.key}
            className="border border-gray-200 hover:shadow-md transition"
            onClick={() => router.push(`/refunds/${item.orderId}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                    Refund completed
                  </span>
                </div>
                <div className="font-medium truncate">{item.bookTitle}</div>
                <div className="text-xs text-gray-500">
                  Refund ID: {item.refundId.slice(0, 8)}…
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold">{fmtAud(item.amountCents)}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
