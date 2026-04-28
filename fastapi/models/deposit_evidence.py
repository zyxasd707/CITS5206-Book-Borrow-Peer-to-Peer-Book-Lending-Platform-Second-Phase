"""
Deposit evidence model (MVP6-1).

Records photographic + textual evidence uploaded by the lender (on
confirm-received) or the borrower (as counter-evidence) when a returned
book is reported damaged. Admin uses these to arbitrate the final
deduction.
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from models.base import Base

EVIDENCE_ROLE_ENUM = ("lender", "borrower")
EVIDENCE_SEVERITY_ENUM = ("light", "medium", "severe")


class DepositEvidence(Base):
    __tablename__ = "deposit_evidence"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"),
                      nullable=False, index=True)
    submitter_id = Column(String(25), ForeignKey("users.user_id", ondelete="CASCADE"),
                          nullable=False, index=True)
    submitter_role = Column(Enum(*EVIDENCE_ROLE_ENUM, name="evidence_role_enum"),
                            nullable=False)

    # JSON array of relative media paths (e.g. ["/media/...a.jpg","/media/...b.jpg"])
    photos = Column(Text, nullable=False, default="[]")
    claimed_severity = Column(Enum(*EVIDENCE_SEVERITY_ENUM, name="evidence_severity_enum"),
                              nullable=False)
    note = Column(Text, nullable=True)

    submitted_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    submitter = relationship("User", foreign_keys=[submitter_id])
