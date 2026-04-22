from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.dependencies import get_db, get_current_admin
from models.user import User
from models.book import Book
from models.order import Order
from datetime import datetime, timedelta
from collections import Counter
from datetime import date
from datetime import datetime
from fastapi import Query
from fastapi import APIRouter, Depends, Query
from fastapi import APIRouter, Depends, Query, HTTPException
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

@router.get("/book-metrics")
def get_book_metrics(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    total_books = db.query(Book).count()

    books_for_loan = db.query(Book).filter(Book.can_rent == True).count()
    books_for_sale = db.query(Book).filter(Book.can_sell == True).count()

    return {
        "total_books": total_books,
        "books_for_loan": books_for_loan,
        "books_for_sale": books_for_sale,
    }

@router.get("/user-metrics")
def get_user_metrics(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    total_users = db.query(User).count()

    seven_days_ago = datetime.utcnow() - timedelta(days=7)

    new_users_last_7_days = db.query(User).filter(
        User.created_at >= seven_days_ago
    ).count()

    return {
        "total_users": total_users,
        "new_users_last_7_days": new_users_last_7_days,
    }

@router.get("/user-signups")
def get_user_signups(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d")
        end_date = datetime.strptime(to_date, "%Y-%m-%d")
        end_date = end_date.replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    users = (
        db.query(User)
        .filter(User.created_at >= start_date, User.created_at <= end_date)
        .order_by(User.created_at.desc())
        .all()
    )

    results = []
    for user in users:
        results.append({
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "city": user.city,
            "state": user.state,
            "country": user.country,
        })

    return {
        "total_signups": len(results),
        "users": results
    }

@router.get("/book-categories")
def get_book_categories(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    category_data = (
        db.query(Book.category, func.count(Book.id))
        .group_by(Book.category)
        .all()
    )

    result = []
    for category, count in category_data:
        result.append({
            "category": category if category else "Uncategorized",
            "count": count
        })

    return result

@router.get("/user-demographics")
def get_user_demographics(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    users = db.query(User).all()

    today = date.today()

    age_groups = {
        "Under 18": 0,
        "18-24": 0,
        "25-34": 0,
        "35-44": 0,
        "45+": 0,
        "Unknown": 0,
    }

    location_counter = Counter()

    for user in users:
        # Age calculation
        if user.date_of_birth:
            age = today.year - user.date_of_birth.year - (
                (today.month, today.day) < (user.date_of_birth.month, user.date_of_birth.day)
            )

            if age < 18:
                age_groups["Under 18"] += 1
            elif age <= 24:
                age_groups["18-24"] += 1
            elif age <= 34:
                age_groups["25-34"] += 1
            elif age <= 44:
                age_groups["35-44"] += 1
            else:
                age_groups["45+"] += 1
        else:
            age_groups["Unknown"] += 1

        # Location distribution
        state = user.state if user.state else "Unknown"
        location_counter[state] += 1

    # Reading preferences inferred from listed book categories
    category_data = (
        db.query(Book.category, func.count(Book.id))
        .group_by(Book.category)
        .all()
    )

    reading_preferences = []
    for category, count in category_data:
        reading_preferences.append({
            "category": category if category else "Uncategorized",
            "count": count
        })

    return {
        "age_groups": age_groups,
        "locations": dict(location_counter),
        "reading_preferences": reading_preferences,
    }

@router.get("/search-users")
def search_users(
    q: str = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    users = (
        db.query(User)
        .filter(User.name.ilike(f"%{q}%"))
        .limit(10)
        .all()
    )

    results = []
    for user in users:
        results.append({
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
        })

    return results

@router.get("/books-by-user/{user_id}")
def get_books_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    books = (
        db.query(Book)
        .filter(Book.owner_id == user_id)
        .order_by(Book.date_added.desc())
        .all()
    )

    results = []
    for book in books:
        results.append({
            "id": book.id,
            "title_or": book.title_or,
            "author": book.author,
            "category": book.category,
            "status": book.status,
            "can_rent": book.can_rent,
            "can_sell": book.can_sell,
            "date_added": book.date_added.isoformat() if book.date_added else None,
        })

    return {
        "total_books": len(results),
        "books": results
    }

@router.get("/books-per-user-average")
def get_books_per_user_average(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    total_books = db.query(Book).count()
    total_users = db.query(User).count()

    average = total_books / total_users if total_users > 0 else 0

    return {
        "total_books": total_books,
        "total_users": total_users,
        "average_books_per_user": round(average, 2),
    }

@router.get("/orders")
def get_all_orders(
    status: str = Query("ALL"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    query = db.query(Order)

    if status != "ALL":
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).all()

    results = []
    for order in orders:
        book_titles = []
        for ob in order.books:
            if ob.book:
                book_titles.append(ob.book.title_or or ob.book.title_en)

        results.append({
            "id": order.id,
            "status": order.status,
            "action_type": order.action_type,
            "owner_name": order.owner.name if order.owner else "-",
            "borrower_name": order.borrower.name if order.borrower else "-",
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "due_at": order.due_at.isoformat() if order.due_at else None,
            "total_paid_amount": float(order.total_paid_amount or 0),
            "books": book_titles,
        })

    return {
        "total_orders": len(results),
        "orders": results,
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