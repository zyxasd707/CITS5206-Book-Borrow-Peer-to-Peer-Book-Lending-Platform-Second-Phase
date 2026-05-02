// deposits.ts — MVP6-1 deposit management API client
import axios from "axios";
import { getApiUrl } from "./auth";

const API_URL = getApiUrl();

const authHeader = () => ({
  Authorization: `Bearer ${
    typeof window !== "undefined" ? localStorage.getItem("access_token") : ""
  }`,
});

// ---------- Shapes returned by the backend ----------

export interface DepositEvidence {
  id: string;
  orderId: string;
  submitterId: string;
  submitterRole: "lender" | "borrower";
  photos: string[];
  claimedSeverity: "light" | "medium" | "severe";
  note: string | null;
  submittedAt: string | null;
}

export interface DepositAuditEntry {
  id: string;
  orderId: string;
  actorId: string | null;
  actorRole: "admin" | "lender" | "borrower" | "system";
  action:
    | "evidence_submitted"
    | "release"
    | "partial_deduct"
    | "forfeit"
    | "restrict"
    | "unrestrict"
    | "ban";
  amountCents: number | null;
  finalSeverity: "none" | "light" | "medium" | "severe" | null;
  note: string | null;
  createdAt: string | null;
}

export interface DepositSummaryItem {
  orderId: string;
  status: string;
  depositStatus:
    | "held"
    | "pending_review"
    | "released"
    | "partially_deducted"
    | "forfeited"
    | "refund_ready";
  damageSeverityFinal: "none" | "light" | "medium" | "severe" | null;
  depositCents: number;
  depositDeductedCents: number;
  lender: { id: string | null; name: string | null };
  borrower: {
    id: string | null;
    name: string | null;
    damageStrikeCount: number;
    damageSeverityScore: number;
    isRestricted: boolean;
  };
  returnedAt: string | null;
  updatedAt: string | null;
  book: { id: string; titleEn: string; coverImgUrl: string | null } | null;
  role?: "borrower" | "lender";
}

export interface DepositDetail extends DepositSummaryItem {
  lenderEvidence: DepositEvidence[];
  borrowerEvidence: DepositEvidence[];
  auditLog: DepositAuditEntry[];
  borrower: DepositSummaryItem["borrower"] & {
    historyBySeverity?: Record<string, number>;
    restrictionReason?: string | null;
  };
}

export interface AdminListResponse {
  items: DepositSummaryItem[];
  page: number;
  pageSize: number;
  total: number;
  stats: {
    pendingReviewCount: number;
    deductedLast30dCents: number;
    watchlistCount: number;
    restrictedCount: number;
  };
}

export interface StrikeSignal {
  restrict_applied: boolean;
  suggest_ban: boolean;
  auto_ban: boolean;
  strike_count: number;
  severity_score: number;
}

export interface AdminActionResult {
  order_id: string;
  deposit_status: string;
  deducted_cents?: number;
  refunded_cents?: number;
  stripe_refund?: unknown;
  strike?: StrikeSignal;
}

// Phase B.2 (Q4=B) — combined deposit + rental arbitration.
export type ArbitrationDepositAction =
  | "release"
  | "deduct_25"
  | "deduct_50"
  | "forfeit";
export type ArbitrationRentalAction = "keep" | "refund_full";

export interface ArbitrationDecideBody {
  deposit_action: ArbitrationDepositAction;
  rental_action: ArbitrationRentalAction;
  complaint_id?: string | null;
  note?: string | null;
}

export interface ArbitrationDecideResult {
  order_id: string;
  deposit_action: ArbitrationDepositAction;
  rental_action: ArbitrationRentalAction;
  deposit_status: string;
  deposit_deducted_cents: number;
  rental_total_cents: number;
  rental_kept_cents: number;
  rental_refund_cents_pending_claim: number;
  complaint_id: string | null;
  complaint_status: string | null;
  strike?: StrikeSignal;
  lender_transfer_id?: string | null;
}

// ---------- Admin ----------

export async function getAdminDeposits(params: {
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<AdminListResponse> {
  const res = await axios.get(`${API_URL}/api/v1/deposits/admin`, {
    params,
    headers: authHeader(),
    withCredentials: true,
  });
  return res.data;
}

export async function getAdminDepositDetail(
  orderId: string
): Promise<DepositDetail> {
  const res = await axios.get(`${API_URL}/api/v1/deposits/admin/${orderId}`, {
    headers: authHeader(),
    withCredentials: true,
  });
  return res.data;
}

export async function adminReleaseDeposit(
  orderId: string,
  note?: string
): Promise<AdminActionResult> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/${orderId}/release`,
    { note: note || null },
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

export async function adminDeductDeposit(
  orderId: string,
  severity: "light" | "medium",
  note?: string
): Promise<AdminActionResult> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/${orderId}/deduct`,
    { severity, note: note || null },
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

export async function adminForfeitDeposit(
  orderId: string,
  note?: string
): Promise<AdminActionResult> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/${orderId}/forfeit`,
    { note: note || null },
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

// Phase B.2 (Q4=B) one-shot arbitration: deposit_action + rental_action.
// Replaces the legacy 3 endpoints above for the admin/deposits/[orderId]
// page; the legacy endpoints are kept exported for backwards compatibility.
export async function adminArbitrationDecide(
  orderId: string,
  body: ArbitrationDecideBody
): Promise<ArbitrationDecideResult> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/arbitration/${orderId}/decide`,
    {
      deposit_action: body.deposit_action,
      rental_action: body.rental_action,
      complaint_id: body.complaint_id || null,
      note: body.note || null,
    },
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

export async function adminRestrictUser(
  userId: string,
  reason: string
): Promise<{ user_id: string; is_restricted: boolean; restriction_reason: string | null }> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/users/${userId}/restrict`,
    { reason },
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

export async function adminUnrestrictUser(
  userId: string
): Promise<{ user_id: string; is_restricted: boolean; restriction_reason: string | null }> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/admin/users/${userId}/unrestrict`,
    {},
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

// ---------- User ----------

export async function getMyDeposits(
  userId: string,
  options?: { includeHeld?: boolean }
): Promise<DepositSummaryItem[]> {
  const res = await axios.get(`${API_URL}/api/v1/deposits/user/${userId}`, {
    headers: authHeader(),
    withCredentials: true,
    params: options?.includeHeld ? { include_held: true } : undefined,
  });
  return res.data.items as DepositSummaryItem[];
}

export async function getDepositDetail(orderId: string): Promise<DepositDetail> {
  const res = await axios.get(`${API_URL}/api/v1/deposits/${orderId}`, {
    headers: authHeader(),
    withCredentials: true,
  });
  return res.data;
}

export async function claimRefund(orderId: string): Promise<{
  order_id: string;
  deposit_status: string;
  refunded_cents: number;
  message?: string;
}> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/${orderId}/claim-refund`,
    {},
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}

export async function submitBorrowerEvidence(
  orderId: string,
  payload: {
    photos: string[];
    claimed_severity: "light" | "medium" | "severe";
    note?: string;
  }
): Promise<DepositEvidence> {
  const res = await axios.post(
    `${API_URL}/api/v1/deposits/${orderId}/evidence`,
    payload,
    { headers: authHeader(), withCredentials: true }
  );
  return res.data;
}
