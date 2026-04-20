from datetime import date, datetime, time
from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.dependencies import get_db, get_current_admin
from models.user import User

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def calculate_age(dob):
    if not dob:
        return None

    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age


def age_bucket(age: int | None):
    if age is None:
        return "Unknown"
    if age < 18:
        return "<18"
    if 18 <= age <= 24:
        return "18-24"
    if 25 <= age <= 34:
        return "25-34"
    if 35 <= age <= 44:
        return "35-44"
    if 45 <= age <= 54:
        return "45-54"
    return "55+"


@router.get("/user-metrics")
def get_user_metrics(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    total_registered_users = db.query(User).count()

    query = db.query(User)

    if from_date:
        from_dt = datetime.combine(from_date, time.min)
        query = query.filter(User.created_at >= from_dt)

    if to_date:
        to_dt = datetime.combine(to_date, time.max)
        query = query.filter(User.created_at <= to_dt)

    users_in_range = query.order_by(User.created_at.desc()).all()

    signup_details = [
        {
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "city": user.city,
            "state": user.state,
            "country": user.country,
        }
        for user in users_in_range
    ]

    age_counter = Counter()
    for user in db.query(User).all():
        bucket = age_bucket(calculate_age(user.date_of_birth))
        age_counter[bucket] += 1

    age_distribution = [
        {"label": label, "value": value}
        for label, value in age_counter.items()
    ]

    location_rows = (
        db.query(
            func.coalesce(User.country, "Unknown").label("country"),
            func.count(User.user_id).label("count"),
        )
        .group_by(func.coalesce(User.country, "Unknown"))
        .all()
    )

    location_distribution = [
        {"label": row.country, "value": row.count}
        for row in location_rows
    ]

    return {
        "total_registered_users": total_registered_users,
        "signups_in_selected_period": len(users_in_range),
        "signup_details": signup_details,
        "age_distribution": age_distribution,
        "location_distribution": location_distribution,
    }