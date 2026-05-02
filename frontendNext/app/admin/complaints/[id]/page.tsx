"use client";

// /admin/complaints/[id] — Phase A.4 master arbitration detail.
// Five sections: Related Order, Both-Side Evidence, Linked Arbitration/Refund,
// Admin Decision Panel, Audit Trail. All financial actions delegate to
// /admin/deposits/[orderId]; borrowers must explicitly claim their refund there.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImageIcon,
  Info,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { getCurrentUser, getUserById } from "@/utils/auth";
import {
  addComplaintMessage,
  getComplaintDetail,
  resolveComplaint,
  type Complaint,
  type Message,
} from "@/utils/complaints";
import {
  getAdminDepositDetail,
  type DepositAuditEntry,
  type DepositDetail,
} from "@/utils/deposits";
import { getAdminRefunds } from "@/utils/payments";
import { getOrderById } from "@/utils/borrowingOrders";
import type { User } from "@/app/types/user";

// Keep this list in sync with /admin/complaints page.tsx FINANCIAL_TYPES.
const FINANCIAL_TYPES: ReadonlyArray<Complaint["type"]> = [
  "book-condition",
  "overdue",
  "damage-on-return",
  "damage-on-receipt",
  "rental-defect",
  "wrong-item",
  "delivery",
  "package-lost",
  "lender-no-ship",
  "no-return",
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
  "damage-on-receipt": "Damage on Receipt",
  "rental-defect": "Rental Defect",
  "no-return": "No Return",
  "lender-no-ship": "Lender Did Not Ship",
  "package-lost": "Package Lost",
  "wrong-item": "Wrong Item",
  "object-clean-return": "Object Clean Return",
  "lender-reverse": "Lender Reverse",
};

const DEPOSIT_STATUS_META: Record<string, { label: string; className: string }> = {
  held: { label: "Held", className: "bg-gray-100 text-gray-700" },
  pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700" },
  refund_ready: { label: "Refund Ready (awaiting borrower claim)", className: "bg-emerald-100 text-emerald-700" },
  released: { label: "Released", className: "bg-green-100 text-green-700" },
  partially_deducted: { label: "Partially Deducted", className: "bg-orange-100 text-orange-700" },
  forfeited: { label: "Forfeited (lender)", className: "bg-red-100 text-red-700" },
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  lender: "bg-blue-100 text-blue-700",
  borrower: "bg-amber-100 text-amber-700",
  system: "bg-gray-100 text-gray-700",
};

const ACTION_LABELS: Record<DepositAuditEntry["action"], string> = {
  evidence_submitted: "Evidence submitted",
  release: "Deposit released / claimed",
  partial_deduct: "Partial deduction",
  forfeit: "Forfeit (full deduction)",
  restrict: "User restricted",
  unrestrict: "User unrestricted",
  ban: "User banned",
};

const fmtA = (cents: number) => `A$${(cents / 100).toFixed(2)}`;
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

function isFinancialType(t: Complaint["type"]) {
  return FINANCIAL_TYPES.includes(t);
}

interface AdminRefundLite {
  refund_id: string;
  amount: number;
  currency: string;
  status: string;
  refund_type: string;
  trigger: string;
  created_at: string | null;
  reason: string | null;
}

interface TimelineItem {
  key: string;
  at: number; // epoch ms for sorting
  iconKey: "complaint" | "message" | "evidence" | "release" | "deduct" | "forfeit" | "restrict" | "system";
  actorRole: "admin" | "lender" | "borrower" | "system";
  actorName: string;
  title: string;
  detail?: string;
}

export default function AdminComplaintDetailPage() {
  const params = useParams();
  const router = useRouter();
  const complaintId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [me, setMe] = useState<User | null>(null);

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [order, setOrder] = useState<any | null>(null);
  const [deposit, setDeposit] = useState<DepositDetail | null>(null);
  const [refunds, setRefunds] = useState<AdminRefundLite[]>([]);
  const [userCache, setUserCache] = useState<Record<string, User>>({});

  const [submitting, setSubmitting] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    if (!complaintId) return;
    try {
      setRefreshing(true);
      const detail = await getComplaintDetail(complaintId);
      if (!detail) {
        alert("Complaint not found.");
        router.push("/admin/complaints");
        return;
      }
      setComplaint(detail.complaint);
      setMessages(detail.messages || []);

      const orderId = detail.complaint.orderId;
      const [orderRes, depositRes, refundsRes] = await Promise.all([
        orderId ? getOrderById(orderId).catch(() => null) : Promise.resolve(null),
        orderId ? getAdminDepositDetail(orderId).catch(() => null) : Promise.resolve(null),
        orderId
          ? getAdminRefunds({ search: orderId, page_size: 20 }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setOrder(orderRes);
      setDeposit(depositRes);
      const matched = (refundsRes?.refunds || []).filter(
        (r: any) => r.order?.order_id === orderId
      );
      setRefunds(matched);

      // Resolve display names for everyone referenced in this case.
      const ids = new Set<string>();
      ids.add(detail.complaint.complainantId);
      if (detail.complaint.respondentId) ids.add(detail.complaint.respondentId);
      (detail.messages || []).forEach((m) => ids.add(m.senderId));
      depositRes?.auditLog?.forEach((a) => a.actorId && ids.add(a.actorId));
      depositRes?.lenderEvidence?.forEach((e) => ids.add(e.submitterId));
      depositRes?.borrowerEvidence?.forEach((e) => ids.add(e.submitterId));

      const missing = Array.from(ids).filter((id) => !userCache[id]);
      if (missing.length > 0) {
        const fetched = await Promise.all(missing.map((id) => getUserById(id).catch(() => null)));
        const next = { ...userCache };
        missing.forEach((id, i) => {
          const u = fetched[i];
          if (u) next[id] = u;
        });
        setUserCache(next);
      }
    } finally {
      setRefreshing(false);
    }
  }, [complaintId, router, userCache]);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        setMe(u as User | null);
        setMeAdmin(isAdminLikeUser(u as any));
      } catch {
        setMeAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (meAdmin) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meAdmin, complaintId]);

  const userLabel = useCallback(
    (id?: string | null) => {
      if (!id) return "Unknown";
      const u = userCache[id];
      if (!u) return id.slice(0, 8) + "…";
      const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return full || u.name || u.email || id.slice(0, 8) + "…";
    },
    [userCache]
  );

  const roleFor = useCallback(
    (userId: string): TimelineItem["actorRole"] => {
      if (!complaint) return "system";
      if (userCache[userId]?.is_admin) return "admin";
      if (order?.owner?.id === userId) return "lender";
      if (order?.borrower?.id === userId) return "borrower";
      if (userId === complaint.complainantId) return "borrower";
      if (userId === complaint.respondentId) return "lender";
      return "system";
    },
    [complaint, order, userCache]
  );

  // ----------------- Audit Trail aggregator -----------------
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!complaint) return [];
    const items: TimelineItem[] = [];

    items.push({
      key: `complaint-created-${complaint.id}`,
      at: new Date(complaint.createdAt).getTime() || 0,
      iconKey: "complaint",
      actorRole: roleFor(complaint.complainantId),
      actorName: userLabel(complaint.complainantId),
      title: "Complaint filed",
      detail: complaint.subject,
    });

    messages.forEach((m) => {
      items.push({
        key: `msg-${m.id}`,
        at: new Date(m.createdAt).getTime() || 0,
        iconKey: "message",
        actorRole: roleFor(m.senderId),
        actorName: userLabel(m.senderId),
        title: "Note added",
        detail: m.body,
      });
    });

    deposit?.auditLog?.forEach((a) => {
      const iconKey: TimelineItem["iconKey"] =
        a.action === "evidence_submitted"
          ? "evidence"
          : a.action === "release"
          ? "release"
          : a.action === "partial_deduct"
          ? "deduct"
          : a.action === "forfeit"
          ? "forfeit"
          : "restrict";
      items.push({
        key: `audit-${a.id}`,
        at: new Date(a.createdAt || "").getTime() || 0,
        iconKey,
        actorRole: a.actorRole,
        actorName: a.actorId ? userLabel(a.actorId) : a.actorRole,
        title: ACTION_LABELS[a.action] || a.action,
        detail: [
          a.amountCents != null ? fmtA(a.amountCents) : null,
          a.finalSeverity ? `severity: ${a.finalSeverity}` : null,
          a.note,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });

    if (complaint.adminResponse && (complaint.status === "resolved" || complaint.status === "closed")) {
      items.push({
        key: `complaint-resolution-${complaint.id}`,
        at: new Date(complaint.updatedAt).getTime() || 0,
        iconKey: complaint.status === "resolved" ? "release" : "system",
        actorRole: "admin",
        actorName: "Admin",
        title: complaint.status === "resolved" ? "Complaint resolved" : "Complaint closed",
        detail: complaint.adminResponse,
      });
    }

    items.sort((a, b) => a.at - b.at);
    return items;
  }, [complaint, messages, deposit, userLabel, roleFor]);

  // ----------------- Closure logic helpers (BRD §10.6 + §17.3 #6) -----------------
  // After admin release/deduct, deposit goes to refund_ready — borrower has not
  // received the money yet, so do NOT mark complaint resolved until the
  // borrower has claimed (depositStatus → released | partially_deducted) OR the
  // case was a forfeit (terminal, lender keeps everything).
  const decisionState = useMemo(() => {
    if (!deposit) {
      return {
        canResolve: !isFinancialType(complaint?.type ?? "other"),
        banner: null as string | null,
      };
    }
    const s = deposit.depositStatus;
    if (s === "refund_ready") {
      return {
        canResolve: false,
        banner:
          "Decision made. Awaiting borrower to click 'Claim My Refund' on /deposits — complaint will be marked resolved only after the funds actually move.",
      };
    }
    if (s === "released" || s === "partially_deducted" || s === "forfeited") {
      return { canResolve: true, banner: null };
    }
    if (s === "pending_review") {
      return {
        canResolve: false,
        banner:
          "Deposit is still pending review. Make a release / deduct / forfeit decision in the deposit arbitration view before resolving the complaint.",
      };
    }
    return { canResolve: false, banner: null };
  }, [deposit, complaint]);

  // ----------------- Action handlers -----------------
  const setStatus = async (
    status: "investigating" | "resolved" | "closed",
    adminResponse?: string
  ) => {
    if (!complaint) return;
    try {
      setSubmitting(true);
      await resolveComplaint(complaint.id, { status, adminResponse });
      await loadAll();
    } catch (err) {
      console.error("[AdminComplaintDetail] status change failed:", err);
      alert("Failed to update complaint status.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!complaint || !noteInput.trim()) return;
    try {
      setSubmitting(true);
      await addComplaintMessage(complaint.id, { body: noteInput.trim() });
      setNoteInput("");
      await loadAll();
    } catch (err) {
      console.error("[AdminComplaintDetail] add note failed:", err);
      alert("Failed to add note.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    const note = prompt("Resolution note (visible to both parties):", "");
    if (!note || !note.trim()) return;
    await setStatus("resolved", note.trim());
  };

  const handleClose = async () => {
    const note = prompt("Close note (will be archived):", "Closed without further action.");
    if (!note || !note.trim()) return;
    await setStatus("closed", note.trim());
  };

  // ----------------- Render -----------------
  if (loading) return <div className="p-6">Loading…</div>;
  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Complaint Detail</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }
  if (!complaint) return <div className="p-6 text-gray-500">Complaint not found.</div>;

  const meta = STATUS_META[complaint.status];
  const orderId = complaint.orderId;
  const financial = isFinancialType(complaint.type);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/complaints"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black mb-1"
          >
            <ArrowLeft className="w-4 h-4" /> Complaint queue
          </Link>
          <h1 className="text-2xl font-bold">{complaint.subject}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
            <span>Case ID: {complaint.id}</span>
            <span>·</span>
            <span>Type: {TYPE_LABELS[complaint.type] || complaint.type}</span>
            {financial && (
              <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                Financial
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${meta.className}`}>
            {meta.label}
          </span>
          <button
            onClick={loadAll}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md border text-xs flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Section 1: Related Order */}
      <section className="rounded-xl border bg-white p-5 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Info className="w-5 h-5" /> 1 · Related Order
        </h2>
        {!orderId ? (
          <p className="text-sm text-gray-500">No order linked to this complaint.</p>
        ) : !order ? (
          <p className="text-sm text-gray-500">Order {orderId} not loaded (deleted or inaccessible).</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Order ID</div>
              <div className="font-mono text-xs break-all">{order.id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-medium">{order.status}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Borrower</div>
              <div>{order.borrower?.name || "—"}</div>
              <div className="text-xs text-gray-400">{order.borrower?.email}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Lender</div>
              <div>{order.owner?.name || "—"}</div>
              <div className="text-xs text-gray-400">{order.owner?.email}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-500">Books</div>
              <div>
                {(order.books || []).map((b: any) => b.titleEn).join(", ") || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Created</div>
              <div>{fmtDate(order.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Returned</div>
              <div>{fmtDate(order.returnedAt)}</div>
            </div>
            <div className="md:col-span-2">
              <Link
                href={`/admin/orders/${orderId}`}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                Open admin order view <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Both-Side Evidence */}
      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ImageIcon className="w-5 h-5" /> 2 · Both-Side Evidence
        </h2>

        {/* Complainant evidence (from the complaint itself) */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Complainant — {userLabel(complaint.complainantId)}
          </h3>
          <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">{complaint.description}</p>
          {complaint.evidencePhotos && complaint.evidencePhotos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {complaint.evidencePhotos.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square rounded-lg overflow-hidden border bg-gray-50"
                >
                  <img src={src} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No photos attached.</p>
          )}
          {complaint.damageSeverity && complaint.damageSeverity !== "none" && (
            <div className="text-xs text-gray-500 mt-2">
              Claimed severity: <span className="font-medium">{complaint.damageSeverity}</span>
            </div>
          )}
        </div>

        {/* Lender / Borrower evidence (deposit-side) */}
        {deposit && (
          <>
            <hr className="border-gray-100" />
            <EvidenceList
              title={`Lender evidence (${deposit.lenderEvidence.length})`}
              items={deposit.lenderEvidence}
              userLabel={userLabel}
            />
            <EvidenceList
              title={`Borrower evidence (${deposit.borrowerEvidence.length})`}
              items={deposit.borrowerEvidence}
              userLabel={userLabel}
            />
          </>
        )}
      </section>

      {/* Section 3: Linked Arbitration / Refund */}
      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> 3 · Linked Arbitration & Refund
        </h2>

        {!orderId ? (
          <p className="text-sm text-gray-500">No order — no deposit or refund to link.</p>
        ) : (
          <>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">Deposit</div>
                {deposit?.depositStatus && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      DEPOSIT_STATUS_META[deposit.depositStatus]?.className || "bg-gray-100"
                    }`}
                  >
                    {DEPOSIT_STATUS_META[deposit.depositStatus]?.label || deposit.depositStatus}
                  </span>
                )}
              </div>
              {deposit ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">Total deposit</div>
                      <div className="font-semibold">{fmtA(deposit.depositCents)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Deducted</div>
                      <div className="font-semibold text-red-600">
                        {deposit.depositDeductedCents > 0 ? `-${fmtA(deposit.depositDeductedCents)}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Refundable</div>
                      <div className="font-semibold">
                        {fmtA(deposit.depositCents - deposit.depositDeductedCents)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Final severity</div>
                      <div>{deposit.damageSeverityFinal || "—"}</div>
                    </div>
                  </div>
                  <Link
                    href={`/admin/deposits/${orderId}?complaintId=${complaint.id}&complaintType=${complaint.type}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-1"
                  >
                    Open deposit arbitration view <ExternalLink className="w-3 h-3" />
                  </Link>
                </>
              ) : (
                <p className="text-xs text-gray-400">No deposit record found for this order.</p>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Refunds for this order ({refunds.length})
              </div>
              {refunds.length === 0 ? (
                <p className="text-xs text-gray-400">No refunds yet.</p>
              ) : (
                <ul className="divide-y">
                  {refunds.map((r) => (
                    <li key={r.refund_id} className="py-2 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">
                          {fmtA(r.amount)} · {r.refund_type}{" "}
                          <span className="text-xs text-gray-400">({r.trigger})</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.status} · {fmtDate(r.created_at)}
                        </div>
                      </div>
                      <Link
                        href={`/admin/refunds/${r.refund_id}`}
                        className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* Section 4: Admin Decision Panel */}
      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> 4 · Admin Decision
        </h2>

        {/* Educational tooltip — always show on financial cases */}
        {financial && orderId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Before you decide — how your call moves money</div>
              <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                <li>
                  <b>Release</b> / <b>Deduct (light/medium)</b>: the borrower must claim their
                  refund before money actually moves. Wait for them to claim before marking this
                  resolved.
                </li>
                <li>
                  <b>Forfeit</b>: money transfers to the lender immediately &mdash; no borrower
                  action needed. You can mark resolved right away.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Closure-state banner */}
        {decisionState.banner && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
            <Clock3 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{decisionState.banner}</div>
          </div>
        )}

        {/* Action row — drill-in CTA + status controls share the same row;
            wraps to multiple lines on narrow screens. */}
        <div className="flex flex-wrap gap-2">
          {orderId && financial && (
            <Link
              href={`/admin/deposits/${orderId}?complaintId=${complaint.id}&complaintType=${complaint.type}`}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-1"
            >
              Open Deposit Arbitration <ExternalLink className="w-4 h-4" />
            </Link>
          )}
          {complaint.status === "pending" && (
            <button
              disabled={submitting}
              onClick={() => setStatus("investigating")}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Clock3 className="w-4 h-4" /> Mark Investigating
            </button>
          )}
          {(complaint.status === "pending" || complaint.status === "investigating") && (
            <>
              <button
                disabled={submitting || !decisionState.canResolve}
                onClick={handleResolve}
                title={
                  !decisionState.canResolve
                    ? "Resolve gated until the deposit decision has actually moved funds (released / partially_deducted / forfeited)."
                    : ""
                }
                className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" /> Mark Resolved
              </button>
              <button
                disabled={submitting}
                onClick={handleClose}
                className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <XCircle className="w-4 h-4" /> Close (no action)
              </button>
            </>
          )}
        </div>

        {/* Add note */}
        {complaint.status !== "closed" && complaint.status !== "resolved" && (
          <div className="pt-3 border-t">
            <label className="text-sm font-medium text-gray-700 block mb-1">Add note</label>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              rows={3}
              placeholder="Internal or party-visible note…"
              className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleAddNote}
                disabled={submitting || !noteInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-black text-white text-sm hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Send className="w-4 h-4" /> Add Note
              </button>
            </div>
          </div>
        )}

        {complaint.adminResponse && (
          <div className="pt-3 border-t">
            <div className="text-xs text-gray-500 mb-1">Last admin response</div>
            <div className="text-sm bg-blue-50 border border-blue-100 rounded-lg p-3 text-blue-900">
              {complaint.adminResponse}
            </div>
          </div>
        )}
      </section>

      {/* Section 5: Audit Trail */}
      <section className="rounded-xl border bg-white p-5 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageCircle className="w-5 h-5" /> 5 · Audit Trail
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet.</p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2">
            {timeline.map((item) => (
              <li key={item.key} className="ml-4 pb-4">
                <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white border-2 border-gray-300" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{item.title}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_BADGE[item.actorRole]}`}>
                    {item.actorRole}
                  </span>
                  <span className="text-xs text-gray-500">{item.actorName}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {item.at ? new Date(item.at).toLocaleString() : "—"}
                  </span>
                </div>
                {item.detail && (
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.detail}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {!financial && (
        <div className="text-xs text-gray-400 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
          <span>
            This is a non-financial complaint ({TYPE_LABELS[complaint.type]}). No deposit panel
            applies — handle through notes + resolve / close.
          </span>
        </div>
      )}
    </div>
  );
}

// ----------------- Sub-components -----------------

function EvidenceList({
  title,
  items,
  userLabel,
}: {
  title: string;
  items: DepositDetail["lenderEvidence"];
  userLabel: (id: string) => string;
}) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
        <p className="text-xs text-gray-400">None submitted.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      {items.map((e) => (
        <div key={e.id} className="rounded-lg border p-3 space-y-2">
          <div className="text-xs text-gray-500 flex flex-wrap gap-2">
            <span>{userLabel(e.submitterId)}</span>
            <span>·</span>
            <span>severity: {e.claimedSeverity}</span>
            <span>·</span>
            <span>{fmtDate(e.submittedAt)}</span>
          </div>
          {e.note && <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.note}</p>}
          {e.photos && e.photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {e.photos.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square rounded-lg overflow-hidden border bg-gray-50"
                >
                  <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
