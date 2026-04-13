"""
Seed script — populates the database with demo users, books, and orders.

For local Docker development, run this inside the backend container:
    docker exec -it fastapi-backend python seed.py

Why this matters:
    The root `.env` uses `DB_HOST=db`, which resolves correctly inside Docker
    but usually does not resolve from the host machine.
"""

import os
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from database.connection import SessionLocal
from models.user import User
from models.book import Book
from models.order import Order, OrderBook
from models.payment_gateway import Payment
from core.security import get_password_hash


def uid():
    return str(uuid.uuid4())


def short_uid():
    return "U" + str(uuid.uuid4()).replace("-", "")[:24]


USERS = [
    {
        "user_id": short_uid(),
        "name": "Alice Chen",
        "first_name": "Alice",
        "last_name": "Chen",
        "email": "alice@example.com",
        "password": "Password123!",
        "location": "Perth, WA",
        "country": "Australia",
        "street_address": "10 Murray Street",
        "city": "Perth",
        "state": "WA",
        "zip_code": "6000",
        "is_admin": False,
    },
    {
        "user_id": short_uid(),
        "name": "Bob Smith",
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob@example.com",
        "password": "Password123!",
        "location": "Melbourne, VIC",
        "country": "Australia",
        "street_address": "25 Swanston Street",
        "city": "Melbourne",
        "state": "VIC",
        "zip_code": "3000",
        "is_admin": False,
    },
    {
        "user_id": short_uid(),
        "name": "Carol Wang",
        "first_name": "Carol",
        "last_name": "Wang",
        "email": "carol@example.com",
        "password": "Password123!",
        "location": "Sydney, NSW",
        "country": "Australia",
        "street_address": "88 George Street",
        "city": "Sydney",
        "state": "NSW",
        "zip_code": "2000",
        "is_admin": False,
    },
    {
        "user_id": short_uid(),
        "name": "Admin User",
        "first_name": "Admin",
        "last_name": "User",
        "email": "admin@bookhive.com",
        "password": "Admin123!",
        "location": "Perth, WA",
        "country": "Australia",
        "street_address": "1 St Georges Terrace",
        "city": "Perth",
        "state": "WA",
        "zip_code": "6000",
        "is_admin": True,
    },
]

BOOKS = [
    {
        "title_or": "The Great Gatsby",
        "title_en": "The Great Gatsby",
        "original_language": "English",
        "author": "F. Scott Fitzgerald",
        "category": "Classic Fiction",
        "description": "A story of the fabulously wealthy Jay Gatsby and his love for the beautiful Daisy Buchanan, set in the 1920s Jazz Age.",
        "condition": "good",
        "status": "listed",
        "can_rent": True,
        "can_sell": True,
        "deposit": "20.00",
        "sale_price": "15.00",
        "max_lending_days": 14,
        "delivery_method": "both",
        "publish_year": 1925,
        "isbn": "9780743273565",
        "tags": ["classic", "american literature", "fiction"],
        "owner_index": 0,
    },
    {
        "title_or": "1984",
        "title_en": "Nineteen Eighty-Four",
        "original_language": "English",
        "author": "George Orwell",
        "category": "Dystopian Fiction",
        "description": "A chilling dystopia about totalitarian surveillance and thought control.",
        "condition": "like-new",
        "status": "listed",
        "can_rent": True,
        "can_sell": False,
        "deposit": "25.00",
        "sale_price": None,
        "max_lending_days": 21,
        "delivery_method": "post",
        "publish_year": 1949,
        "isbn": "9780451524935",
        "tags": ["dystopia", "classic", "political"],
        "owner_index": 0,
    },
    {
        "title_or": "To Kill a Mockingbird",
        "title_en": "To Kill a Mockingbird",
        "original_language": "English",
        "author": "Harper Lee",
        "category": "Classic Fiction",
        "description": "The story of young Scout Finch and Atticus Finch.",
        "condition": "good",
        "status": "listed",
        "can_rent": True,
        "can_sell": True,
        "deposit": "15.00",
        "sale_price": "12.00",
        "max_lending_days": 14,
        "delivery_method": "both",
        "publish_year": 1960,
        "isbn": "9780061935466",
        "tags": ["classic", "justice", "coming-of-age"],
        "owner_index": 1,
    },
    {
        "title_or": "The Hitchhiker's Guide to the Galaxy",
        "title_en": "The Hitchhiker's Guide to the Galaxy",
        "original_language": "English",
        "author": "Douglas Adams",
        "category": "Science Fiction",
        "description": "Arthur Dent is swept off Earth before its destruction.",
        "condition": "fair",
        "status": "listed",
        "can_rent": True,
        "can_sell": False,
        "deposit": "10.00",
        "sale_price": None,
        "max_lending_days": 10,
        "delivery_method": "pickup",
        "publish_year": 1979,
        "isbn": "9780345391803",
        "tags": ["sci-fi", "comedy", "adventure"],
        "owner_index": 1,
    },
    {
        "title_or": "Pride and Prejudice",
        "title_en": "Pride and Prejudice",
        "original_language": "English",
        "author": "Jane Austen",
        "category": "Classic Romance",
        "description": "Elizabeth Bennet navigates manners, morality, and marriage.",
        "condition": "new",
        "status": "listed",
        "can_rent": True,
        "can_sell": True,
        "deposit": "18.00",
        "sale_price": "14.00",
        "max_lending_days": 21,
        "delivery_method": "both",
        "publish_year": 1813,
        "isbn": "9780141439518",
        "tags": ["classic", "romance", "british literature"],
        "owner_index": 2,
    },
    {
        "title_or": "Dune",
        "title_en": "Dune",
        "original_language": "English",
        "author": "Frank Herbert",
        "category": "Science Fiction",
        "description": "Paul Atreides and the desert planet Arrakis.",
        "condition": "good",
        "status": "listed",
        "can_rent": True,
        "can_sell": True,
        "deposit": "30.00",
        "sale_price": "22.00",
        "max_lending_days": 30,
        "delivery_method": "post",
        "publish_year": 1965,
        "isbn": "9780441013593",
        "tags": ["sci-fi", "epic", "fantasy"],
        "owner_index": 2,
    },
    {
        "title_or": "The Alchemist",
        "title_en": "The Alchemist",
        "original_language": "Portuguese",
        "author": "Paulo Coelho",
        "category": "Inspirational Fiction",
        "description": "Santiago travels to the Egyptian desert in search of treasure.",
        "condition": "like-new",
        "status": "listed",
        "can_rent": True,
        "can_sell": False,
        "deposit": "12.00",
        "sale_price": None,
        "max_lending_days": 14,
        "delivery_method": "both",
        "publish_year": 1988,
        "isbn": "9780062315007",
        "tags": ["inspirational", "fiction", "philosophy"],
        "owner_index": 0,
    },
    {
        "title_or": "Harry Potter and the Philosopher's Stone",
        "title_en": "Harry Potter and the Philosopher's Stone",
        "original_language": "English",
        "author": "J.K. Rowling",
        "category": "Fantasy",
        "description": "An orphan boy discovers he is a wizard.",
        "condition": "good",
        "status": "listed",
        "can_rent": True,
        "can_sell": True,
        "deposit": "20.00",
        "sale_price": "18.00",
        "max_lending_days": 14,
        "delivery_method": "both",
        "publish_year": 1997,
        "isbn": "9780439708180",
        "tags": ["fantasy", "magic", "young adult"],
        "owner_index": 1,
    },
]

ORDERS = [
    {
        "owner_index": 0,
        "borrower_index": 1,
        "book_indices": [0],
        "status": "BORROWING",
        "action_type": "borrow",
        "shipping_method": "post",
        "deposit_or_sale_amount": "20.00",
        "service_fee_amount": "2.00",
        "shipping_out_fee_amount": "5.00",
        "total_paid_amount": "27.00",
        "estimated_delivery_time": 3,
        "contact_name": "Bob Smith",
        "phone": "0412345678",
        "street": "12 Hay Street",
        "city": "Perth",
        "postcode": "6000",
        "country": "Australia",
        "notes": "Handle with care",
        "created_days_ago": 5,
        "start_days_ago": 4,
        "due_days_after_start": 14,
    },
    {
        "owner_index": 1,
        "borrower_index": 2,
        "book_indices": [2],
        "status": "COMPLETED",
        "action_type": "purchase",
        "shipping_method": "pickup",
        "deposit_or_sale_amount": "12.00",
        "service_fee_amount": "1.50",
        "shipping_out_fee_amount": None,
        "total_paid_amount": "13.50",
        "estimated_delivery_time": 1,
        "contact_name": "Carol Wang",
        "phone": "0422334455",
        "street": "45 George Street",
        "city": "Sydney",
        "postcode": "2000",
        "country": "Australia",
        "notes": "Completed pickup order",
        "created_days_ago": 10,
        "completed_days_ago": 8,
    },
    {
        "owner_index": 2,
        "borrower_index": 0,
        "book_indices": [4],
        "status": "OVERDUE",
        "action_type": "borrow",
        "shipping_method": "post",
        "deposit_or_sale_amount": "18.00",
        "service_fee_amount": "2.00",
        "shipping_out_fee_amount": "4.00",
        "total_paid_amount": "24.00",
        "estimated_delivery_time": 4,
        "contact_name": "Alice Chen",
        "phone": "0433556677",
        "street": "89 Murray Street",
        "city": "Perth",
        "postcode": "6000",
        "country": "Australia",
        "notes": "Overdue return sample",
        "created_days_ago": 20,
        "start_days_ago": 18,
        "due_days_after_start": 7,
    },
]


def is_database_empty(db) -> bool:
    return (
        db.query(User).count() == 0
        and db.query(Book).count() == 0
        and db.query(Order).count() == 0
    )


def seed(*, force: bool = False):
    db = SessionLocal()
    try:
        if not force and not is_database_empty(db):
            print("Database is not empty. Skipping auto-seed.")
            return

        print("Seeding users...")
        created_users = []
        for u in USERS:
            existing_user = db.query(User).filter(User.email == u["email"]).first()
            if existing_user:
                print(f"  Skipping existing user: {u['email']}")
                created_users.append(existing_user)
                continue

            user = User(
                user_id=u["user_id"],
                name=u["name"],
                email=u["email"],
                password_hash=get_password_hash(u["password"]),
                password_algo="bcrypt",
                location=u["location"],
                first_name=u.get("first_name"),
                last_name=u.get("last_name"),
                country=u.get("country"),
                street_address=u.get("street_address"),
                city=u.get("city"),
                state=u.get("state"),
                zip_code=u.get("zip_code"),
                is_admin=u["is_admin"],
            )
            db.add(user)
            db.flush()
            created_users.append(user)
            print(f"  Created user: {u['email']}")

        print("Seeding books...")
        created_books = []
        for b in BOOKS:
            owner = created_users[b["owner_index"]]
            book = Book(
                id=uid(),
                owner_id=owner.user_id,
                title_or=b["title_or"],
                title_en=b["title_en"],
                original_language=b["original_language"],
                author=b["author"],
                category=b["category"],
                description=b["description"],
                condition=b["condition"],
                status=b["status"],
                can_rent=b["can_rent"],
                can_sell=b["can_sell"],
                deposit=b["deposit"],
                sale_price=b["sale_price"],
                max_lending_days=b["max_lending_days"],
                delivery_method=b["delivery_method"],
                publish_year=b["publish_year"],
                isbn=b["isbn"],
                tags=b["tags"],
            )
            db.add(book)
            db.flush()
            created_books.append(book)
            print(f"  Created book: {b['title_en']}")

        print("Seeding orders...")
        for o in ORDERS:
            owner = created_users[o["owner_index"]]
            borrower = created_users[o["borrower_index"]]

            created_at = datetime.utcnow() - timedelta(days=o["created_days_ago"])
            start_at = None
            due_at = None
            completed_at = None

            if "start_days_ago" in o:
                start_at = datetime.utcnow() - timedelta(days=o["start_days_ago"])

            if start_at and "due_days_after_start" in o:
                due_at = start_at + timedelta(days=o["due_days_after_start"])

            if "completed_days_ago" in o:
                completed_at = datetime.utcnow() - timedelta(days=o["completed_days_ago"])

            order = Order(
                id=uid(),
                owner_id=owner.user_id,
                borrower_id=borrower.user_id,
                status=o["status"],
                action_type=o["action_type"],
                start_at=start_at,
                due_at=due_at,
                completed_at=completed_at,
                created_at=created_at,
                shipping_method=o["shipping_method"],
                deposit_or_sale_amount=o["deposit_or_sale_amount"],
                service_fee_amount=o["service_fee_amount"],
                shipping_out_fee_amount=o["shipping_out_fee_amount"],
                total_paid_amount=o["total_paid_amount"],
                estimated_delivery_time=o["estimated_delivery_time"],
                contact_name=o["contact_name"],
                phone=o["phone"],
                street=o["street"],
                city=o["city"],
                postcode=o["postcode"],
                country=o["country"],
                notes=o["notes"],
            )
            db.add(order)
            db.flush()

            for book_index in o["book_indices"]:
                order_book = OrderBook(
                    order_id=order.id,
                    book_id=created_books[book_index].id,
                )
                db.add(order_book)

            print(f"  Created order: {order.id} ({o['status']})")

        db.commit()

        # --- Seed a CANCELED order with payment + refund for testing ---
        print("Seeding refund demo data...")
        from models.payment_gateway import Payment as PaymentModel, Refund, AuditLog
        from models.payment_split import PaymentSplit

        alice = db.query(User).filter(User.email == "alice@example.com").first()
        bob = db.query(User).filter(User.email == "bob@example.com").first()
        book4 = db.query(Book).filter(Book.title_en == "The Hitchhiker's Guide to the Galaxy").first()

        if alice and bob and book4:
            # Check if refund demo already exists
            existing_refund = db.query(Refund).filter(Refund.refund_id == "re_mock_demo001").first()
            if not existing_refund:
                payment_id = "pi_mock_demo001"
                refund_order_id = uid()
                canceled_time = datetime.utcnow() - timedelta(days=1)
                created_time = canceled_time - timedelta(hours=2)

                # Create Payment
                payment = PaymentModel(
                    payment_id=payment_id,
                    checkout_id="cs_mock_demo001",
                    user_id=alice.user_id,
                    amount=1000,
                    currency="aud",
                    status="refunded",
                    deposit=1000,
                    shipping_fee=0,
                    service_fee=0,
                    created_at=created_time,
                    destination="acct_mock",
                    action_type="BORROW",
                )
                db.add(payment)
                db.flush()

                # Create CANCELED Order
                refund_order = Order(
                    id=refund_order_id,
                    owner_id=bob.user_id,
                    borrower_id=alice.user_id,
                    status="CANCELED",
                    action_type="borrow",
                    created_at=created_time,
                    canceled_at=canceled_time,
                    shipping_method="pickup",
                    deposit_or_sale_amount=10.00,
                    service_fee_amount=0.00,
                    shipping_out_fee_amount=0.00,
                    total_paid_amount=10.00,
                    total_refunded_amount=10.00,
                    payment_id=payment_id,
                    estimated_delivery_time=3,
                    contact_name="Yuan Alice",
                    phone="0414069405",
                    street="555 Wellington St",
                    city="PERTH",
                    postcode="6000",
                    country="Australia",
                )
                db.add(refund_order)
                db.flush()

                # Link book to order
                db.add(OrderBook(order_id=refund_order_id, book_id=book4.id))

                # Create PaymentSplit
                db.add(PaymentSplit(
                    payment_id=payment_id,
                    order_id=refund_order_id,
                    owner_id=bob.user_id,
                    connected_account_id="acct_mock",
                    currency="aud",
                    deposit_cents=1000,
                    shipping_cents=0,
                    service_fee_cents=0,
                    transfer_amount_cents=0,
                ))

                # Create Refund record
                db.add(Refund(
                    refund_id="re_mock_demo001",
                    payment_id=payment_id,
                    amount=1000,
                    currency="aud",
                    status="succeeded",
                    reason="Order cancelled by user",
                    created_at=canceled_time,
                ))

                # Create AuditLog
                db.add(AuditLog(
                    event_type="refund_on_cancel",
                    reference_id=refund_order_id,
                    actor="user",
                    message="User cancelled order, full refund issued",
                    created_at=canceled_time,
                ))

                db.commit()
                print(f"  Created CANCELED order with refund: {refund_order_id}")
            else:
                print("  Refund demo data already exists, skipping.")

        print("\nSeed complete!")
        print("\nTest accounts:")
        for u in USERS:
            role = "ADMIN" if u["is_admin"] else "user"
            print(f"  [{role}] {u['email']}  /  {u['password']}")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    try:
        seed(force="--force" in os.sys.argv)
    except ModuleNotFoundError as exc:
        if exc.name == "dotenv":
            print(
                "Missing dependency: python-dotenv.\n"
                "If you are using Docker, run the seed inside the backend container:\n"
                "  docker exec -it fastapi-backend python seed.py"
            )
        raise