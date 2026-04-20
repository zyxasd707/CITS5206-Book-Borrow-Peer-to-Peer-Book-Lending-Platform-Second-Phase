"""
Deposit management service (MVP6-1).

Handles admin arbitration actions on deposits that are in pending_review:
full release, partial deduction (light/medium), or forfeiture. Also
maintains the per-user damage-strike counter that drives auto-restrict
and ban-suggestion behaviour.
"""

import traceback
from typing import Optional, Literal, Dict, Any
import stripe
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from fastapi import HTTPException

from models.order import Order
from models.user import User
from models.payment_gateway import Payment, Refund
from models.deposit_audit_log import DepositAuditLog
from services.notification_service import NotificationService


# Damage tier configuration (source of truth; backend enforces these)
DEDUCTION_PCT = {
    "light": 25,
    "medium": 50,
    "severe": 100,
}
STRIKE_WEIGHTS = {
    "light": 1,
    "medium": 2,
    "severe": 3,
}

# Auto-escalation thresholds (requirements locked by teacher 2026-04-19)
AUTO_RESTRICT_STRIKE_THRESHOLD = 3
AUTO_RESTRICT_SCORE_THRESHOLD = 6
AUTO_BAN_SCORE_THRESHOLD = 10


def _require_pending_review(order: Order) -> None:
    if order.deposit_status != "pending_review":
        raise HTTPException(
            status_code=409,
            detail=f"Deposit is not in pending_review (current: {order.deposit_status})",
        )


def _deposit_cents(order: Order, db: Session) -> int:
    """Return the deposit amount in cents. Prefer Payment.deposit (integer cents)."""
    if order.payment_id:
        payment = db.query(Payment).filter(Payment.payment_id == order.payment_id).first()
        if payment and payment.deposit:
            return int(payment.deposit)
    # Fallback to order dollar amount
    return int(round(float(order.deposit_or_sale_amount or 0) * 100))


def _stripe_refund(payment_id: str, amount_cents: int, reason: str) -> Dict[str, Any]:
    """Create a partial Stripe refund. Returns dict summary."""
    try:
        refund = stripe.Refund.create(
            payment_intent=payment_id,
            amount=amount_cents,
            reason="requested_by_customer",
        )
        return {
            "id": refund.id,
            "amount": refund.amount,
            "currency": refund.currency,
            "status": refund.status,
        }
    except stripe.error.InvalidRequestError as e:
        if "charge_already_refunded" in str(e).lower():
            return {"id": None, "amount": 0, "currency": "aud", "status": "already_refunded"}
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Stripe error: {e}")
    except stripe.error.StripeError as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Stripe error: {e}")


def _persist_refund_record(db: Session, payment_id: str, stripe_refund: Dict[str, Any], reason: str) -> None:
    if not stripe_refund.get("id"):
        return
    db.add(Refund(
        refund_id=stripe_refund["id"],
        payment_id=payment_id,
        amount=stripe_refund["amount"],
        currency=stripe_refund["currency"],
        status=stripe_refund["status"],
        reason=reason,
    ))

    payment = db.query(Payment).filter(Payment.payment_id == payment_id).first()
    if payment:
        total_refunded = (
            db.query(sa_func.coalesce(sa_func.sum(Refund.amount), 0))
            .filter(Refund.payment_id == payment_id)
            .scalar()
        ) or 0
        if int(total_refunded) >= int(payment.amount or 0):
            payment.status = "refunded"
        else:
            payment.status = "partially_refunded"


def _apply_strike(db: Session, borrower: User, severity: str) -> Dict[str, Any]:
    """Bump the borrower's strike counters and decide auto-escalations.

    Returns a signal dict the caller can surface to the admin UI:
      { 'restrict_applied': bool, 'suggest_ban': bool, 'auto_ban': bool,
        'strike_count': int, 'severity_score': int }
    """
    weight = STRIKE_WEIGHTS.get(severity, 0)
    borrower.damage_strike_count = int(borrower.damage_strike_count or 0) + 1
    borrower.damage_severity_score = int(borrower.damage_severity_score or 0) + weight

    restrict_applied = False
    if not borrower.is_restricted and (
        borrower.damage_strike_count >= AUTO_RESTRICT_STRIKE_THRESHOLD
        or borrower.damage_severity_score >= AUTO_RESTRICT_SCORE_THRESHOLD
    ):
        borrower.is_restricted = True
        borrower.restriction_reason = (
            f"Auto-restricted: {borrower.damage_strike_count} damage strikes, "
            f"severity score {borrower.damage_severity_score}."
        )
        restrict_applied = True

    suggest_ban = severity == "severe"
    auto_ban = borrower.damage_severity_score >= AUTO_BAN_SCORE_THRESHOLD

    return {
        "restrict_applied": restrict_applied,
        "suggest_ban": suggest_ban,
        "auto_ban": auto_ban,
        "strike_count": borrower.damage_strike_count,
        "severity_score": borrower.damage_severity_score,
    }


def _notify_parties(db: Session, order: Order, title_lender: str, msg_lender: str,
                    title_borrower: str, msg_borrower: str) -> None:
    NotificationService.create(
        db, user_id=order.owner_id, order_id=order.id,
        type="DEPOSIT_UPDATED", title=title_lender, message=msg_lender, commit=False,
    )
    NotificationService.create(
        db, user_id=order.borrower_id, order_id=order.id,
        type="DEPOSIT_UPDATED", title=title_borrower, message=msg_borrower, commit=False,
    )


# ----------------- Admin action entry points -----------------

def admin_release(db: Session, order_id: str, admin: User, note: Optional[str] = None) -> Dict[str, Any]:
    """Full release: refund the entire deposit to borrower, no damage attributed."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_pending_review(order)

    amount = _deposit_cents(order, db)
    stripe_refund = {"id": None, "amount": 0, "currency": "aud", "status": "skipped"}
    if order.payment_id and amount > 0:
        stripe_refund = _stripe_refund(order.payment_id, amount, "Admin release after damage report")
        _persist_refund_record(db, order.payment_id, stripe_refund, "Admin release after damage report")

    order.deposit_status = "released"
    order.deposit_deducted_cents = 0
    order.damage_severity_final = "none"

    db.add(DepositAuditLog(
        order_id=order.id, actor_id=admin.user_id, actor_role="admin",
        action="release", amount_cents=amount, final_severity="none",
        note=note or "Admin released full deposit after review.",
    ))

    _notify_parties(
        db, order,
        title_lender="Deposit Released by Admin",
        msg_lender="After review the admin released the full deposit to the borrower.",
        title_borrower="Full Deposit Refund Approved",
        msg_borrower=f"Admin reviewed the damage report and released your full deposit (${amount/100:.2f}).",
    )

    db.commit()
    db.refresh(order)
    return {
        "order_id": order.id,
        "deposit_status": order.deposit_status,
        "refunded_cents": amount if stripe_refund.get("id") else 0,
        "stripe_refund": stripe_refund,
    }


def admin_deduct(db: Session, order_id: str, admin: User,
                 severity: Literal["light", "medium"], note: Optional[str] = None) -> Dict[str, Any]:
    """Partial deduction: keep a % of deposit with lender, refund the rest to borrower."""
    if severity not in DEDUCTION_PCT or severity == "severe":
        raise HTTPException(status_code=400, detail="Partial deduction severity must be 'light' or 'medium'")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_pending_review(order)

    borrower = db.query(User).filter(User.user_id == order.borrower_id).first()
    if not borrower:
        raise HTTPException(status_code=404, detail="Borrower not found")

    total_cents = _deposit_cents(order, db)
    deducted = total_cents * DEDUCTION_PCT[severity] // 100
    to_refund = total_cents - deducted

    stripe_refund = {"id": None, "amount": 0, "currency": "aud", "status": "skipped"}
    if order.payment_id and to_refund > 0:
        stripe_refund = _stripe_refund(order.payment_id, to_refund, f"Admin partial deduction ({severity})")
        _persist_refund_record(db, order.payment_id, stripe_refund, f"Admin partial deduction ({severity})")

    order.deposit_status = "partially_deducted"
    order.deposit_deducted_cents = deducted
    order.damage_severity_final = severity

    strike_signal = _apply_strike(db, borrower, severity)

    db.add(DepositAuditLog(
        order_id=order.id, actor_id=admin.user_id, actor_role="admin",
        action="partial_deduct", amount_cents=deducted, final_severity=severity,
        note=note or f"Admin deducted {DEDUCTION_PCT[severity]}% for {severity} damage.",
    ))

    if strike_signal["restrict_applied"]:
        db.add(DepositAuditLog(
            order_id=order.id, actor_id=admin.user_id, actor_role="system",
            action="restrict", note=borrower.restriction_reason,
        ))

    _notify_parties(
        db, order,
        title_lender="Partial Deduction Applied",
        msg_lender=f"Admin deducted ${deducted/100:.2f} from the deposit ({severity} damage). The rest went back to the borrower.",
        title_borrower="Partial Deduction From Your Deposit",
        msg_borrower=(
            f"After review the admin deducted ${deducted/100:.2f} for {severity} damage. "
            f"You received a refund of ${to_refund/100:.2f}."
            + (f" This is strike {strike_signal['strike_count']}; your borrowing is now restricted."
               if strike_signal["restrict_applied"] else "")
        ),
    )

    db.commit()
    db.refresh(order)
    return {
        "order_id": order.id,
        "deposit_status": order.deposit_status,
        "deducted_cents": deducted,
        "refunded_cents": to_refund,
        "stripe_refund": stripe_refund,
        "strike": strike_signal,
    }


def admin_forfeit(db: Session, order_id: str, admin: User, note: Optional[str] = None) -> Dict[str, Any]:
    """Full forfeit: lender keeps the deposit. No refund to borrower."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_pending_review(order)

    borrower = db.query(User).filter(User.user_id == order.borrower_id).first()
    if not borrower:
        raise HTTPException(status_code=404, detail="Borrower not found")

    total_cents = _deposit_cents(order, db)

    order.deposit_status = "forfeited"
    order.deposit_deducted_cents = total_cents
    order.damage_severity_final = "severe"

    strike_signal = _apply_strike(db, borrower, "severe")

    db.add(DepositAuditLog(
        order_id=order.id, actor_id=admin.user_id, actor_role="admin",
        action="forfeit", amount_cents=total_cents, final_severity="severe",
        note=note or "Admin forfeited the full deposit (severe damage / non-return).",
    ))

    if strike_signal["restrict_applied"]:
        db.add(DepositAuditLog(
            order_id=order.id, actor_id=admin.user_id, actor_role="system",
            action="restrict", note=borrower.restriction_reason,
        ))

    _notify_parties(
        db, order,
        title_lender="Deposit Forfeited",
        msg_lender=f"Admin ruled severe damage. The full deposit of ${total_cents/100:.2f} is yours to keep.",
        title_borrower="Deposit Forfeited",
        msg_borrower=(
            f"After review the admin ruled severe damage and forfeited your full deposit "
            f"(${total_cents/100:.2f}). "
            + ("Your borrowing has been automatically restricted."
               if strike_signal["restrict_applied"] else "")
        ),
    )

    db.commit()
    db.refresh(order)
    return {
        "order_id": order.id,
        "deposit_status": order.deposit_status,
        "deducted_cents": total_cents,
        "refunded_cents": 0,
        "strike": strike_signal,
    }


def admin_set_restriction(db: Session, user_id: str, admin: User,
                          restricted: bool, reason: Optional[str] = None) -> Dict[str, Any]:
    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_restricted = restricted
    target.restriction_reason = reason if restricted else None

    db.add(DepositAuditLog(
        order_id="-",  # not tied to an order
        actor_id=admin.user_id, actor_role="admin",
        action="restrict" if restricted else "unrestrict",
        note=reason or ("Admin manually restricted user." if restricted else "Admin lifted restriction."),
    ))

    db.commit()
    db.refresh(target)
    return {
        "user_id": target.user_id,
        "is_restricted": target.is_restricted,
        "restriction_reason": target.restriction_reason,
    }
