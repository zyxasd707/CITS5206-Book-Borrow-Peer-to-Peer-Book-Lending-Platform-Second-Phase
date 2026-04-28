import json
from datetime import date, datetime, timedelta
from collections import Counter

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, text, case
from sqlalchemy.orm import Session, joinedload

from core.dependencies import get_db, get_current_admin
from models.user import User
from models.book import Book
from models.order import Order, OrderBook
from models.admin_setting import AdminSetting
from models.complaint import Complaint
from models.deposit_audit_log import DepositAuditLog
from models.deposit_evidence import DepositEvidence
from models.payment_gateway import Dispute, Payment, Refund
from models.payment_split import PaymentSplit
from models.review import Review

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _iso(value):
    return value.isoformat() if value else None


def _json_list(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


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

    books_for_loan = db.query(Book).filter(
        Book.can_rent == True,
        Book.status == "listed",
    ).count()
    books_for_sale = db.query(Book).filter(
        Book.can_sell == True,
        Book.status == "listed",
    ).count()

    return {
        "total_books": total_books,
        "books_for_loan": books_for_loan,
        "books_for_sale": books_for_sale,
    }

@router.get("/book-listings")
def get_book_listings(
    type: str = Query("all", pattern="^(all|loan|sale)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    query = db.query(Book)

    if type == "loan":
        query = query.filter(
            Book.can_rent == True,
            Book.status == "listed",
        )
    elif type == "sale":
        query = query.filter(
            Book.can_sell == True,
            Book.status == "listed",
        )

    total_count = query.count()
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    books = (
        query
        .order_by(Book.date_added.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    book_ids = [book.id for book in books]
    owner_ids = {book.owner_id for book in books}

    users_by_id = {
        user.user_id: user
        for user in db.query(User).filter(User.user_id.in_(owner_ids)).all()
    } if owner_ids else {}

    activity_rows = (
        db.query(
            OrderBook.book_id,
            func.sum(
                case((Order.action_type == "borrow", 1), else_=0)
            ).label("times_borrowed"),
            func.sum(
                case((Order.action_type == "purchase", 1), else_=0)
            ).label("times_purchased"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .join(Order, Order.id == OrderBook.order_id)
        .filter(OrderBook.book_id.in_(book_ids))
        .group_by(OrderBook.book_id)
        .all()
    ) if book_ids else []

    activity_by_book_id = {
        row.book_id: {
            "times_borrowed": int(row.times_borrowed or 0),
            "times_purchased": int(row.times_purchased or 0),
            "last_order_at": row.last_order_at.isoformat() if row.last_order_at else None,
        }
        for row in activity_rows
    }

    results = []
    for book in books:
        owner = users_by_id.get(book.owner_id)
        activity = activity_by_book_id.get(book.id, {
            "times_borrowed": 0,
            "times_purchased": 0,
            "last_order_at": None,
        })

        results.append({
            "id": book.id,
            "title_or": book.title_or,
            "title_en": book.title_en,
            "original_language": book.original_language,
            "author": book.author,
            "category": book.category,
            "description": book.description,
            "cover_img_url": book.cover_img_url,
            "condition_img_urls": book.condition_img_urls or [],
            "status": book.status,
            "condition": book.condition,
            "can_rent": bool(book.can_rent),
            "can_sell": bool(book.can_sell),
            "date_added": book.date_added.isoformat() if book.date_added else None,
            "update_date": book.update_date.isoformat() if book.update_date else None,
            "isbn": book.isbn,
            "tags": book.tags or [],
            "publish_year": book.publish_year,
            "max_lending_days": int(book.max_lending_days or 0),
            "deposit_income_percentage": int(book.deposit_income_percentage or 0),
            "delivery_method": book.delivery_method,
            "sale_price": float(book.sale_price or 0),
            "deposit": float(book.deposit or 0),
            "owner": {
                "id": book.owner_id,
                "name": owner.name if owner else "-",
                "email": owner.email if owner else None,
                "phone_number": owner.phone_number if owner else None,
                "city": owner.city if owner else None,
                "state": owner.state if owner else None,
                "country": owner.country if owner else None,
            },
            **activity,
        })

    return {
        "type": type,
        "total": len(results),
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "books": results,
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

    setting = db.query(AdminSetting).filter(
        AdminSetting.key == "platform_fee_per_transaction"
    ).first()

    platform_fee = float(setting.max_value) if setting else 2.00
    params["platform_fee"] = platform_fee

    summary_sql = text(f"""
        SELECT
            COUNT(o.id) AS total_transactions,
            COALESCE(SUM(o.total_paid_amount), 0) AS gross_transaction_value,
            COALESCE(AVG(o.total_paid_amount), 0) AS average_transaction_value,
            COALESCE(COUNT(o.id) * :platform_fee, 0) AS platform_revenue,
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
        "platform_fee_per_transaction": platform_fee,
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


@router.get("/platform-fee-setting")
def get_platform_fee_setting(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    setting = db.query(AdminSetting).filter(
        AdminSetting.key == "platform_fee_per_transaction"
    ).first()

    return {
        "key": "platform_fee_per_transaction",
        "max_value": float(setting.max_value) if setting else 2.00,
    }


@router.get("/shipping-metrics")
def get_shipping_metrics(
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

    summary_sql = text(f"""
        SELECT
            COUNT(o.id) AS total_orders,
            SUM(CASE WHEN o.shipping_method = 'post' THEN 1 ELSE 0 END) AS delivery_orders,
            SUM(CASE WHEN o.shipping_method = 'pickup' THEN 1 ELSE 0 END) AS pickup_orders,
            SUM(
                CASE
                    WHEN o.shipping_method = 'post'
                         AND (
                            o.shipping_out_tracking_number IS NULL
                            OR TRIM(o.shipping_out_tracking_number) = ''
                         )
                    THEN 1
                    ELSE 0
                END
            ) AS missing_tracking_orders,
            SUM(
                CASE
                    WHEN o.shipping_out_tracking_number IS NOT NULL
                         AND TRIM(o.shipping_out_tracking_number) <> ''
                    THEN 1
                    ELSE 0
                END
            ) AS outbound_tracking_orders,
            SUM(
                CASE
                    WHEN o.shipping_return_tracking_number IS NOT NULL
                         AND TRIM(o.shipping_return_tracking_number) <> ''
                    THEN 1
                    ELSE 0
                END
            ) AS return_tracking_orders,
            COALESCE(AVG(o.estimated_delivery_time), 0) AS average_estimated_delivery_time,
            COALESCE(SUM(o.shipping_out_fee_amount), 0) AS shipping_fee_total
        FROM orders o
        {where_sql}
    """)

    checkout_summary_sql = text("""
        SELECT
            COUNT(ci.item_id) AS checkout_items,
            SUM(CASE WHEN LOWER(ci.shipping_method) = 'delivery' THEN 1 ELSE 0 END) AS checkout_delivery_items,
            SUM(CASE WHEN LOWER(ci.shipping_method) = 'pickup' THEN 1 ELSE 0 END) AS checkout_pickup_items,
            COALESCE(SUM(ci.shipping_quote), 0) AS checkout_shipping_quote_total,
            COALESCE(AVG(ci.estimated_delivery_time), 0) AS checkout_average_estimated_delivery_time
        FROM checkout_item ci
    """)

    recent_shipments_sql = text(f"""
        SELECT
            o.id,
            o.status,
            o.shipping_method,
            o.shipping_out_tracking_number,
            o.shipping_return_tracking_number,
            o.estimated_delivery_time,
            o.shipping_out_fee_amount,
            o.created_at,
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
    checkout_summary = db.execute(checkout_summary_sql).mappings().first()
    recent_shipments = db.execute(recent_shipments_sql, params).mappings().all()

    total_orders = int(summary["total_orders"] or 0)
    delivery_orders = int(summary["delivery_orders"] or 0)
    pickup_orders = int(summary["pickup_orders"] or 0)

    return {
        "total_orders": total_orders,
        "delivery_orders": delivery_orders,
        "pickup_orders": pickup_orders,
        "delivery_ratio": round((delivery_orders / total_orders) * 100, 2) if total_orders else 0,
        "pickup_ratio": round((pickup_orders / total_orders) * 100, 2) if total_orders else 0,
        "missing_tracking_orders": int(summary["missing_tracking_orders"] or 0),
        "outbound_tracking_orders": int(summary["outbound_tracking_orders"] or 0),
        "return_tracking_orders": int(summary["return_tracking_orders"] or 0),
        "average_estimated_delivery_time": float(summary["average_estimated_delivery_time"] or 0),
        "shipping_fee_total": float(summary["shipping_fee_total"] or 0),
        "checkout_summary": {
            "checkout_items": int(checkout_summary["checkout_items"] or 0),
            "delivery_items": int(checkout_summary["checkout_delivery_items"] or 0),
            "pickup_items": int(checkout_summary["checkout_pickup_items"] or 0),
            "shipping_quote_total": float(checkout_summary["checkout_shipping_quote_total"] or 0),
            "average_estimated_delivery_time": float(
                checkout_summary["checkout_average_estimated_delivery_time"] or 0
            ),
        },
        "recent_shipments": [
            {
                "id": row["id"],
                "status": row["status"],
                "shipping_method": row["shipping_method"],
                "shipping_out_tracking_number": row["shipping_out_tracking_number"],
                "shipping_return_tracking_number": row["shipping_return_tracking_number"],
                "estimated_delivery_time": row["estimated_delivery_time"],
                "shipping_out_fee_amount": float(row["shipping_out_fee_amount"] or 0),
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "owner_name": row["owner_name"],
                "borrower_name": row["borrower_name"],
            }
            for row in recent_shipments
        ],
    }


@router.get("/orders/{order_id}/details")
def get_admin_order_details(
    order_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    order = (
        db.query(Order)
        .options(
            joinedload(Order.books).joinedload(OrderBook.book),
            joinedload(Order.borrower),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    payment = (
        db.query(Payment)
        .filter(Payment.payment_id == order.payment_id)
        .first()
        if order.payment_id
        else None
    )

    refunds = (
        db.query(Refund)
        .filter(Refund.payment_id == order.payment_id)
        .order_by(Refund.created_at.desc())
        .all()
        if order.payment_id
        else []
    )

    disputes = (
        db.query(Dispute)
        .filter(Dispute.payment_id == order.payment_id)
        .order_by(Dispute.created_at.desc())
        .all()
        if order.payment_id
        else []
    )

    payment_splits = (
        db.query(PaymentSplit)
        .filter(PaymentSplit.order_id == order.id)
        .order_by(PaymentSplit.created_at.desc())
        .all()
    )

    complaints = (
        db.query(Complaint)
        .filter(Complaint.order_id == order.id)
        .order_by(Complaint.created_at.desc())
        .all()
    )

    reviews = (
        db.query(Review)
        .filter(Review.order_id == order.id)
        .order_by(Review.created_at.desc())
        .all()
    )

    evidence_items = (
        db.query(DepositEvidence)
        .filter(DepositEvidence.order_id == order.id)
        .order_by(DepositEvidence.submitted_at.desc())
        .all()
    )

    audit_logs = (
        db.query(DepositAuditLog)
        .filter(DepositAuditLog.order_id == order.id)
        .order_by(DepositAuditLog.created_at.desc())
        .all()
    )

    user_ids = {
        order.owner_id,
        order.borrower_id,
        *[c.complainant_id for c in complaints],
        *[c.respondent_id for c in complaints if c.respondent_id],
        *[r.reviewer_id for r in reviews],
        *[r.reviewee_id for r in reviews],
        *[e.submitter_id for e in evidence_items],
        *[a.actor_id for a in audit_logs if a.actor_id],
        *[split.owner_id for split in payment_splits],
        *[dispute.user_id for dispute in disputes],
    }
    users_by_id = {
        user.user_id: user
        for user in db.query(User).filter(User.user_id.in_(user_ids)).all()
    } if user_ids else {}

    def user_summary(user_id):
        user = users_by_id.get(user_id)
        if not user:
            return {"id": user_id, "name": "-", "email": None}
        return {
            "id": user.user_id,
            "name": user.name,
            "email": user.email,
            "phone_number": user.phone_number,
            "city": user.city,
            "state": user.state,
            "country": user.country,
            "is_restricted": bool(user.is_restricted),
            "restriction_reason": user.restriction_reason,
            "damage_strike_count": int(user.damage_strike_count or 0),
            "damage_severity_score": int(user.damage_severity_score or 0),
            "stripe_account_id": user.stripe_account_id,
        }

    books = []
    for order_book in order.books:
        book = order_book.book
        if not book:
            continue
        books.append({
            "id": book.id,
            "title_or": book.title_or,
            "title_en": book.title_en,
            "author": book.author,
            "category": book.category,
            "condition": book.condition,
            "status": book.status,
            "cover_img_url": book.cover_img_url,
            "can_rent": bool(book.can_rent),
            "can_sell": bool(book.can_sell),
            "sale_price": float(book.sale_price or 0),
            "deposit": float(book.deposit or 0),
            "max_lending_days": int(book.max_lending_days or 0),
            "date_added": _iso(book.date_added),
        })

    return {
        "order": {
            "id": order.id,
            "status": order.status,
            "action_type": order.action_type,
            "created_at": _iso(order.created_at),
            "updated_at": _iso(order.updated_at),
            "start_at": _iso(order.start_at),
            "due_at": _iso(order.due_at),
            "returned_at": _iso(order.returned_at),
            "completed_at": _iso(order.completed_at),
            "canceled_at": _iso(order.canceled_at),
            "notes": order.notes,
        },
        "people": {
            "owner": user_summary(order.owner_id),
            "borrower": user_summary(order.borrower_id),
            "contact": {
                "name": order.contact_name,
                "email": (
                    users_by_id[order.borrower_id].email
                    if order.borrower_id in users_by_id
                    else None
                ),
                "phone": order.phone,
            },
        },
        "books": books,
        "shipping": {
            "method": order.shipping_method,
            "address": {
                "street": order.street,
                "city": order.city,
                "postcode": order.postcode,
                "country": order.country,
            },
            "outbound": {
                "carrier": order.shipping_out_carrier,
                "tracking_number": order.shipping_out_tracking_number,
                "tracking_url": order.shipping_out_tracking_url,
            },
            "return": {
                "carrier": order.shipping_return_carrier,
                "tracking_number": order.shipping_return_tracking_number,
                "tracking_url": order.shipping_return_tracking_url,
            },
            "estimated_delivery_time": order.estimated_delivery_time,
        },
        "payment": {
            "payment_id": order.payment_id,
            "payment_status": payment.status if payment else None,
            "payment_currency": payment.currency if payment else None,
            "payment_amount_cents": int(payment.amount or 0) if payment else 0,
            "payment_created_at": _iso(payment.created_at) if payment else None,
            "payment_updated_at": _iso(payment.updated_at) if payment else None,
            "payment_action_type": payment.action_type if payment else None,
            "deposit_or_sale_amount": float(order.deposit_or_sale_amount or 0),
            "owner_income_amount": float(order.owner_income_amount or 0),
            "service_fee_amount": float(order.service_fee_amount or 0),
            "shipping_out_fee_amount": float(order.shipping_out_fee_amount or 0),
            "total_paid_amount": float(order.total_paid_amount or 0),
            "total_refunded_amount": float(order.total_refunded_amount or 0),
            "late_fee_amount": float(order.late_fee_amount or 0),
            "damage_fee_amount": float(order.damage_fee_amount or 0),
        },
        "deposit": {
            "status": order.deposit_status,
            "deducted_cents": int(order.deposit_deducted_cents or 0),
            "damage_severity_final": order.damage_severity_final,
        },
        "payment_splits": [
            {
                "id": split.id,
                "payment_id": split.payment_id,
                "owner": user_summary(split.owner_id),
                "connected_account_id": split.connected_account_id,
                "currency": split.currency,
                "deposit_cents": int(split.deposit_cents or 0),
                "shipping_cents": int(split.shipping_cents or 0),
                "service_fee_cents": int(split.service_fee_cents or 0),
                "transfer_amount_cents": int(split.transfer_amount_cents or 0),
                "transfer_id": split.transfer_id,
                "transfer_status": split.transfer_status,
                "created_at": _iso(split.created_at),
                "updated_at": _iso(split.updated_at),
            }
            for split in payment_splits
        ],
        "refunds": [
            {
                "id": refund.id,
                "refund_id": refund.refund_id,
                "payment_id": refund.payment_id,
                "amount_cents": int(refund.amount or 0),
                "currency": refund.currency,
                "status": refund.status,
                "reason": refund.reason,
                "created_at": _iso(refund.created_at),
                "updated_at": _iso(refund.updated_at),
            }
            for refund in refunds
        ],
        "disputes": [
            {
                "id": dispute.id,
                "dispute_id": dispute.dispute_id,
                "payment_id": dispute.payment_id,
                "user": user_summary(dispute.user_id),
                "reason": dispute.reason,
                "note": dispute.note,
                "status": dispute.status,
                "deduction_cents": int(dispute.deduction or 0),
                "created_at": _iso(dispute.created_at),
            }
            for dispute in disputes
        ],
        "complaints": [
            {
                "id": complaint.id,
                "type": complaint.type,
                "subject": complaint.subject,
                "description": complaint.description,
                "status": complaint.status,
                "admin_response": complaint.admin_response,
                "damage_severity": complaint.damage_severity,
                "evidence_photos": _json_list(complaint.evidence_photos),
                "complainant": user_summary(complaint.complainant_id),
                "respondent": user_summary(complaint.respondent_id) if complaint.respondent_id else None,
                "created_at": _iso(complaint.created_at),
                "updated_at": _iso(complaint.updated_at),
            }
            for complaint in complaints
        ],
        "reviews": [
            {
                "id": review.id,
                "rating": int(review.rating or 0),
                "comment": review.comment,
                "reviewer": user_summary(review.reviewer_id),
                "reviewee": user_summary(review.reviewee_id),
                "created_at": _iso(review.created_at),
            }
            for review in reviews
        ],
        "deposit_evidence": [
            {
                "id": evidence.id,
                "submitter": user_summary(evidence.submitter_id),
                "submitter_role": evidence.submitter_role,
                "photos": _json_list(evidence.photos),
                "claimed_severity": evidence.claimed_severity,
                "note": evidence.note,
                "submitted_at": _iso(evidence.submitted_at),
            }
            for evidence in evidence_items
        ],
        "deposit_audit_logs": [
            {
                "id": audit.id,
                "actor": user_summary(audit.actor_id) if audit.actor_id else None,
                "actor_role": audit.actor_role,
                "action": audit.action,
                "amount_cents": int(audit.amount_cents or 0) if audit.amount_cents is not None else None,
                "final_severity": audit.final_severity,
                "note": audit.note,
                "created_at": _iso(audit.created_at),
            }
            for audit in audit_logs
        ],
    }

@router.put("/platform-fee-setting")
def update_platform_fee_setting(
    max_value: float = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    setting = db.query(AdminSetting).filter(
        AdminSetting.key == "platform_fee_per_transaction"
    ).first()

    if not setting:
        setting = AdminSetting(
            key="platform_fee_per_transaction",
            max_value=max_value
        )
        db.add(setting)
    else:
        setting.max_value = max_value

    db.commit()
    db.refresh(setting)

    return {
        "key": setting.key,
        "max_value": float(setting.max_value),
    }
