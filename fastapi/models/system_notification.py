from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from .base import Base
import uuid


class SystemNotification(Base):
    __tablename__ = "system_notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(25), nullable=False, index=True)
    order_id = Column(String(36), nullable=True)
    type = Column(String(50), nullable=False)  # e.g. PAYMENT_CONFIRMED, SHIPMENT_SENT, BORROWING, OVERDUE, RETURNED, COMPLETED, CANCELED, REFUND
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
