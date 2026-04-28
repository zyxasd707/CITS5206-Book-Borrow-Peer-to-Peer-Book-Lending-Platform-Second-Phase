import os
import stripe
import traceback
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header, Body, Query
from core.config import settings
from services import payment_gateway_service
from sqlalchemy.orm import Session
from core.dependencies import get_db, get_current_admin
from models.payment_gateway import (
    PaymentInitiateRequest,
    PaymentStatusResponse,
    DistributeShippingFeeRequest,
    PaymentRefundRequest,
    DisputeCreateRequest,
    PaymentDisputeRequest,
    DonationInitiateRequest,
    DonationResponse,
    StripeWebhookEvent
)
from typing import Optional
from utils.datetime import to_utc_iso

router = APIRouter(prefix="/payment_gateway", tags=["Payment_gateway"])



# -------- Routes --------
# ---------------------------
# Payment API
# ---------------------------

@router.post("/accounts/express", status_code=status.HTTP_201_CREATED)
def create_express_account_route(email: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """
    Create a Stripe Express Connected Account with manual payout schedule.
    - Calls Stripe API to create account
    - Sets payout to manual
    - Returns onboarding link
    """
    try:
        result = payment_gateway_service.create_express_account(email=email, db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payment/initiate", status_code=status.HTTP_201_CREATED)
def initiate_payment(body: PaymentInitiateRequest, db: Session = Depends(get_db)):
    """
    Initiate a payment:
    - Calls Stripe API to create PaymentIntent with lender destination
    - Saves payment record into DB
    - Returns client_secret for frontend
    """
    try:
        result = payment_gateway_service.initiate_payment(body.dict(), db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/payment/status/{payment_id}", response_model=PaymentStatusResponse, status_code=status.HTTP_200_OK)
def get_payment_status(payment_id: str):
    """
    Retrieve the status of a payment:
    - Fetch status from Stripe
    - Update local DB record if found
    - Return current status
    """
    try:
        result = payment_gateway_service.get_payment_status_service(payment_id)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payment/capture/{payment_id}", status_code=status.HTTP_200_OK)
def capture_payment(payment_id: str, db: Session = Depends(get_db)):
    """
    Capture a held payment:
    - Retrieve PaymentIntent from Stripe
    - Capture the held deposit/funds
    - Update local DB record
    - Return confirmation details
    """
    try:
        result = payment_gateway_service.capture_payment(payment_id, db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/payment/distribute_shipping_fee/{payment_id}", status_code=status.HTTP_200_OK)
def distribute_shipping_fee(payment_id: str, body: DistributeShippingFeeRequest, db: Session = Depends(get_db)):
    """
    Distribute the shipping fee to the lender:
    - Retrieve the corresponding PaymentIntent ID
    - Create a Stripe Transfer for the shipping fee amount
    - Optionally record the transfer in the local database
    - Return the transfer confirmation details
    """
    try:
        result = payment_gateway_service.distribute_shipping_fee(payment_id, body.dict(), db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payment/refund/{payment_id}", status_code=status.HTTP_200_OK)
def refund_payment(payment_id: str, body: PaymentRefundRequest, db: Session = Depends(get_db)):
    """
    Refund a payment:
    - Call Stripe Refund API
    - Insert refund record into DB
    - Update payment status accordingly
    - Return refund details
    """
    try:
        result = payment_gateway_service.refund_payment(payment_id, body.dict(), db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# MVP6: Refund Endpoints
# ---------------------------

@router.get("/payment/refunds/{order_id}", status_code=status.HTTP_200_OK)
def get_refunds_for_order(order_id: str, db: Session = Depends(get_db)):
    """
    Query all Refund records for an order (for frontend refund status display).
    Returns list of refunds with amounts, statuses, reasons, and timestamps.
    """
    from models.order import Order
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Refund

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    sp = db.query(PaymentSplit).filter(PaymentSplit.order_id == order_id).first()
    if not sp:
        return {"order_id": order_id, "refunds": []}

    refunds = (
        db.query(Refund)
        .filter(Refund.payment_id == sp.payment_id)
        .order_by(Refund.created_at.desc())
        .all()
    )

    return {
        "order_id": order_id,
        "refunds": [
            {
                "refund_id": r.refund_id,
                "amount": r.amount,
                "currency": r.currency,
                "status": r.status,
                "reason": r.reason,
                "created_at": to_utc_iso(r.created_at),
                "updated_at": to_utc_iso(r.updated_at),
            }
            for r in refunds
        ],
    }


@router.post("/payment/refund/cancel/{order_id}", status_code=status.HTTP_200_OK)
def cancel_order_with_refund(order_id: str, db: Session = Depends(get_db)):
    """
    Cancel an order and trigger automatic full refund (total paid).
    Only works for orders in PENDING_SHIPMENT status.
    """
    result = payment_gateway_service.refund_on_cancel(db=db, order_id=order_id, actor="user")
    return result


@router.get("/refunds/user/{user_id}", status_code=status.HTTP_200_OK)
def get_user_refunds(user_id: str, db: Session = Depends(get_db)):
    """
    Get all refund records for a specific user (as borrower).
    Returns refunds with order info, book titles, amounts, statuses.
    """
    from models.order import Order, OrderBook
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Refund, Payment, AuditLog
    from models.book import Book

    # Find all orders where user is the borrower
    orders = db.query(Order).filter(Order.borrower_id == user_id).all()
    if not orders:
        return {"user_id": user_id, "refunds": []}

    result = []
    for order in orders:
        sp = db.query(PaymentSplit).filter(PaymentSplit.order_id == order.id).first()
        if not sp:
            continue

        refunds = (
            db.query(Refund)
            .filter(Refund.payment_id == sp.payment_id)
            .order_by(Refund.created_at.desc())
            .all()
        )
        if not refunds:
            continue

        # Get book titles for this order
        order_books = db.query(OrderBook).filter(OrderBook.order_id == order.id).all()
        book_titles = []
        for ob in order_books:
            book = db.query(Book).filter(Book.id == ob.book_id).first()
            if book:
                book_titles.append(book.title_en or book.title_or or "Unknown")

        # Get audit logs for timeline
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.reference_id == order.id)
            .order_by(AuditLog.created_at.asc())
            .all()
        )

        for r in refunds:
            # Determine refund type by comparing amount
            total_cents = (sp.deposit_cents or 0) + (sp.shipping_cents or 0)
            if r.amount >= total_cents:
                refund_type = "full"
            elif r.amount == (sp.deposit_cents or 0):
                refund_type = "deposit"
            elif r.amount == (sp.shipping_cents or 0):
                refund_type = "shipping"
            else:
                refund_type = "partial"

            result.append({
                "refund_id": r.refund_id,
                "amount": r.amount,
                "currency": r.currency,
                "status": r.status,
                "reason": r.reason,
                "refund_type": refund_type,
                "created_at": to_utc_iso(r.created_at),
                "updated_at": to_utc_iso(r.updated_at),
                "order": {
                    "order_id": order.id,
                    "status": order.status,
                    "book_titles": book_titles,
                    "created_at": to_utc_iso(order.created_at),
                    "canceled_at": to_utc_iso(order.canceled_at),
                },
                "timeline": [
                    {
                        "event": log.event_type,
                        "actor": log.actor,
                        "message": log.message,
                        "timestamp": to_utc_iso(log.created_at),
                    }
                    for log in logs
                ],
            })

    # Sort by newest first
    result.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return {"user_id": user_id, "refunds": result}


# ---------------------------
# MVP6 Phase 3: Admin Refund Endpoints
# ---------------------------

@router.get("/refunds/admin", status_code=status.HTTP_200_OK)
def get_admin_refunds(
    status_filter: Optional[str] = Query(None, description="Filter by status: succeeded/pending/failed"),
    refund_type: Optional[str] = Query(None, description="Filter by type: full/deposit/shipping/partial"),
    search: Optional[str] = Query(None, description="Search by book title, user name, order ID, or refund ID"),
    sort_by: Optional[str] = Query("created_at", description="Sort field: created_at/amount"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc/desc"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: "User" = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Get all refund records across all users with search, filter, sort, and pagination.
    Also returns KPI summary (total count, total amount, success rate, failed count).
    """
    from models.order import Order, OrderBook
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Refund, Payment, AuditLog, Dispute
    from models.book import Book
    from models.user import User
    from sqlalchemy import func as sa_func, or_, cast, String

    # --- KPI Stats ---
    total_count = db.query(sa_func.count(Refund.id)).scalar() or 0
    total_amount = db.query(sa_func.coalesce(sa_func.sum(Refund.amount), 0)).scalar() or 0
    succeeded_count = db.query(sa_func.count(Refund.id)).filter(Refund.status == "succeeded").scalar() or 0
    failed_count = db.query(sa_func.count(Refund.id)).filter(Refund.status == "failed").scalar() or 0
    pending_count = db.query(sa_func.count(Refund.id)).filter(Refund.status == "pending").scalar() or 0
    success_rate = round((succeeded_count / total_count * 100), 1) if total_count > 0 else 0

    # --- Build query ---
    query = db.query(Refund).join(Payment, Refund.payment_id == Payment.payment_id)

    # Status filter
    if status_filter:
        query = query.filter(Refund.status == status_filter)

    # Search
    if search:
        search_term = f"%{search}%"
        # We need to join more tables for search
        query = query.outerjoin(
            PaymentSplit, Payment.payment_id == PaymentSplit.payment_id
        ).outerjoin(
            Order, PaymentSplit.order_id == Order.id
        ).outerjoin(
            User, Order.borrower_id == User.user_id
        )
        query = query.filter(
            or_(
                Refund.refund_id.ilike(search_term),
                Order.id.ilike(search_term),
                User.name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    # Sort
    if sort_by == "amount":
        order_col = Refund.amount
    else:
        order_col = Refund.created_at
    if sort_order == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())

    # Pagination
    total_filtered = query.count()
    refunds = query.offset((page - 1) * page_size).limit(page_size).all()

    # --- Build response ---
    result = []
    for r in refunds:
        payment = db.query(Payment).filter(Payment.payment_id == r.payment_id).first()

        # Find order via PaymentSplit
        sp = db.query(PaymentSplit).filter(PaymentSplit.payment_id == r.payment_id).first()
        order = None
        borrower = None
        lender = None
        book_titles = []
        disputes = []

        if sp:
            order = db.query(Order).filter(Order.id == sp.order_id).first()
            if order:
                borrower = db.query(User).filter(User.user_id == order.borrower_id).first()
                lender = db.query(User).filter(User.user_id == order.owner_id).first()
                order_books = db.query(OrderBook).filter(OrderBook.order_id == order.id).all()
                for ob in order_books:
                    book = db.query(Book).filter(Book.id == ob.book_id).first()
                    if book:
                        book_titles.append(book.title_en or book.title_or or "Unknown")

        # Determine refund type
        if sp:
            total_cents = (sp.deposit_cents or 0) + (sp.shipping_cents or 0)
            if r.amount >= total_cents and total_cents > 0:
                r_type = "full"
            elif r.amount == (sp.deposit_cents or 0) and (sp.deposit_cents or 0) > 0:
                r_type = "deposit"
            elif r.amount == (sp.shipping_cents or 0) and (sp.shipping_cents or 0) > 0:
                r_type = "shipping"
            else:
                r_type = "partial"
        else:
            r_type = "unknown"

        # Refund type filter (post-query since type is computed)
        if refund_type and r_type != refund_type:
            continue

        # Get disputes for this payment
        if payment:
            payment_disputes = db.query(Dispute).filter(Dispute.payment_id == payment.payment_id).all()
            disputes = [
                {
                    "dispute_id": d.dispute_id,
                    "reason": d.reason,
                    "status": d.status,
                    "created_at": to_utc_iso(d.created_at),
                }
                for d in payment_disputes
            ]

        # Determine trigger condition from audit logs
        trigger = "unknown"
        if sp and order:
            log = db.query(AuditLog).filter(
                AuditLog.reference_id == order.id,
                AuditLog.event_type.in_(["refund_on_cancel", "auto_refund", "refund_payment", "manual_refund"])
            ).first()
            if log:
                if "cancel" in log.event_type:
                    trigger = "user_cancel"
                elif "auto" in log.event_type:
                    trigger = "timeout"
                elif "manual" in log.event_type:
                    trigger = "admin_manual"
                else:
                    trigger = "payment_flow"

        result.append({
            "refund_id": r.refund_id,
            "payment_id": r.payment_id,
            "amount": r.amount,
            "currency": r.currency,
            "status": r.status,
            "reason": r.reason,
            "refund_type": r_type,
            "trigger": trigger,
            "created_at": to_utc_iso(r.created_at),
            "updated_at": to_utc_iso(r.updated_at),
            "order": {
                "order_id": order.id if order else None,
                "status": order.status if order else None,
                "book_titles": book_titles,
            } if order else None,
            "borrower": {
                "user_id": borrower.user_id,
                "name": borrower.name,
                "email": borrower.email,
            } if borrower else None,
            "lender": {
                "user_id": lender.user_id,
                "name": lender.name,
                "email": lender.email,
            } if lender else None,
            "disputes": disputes,
        })

    return {
        "kpi": {
            "total_count": total_count,
            "total_amount": total_amount,
            "succeeded_count": succeeded_count,
            "failed_count": failed_count,
            "pending_count": pending_count,
            "success_rate": success_rate,
        },
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total_filtered,
            "total_pages": (total_filtered + page_size - 1) // page_size,
        },
        "refunds": result,
    }


@router.get("/refunds/admin/{refund_id}", status_code=status.HTTP_200_OK)
def get_admin_refund_detail(
    refund_id: str,
    admin: "User" = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Get detailed info for a single refund, including Stripe IDs,
    borrower/lender info, audit timeline, disputes, and payment breakdown.
    """
    from models.order import Order, OrderBook
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Refund, Payment, AuditLog, Dispute
    from models.book import Book
    from models.user import User

    refund = db.query(Refund).filter(Refund.refund_id == refund_id).first()
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")

    payment = db.query(Payment).filter(Payment.payment_id == refund.payment_id).first()
    sp = db.query(PaymentSplit).filter(PaymentSplit.payment_id == refund.payment_id).first()

    order = None
    borrower = None
    lender = None
    book_titles = []
    timeline = []
    disputes = []

    if sp:
        order = db.query(Order).filter(Order.id == sp.order_id).first()
        if order:
            borrower = db.query(User).filter(User.user_id == order.borrower_id).first()
            lender = db.query(User).filter(User.user_id == order.owner_id).first()
            order_books = db.query(OrderBook).filter(OrderBook.order_id == order.id).all()
            for ob in order_books:
                book = db.query(Book).filter(Book.id == ob.book_id).first()
                if book:
                    book_titles.append(book.title_en or book.title_or or "Unknown")

            # Audit log timeline
            logs = db.query(AuditLog).filter(
                AuditLog.reference_id == order.id
            ).order_by(AuditLog.created_at.asc()).all()
            timeline = [
                {
                    "event": log.event_type,
                    "actor": log.actor,
                    "message": log.message,
                    "timestamp": to_utc_iso(log.created_at),
                }
                for log in logs
            ]

    # Disputes
    if payment:
        payment_disputes = db.query(Dispute).filter(Dispute.payment_id == payment.payment_id).all()
        disputes = [
            {
                "dispute_id": d.dispute_id,
                "user_id": d.user_id,
                "reason": d.reason,
                "note": d.note,
                "status": d.status,
                "deduction": d.deduction,
                "created_at": to_utc_iso(d.created_at),
            }
            for d in payment_disputes
        ]

    # Refund type
    if sp:
        total_cents = (sp.deposit_cents or 0) + (sp.shipping_cents or 0)
        if refund.amount >= total_cents and total_cents > 0:
            r_type = "full"
        elif refund.amount == (sp.deposit_cents or 0) and (sp.deposit_cents or 0) > 0:
            r_type = "deposit"
        elif refund.amount == (sp.shipping_cents or 0) and (sp.shipping_cents or 0) > 0:
            r_type = "shipping"
        else:
            r_type = "partial"
    else:
        r_type = "unknown"

    # Trigger condition
    trigger = "unknown"
    if sp and order:
        log = db.query(AuditLog).filter(
            AuditLog.reference_id == order.id,
            AuditLog.event_type.in_(["refund_on_cancel", "auto_refund", "refund_payment", "manual_refund"])
        ).first()
        if log:
            if "cancel" in log.event_type:
                trigger = "user_cancel"
            elif "auto" in log.event_type:
                trigger = "timeout"
            elif "manual" in log.event_type:
                trigger = "admin_manual"
            else:
                trigger = "payment_flow"

    return {
        "refund_id": refund.refund_id,
        "payment_id": refund.payment_id,
        "amount": refund.amount,
        "currency": refund.currency,
        "status": refund.status,
        "reason": refund.reason,
        "refund_type": r_type,
        "trigger": trigger,
        "created_at": to_utc_iso(refund.created_at),
        "updated_at": to_utc_iso(refund.updated_at),
        "payment": {
            "payment_id": payment.payment_id,
            "amount": payment.amount,
            "deposit": payment.deposit,
            "shipping_fee": payment.shipping_fee,
            "service_fee": payment.service_fee,
            "status": payment.status,
            "action_type": payment.action_type,
        } if payment else None,
        "payment_split": {
            "deposit_cents": sp.deposit_cents,
            "shipping_cents": sp.shipping_cents,
            "service_fee_cents": sp.service_fee_cents,
        } if sp else None,
        "order": {
            "order_id": order.id,
            "status": order.status,
            "book_titles": book_titles,
            "created_at": to_utc_iso(order.created_at),
            "canceled_at": to_utc_iso(order.canceled_at),
        } if order else None,
        "borrower": {
            "user_id": borrower.user_id,
            "name": borrower.name,
            "email": borrower.email,
        } if borrower else None,
        "lender": {
            "user_id": lender.user_id,
            "name": lender.name,
            "email": lender.email,
        } if lender else None,
        "timeline": timeline,
        "disputes": disputes,
    }


@router.post("/refunds/admin/{refund_id}/retry", status_code=status.HTTP_200_OK)
def retry_failed_refund(
    refund_id: str,
    admin: "User" = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Retry a failed Stripe refund.
    Creates a new Stripe refund for the same payment and amount.
    """
    from models.payment_gateway import Refund, Payment, AuditLog
    from models.payment_split import PaymentSplit
    from models.order import Order

    refund = db.query(Refund).filter(Refund.refund_id == refund_id).first()
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")
    if refund.status != "failed":
        raise HTTPException(status_code=400, detail=f"Refund status is '{refund.status}', only 'failed' refunds can be retried")

    try:
        new_refund = stripe.Refund.create(
            payment_intent=refund.payment_id,
            amount=refund.amount,
            reason=refund.reason,
        )
    except stripe.error.InvalidRequestError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")

    # Update existing refund record with new Stripe refund
    refund.refund_id = new_refund.id
    refund.status = new_refund.status
    refund.updated_at = None  # trigger auto-update

    # Audit log
    sp = db.query(PaymentSplit).filter(PaymentSplit.payment_id == refund.payment_id).first()
    order_id = sp.order_id if sp else refund.payment_id
    log = AuditLog(
        event_type="admin_retry_refund",
        reference_id=order_id,
        actor=admin.user_id,
        message=f"Admin retried failed refund. Old: {refund_id}, New: {new_refund.id}, Amount: {refund.amount} cents",
    )
    db.add(log)
    db.commit()

    return {
        "message": "Refund retry initiated",
        "old_refund_id": refund_id,
        "new_refund_id": new_refund.id,
        "amount": refund.amount,
        "status": new_refund.status,
    }


@router.post("/refunds/admin/manual", status_code=status.HTTP_201_CREATED)
def manual_admin_refund(
    order_id: str = Body(..., description="Order ID to refund"),
    refund_type: str = Body("full", description="Refund type: full/deposit/shipping"),
    reason: str = Body("Admin manual refund", description="Reason for refund"),
    admin: "User" = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Manually issue a refund for any order.
    Works regardless of order status (admin override).
    """
    from models.order import Order
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Refund, Payment, AuditLog

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    sp = db.query(PaymentSplit).filter(PaymentSplit.order_id == order_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Payment split not found for this order")

    # Calculate refund amount based on type
    if refund_type == "shipping":
        refund_amount = int(sp.shipping_cents or 0)
    elif refund_type == "deposit":
        refund_amount = int(sp.deposit_cents or 0)
    else:  # full
        refund_amount = int(sp.deposit_cents or 0) + int(sp.shipping_cents or 0)

    if refund_amount <= 0:
        raise HTTPException(status_code=400, detail=f"No refundable amount for refund_type='{refund_type}'")

    # Check if already fully refunded
    from sqlalchemy import func as sa_func
    existing_refunded = (
        db.query(sa_func.coalesce(sa_func.sum(Refund.amount), 0))
        .filter(Refund.payment_id == sp.payment_id, Refund.status.in_(["succeeded", "pending"]))
        .scalar()
    ) or 0
    payment = db.query(Payment).filter(Payment.payment_id == sp.payment_id).first()
    if payment and int(existing_refunded) + refund_amount > int(payment.amount or 0):
        raise HTTPException(status_code=400, detail="Refund amount would exceed original payment amount")

    try:
        r = stripe.Refund.create(
            payment_intent=sp.payment_id,
            amount=refund_amount,
            reason=reason,
        )
    except stripe.error.InvalidRequestError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")

    # Save refund record
    db_refund = Refund(
        refund_id=r.id,
        payment_id=sp.payment_id,
        amount=refund_amount,
        currency=r.currency,
        status=r.status,
        reason=reason,
    )
    db.add(db_refund)

    # Update payment status
    from sqlalchemy import func as sa_func
    total_refunded = int(existing_refunded) + refund_amount
    if payment:
        if total_refunded >= int(payment.amount or 0):
            payment.status = "refunded"
        else:
            payment.status = "partially_refunded"

    # Update order refund amount
    order.total_refunded_amount = (order.total_refunded_amount or 0) + refund_amount / 100.0

    # Audit log
    log = AuditLog(
        event_type="manual_refund",
        reference_id=order_id,
        actor=admin.user_id,
        message=f"Admin manual refund: {refund_type}, {refund_amount} cents. Reason: {reason}",
    )
    db.add(log)

    # Send notification to borrower
    try:
        from services.notification_service import NotificationService
        amount_display = refund_amount / 100
        NotificationService.create(
            db, user_id=order.borrower_id, order_id=order.id,
            type="REFUND",
            title="Refund Issued",
            message=f"A refund of ${amount_display:.2f} {r.currency.upper()} has been issued by admin. Reason: {reason}",
            commit=False,
        )
    except Exception as e:
        print(f"[WARN] Failed to create manual refund notification: {e}")

    db.commit()

    return {
        "message": "Manual refund issued successfully",
        "refund_id": r.id,
        "order_id": order_id,
        "amount": refund_amount,
        "currency": r.currency,
        "status": r.status,
        "refund_type": refund_type,
        "reason": reason,
    }


@router.post("/payment/compensate/{payment_id}", status_code=status.HTTP_200_OK)
def compensate_payment(payment_id: str, destination: str, db: Session = Depends(get_db)):
    """
    Compensate payment after dispute resolution:
    - Transfer partial compensation to owner 
    - Record transaction in DB
    """
    try:
        result = payment_gateway_service.compensate_payment(payment_id, destination, db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/payment/dispute/create/{payment_id}", status_code=status.HTTP_201_CREATED)
def create_dispute(payment_id: str, body: DisputeCreateRequest, db: Session = Depends(get_db)):
    """
    Create a dispute:
    - User submits a dispute request
    - Insert dispute record into DB with status='open'
    - Return dispute confirmation
    """
    try:
        result = payment_gateway_service.create_dispute(payment_id, body.dict(), db=db)  # ✅ 改这里
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payment/dispute/handle/{payment_id}", status_code=status.HTTP_200_OK)
def handle_dispute(payment_id: str, body: PaymentDisputeRequest, db: Session = Depends(get_db)):
    """
    Handle an existing dispute:
    - Admin reviews the open dispute
    - Update dispute status (adjust / overrule)
    - Optionally update related payment record
    - Save admin note in DB
    """
    try:
        result = payment_gateway_service.handle_dispute(payment_id, body.dict(), db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# Log / History
# ---------------------------

@router.get("/payment/logs/{limit}", status_code=200)
def get_audit_logs(limit: int, db: Session = Depends(get_db)):
    """Admin-only: View audit logs of all payment actions"""
    try:
        result = payment_gateway_service.view_logs(db, limit)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

# ---------------------------
# Donation Support
# ---------------------------

@router.post("/payment/donation/initiate", status_code=status.HTTP_201_CREATED)
def initiate_donation(body: DonationInitiateRequest, db: Session = Depends(get_db)):
    """
    Initiate a donation:
    - Call Stripe API to create PaymentIntent for donation
    - Save donation record into DB
    - Return client_secret for frontend
    """
    try:
        result = payment_gateway_service.initiate_donation(body.dict(), db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/payment/donation/history", response_model=list[DonationResponse], status_code=status.HTTP_200_OK)
def donation_history(user_id: str, db: Session = Depends(get_db)):
    """
    Retrieve donation history:
    - Query donation records for the current user
    - Return list of donation transactions
    """
    try:
        result = payment_gateway_service.donation_history(user_id, db=db)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# Confirm order (fallback when webhook doesn't fire)
# ---------------------------

@router.post("/payment/confirm-order", status_code=status.HTTP_200_OK)
def confirm_order_after_payment(payment_id: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """
    Frontend fallback: after Stripe payment succeeds but webhook didn't fire,
    the success page calls this to create orders + clear cart.
    Idempotent: if orders already exist for this payment_id, returns them.
    """
    result = payment_gateway_service.confirm_order_after_payment(db, payment_id)
    return result


# ---------------------------
# Webhooks
# ---------------------------

@router.post("/payment/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    print("🔥 ENTER stripe_webhook route handler")
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature")

    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    print(">>> ENV SECRET:", endpoint_secret)
    print(">>> HEADER SIG:", sig_header)
    print(">>> RAW PAYLOAD:", payload[:200])
    
    try:
        # 1. Verify signature
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=endpoint_secret
        )
    except Exception as e:
        print("=== Webhook Error ===")
        print(f"Payload: {payload}")
        print(f"Sig header: {sig_header}")
        print(f"Error: {repr(e)}") 
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")
    
    print(">>> Calling service.stripe_webhook now ...", type(event))    

    event_type = await payment_gateway_service.stripe_webhook(event, db=db)
    return {"message": "Webhook received", "event": event_type}
