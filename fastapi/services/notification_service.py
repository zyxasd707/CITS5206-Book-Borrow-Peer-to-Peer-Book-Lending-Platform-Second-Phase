from sqlalchemy.orm import Session
from models.system_notification import SystemNotification
from typing import List, Optional


class NotificationService:

    @staticmethod
    def create(
        db: Session,
        user_id: str,
        type: str,
        title: str,
        message: str,
        order_id: Optional[str] = None,
        commit: bool = True,
    ) -> SystemNotification:
        notif = SystemNotification(
            user_id=user_id,
            order_id=order_id,
            type=type,
            title=title,
            message=message,
        )
        db.add(notif)
        if commit:
            db.commit()
            db.refresh(notif)
        return notif

    @staticmethod
    def get_user_notifications(
        db: Session,
        user_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> List[SystemNotification]:
        return (
            db.query(SystemNotification)
            .filter(SystemNotification.user_id == user_id)
            .order_by(SystemNotification.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_unread_count(db: Session, user_id: str) -> int:
        return (
            db.query(SystemNotification)
            .filter(
                SystemNotification.user_id == user_id,
                SystemNotification.is_read == False,
            )
            .count()
        )

    @staticmethod
    def mark_all_read(db: Session, user_id: str) -> int:
        count = (
            db.query(SystemNotification)
            .filter(
                SystemNotification.user_id == user_id,
                SystemNotification.is_read == False,
            )
            .update({"is_read": True})
        )
        db.commit()
        return count
