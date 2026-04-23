from datetime import date, datetime, timedelta
from collections import Counter

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

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

@router.get("/financial-metrics")
def get_financial_metrics(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    start_date = None
    end_date = None

    try:
        if from_date:
            start_date = datetime.strptime(from_date, "%Y-%m-%d")
        if to_date:
            end_date = datetime.strptime(to_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use YYYY-MM-DD"
        )

    where_clauses = []
    params = {}

    if start_date:
        where_clauses.append("o.created_at >= :start_date")
        params["start_date"] = start_date

    if end_date:
        where_clauses.append("o.created_at <= :end_date")
        params["end_date"] = end_date

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Refunds should be filtered by the refund timestamp, not the order timestamp.
    refund_where_clauses = []
    if start_date:
        refund_where_clauses.append("r.created_at >= :start_date")

    if end_date:
        refund_where_clauses.append("r.created_at <= :end_date")

    refund_where_sql = ""
    if refund_where_clauses:
        refund_where_sql = "WHERE " + " AND ".join(refund_where_clauses)

    order_filter_sql = f" AND {' AND '.join(where_clauses)}" if where_clauses else ""

    summary_sql = text(f"""
        SELECT
            COUNT(o.id) AS total_transactions,
            COALESCE(SUM(o.total_paid_amount), 0) AS gross_transaction_value,
            COALESCE(AVG(o.total_paid_amount), 0) AS average_transaction_value,
            COALESCE(SUM(o.total_paid_amount) * 0.05, 0) AS platform_revenue,
            SUM(CASE WHEN LOWER(o.action_type) = 'borrow' THEN 1 ELSE 0 END) AS borrow_transactions,
            SUM(CASE WHEN LOWER(o.action_type) = 'purchase' THEN 1 ELSE 0 END) AS purchase_transactions
        FROM orders o
        {where_sql}
    """)

    refund_sql = text(f"""
        SELECT
            COUNT(r.id) AS total_refunds,
            COALESCE(SUM(r.amount), 0) / 100.0 AS total_refund_amount
        FROM refunds r
        JOIN payments p ON p.payment_id = r.payment_id
        JOIN orders o ON o.payment_id = p.payment_id
        {refund_where_sql}
    """)

    payment_distribution_sql = text(f"""
        SELECT
            COALESCE(p.action_type, 'unknown') AS label,
            COUNT(*) AS value
        FROM payments p
        JOIN orders o ON o.payment_id = p.payment_id
        {where_sql}
        GROUP BY COALESCE(p.action_type, 'unknown')
        ORDER BY value DESC
    """)

    # Top earning users:
    # 1. Find all successful borrow/purchase orders
    # 2. Get the owner of each order
    # 3. Sum the transferred amount paid to each owner
    # 4. Rank owners by highest total earnings

    top_earners_sql = text(f"""
        SELECT
            ps.owner_id AS user_id,
            COALESCE(u.name, ps.owner_id) AS user_name,
            ROUND(COALESCE(SUM(ps.transfer_amount_cents), 0) / 100.0, 2) AS earnings
        FROM payment_splits ps
        LEFT JOIN users u ON u.user_id = ps.owner_id
        JOIN orders o ON o.id = ps.order_id
        WHERE LOWER(o.action_type) IN ('borrow', 'purchase')
          AND UPPER(o.status) IN ('COMPLETED', 'BORROWING', 'RETURNED', 'OVERDUE')
          {order_filter_sql}
        GROUP BY ps.owner_id, u.name
        HAVING earnings > 0
        ORDER BY earnings DESC
        LIMIT 10
    """)

    recent_transactions_sql = text(f"""
        SELECT
            o.id,
            o.created_at,
            o.status,
            o.action_type,
            o.total_paid_amount,
            COALESCE(owner_user.name, '-') AS owner_name,
            COALESCE(borrower_user.name, '-') AS borrower_name
        FROM orders o
        LEFT JOIN users owner_user ON owner_user.user_id = o.owner_id
        LEFT JOIN users borrower_user ON borrower_user.user_id = o.borrower_id
        {where_sql}
        ORDER BY o.created_at DESC
        LIMIT 20
    """)

    summary = db.execute(summary_sql, params).mappings().first()
    refunds = db.execute(refund_sql, params).mappings().first()
    payment_distribution = db.execute(payment_distribution_sql, params).mappings().all()
    top_earners = db.execute(top_earners_sql, params).mappings().all()
    recent_transactions = db.execute(recent_transactions_sql, params).mappings().all()

    total_transactions = int(summary["total_transactions"] or 0)
    total_refunds = int(refunds["total_refunds"] or 0)
    refund_rate = round((total_refunds / total_transactions) * 100, 2) if total_transactions else 0

    return {
        "total_transactions": total_transactions,
        "gross_transaction_value": float(summary["gross_transaction_value"] or 0),
        "platform_revenue": float(summary["platform_revenue"] or 0),
        "average_transaction_value": float(summary["average_transaction_value"] or 0),
        "borrow_transactions": int(summary["borrow_transactions"] or 0),
        "purchase_transactions": int(summary["purchase_transactions"] or 0),
        "payment_method_distribution": [
            {"label": row["label"], "value": int(row["value"] or 0)}
            for row in payment_distribution
        ],
        "total_refunds": total_refunds,
        "total_refund_amount": float(refunds["total_refund_amount"] or 0),
        "refund_rate": refund_rate,
        "top_earning_users": [
            {
                "user_id": row["user_id"],
                "user_name": row["user_name"],
                "earnings": float(row["earnings"] or 0),
            }
            for row in top_earners
        ],
        "recent_transactions": [
            {
                "id": row["id"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "status": row["status"],
                "action_type": row["action_type"],
                "total_paid_amount": float(row["total_paid_amount"] or 0),
                "owner_name": row["owner_name"],
                "borrower_name": row["borrower_name"],
            }
            for row in recent_transactions
        ],
    }