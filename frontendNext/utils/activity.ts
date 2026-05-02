// Cross-module aggregator for /activity (BRD §8.2). No backend endpoint:
// Q9=A — frontend stitches deposits + refunds + complaints into 3 buckets.

import type { Complaint } from "./complaints";
import type { DepositSummaryItem } from "./deposits";
import { getDepositDetail } from "./deposits";

export interface UserRefundItem {
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
}

export type AwaitingItem =
  | {
      kind: "deposit-refund-ready";
      key: string;
      orderId: string;
      bookTitle: string;
      counterparty: string;
      refundableCents: number;
      updatedAt: string | null;
    }
  | {
      kind: "deposit-counter-evidence";
      key: string;
      orderId: string;
      bookTitle: string;
      counterparty: string;
      depositCents: number;
      updatedAt: string | null;
    }
  | {
      kind: "complaint-needs-response";
      key: string;
      complaintId: string;
      subject: string;
      orderId?: string;
      updatedAt: string | null;
    };

export type ActiveItem =
  | {
      kind: "deposit-in-review";
      key: string;
      orderId: string;
      bookTitle: string;
      counterparty: string;
      depositCents: number;
      depositStatus: DepositSummaryItem["depositStatus"];
      role?: "borrower" | "lender";
      updatedAt: string | null;
    }
  | {
      kind: "refund-processing";
      key: string;
      refundId: string;
      orderId: string;
      bookTitle: string;
      amountCents: number;
      currency: string;
      status: string;
      createdAt: string | null;
    };

export type HistoryItem =
  | {
      kind: "deposit-finalized";
      key: string;
      orderId: string;
      bookTitle: string;
      counterparty: string;
      depositCents: number;
      depositDeductedCents: number;
      depositStatus: DepositSummaryItem["depositStatus"];
      role?: "borrower" | "lender";
      updatedAt: string | null;
    }
  | {
      kind: "refund-completed";
      key: string;
      refundId: string;
      orderId: string;
      bookTitle: string;
      amountCents: number;
      currency: string;
      createdAt: string | null;
    };

export interface ActivityBuckets {
  awaiting: AwaitingItem[];
  active: ActiveItem[];
  history: HistoryItem[];
}

const counterpartyName = (d: DepositSummaryItem) =>
  (d.role === "borrower" ? d.lender.name : d.borrower.name) || "Unknown";

const depositBookTitle = (d: DepositSummaryItem) => d.book?.titleEn || "Untitled book";

const refundBookTitle = (r: UserRefundItem) =>
  r.order.book_titles.length > 0 ? r.order.book_titles.join(", ") : "Untitled book";

export async function buildActivityBuckets(args: {
  currentUserId: string;
  deposits: DepositSummaryItem[];
  refunds: UserRefundItem[];
  complaints: Complaint[];
}): Promise<ActivityBuckets> {
  const { currentUserId, deposits, refunds, complaints } = args;

  const awaiting: AwaitingItem[] = [];

  // 1. refund_ready (borrower-side): highest priority — money is sitting in
  // refund_ready until borrower explicitly claims (PR #97 model).
  for (const d of deposits) {
    if (d.depositStatus === "refund_ready" && d.role === "borrower") {
      awaiting.push({
        kind: "deposit-refund-ready",
        key: `dep-claim-${d.orderId}`,
        orderId: d.orderId,
        bookTitle: depositBookTitle(d),
        counterparty: counterpartyName(d),
        refundableCents: d.depositCents - d.depositDeductedCents,
        updatedAt: d.updatedAt,
      });
    }
  }

  // 2. Counter-evidence window: only relevant if borrower has not yet
  // submitted any evidence (BRD §8.2). Summary endpoint omits the evidence
  // arrays, so we fetch DepositDetail for each candidate. Fanout is bounded
  // by the count of pending_review-as-borrower items (typically 0–2 per
  // user) so a parallel fetch without paging is fine.
  const pendingReviewBorrower = deposits.filter(
    (d) => d.depositStatus === "pending_review" && d.role === "borrower"
  );
  if (pendingReviewBorrower.length > 0) {
    const details = await Promise.all(
      pendingReviewBorrower.map((d) => getDepositDetail(d.orderId).catch(() => null))
    );
    pendingReviewBorrower.forEach((d, i) => {
      const detail = details[i];
      if (detail && detail.borrowerEvidence.length > 0) return;
      awaiting.push({
        kind: "deposit-counter-evidence",
        key: `dep-evidence-${d.orderId}`,
        orderId: d.orderId,
        bookTitle: depositBookTitle(d),
        counterparty: counterpartyName(d),
        depositCents: d.depositCents,
        updatedAt: d.updatedAt,
      });
    });
  }

  // 3. Complaints where the user is the respondent and admin has marked the
  // case "investigating" — best-effort surrogate for "admin needs your
  // reply". The "unread message" bullet from BRD §8.2 is intentionally
  // skipped here: there is no per-complaint read state in Phase A. Phase
  // B.1 introduces COMPLAINT_REPLY notifications which will fill the gap.
  for (const c of complaints) {
    if (c.respondentId === currentUserId && c.status === "investigating") {
      awaiting.push({
        kind: "complaint-needs-response",
        key: `cmp-${c.id}`,
        complaintId: c.id,
        subject: c.subject,
        orderId: c.orderId,
        updatedAt: c.updatedAt,
      });
    }
  }

  const active: ActiveItem[] = [];
  for (const d of deposits) {
    if (d.depositStatus === "pending_review" || d.depositStatus === "refund_ready") {
      active.push({
        kind: "deposit-in-review",
        key: `dep-active-${d.orderId}`,
        orderId: d.orderId,
        bookTitle: depositBookTitle(d),
        counterparty: counterpartyName(d),
        depositCents: d.depositCents,
        depositStatus: d.depositStatus,
        role: d.role,
        updatedAt: d.updatedAt,
      });
    }
  }
  for (const r of refunds) {
    if (r.status === "pending" || r.status === "processing") {
      active.push({
        kind: "refund-processing",
        key: `ref-active-${r.refund_id}`,
        refundId: r.refund_id,
        orderId: r.order.order_id,
        bookTitle: refundBookTitle(r),
        amountCents: r.amount,
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
      });
    }
  }

  const history: HistoryItem[] = [];
  for (const d of deposits) {
    if (
      d.depositStatus === "released" ||
      d.depositStatus === "partially_deducted" ||
      d.depositStatus === "forfeited"
    ) {
      history.push({
        kind: "deposit-finalized",
        key: `dep-done-${d.orderId}`,
        orderId: d.orderId,
        bookTitle: depositBookTitle(d),
        counterparty: counterpartyName(d),
        depositCents: d.depositCents,
        depositDeductedCents: d.depositDeductedCents,
        depositStatus: d.depositStatus,
        role: d.role,
        updatedAt: d.updatedAt,
      });
    }
  }
  for (const r of refunds) {
    // Stripe-side terminal status is "succeeded"; the legacy /refunds page
    // treats it as the "Completed" UI state. Accept "completed" too in case
    // future code paths normalize differently.
    if (r.status === "succeeded" || r.status === "completed") {
      history.push({
        kind: "refund-completed",
        key: `ref-done-${r.refund_id}`,
        refundId: r.refund_id,
        orderId: r.order.order_id,
        bookTitle: refundBookTitle(r),
        amountCents: r.amount,
        currency: r.currency,
        createdAt: r.created_at,
      });
    }
  }

  return { awaiting, active, history };
}

export function fmtAud(cents: number) {
  return `A$${(cents / 100).toFixed(2)}`;
}
