from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.dependencies import get_db, get_current_admin
from models.user import User
from models.book import Book
from models.order import Order

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    total_users = db.query(User).count()
    total_books = db.query(Book).count()

    return {
        "total_users": total_users,
        "total_books": total_books,
        "active_rentals": 0,
        "total_revenue": 0,
    }

@router.get("/transactions-over-time")
def get_transactions_over_time(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    results = (
        db.query(
            func.date_format(Order.created_at, "%Y-%m-%d").label("date"),
            func.count(Order.id).label("count"),
        )
        .group_by(func.date_format(Order.created_at, "%Y-%m-%d"))
        .order_by(func.date_format(Order.created_at, "%Y-%m-%d"))
        .all()
    )

    return [{"date": r.date, "count": r.count} for r in results]