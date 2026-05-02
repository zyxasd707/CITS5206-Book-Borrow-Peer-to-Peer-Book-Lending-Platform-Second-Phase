"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Minus,
  XCircle,
  Clock,
  ShieldAlert,
  User,
  Camera,
  AlertTriangle,
  ShieldOff,
  History,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import {
  getAdminDepositDetail,
  adminArbitrationDecide,
  adminRestrictUser,
  adminUnrestrictUser,
  DepositDetail,
  StrikeSignal,
  DepositEvidence,
  DepositAuditEntry,
  ArbitrationDepositAction,
} from "@/utils/deposits";

// Phase B.2 — rental refund default by complaint type (BRD §6.8 step 5).
// damage-on-receipt / wrong-item / rental-defect → toggle pre-checked.
// damage-on-return → toggle unchecked (rental was already enjoyed).
// Anything else (delivery / no-return / no complaint context) → unchecked,
// admin opts in explicitly.
const RENTAL_REFUND_DEFAULT_TYPES: ReadonlyArray<string> = [
  "damage-on-receipt",
  "wrong-item",
  "rental-defect",
];

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  none: { label: "None", className: "bg-gray-100 text-gray-700" },
  light: { label: "Light", className: "bg-yellow-100 text-yellow-700" },
  medium: { label: "Medium", className: "bg-orange-100 text-orange-700" },
  severe: { label: "Severe", className: "bg-red-100 text-red-700" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  // PR #97 mid-state: admin already decided, borrower has not claimed yet.
  // Pre-B.2 this page lacked the key, so the status banner fell back to "Held"
  // (gray) right after a successful arbitration — confusing because the
  // arbitration was actually done. Match the green emerald used by
  // /admin/complaints/[id]'s DEPOSIT_STATUS_META.
  refund_ready: { label: "Refund Ready (awaiting borrower claim)", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  released: { label: "Released", className: "bg-green-100 text-green-700 border-green-200" },
  partially_deducted: { label: "Partially Deducted", className: "bg-orange-100 text-orange-700 border-orange-200" },
  forfeited: { label: "Forfeited", className: "bg-red-100 text-red-700 border-red-200" },
  held: { label: "Held", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

function fmtAmount(cents: number | null) {
  if (cents == null) return "-";
  return `A$${(cents / 100).toFixed(2)}`;
}

function fmtDate(v: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "-";
  }
}

function EvidencePanel({
  role,
  evidence,
  emptyHint,
}: {
  role: "lender" | "borrower";
  evidence: DepositEvidence[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Camera className="w-4 h-4" />
        {role === "lender" ? "Lender Evidence" : "Borrower Counter-Evidence"}
      </h2>
      {evidence.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyHint}</p>
      ) : (
        evidence.map((ev) => {
          const sev = SEVERITY_META[ev.claimedSeverity] || SEVERITY_META["none"];
          return (
            <div key={ev.id} className="space-y-2 border-t pt-3 first:border-none first:pt-0">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sev.className}`}>
                  Claims: {sev.label}
                </span>
                <span className="text-xs text-gray-400">{fmtDate(ev.submittedAt)}</span>
              </div>
              {ev.note && <p className="text-sm text-gray-700">{ev.note}</p>}
              {ev.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {ev.photos.map((p, i) => (
                    <a
                      key={i}
                      href={p}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square overflow-hidden rounded-lg border bg-gray-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p}
                        alt={`evidence ${i + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function StrikeDialog({
  signal,
  borrowerId,
  borrowerName,
  onRestrict,
  onClose,
}: {
  signal: StrikeSignal;
  borrowerId: string;
  borrowerName: string;
  onRestrict: () => Promise<void>;
  onClose: () => void;
}) {
  const mustBan = signal.auto_ban;
  const recommendBan = signal.suggest_ban && !mustBan;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-red-700">
          <ShieldAlert className="w-5 h-5" />
          Damage Strike Alert
        </h2>

        <div className="rounded-lg border bg-red-50 text-red-800 p-3 text-sm space-y-1">
          <p>
            <span className="font-semibold">{borrowerName}</span> now has{" "}
            <span className="font-semibold">{signal.strike_count}</span> damage strike
            {signal.strike_count === 1 ? "" : "s"} (severity score{" "}
            <span className="font-semibold">{signal.severity_score}</span>).
          </p>
          {signal.restrict_applied && (
            <p>🚨 Borrowing has been <b>automatically restricted</b>.</p>
          )}
          {recommendBan && (
            <p>⚠️ Latest case was marked <b>severe</b> — consider permanent ban.</p>
          )}
          {mustBan && (
            <p>🛑 Severity score reached <b>{signal.severity_score}</b> — auto-ban threshold met.</p>
          )}
        </div>

        {!signal.restrict_applied && (recommendBan || mustBan) && (
          <div className="text-sm text-gray-600">
            You may want to restrict this borrower preemptively while reviewing the case.
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Dismiss
          </button>
          {!signal.restrict_applied && (
            <button
              onClick={onRestrict}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Restrict Borrower
            </button>
          )}
          {(recommendBan || mustBan) && (
            <Link
              href={`/admin/users?userId=${borrowerId}`}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
            >
              Open User → Ban
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditTimeline({ entries }: { entries: DepositAuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">No history yet.</p>;
  }
  return (
    <div className="relative pl-6">
      {entries.map((log, i) => (
        <div key={log.id} className="relative pb-4 last:pb-0">
          {i < entries.length - 1 && (
            <div className="absolute left-[-16px] top-3 w-px h-full bg-gray-200" />
          )}
          <div className="absolute left-[-20px] top-1.5 w-2 h-2 rounded-full bg-gray-400" />
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{log.action}</span>
              <span className="text-xs text-gray-400">
                by {log.actorRole}
                {log.finalSeverity ? ` · ${log.finalSeverity}` : ""}
                {log.amountCents != null ? ` · ${fmtAmount(log.amountCents)}` : ""}
              </span>
            </div>
            {log.note && <p className="text-gray-600 text-xs mt-0.5">{log.note}</p>}
            <p className="text-gray-400 text-xs">{fmtDate(log.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDepositDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;
  const complaintId = searchParams?.get("complaintId") || null;
  const complaintType = searchParams?.get("complaintType") || null;

  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [detail, setDetail] = useState<DepositDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [note, setNote] = useState("");
  const [refundRental, setRefundRental] = useState<boolean>(
    complaintType ? RENTAL_REFUND_DEFAULT_TYPES.includes(complaintType) : false,
  );
  const [strikePopup, setStrikePopup] = useState<StrikeSignal | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminDepositDetail(orderId);
      setDetail(data);
    } catch (err) {
      console.error("[AdminDepositDetail] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        const isAdmin = isAdminLikeUser(me);
        setMeAdmin(isAdmin);
        if (isAdmin) await load();
      } catch {
        setMeAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const handleAction = async (kind: "release" | "light" | "medium" | "forfeit") => {
    if (!detail) return;
    // Phase B.2: 4-tier UI labels mapped onto deposit_action terms used by
    // the new arbitration endpoint.
    const depositAction: ArbitrationDepositAction =
      kind === "release"
        ? "release"
        : kind === "forfeit"
        ? "forfeit"
        : kind === "light"
        ? "deduct_25"
        : "deduct_50";
    const rentalAction = refundRental ? "refund_full" : "keep";

    const label =
      kind === "release"
        ? "release the full deposit"
        : kind === "forfeit"
        ? "forfeit the full deposit"
        : `deduct ${kind === "light" ? "25%" : "50%"} for ${kind} damage`;
    const rentalNote = refundRental
      ? " AND refund the full rental fee to the borrower"
      : "";
    if (!confirm(`Are you sure you want to ${label}${rentalNote}?`)) return;

    try {
      setSubmitting(true);
      const result = await adminArbitrationDecide(orderId, {
        deposit_action: depositAction,
        rental_action: rentalAction,
        complaint_id: complaintId,
        note,
      });

      setNote("");
      await load();

      if (
        result.strike &&
        (result.strike.restrict_applied ||
          result.strike.suggest_ban ||
          result.strike.auto_ban)
      ) {
        setStrikePopup(result.strike);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || "Unknown error";
      alert(`Action failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestrict = async () => {
    if (!detail?.borrower.id) return;
    const reason =
      detail.borrower.restrictionReason ||
      `Restricted from deposits page after reviewing order ${orderId}.`;
    try {
      await adminRestrictUser(detail.borrower.id, reason);
      await load();
      setStrikePopup(null);
    } catch (err: any) {
      alert(`Failed to restrict: ${err?.response?.data?.detail || err.message}`);
    }
  };

  const handleUnrestrict = async () => {
    if (!detail?.borrower.id) return;
    if (!confirm("Lift borrowing restriction for this user?")) return;
    try {
      await adminUnrestrictUser(detail.borrower.id);
      await load();
    } catch (err: any) {
      alert(`Failed to unrestrict: ${err?.response?.data?.detail || err.message}`);
    }
  };

  if (loading) return <div className="p-6">Loading deposit…</div>;

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Deposit Detail</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Deposit Not Found</h1>
        <Link href="/admin/deposits" className="text-blue-600 underline">
          Back to Deposit List
        </Link>
      </div>
    );
  }

  const statusMeta = STATUS_META[detail.depositStatus] || STATUS_META["held"];
  const sevMeta = SEVERITY_META[detail.damageSeverityFinal || "none"] || SEVERITY_META["none"];
  const refundableCents = detail.depositCents - detail.depositDeductedCents;
  const isPending = detail.depositStatus === "pending_review";

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/admin/deposits")}
          className="flex items-center gap-1 text-gray-500 hover:text-black mb-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Deposit List
        </button>
        <h1 className="text-2xl font-bold">Deposit Detail</h1>
        <p className="text-xs text-gray-400 font-mono mt-1">Order {detail.orderId}</p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl border p-4 ${statusMeta.className}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="text-lg font-bold">{statusMeta.label}</span>
            <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium ${sevMeta.className}`}>
              Final: {sevMeta.label}
            </span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{fmtAmount(detail.depositCents)}</div>
            {detail.depositDeductedCents > 0 && (
              <div className="text-sm opacity-80">
                -{fmtAmount(detail.depositDeductedCents)} deducted · {fmtAmount(refundableCents)} refunded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EvidencePanel
          role="lender"
          evidence={detail.lenderEvidence}
          emptyHint="Lender has not uploaded evidence."
        />
        <EvidencePanel
          role="borrower"
          evidence={detail.borrowerEvidence}
          emptyHint="Borrower has not submitted counter-evidence yet."
        />
      </div>

      {/* Parties */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> Lender
          </h2>
          <div className="text-sm">
            <div className="font-medium">{detail.lender.name || "-"}</div>
            <div className="text-xs text-gray-400 font-mono">{detail.lender.id}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> Borrower
          </h2>
          <div className="text-sm">
            <div className="font-medium">{detail.borrower.name || "-"}</div>
            <div className="text-xs text-gray-400 font-mono">{detail.borrower.id}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs pt-2">
            <span className="px-2 py-1 rounded bg-gray-100">
              {detail.borrower.damageStrikeCount}× strike
            </span>
            <span className="px-2 py-1 rounded bg-gray-100">
              score {detail.borrower.damageSeverityScore}
            </span>
            {detail.borrower.isRestricted && (
              <span className="px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1">
                <ShieldOff className="w-3 h-3" /> Restricted
              </span>
            )}
          </div>
          {detail.borrower.historyBySeverity &&
            Object.keys(detail.borrower.historyBySeverity).length > 0 && (
              <div className="text-xs text-gray-500 pt-2 border-t">
                Past outcomes:{" "}
                {Object.entries(detail.borrower.historyBySeverity)
                  .map(([k, v]) => `${k}×${v}`)
                  .join(" · ")}
              </div>
            )}
          {detail.borrower.isRestricted && (
            <button
              onClick={handleUnrestrict}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Lift restriction
            </button>
          )}
        </div>
      </div>

      {/* Action panel — only active when pending_review */}
      {isPending ? (
        <div className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" /> Arbitrate this deposit
          </h2>
          <p className="text-sm text-gray-600">
            Pick an outcome. Deduction rates are fixed: light 25%, medium 50%, severe 100% (forfeit).
            {complaintType && (
              <span className="ml-1 text-gray-500">
                Complaint type: <code className="text-xs">{complaintType}</code>.
              </span>
            )}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (optional, shown to both parties)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Reviewed both sets of photos; ruling based on cover damage visible in lender photo 2."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Phase B.2 — rental refund toggle (Q4=B). Combined into the same
              Stripe.Refund.create at borrower-claim time. */}
          <label className="flex items-start gap-2 rounded-lg border bg-blue-50 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={refundRental}
              onChange={(e) => setRefundRental(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium text-blue-900">Also refund the full rental fee</div>
              <div className="text-xs text-blue-800/80 mt-0.5">
                Pre-checked for damage-on-receipt / wrong-item / rental-defect cases. Leave
                unchecked when the borrower already enjoyed the rental (e.g. damage-on-return).
                If checked, the rental refund will be combined with the deposit refund into a
                single Stripe refund when the borrower claims.
              </div>
            </div>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              disabled={submitting}
              onClick={() => handleAction("release")}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Release
            </button>
            <button
              disabled={submitting}
              onClick={() => handleAction("light")}
              className="px-3 py-2 bg-yellow-500 text-white rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-yellow-600 disabled:opacity-50"
            >
              <Minus className="w-4 h-4" /> Deduct 25% (light)
            </button>
            <button
              disabled={submitting}
              onClick={() => handleAction("medium")}
              className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-orange-600 disabled:opacity-50"
            >
              <Minus className="w-4 h-4" /> Deduct 50% (medium)
            </button>
            <button
              disabled={submitting}
              onClick={() => handleAction("forfeit")}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> Forfeit (100%)
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500 flex items-center gap-2">
          <Clock className="w-4 h-4" /> This deposit has been resolved. No further arbitration actions available.
        </div>
      )}

      {/* Audit Timeline */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> Audit Timeline
        </h2>
        <AuditTimeline entries={detail.auditLog} />
      </div>

      {/* Strike popup */}
      {strikePopup && detail.borrower.id && (
        <StrikeDialog
          signal={strikePopup}
          borrowerId={detail.borrower.id}
          borrowerName={detail.borrower.name || "this borrower"}
          onRestrict={handleRestrict}
          onClose={() => setStrikePopup(null)}
        />
      )}
    </div>
  );
}
