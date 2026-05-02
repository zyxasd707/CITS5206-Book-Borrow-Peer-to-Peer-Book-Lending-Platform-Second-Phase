"""
Deposit management routes (MVP6-1).

Exposes admin arbitration endpoints and user-facing read endpoints for
deposits that were held for damaged-return review. Business logic lives
in services/deposit_service.py; this module is a thin HTTP layer with
schema validation, authorization, and response shaping.
"""

import json
from datetime import datetime, timedelta
from typing import Optional, List, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, constr
from sqlalchemy import func as sa_func, or_
from sqlalchemy.orm import Session

from core.dependencies import get_db, get_current_user, get_current_admin
from models.user import User
from models.order import Order, OrderBook
from models.book import Book
from models.deposit_evidence import DepositEvidence
from models.deposit_audit_log import DepositAuditLog
from models.payment_gateway import Payment
from services import deposit_service
from services.notification_service import NotificationService


router = APIRouter(prefix="/deposits", tags=["Deposits"])


# ----------------- Pydantic bodies -----------------

class AdminActionNoteBody(BaseModel):
    note: Optional[str] = None


class AdminDeductBody(BaseModel):
    severity: Literal["light", "medium"]
    note: Optional[str] = None


class AdminRestrictBody(BaseModel):
    reason: constr(min_length=1, max_length=255)


class BorrowerEvidenceBody(BaseModel):
    photos: List[str] = Field(default_factory=list)
    claimed_severity: Literal["light", "medium", "severe"]
    note: Optional[str] = None


# ----------------- Helpers -----------------

COUNTER_EVIDENCE_WINDOW_DAYS = 7


def _parse_photos(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        out = json.loads(raw)
        return out if isinstance(out, list) else []
    except (ValueError, TypeError):
        return []


def _evidence_to_dict(ev: DepositEvidence) -> Dict[str, Any]:
    return {
        "id": ev.id,
        "orderId": ev.order_id,
        "submitterId": ev.submitter_id,
        "submitterRole": ev.submitter_role,
        "photos": _parse_photos(ev.photos),
        "claimedSeverity": ev.claimed_severity,
        "note": ev.note,
        "submittedAt": ev.submitted_at.isoformat() if ev.submitted_at else None,
    }


def _audit_to_dict(log: DepositAuditLog) -> Dict[str, Any]:
    return {
        "id": log.id,
        "orderId": log.order_id,
        "actorId": log.actor_id,
        "actorRole": log.actor_role,
        "action": log.action,
        "amountCents": log.amount_cents,
        "finalSeverity": log.final_severity,
        "note": log.note,
        "createdAt": log.created_at.isoformat() if log.created_at else None,
    }


def _order_to_summary(order: Order, db: Session) -> Dict[str, Any]:
    """Compact row for list views: deposit-centric, with book + party display names."""
    # First associated book — enough for list-view header
    first_book = None
    ob = db.query(OrderBook).filter(OrderBook.order_id == order.id).first()
    if ob:
        book = db.query(Book).filter(Book.id == ob.book_id).first()
        if book:
            first_book = {
                "id": book.id,
                "titleEn": book.title_en,
                "coverImgUrl": book.cover_img_url,
            }

    deposit_cents = deposit_service._deposit_cents(order, db)
    return {
        "orderId": order.id,
        "status": order.status,
        "depositStatus": order.deposit_status,
        "damageSeverityFinal": order.damage_severity_final,
        "depositCents": deposit_cents,
        "depositDeductedCents": int(order.deposit_deducted_cents or 0),
        "lender": {
            "id": order.owner.user_id if order.owner else None,
            "name": order.owner.name if order.owner else None,
        },
        "borrower": {
            "id": order.borrower.user_id if order.borrower else None,
            "name": order.borrower.name if order.borrower else None,
            "damageStrikeCount": int(order.borrower.damage_strike_count or 0) if order.borrower else 0,
            "damageSeverityScore": int(order.borrower.damage_severity_score or 0) if order.borrower else 0,
            "isRestricted": bool(order.borrower.is_restricted) if order.borrower else False,
        },
        "returnedAt": order.returned_at.isoformat() if order.returned_at else None,
        "updatedAt": order.updated_at.isoformat() if order.updated_at else None,
        "book": first_book,
    }


def _order_to_detail(order: Order, db: Session) -> Dict[str, Any]:
    """Full detail view — list summary plus evidence + audit timeline."""
    summary = _order_to_summary(order, db)

    evidence = (
        db.query(DepositEvidence)
        .filter(DepositEvidence.order_id == order.id)
        .order_by(DepositEvidence.submitted_at.asc())
        .all()
    )
    audit = (
        db.query(DepositAuditLog)
        .filter(DepositAuditLog.order_id == order.id)
        .order_by(DepositAuditLog.created_at.asc())
        .all()
    )

    lender_ev = [_evidence_to_dict(e) for e in evidence if e.submitter_role == "lender"]
    borrower_ev = [_evidence_to_dict(e) for e in evidence if e.submitter_role == "borrower"]

    summary.update({
        "lenderEvidence": lender_ev,
        "borrowerEvidence": borrower_ev,
        "auditLog": [_audit_to_dict(a) for a in audit],
    })

    # Past behaviour snapshot for the borrower (admin arbitration context)
    if order.borrower:
        past_outcomes = (
            db.query(Order.damage_severity_final, sa_func.count(Order.id))
            .filter(
                Order.borrower_id == order.borrower_id,
                Order.deposit_status.in_(("released", "partially_deducted", "forfeited")),
                Order.id != order.id,
            )
            .group_by(Order.damage_severity_final)
            .all()
        )
        summary["borrower"]["historyBySeverity"] = {
            (sev or "none"): int(cnt) for sev, cnt in past_outcomes
        }
        summary["borrower"]["restrictionReason"] = order.borrower.restriction_reason

    return summary


# ----------------- Admin: list + KPIs -----------------

@router.get("/admin")
def admin_list_deposits(
    status: Optional[str] = Query(None, description="Filter by deposit_status"),
    severity: Optional[str] = Query(None, description="Filter by damage_severity_final"),
    search: Optional[str] = Query(None, description="Match order id, borrower/lender name or email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin deposit list with filters + KPI stats."""
    q = db.query(Order).filter(Order.deposit_status != "held")
    if status and status != "all":
        q = q.filter(Order.deposit_status == status)
    if severity and severity != "all":
        q = q.filter(Order.damage_severity_final == severity)
    if search:
        like = f"%{search.strip()}%"
        Borrower = User
        q = (
            q.outerjoin(User, User.user_id == Order.borrower_id)
             .filter(or_(
                Order.id.ilike(like),
                User.name.ilike(like),
                User.email.ilike(like),
             ))
        )

    total = q.count()
    items = (
        q.order_by(Order.updated_at.desc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )

    # KPIs — computed across the whole deposit universe, not filtered view
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    pending_count = db.query(Order).filter(Order.deposit_status == "pending_review").count()
    deducted_last_30d = (
        db.query(sa_func.coalesce(sa_func.sum(Order.deposit_deducted_cents), 0))
        .filter(
            Order.deposit_status.in_(("partially_deducted", "forfeited")),
            Order.updated_at >= thirty_days_ago,
        )
        .scalar()
    ) or 0
    watchlist_count = (
        db.query(sa_func.count(User.user_id))
        .filter(User.damage_strike_count >= 2)
        .scalar()
    ) or 0
    restricted_count = (
        db.query(sa_func.count(User.user_id))
        .filter(User.is_restricted.is_(True))
        .scalar()
    ) or 0

    return {
        "items": [_order_to_summary(o, db) for o in items],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "stats": {
            "pendingReviewCount": int(pending_count),
            "deductedLast30dCents": int(deducted_last_30d),
            "watchlistCount": int(watchlist_count),
            "restrictedCount": int(restricted_count),
        },
    }


@router.get("/admin/{order_id}")
def admin_get_deposit(
    order_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_to_detail(order, db)


# ----------------- Admin: arbitration actions -----------------

@router.post("/admin/{order_id}/release")
def admin_release_deposit(
    order_id: str,
    body: Optional[AdminActionNoteBody] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return deposit_service.admin_release(db, order_id, admin, note=(body.note if body else None))


@router.post("/admin/{order_id}/deduct")
def admin_deduct_deposit(
    order_id: str,
    body: AdminDeductBody,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return deposit_service.admin_deduct(db, order_id, admin, severity=body.severity, note=body.note)


@router.post("/admin/{order_id}/forfeit")
def admin_forfeit_deposit(
    order_id: str,
    body: Optional[AdminActionNoteBody] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return deposit_service.admin_forfeit(db, order_id, admin, note=(body.note if body else None))


@router.post("/admin/users/{user_id}/restrict")
def admin_restrict_user(
    user_id: str,
    body: AdminRestrictBody,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return deposit_service.admin_set_restriction(db, user_id, admin, restricted=True, reason=body.reason)


@router.post("/admin/users/{user_id}/unrestrict")
def admin_unrestrict_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return deposit_service.admin_set_restriction(db, user_id, admin, restricted=False, reason=None)


# ----------------- User: read + counter-evidence -----------------

@router.get("/user/{user_id}")
def list_my_deposits(
    user_id: str,
    include_held: bool = Query(
        False,
        description=(
            "When true, also return orders whose deposit is still 'held' "
            "(i.e. live borrowing flow, no admin action yet). The legacy "
            "/deposits page leaves this off; the /borrowing and /lending "
            "row badges (Phase A.3) need it on."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List deposits where the current user is borrower or lender.

    Admins may view any user. Non-admin callers can only fetch their own.
    """
    if not current_user.is_admin and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    q = db.query(Order).filter(
        or_(Order.borrower_id == user_id, Order.owner_id == user_id)
    )
    if not include_held:
        q = q.filter(Order.deposit_status != "held")
    orders = q.order_by(Order.updated_at.desc()).all()
    return {
        "items": [
            {
                **_order_to_summary(o, db),
                "role": "borrower" if o.borrower_id == user_id else "lender",
            }
            for o in orders
        ]
    }


@router.get("/{order_id}")
def get_deposit_detail(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (
        current_user.user_id not in (order.borrower_id, order.owner_id)
        and not current_user.is_admin
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _order_to_detail(order, db)


@router.post("/{order_id}/claim-refund", status_code=200)
def borrower_claim_refund(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Borrower triggers the actual Stripe refund after admin sets deposit to refund_ready."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.user_id != order.borrower_id:
        raise HTTPException(status_code=403, detail="Only the borrower can claim this refund")
    if order.deposit_status != "refund_ready":
        raise HTTPException(
            status_code=409,
            detail=f"Deposit is not ready to claim (current status: {order.deposit_status})",
        )

    total_cents = deposit_service._deposit_cents(order, db)
    deducted = int(order.deposit_deducted_cents or 0)
    to_refund = total_cents - deducted

    if to_refund <= 0:
        # Nothing to refund (full forfeit path should never reach here, but guard anyway)
        order.deposit_status = "partially_deducted" if deducted > 0 else "released"
        db.add(DepositAuditLog(
            order_id=order.id, actor_id=current_user.user_id, actor_role="borrower",
            action="release", amount_cents=0, note="Claim attempted but refund amount is zero.",
        ))
        db.commit()
        return {"order_id": order.id, "refunded_cents": 0, "message": "No refund amount to process."}

    stripe_refund = deposit_service._stripe_refund(
        order.payment_id, to_refund, "Borrower claimed deposit refund"
    )
    deposit_service._persist_refund_record(
        db, order.payment_id, stripe_refund, "Borrower claimed deposit refund"
    )

    order.deposit_status = "partially_deducted" if deducted > 0 else "released"

    db.add(DepositAuditLog(
        order_id=order.id, actor_id=current_user.user_id, actor_role="borrower",
        action="release", amount_cents=to_refund,
        note=f"Borrower claimed refund of ${to_refund/100:.2f}.",
    ))

    from services.notification_service import NotificationService
    NotificationService.create(
        db, user_id=order.borrower_id, order_id=order.id,
        type="DEPOSIT_UPDATED",
        title="Deposit Refund Processed",
        message=f"Your deposit refund of ${to_refund/100:.2f} has been processed and will appear on your original payment method.",
        commit=False,
    )

    db.commit()
    db.refresh(order)
    return {
        "order_id": order.id,
        "deposit_status": order.deposit_status,
        "refunded_cents": to_refund,
        "stripe_refund": stripe_refund,
    }


@router.post("/{order_id}/evidence", status_code=201)
def submit_borrower_counter_evidence(
    order_id: str,
    body: BorrowerEvidenceBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Borrower uploads counter-evidence while a deposit is in pending_review.

    Gated by the 7-day window after the lender's initial evidence submission.
    Only the borrower on the order may submit. One submission per borrower
    per order (additional photos should edit the existing record — future
    work; for now reject duplicates).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.user_id != order.borrower_id:
        raise HTTPException(status_code=403, detail="Only the borrower can submit counter-evidence")
    if order.deposit_status != "pending_review":
        raise HTTPException(
            status_code=409,
            detail=f"Counter-evidence only accepted in pending_review (current: {order.deposit_status})",
        )

    lender_ev = (
        db.query(DepositEvidence)
        .filter(
            DepositEvidence.order_id == order.id,
            DepositEvidence.submitter_role == "lender",
        )
        .order_by(DepositEvidence.submitted_at.asc())
        .first()
    )
    if not lender_ev:
        raise HTTPException(status_code=409, detail="No lender evidence on record yet")

    deadline = lender_ev.submitted_at + timedelta(days=COUNTER_EVIDENCE_WINDOW_DAYS)
    if datetime.utcnow() > deadline:
        raise HTTPException(
            status_code=409,
            detail=f"Counter-evidence window closed on {deadline.isoformat()}",
        )

    existing = (
        db.query(DepositEvidence)
        .filter(
            DepositEvidence.order_id == order.id,
            DepositEvidence.submitter_role == "borrower",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Borrower evidence already submitted for this order")

    ev = DepositEvidence(
        order_id=order.id,
        submitter_id=current_user.user_id,
        submitter_role="borrower",
        photos=json.dumps(body.photos or []),
        claimed_severity=body.claimed_severity,
        note=body.note,
    )
    db.add(ev)
    db.add(DepositAuditLog(
        order_id=order.id,
        actor_id=current_user.user_id,
        actor_role="borrower",
        action="evidence_submitted",
        final_severity=body.claimed_severity,
        note=body.note or "Borrower submitted counter-evidence.",
    ))

    # Notify the lender so they know admin now has both sides
    NotificationService.create(
        db, user_id=order.owner_id, order_id=order.id,
        type="DEPOSIT_EVIDENCE_RECEIVED",
        title="Borrower Submitted Counter-Evidence",
        message=(
            f"The borrower claims {body.claimed_severity} damage and uploaded "
            f"{len(body.photos or [])} photo(s). An admin will review both sides."
        ),
        commit=False,
    )

    db.commit()
    db.refresh(ev)
    return _evidence_to_dict(ev)
