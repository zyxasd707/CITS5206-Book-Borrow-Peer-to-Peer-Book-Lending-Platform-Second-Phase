"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet, ShieldOff, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import type { User } from "@/app/types/user";
import { getMyDeposits, DepositSummaryItem } from "@/utils/deposits";
import { formatLocalDateTime } from "@/utils/datetime";

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700" },
  released: { label: "Released", className: "bg-green-100 text-green-700" },
  partially_deducted: { label: "Partially Deducted", className: "bg-orange-100 text-orange-700" },
  forfeited: { label: "Forfeited", className: "bg-red-100 text-red-700" },
  held: { label: "Held", className: "bg-gray-100 text-gray-700" },
};

const ROLE_META: Record<string, { label: string; className: string }> = {
  borrower: { label: "I borrowed", className: "bg-blue-50 text-blue-700 border-blue-200" },
  lender: { label: "I lent", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

function fmtAmount(cents: number) {
  return `A$${(cents / 100).toFixed(2)}`;
}

function fmtDate(v: string | null) {
  return formatLocalDateTime(v, "-");
}

export default function MyDepositsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [items, setItems] = useState<DepositSummaryItem[]>([]);
  const [roleFilter, setRoleFilter] = useState<"all" | "borrower" | "lender">("all");

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push("/login");
          return;
        }
        setMe(user);
        const list = await getMyDeposits(user.id);
        setItems(list);
      } catch (err) {
        console.error("[MyDeposits] load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const visible = items.filter((d) => roleFilter === "all" || d.role === roleFilter);
  const pendingCount = items.filter((d) => d.depositStatus === "pending_review").length;
  const needsAction = items.filter(
    (d) => d.depositStatus === "pending_review" && d.role === "borrower"
  ).length;

  if (loading) {
    return <div className="p-6 text-gray-500">Loading your deposits…</div>;
  }

  if (!me) return null;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Deposits</h1>
        <p className="text-gray-600">
          All deposits tied to books you've borrowed or lent. Admin arbitrates deposits that are flagged for damage.
        </p>
      </div>

      {me.isRestricted && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4 flex items-start gap-3">
          <ShieldOff className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Your borrowing is currently restricted.</div>
            <div>Reason: {me.restrictionReason || "Contact support for details."}</div>
          </div>
        </div>
      )}

      {needsAction > 0 && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          You have <b>{needsAction}</b> deposit{needsAction === 1 ? "" : "s"} awaiting your counter-evidence. Open the detail page to respond before the 7-day window closes.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Wallet className="w-4 h-4" /> Total Deposits
          </div>
          <div className="text-2xl font-bold">{items.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
            <Wallet className="w-4 h-4" /> Pending Review
          </div>
          <div className="text-2xl font-bold text-yellow-700">{pendingCount}</div>
        </div>
      </div>

      <div className="flex gap-2">
        {(["all", "borrower", "lender"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setRoleFilter(v)}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              roleFilter === v ? "bg-black text-white border-black" : "hover:bg-gray-50"
            }`}
          >
            {v === "all" ? "All" : v === "borrower" ? "I borrowed" : "I lent"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No deposits to show.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((d) => {
              const meta = STATUS_META[d.depositStatus] || STATUS_META["held"];
              const role = ROLE_META[d.role || "borrower"];
              return (
                <li key={d.orderId}>
                  <Link
                    href={`/deposits/${d.orderId}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${role.className}`}
                        >
                          {role.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="font-medium truncate">{d.book?.titleEn || "—"}</div>
                      <div className="text-xs text-gray-500 truncate">
                        Counterparty:{" "}
                        {d.role === "borrower" ? d.lender.name : d.borrower.name} · Updated{" "}
                        {fmtDate(d.updatedAt)}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="font-bold">{fmtAmount(d.depositCents)}</div>
                      {d.depositDeductedCents > 0 && (
                        <div className="text-xs text-red-600">
                          -{fmtAmount(d.depositDeductedCents)}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 ml-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
