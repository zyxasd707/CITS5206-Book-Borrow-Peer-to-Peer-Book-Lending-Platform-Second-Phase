"""
Deposit audit log model (MVP6-1).

Append-only history of all actions that affected a deposit's state:
who triggered it, when, what amount moved, and the final severity ruled
by the admin (if any).
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, Integer, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from models.base import Base

AUDIT_ACTION_ENUM = (
    "evidence_submitted",
    "release",
    "partial_deduct",
    "forfeit",
    "restrict",
    "unrestrict",
    "ban",
)
AUDIT_ACTOR_ROLE_ENUM = ("admin", "lender", "borrower", "system")
AUDIT_SEVERITY_ENUM = ("none", "light", "medium", "severe")


class DepositAuditLog(Base):
    __tablename__ = "deposit_audit_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"),
                      nullable=False, index=True)
    actor_id = Column(String(25), ForeignKey("users.user_id", ondelete="SET NULL"),
                      nullable=True, index=True)
    actor_role = Column(Enum(*AUDIT_ACTOR_ROLE_ENUM, name="audit_actor_role_enum"),
                        nullable=False)
    action = Column(Enum(*AUDIT_ACTION_ENUM, name="audit_action_enum"),
                    nullable=False, index=True)

    amount_cents = Column(Integer, nullable=True)
    final_severity = Column(Enum(*AUDIT_SEVERITY_ENUM, name="audit_severity_enum"),
                            nullable=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    actor = relationship("User", foreign_keys=[actor_id])
