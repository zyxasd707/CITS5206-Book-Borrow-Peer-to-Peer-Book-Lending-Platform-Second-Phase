"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Clock,
  Upload,
  X,
  Info,
  History,
  ShieldOff,
} from "lucide-react";
import { getCurrentUser, getToken, getApiUrl } from "@/utils/auth";
import type { User } from "@/app/types/user";
import {
  getDepositDetail,
  submitBorrowerEvidence,
  DepositDetail,
  DepositEvidence,
  DepositAuditEntry,
} from "@/utils/deposits";

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  none: { label: "None", className: "bg-gray-100 text-gray-700" },
  light: { label: "Light", className: "bg-yellow-100 text-yellow-700" },
  medium: { label: "Medium", className: "bg-orange-100 text-orange-700" },
  severe: { label: "Severe", className: "bg-red-100 text-red-700" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  released: { label: "Released", className: "bg-green-100 text-green-700 border-green-200" },
  partially_deducted: { label: "Partially Deducted", className: "bg-orange-100 text-orange-700 border-orange-200" },
  forfeited: { label: "Forfeited", className: "bg-red-100 text-red-700 border-red-200" },
  held: { label: "Held", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

const COUNTER_EVIDENCE_WINDOW_DAYS = 7;

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

function EvidenceBlock({ title, evidence, emptyHint }: {
  title: string;
  evidence: DepositEvidence[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Camera className="w-4 h-4" /> {title}
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

function CounterEvidenceForm({
  orderId,
  deadline,
  onSubmitted,
}: {
  orderId: string;
  deadline: Date | null;
  onSubmitted: () => void;
}) {
  const [severity, setSeverity] = useState<"light" | "medium" | "severe">("light");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = Array.from(picked).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...next].slice(0, 6));
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setErr(null);
    const token = getToken();
    if (!token) {
      setErr("Please log in again.");
      return;
    }
    try {
      setSubmitting(true);
      // Upload each photo first (same scene as lender submits)
      const uploaded: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("scene", "deposit_evidence");
        const res = await fetch(`${getApiUrl()}/api/v1/upload/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) throw new Error(`Photo upload failed: ${f.name}`);
        const data = await res.json();
        uploaded.push(data.path);
      }

      await submitBorrowerEvidence(orderId, {
        photos: uploaded,
        claimed_severity: severity,
        note: note.trim() || undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 space-y-3">
      <div className="flex items-start gap-2 text-blue-900">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold">Your turn: submit counter-evidence</div>
          <div>
            The lender has flagged damage on return. You can upload your own photos and explain
            the book's condition when you returned it. Admin will review both sides.
            {deadline && (
              <>
                {" "}
                <b>Deadline: {deadline.toLocaleString()}</b>.
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          How would you describe the book's condition when you returned it?
        </label>
        <div className="flex flex-wrap gap-2">
          {(["light", "medium", "severe"] as const).map((v) => {
            const m = SEVERITY_META[v];
            const active = severity === v;
            return (
              <button
                key={v}
                onClick={() => setSeverity(v)}
                className={`px-3 py-1.5 rounded-md border text-sm ${
                  active ? "bg-black text-white border-black" : "hover:bg-gray-50 bg-white"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Pick the tier you believe best describes the condition (you cannot pick &quot;none&quot; once
          the lender has reported damage — that&apos;s what admin arbitration is for).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Your statement (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Describe the condition when you shipped / handed over the book."
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Photos (up to 6)</label>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-white bg-white flex items-center gap-1">
            <Upload className="w-4 h-4" />
            Add photos
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 px-2 py-1 border rounded-md bg-white text-xs"
            >
              <span className="truncate max-w-[120px]">{f.name}</span>
              <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {err && <div className="text-sm text-red-700">{err}</div>}

      <div className="flex justify-end">
        <button
          disabled={submitting}
          onClick={submit}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit Counter-Evidence"}
        </button>
      </div>
    </div>
  );
}

function AuditTimeline({ entries }: { entries: DepositAuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-gray-400">No history yet.</p>;
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

export default function MyDepositDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [detail, setDetail] = useState<DepositDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const data = await getDepositDetail(orderId);
      setDetail(data);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e.message || "Failed to load";
      setErr(msg);
    }
  }, [orderId]);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push("/login");
          return;
        }
        setMe(user);
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load, router]);

  if (loading) return <div className="p-6 text-gray-500">Loading deposit…</div>;

  if (err) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Deposit</h1>
        <p className="text-red-600">{err}</p>
        <Link href="/deposits" className="text-blue-600 underline">← Back to My Deposits</Link>
      </div>
    );
  }

  if (!detail || !me) return null;

  const amBorrower = me.id === detail.borrower.id;
  const amLender = me.id === detail.lender.id;
  const statusMeta = STATUS_META[detail.depositStatus] || STATUS_META["held"];
  const sevMeta = SEVERITY_META[detail.damageSeverityFinal || "none"] || SEVERITY_META["none"];
  const refundable = detail.depositCents - detail.depositDeductedCents;

  const lenderEv = detail.lenderEvidence[0];
  const hasBorrowerEv = detail.borrowerEvidence.length > 0;
  const deadline = lenderEv?.submittedAt
    ? new Date(
        new Date(lenderEv.submittedAt).getTime() +
          COUNTER_EVIDENCE_WINDOW_DAYS * 24 * 3600 * 1000
      )
    : null;
  const windowOpen = deadline ? new Date() < deadline : false;

  const canUpload =
    amBorrower &&
    detail.depositStatus === "pending_review" &&
    !hasBorrowerEv &&
    !!lenderEv &&
    windowOpen;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <button
          onClick={() => router.push("/deposits")}
          className="flex items-center gap-1 text-gray-500 hover:text-black mb-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Deposits
        </button>
        <h1 className="text-2xl font-bold">Deposit Detail</h1>
        {detail.book?.titleEn && (
          <p className="text-sm text-gray-500">{detail.book.titleEn}</p>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${statusMeta.className}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="text-lg font-bold">{statusMeta.label}</span>
            <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium ${sevMeta.className}`}>
              Final: {sevMeta.label}
            </span>
            <div className="text-xs opacity-80 mt-0.5">
              You are the {amBorrower ? "borrower" : amLender ? "lender" : "party"}.
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{fmtAmount(detail.depositCents)}</div>
            {detail.depositDeductedCents > 0 ? (
              <div className="text-sm opacity-80">
                -{fmtAmount(detail.depositDeductedCents)} deducted · {fmtAmount(refundable)} refunded
              </div>
            ) : detail.depositStatus === "released" ? (
              <div className="text-sm opacity-80">Full deposit refunded</div>
            ) : null}
          </div>
        </div>
      </div>

      {me.isRestricted && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 flex items-start gap-2 text-sm">
          <ShieldOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Your account is restricted from borrowing.</div>
            <div>Reason: {me.restrictionReason || "Contact support for details."}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EvidenceBlock
          title="Lender's Evidence"
          evidence={detail.lenderEvidence}
          emptyHint="Lender has not uploaded evidence."
        />
        <EvidenceBlock
          title={amBorrower ? "Your Counter-Evidence" : "Borrower's Counter-Evidence"}
          evidence={detail.borrowerEvidence}
          emptyHint={
            amBorrower
              ? "You have not submitted counter-evidence yet."
              : "Borrower has not submitted counter-evidence yet."
          }
        />
      </div>

      {canUpload && (
        <CounterEvidenceForm
          orderId={detail.orderId}
          deadline={deadline}
          onSubmitted={() => load()}
        />
      )}

      {amBorrower && detail.depositStatus === "pending_review" && !canUpload && !hasBorrowerEv && lenderEv && !windowOpen && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-3 flex items-start gap-2 text-sm text-gray-700">
          <Clock className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            The 7-day counter-evidence window closed on {deadline!.toLocaleString()}. Admin will
            arbitrate based on the lender's evidence.
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> History
        </h2>
        <AuditTimeline entries={detail.auditLog} />
      </div>
    </div>
  );
}
