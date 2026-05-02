from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.sql import func
from models.base import Base

COMPLAINT_STATUS_ENUM   = ("pending", "investigating", "resolved", "closed")
COMPLAINT_TYPE_ENUM     = (
    "book-condition", "delivery", "user-behavior", "other", "overdue",
    # Phase B.1
    "damage-on-return",
    # Phase B.2 (auto-dispatched complaint types — see complaint_service.create)
    "damage-on-receipt", "rental-defect", "no-return", "lender-no-ship",
    "package-lost", "wrong-item", "object-clean-return", "lender-reverse",
)
COMPLAINT_SEVERITY_ENUM = ("none", "light", "medium", "severe")

class Complaint(Base):
    __tablename__ = "complaint"

    id              = Column(String(36), primary_key=True)
    order_id        = Column(String(36), nullable=True)  # TODO: Modify when order list/table is created
    complainant_id  = Column(String(25), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    respondent_id   = Column(String(25), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)

    type            = Column(Enum(*COMPLAINT_TYPE_ENUM, name="complaint_type_enum"), nullable=False)
    subject         = Column(String(255), nullable=False)
    description     = Column(Text, nullable=False)

    status          = Column(Enum(*COMPLAINT_STATUS_ENUM, name="complaint_status_enum"), nullable=False, default="pending", index=True)
    admin_response  = Column(Text, nullable=True)

    # Damage escalation (MVP6-1) — used when type == "book-condition"
    damage_severity = Column(Enum(*COMPLAINT_SEVERITY_ENUM, name="complaint_damage_severity_enum"), nullable=True)
    evidence_photos = Column(Text, nullable=True)  # JSON array of relative media paths

    # Phase B.1 — link complaint to deposit arbitration + system bookkeeping
    linked_arbitration_order_id = Column(String(36), nullable=True)
    auto_action_taken           = Column(String(32), nullable=True)
    system_generated            = Column(Boolean, nullable=False, default=False, server_default="0")
    # Phase B.2 — Stripe Refund id when a complaint resolves into a manual refund
    linked_refund_id            = Column(String(255), nullable=True)

    created_at      = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

class ComplaintMessage(Base):
    __tablename__ = "complaint_message"

    id           = Column(String(36), primary_key=True)
    complaint_id = Column(String(36), ForeignKey("complaint.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id    = Column(String(25), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    body         = Column(Text, nullable=False)
    created_at   = Column(DateTime, server_default=func.now(), nullable=False)
