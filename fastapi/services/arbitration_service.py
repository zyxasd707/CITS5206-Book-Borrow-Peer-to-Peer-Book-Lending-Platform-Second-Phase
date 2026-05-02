"""
Arbitration service (Phase B.2, Q4=B).

A thin orchestrator over deposit_service that lets an admin resolve a
deposit + rental dispute in a single decision:

    admin_decide(order_id,
                 deposit_action  in {release, deduct_25, deduct_50, forfeit},
                 rental_action   in {keep, refund_full},
                 complaint_id?, note?)

Contract notes (BRD §6.8 / §10.5 / §B.2 prompt):
  * The deposit half delegates to deposit_service.admin_release/deduct/forfeit
    so the existing PR #97 refund_ready -> claim flow is unchanged. We do not
    re-implement the strike / restriction / lender-transfer logic.
  * The rental half is **bookkeeping only** at decision time. We persist the
    rental amount the lender keeps (orders.rental_deducted_cents) and the
    amount due back to the borrower (deposit_audit_log.rental_refunded_cents).
    Borrower's POST /deposits/{id}/claim-refund picks this up and issues one
    combined Stripe.Refund.create covering both halves.
  * If a complaint id is supplied (the typical path; A.4 master view always
    has one), we mark it resolved + write admin_response inline so the admin
    does not need to navigate back.
"""

from typing import Optional, Literal, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.order import Order
from models.user import User
from models.complaint import Complaint
from models.deposit_audit_log import DepositAuditLog
from services import deposit_service
from services.complaint_service import ComplaintService
from services.notification_service import NotificationService


DepositAction = Literal["release", "deduct_25", "deduct_50", "forfeit"]
RentalAction = Literal["keep", "refund_full"]


# Mapping from B.2 4-tier deposit_action to PR #97 deposit_service severity terms.
# Q12 (2026-05-01) locked this at 4 levels; custom-amount needs B.2.5 if ever.
_DEPOSIT_ACTION_TO_SEVERITY = {
    "deduct_25": "light",   # 25% kept by lender
    "deduct_50": "medium",  # 50% kept by lender
}


def _rental_total_cents(order: Order) -> int:
    """Rental fee originally paid by the borrower, in cents.

    Source of truth: orders.owner_income_amount (what the lender earns;
    confirmed by email_service receipt and BRD §6.9 Clean Code demo).
    """
    return int(round(float(order.owner_income_amount or 0) * 100))


def _resolve_complaint_inline(
    db: Session,
    complaint_id: Optional[str],
    *,
    deposit_action: DepositAction,
    rental_action: RentalAction,
    admin_note: Optional[str],
) -> Optional[Complaint]:
    """Mark the linked complaint resolved and stamp an admin_response. Caller commits."""
    if not complaint_id:
        return None
    c = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not c:
        # Don't 404 — admin may have arrived at the deposit page directly with a
        # stale complaint id query string. Quietly skip rather than abort.
        return None
    c.status = "resolved"
    c.auto_action_taken = f"arbitration:{deposit_action}+{rental_action}"
    response_lines = [
        f"Admin arbitration: deposit_action={deposit_action}, rental_action={rental_action}.",
    ]
    if admin_note:
        response_lines.append(admin_note.strip())
    c.admin_response = "\n".join(response_lines)
    return c


def admin_decide(
    db: Session,
    order_id: str,
    *,
    deposit_action: DepositAction,
    rental_action: RentalAction,
    admin: User,
    complaint_id: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Single-shot arbitration: settle deposit + rental in one transaction."""

    if deposit_action not in ("release", "deduct_25", "deduct_50", "forfeit"):
        raise HTTPException(status_code=400, detail="Invalid deposit_action")
    if rental_action not in ("keep", "refund_full"):
        raise HTTPException(status_code=400, detail="Invalid rental_action")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ---- Deposit half: delegate to existing PR #97 logic ----------------
    # deposit_service functions enforce pending_review, transfer to lender,
    # apply strikes, and emit DEPOSIT_UPDATED notifications. Each commits its
    # own transaction, so we record the rental side AFTER it returns.
    if deposit_action == "release":
        deposit_result = deposit_service.admin_release(db, order_id, admin, note=note)
    elif deposit_action == "forfeit":
        deposit_result = deposit_service.admin_forfeit(db, order_id, admin, note=note)
    else:
        severity = _DEPOSIT_ACTION_TO_SEVERITY[deposit_action]
        deposit_result = deposit_service.admin_deduct(
            db, order_id, admin, severity=severity, note=note
        )

    # Reload order so we see the post-deposit state (deposit_status, etc.)
    db.refresh(order)

    # ---- Rental half: bookkeeping only at decide time -------------------
    rental_total = _rental_total_cents(order)
    if rental_action == "refund_full":
        rental_refund_cents = rental_total
        rental_kept_cents = 0
    else:  # keep
        rental_refund_cents = 0
        rental_kept_cents = rental_total

    order.rental_deducted_cents = rental_kept_cents

    rental_audit_note = (
        f"Arbitration rental decision: {rental_action} "
        f"(refund {rental_refund_cents/100:.2f}, lender keeps {rental_kept_cents/100:.2f})."
    )
    db.add(DepositAuditLog(
        order_id=order.id,
        actor_id=admin.user_id,
        actor_role="admin",
        # Reuse existing enum action; semantics (rental vs deposit) live in
        # rental_refunded_cents and the note. Avoids a 2nd enum migration.
        action="release" if rental_action == "refund_full" else "partial_deduct",
        amount_cents=0,
        rental_refunded_cents=rental_refund_cents,
        note=rental_audit_note,
    ))

    # ---- Inline complaint resolution -----------------------------------
    resolved = _resolve_complaint_inline(
        db, complaint_id,
        deposit_action=deposit_action,
        rental_action=rental_action,
        admin_note=note,
    )

    # ---- Notify both parties about the rental side ---------------------
    # deposit_service already sent a DEPOSIT_UPDATED for the deposit half.
    # We add a rental-specific note so neither party is surprised when the
    # combined refund lands.
    if rental_refund_cents > 0:
        NotificationService.create(
            db, user_id=order.borrower_id, order_id=order.id,
            type="DEPOSIT_UPDATED",
            title="Rental Fee Refund Approved",
            message=(
                f"Admin also approved a full rental fee refund of "
                f"${rental_refund_cents/100:.2f}. It will be paid out together "
                f"with your deposit refund when you click Claim."
            ),
            commit=False,
        )
        NotificationService.create(
            db, user_id=order.owner_id, order_id=order.id,
            type="DEPOSIT_UPDATED",
            title="Rental Fee Will Be Refunded",
            message=(
                f"Admin ruled a full rental refund of ${rental_refund_cents/100:.2f} "
                f"to the borrower for this dispute."
            ),
            commit=False,
        )

    db.commit()
    db.refresh(order)
    if resolved is not None:
        db.refresh(resolved)

    return {
        "order_id": order.id,
        "deposit_action": deposit_action,
        "rental_action": rental_action,
        "deposit_status": order.deposit_status,
        "deposit_deducted_cents": int(order.deposit_deducted_cents or 0),
        "rental_total_cents": rental_total,
        "rental_kept_cents": rental_kept_cents,
        "rental_refund_cents_pending_claim": rental_refund_cents,
        "complaint_id": resolved.id if resolved else None,
        "complaint_status": resolved.status if resolved else None,
        # Surface deposit_service strike signal so the existing UI popup keeps working.
        "strike": deposit_result.get("strike"),
        "lender_transfer_id": deposit_result.get("lender_transfer_id"),
    }


def pending_rental_refund_cents(db: Session, order: Order) -> int:
    """Sum of rental_refunded_cents booked but not yet paid out.

    Used by borrower_claim_refund to combine rental + deposit into one
    Stripe.Refund.create. We sum across all audit rows (instead of reading
    a single column on Order) so a hypothetical multi-step decision still
    settles cleanly.
    """
    from sqlalchemy import func as sa_func
    val = (
        db.query(sa_func.coalesce(sa_func.sum(DepositAuditLog.rental_refunded_cents), 0))
        .filter(DepositAuditLog.order_id == order.id)
        .scalar()
    )
    return int(val or 0)
