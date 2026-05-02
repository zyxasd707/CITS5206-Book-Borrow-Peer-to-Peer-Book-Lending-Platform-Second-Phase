from uuid import uuid4
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_

from models.complaint import Complaint, ComplaintMessage, COMPLAINT_STATUS_ENUM, COMPLAINT_TYPE_ENUM
from models.order import Order
from models.user import User
from services.notification_service import NotificationService


# Phase B.2 — auto-dispatch routing table.
# Drives complaint_service.create() side-effects (BRD §10.2 / §10.5):
#   * "arbitration"     → advance the order's deposit to pending_review if it
#                         is still held, link the complaint, mark the path so
#                         the admin master view can render the right banner.
#   * "manual_refund"   → flag for admin attention; no Refund row is auto-created
#                         because the appropriate refund amount is case-specific
#                         (BRD §14.2 Phase B reuses POST /complaints/{id}/resolve
#                         for manual refunds — that path is admin-driven).
#   * "ticket_only"     → existing behavior; do not touch money state.
_DISPATCH_TABLE = {
    "damage-on-receipt": "arbitration",
    "damage-on-return":  "arbitration",
    "rental-defect":     "arbitration",
    "wrong-item":        "arbitration",

    "delivery":          "manual_refund",
    "package-lost":      "manual_refund",
    "lender-no-ship":    "manual_refund",
    "no-return":         "manual_refund",

    "book-condition":      "ticket_only",
    "user-behavior":       "ticket_only",
    "other":               "ticket_only",
    "overdue":             "ticket_only",
    "object-clean-return": "ticket_only",
    "lender-reverse":      "ticket_only",
}


class ComplaintService:

    # Create
    @staticmethod
    def create(
        db: Session,
        *,
        complainant_id: str,
        type: str,
        subject: str,
        description: str,
        order_id: Optional[str] = None,
        respondent_id: Optional[str] = None,
        evidence_photos: Optional[List[str]] = None,
        damage_severity: Optional[str] = None,
        system_generated: bool = False,
        linked_arbitration_order_id: Optional[str] = None,
        auto_action_taken: Optional[str] = None,
        commit: bool = True,
    ) -> Complaint:
        if type not in COMPLAINT_TYPE_ENUM:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="Invalid complaint type")

        # Convert evidence_photos list to JSON string
        import json
        evidence_photos_json = None
        if evidence_photos:
            evidence_photos_json = json.dumps(evidence_photos)

        # Phase B.2 auto-dispatch: classify the complaint up-front so we can
        # set the right links and (optionally) advance order.deposit_status to
        # pending_review before the row is committed. B.1's lender auto-create
        # path passes its own linked_arbitration_order_id / auto_action_taken
        # explicitly, so we only fill in the blanks.
        dispatch = _DISPATCH_TABLE.get(type, "ticket_only")
        if dispatch == "arbitration":
            if linked_arbitration_order_id is None and order_id:
                linked_arbitration_order_id = order_id
            if auto_action_taken is None:
                auto_action_taken = "arbitration_dispatched"
        elif dispatch == "manual_refund":
            if auto_action_taken is None:
                auto_action_taken = "manual_refund_required"

        c = Complaint(
            id=str(uuid4()),
            complainant_id=complainant_id,
            respondent_id=respondent_id,
            order_id=order_id,
            type=type,
            subject=subject,
            description=description,
            status="pending",
            evidence_photos=evidence_photos_json,
            damage_severity=damage_severity,
            system_generated=system_generated,
            linked_arbitration_order_id=linked_arbitration_order_id,
            auto_action_taken=auto_action_taken,
        )
        db.add(c)

        # If we've classified this as an arbitration case and the deposit is
        # still 'held', advance it to 'pending_review' so it shows up in the
        # admin master view and the borrower's badge flips. We do not touch
        # already-resolved deposits — admins should handle late-arriving
        # complaints manually rather than rewriting history.
        if dispatch == "arbitration" and order_id:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order and order.deposit_status == "held":
                order.deposit_status = "pending_review"
                db.add(order)

        if commit:
            db.commit()
            db.refresh(c)

            # Notify all admins about the new complaint. Use COMPLAINT_CREATED
            # for system-generated rows (Bell + Activity badge consistency
            # with B.1) and the legacy NEW_COMPLAINT for user-filed rows.
            notif_type = "COMPLAINT_CREATED" if system_generated else "NEW_COMPLAINT"
            admins = db.query(User).filter(User.is_admin == True).all()
            for admin in admins:
                NotificationService.create(
                    db,
                    user_id=admin.user_id,
                    type=notif_type,
                    title=f"New Complaint: {subject}",
                    message=f"A new complaint has been submitted (Type: {type}). Subject: {subject}",
                    order_id=order_id,
                    commit=True,
                )
        return c

    # List (by user role)
    @staticmethod
    def list_for_user(
        db: Session,
        *,
        user_id: str,
        status: Optional[str] = None
    ) -> List[Complaint]:
        stmt = select(Complaint).where(
            or_(Complaint.complainant_id == user_id, Complaint.respondent_id == user_id)
        )
        if status:
            stmt = stmt.where(Complaint.status == status)
        return db.execute(stmt.order_by(Complaint.created_at.desc())).scalars().all()

    # Admin list
    @staticmethod
    def list_all(db: Session, *, status: Optional[str] = None) -> List[Complaint]:
        stmt = select(Complaint)
        if status:
            stmt = stmt.where(Complaint.status == status)
        return db.execute(stmt.order_by(Complaint.created_at.desc())).scalars().all()

    # Get (with permission check deferred to router)
    @staticmethod
    def get(db: Session, complaint_id: str) -> Complaint:
        c = db.get(Complaint, complaint_id)
        if not c:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Complaint not found")
        return c

    # Update status / admin response
    @staticmethod
    def admin_update(
        db: Session,
        *,
        complaint_id: str,
        status: Optional[str] = None,
        admin_response: Optional[str] = None
    ) -> Complaint:
        c = ComplaintService.get(db, complaint_id)
        if status:
            if status not in COMPLAINT_STATUS_ENUM:
                from fastapi import HTTPException
                raise HTTPException(status_code=422, detail="Invalid status")
            c.status = status
        if admin_response is not None:
            c.admin_response = admin_response
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    # Messages
    @staticmethod
    def add_message(db: Session, *, complaint_id: str, sender_id: str, body: str) -> ComplaintMessage:
        ComplaintService.get(db, complaint_id)  # ensure exists
        m = ComplaintMessage(
            id=str(uuid4()),
            complaint_id=complaint_id,
            sender_id=sender_id,
            body=body.strip()
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return m

    @staticmethod
    def list_messages(db: Session, *, complaint_id: str) -> List[ComplaintMessage]:
        return db.query(ComplaintMessage).filter(ComplaintMessage.complaint_id == complaint_id).order_by(ComplaintMessage.created_at.asc()).all()
