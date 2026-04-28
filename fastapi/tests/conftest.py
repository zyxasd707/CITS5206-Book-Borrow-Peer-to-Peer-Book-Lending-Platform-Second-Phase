"""
Pytest fixtures for FastAPI backend tests.

Strategy:
- sqlite in-memory engine with StaticPool so the in-memory DB persists across
  connections within a single process.
- Per-test transactional isolation: each test gets a fresh session bound to a
  rolled-back transaction, so tests cannot leak state into each other.
- Tables are created lazily — fixtures only require the tables they touch.
  Models that use MySQL-specific types (e.g. JSON) are NOT imported globally;
  integration-level fixtures opt them in explicitly.
"""

import os
import sys
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# Ensure `fastapi/` is importable as the package root for `from models...`,
# `from services...`, etc., regardless of where pytest is invoked from.
_FASTAPI_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _FASTAPI_ROOT not in sys.path:
    sys.path.insert(0, _FASTAPI_ROOT)


# ---------------------------------------------------------------------------
# Engine / Session factory (session-scoped — built once per pytest run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def engine():
    """Single in-memory sqlite engine shared across the test session."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def TestingSessionLocal(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---------------------------------------------------------------------------
# Schema fixtures — opt in only the tables you need.
# ---------------------------------------------------------------------------

def _import_all_models():
    """
    Import every models module so SQLAlchemy can resolve string-based
    relationships during mapper configuration (e.g. OrderBook -> 'Book').

    Importing a module only registers the mapper class; it does NOT create
    the table. This lets us include models whose columns use MySQL-specific
    types (e.g. dialects.mysql.JSON in book/complaint/deposit_evidence)
    without forcing those tables onto sqlite.
    """
    from models import (  # noqa: F401  (imports for side effects only)
        admin_setting,
        ban,
        blacklist,
        book,
        cart,
        checkout,
        complaint,
        deposit_audit_log,
        deposit_evidence,
        mail,
        message,
        order,
        payment_gateway,
        payment_split,
        review,
        service_fee,
        system_notification,
        user,
    )


@pytest.fixture(scope="session")
def deposit_strike_schema(engine):
    """
    Minimal schema for deposit-strike unit tests:
      - users
      - system_notifications
    All other model classes are imported (so SQLAlchemy can resolve
    relationships) but their tables are not created.
    """
    _import_all_models()
    from models.user import User
    from models.system_notification import SystemNotification

    User.__table__.create(bind=engine, checkfirst=True)
    SystemNotification.__table__.create(bind=engine, checkfirst=True)
    yield
    # Don't drop — engine teardown handles it. Dropping here would force every
    # subsequent fixture to recreate tables unnecessarily.


@pytest.fixture(scope="session")
def deposit_arbitration_schema(deposit_strike_schema, engine):
    """
    Extended schema for deposit_service admin_release/deduct/forfeit tests.

    Adds (in addition to deposit_strike_schema):
      - orders, payments, refunds, deposit_audit_log

    Note: order_books / disputes tables are intentionally NOT created — the
    arbitration code path doesn't insert into them. Skipping them lets us
    avoid pulling in the Book model's mysql.JSON columns.
    """
    from models.order import Order
    from models.payment_gateway import Payment, Refund
    from models.deposit_audit_log import DepositAuditLog

    Payment.__table__.create(bind=engine, checkfirst=True)
    Order.__table__.create(bind=engine, checkfirst=True)
    Refund.__table__.create(bind=engine, checkfirst=True)
    DepositAuditLog.__table__.create(bind=engine, checkfirst=True)
    yield


# ---------------------------------------------------------------------------
# Per-test session with transaction rollback isolation
# ---------------------------------------------------------------------------

@pytest.fixture
def db(engine, TestingSessionLocal):
    """
    Per-test SQLAlchemy session with transactional isolation.

    Each test runs inside an outer transaction that is rolled back at teardown,
    so commits inside the code under test are confined to this transaction and
    do not bleed into other tests.

    NOTE: `db.commit()` inside service code will commit the inner SAVEPOINT,
    not the outer transaction. The session is configured with
    `join_transaction_mode="create_savepoint"` (SQLAlchemy 2.0+) to support this.

    SCHEMA WARNING: This fixture creates NO tables on its own. Tests that
    query/insert into models must additionally depend on a schema fixture
    (e.g. `deposit_strike_schema`) — either directly, or transitively via a
    user fixture (`borrower` / `admin` / `make_user`) that already declares
    the schema dependency.

    Example::

        def test_something(db, deposit_strike_schema):  # explicit
            ...

        def test_something_else(borrower):              # transitive (preferred)
            # `borrower` depends on `db` and `deposit_strike_schema`
            ...
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


# ---------------------------------------------------------------------------
# Convenience user fixtures — assume `deposit_strike_schema` is in scope.
# ---------------------------------------------------------------------------

def _make_user(db, **overrides):
    """Create a User with sensible test defaults; override any field via kwargs."""
    from models.user import User

    defaults = dict(
        user_id=overrides.pop("user_id", f"user-{uuid.uuid4().hex[:8]}"),
        email=overrides.pop("email", f"u{uuid.uuid4().hex[:6]}@test.com"),
        password_hash="not-a-real-hash",
        name="Test User",
        is_admin=False,
        damage_strike_count=0,
        damage_severity_score=0,
        is_restricted=False,
    )
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def borrower(deposit_strike_schema, db):
    """Clean borrower with zero strikes / score, not restricted.

    Schema fixture is listed first to signal that the `users` table must
    exist before `db` is used to insert.
    """
    return _make_user(db, name="Bob Borrower")


@pytest.fixture
def admin(deposit_strike_schema, db):
    return _make_user(db, name="Admin", is_admin=True)


@pytest.fixture
def make_user(deposit_strike_schema, db):
    """Factory for tests that need multiple users with custom strike state."""
    def _factory(**overrides):
        return _make_user(db, **overrides)
    return _factory


# ---------------------------------------------------------------------------
# Phase 4: Arbitration fixtures (orders, payments, Stripe mock)
# ---------------------------------------------------------------------------

def _make_payment(db, **overrides):
    """Create a Payment with sensible defaults (deposit-only)."""
    from models.payment_gateway import Payment

    pid = overrides.pop("payment_id", f"pi_test_{uuid.uuid4().hex[:10]}")
    defaults = dict(
        payment_id=pid,
        checkout_id=overrides.pop("checkout_id", f"cs_test_{uuid.uuid4().hex[:10]}"),
        user_id="borrower-x",
        amount=2000,            # cents
        currency="aud",
        status="succeeded",
        deposit=2000,           # cents — what _deposit_cents returns
        purchase=0,
        shipping_fee=0,
        service_fee=0,
        action_type="BORROW",
        destination="destination",
    )
    defaults.update(overrides)
    p = Payment(**defaults)
    db.add(p)
    db.flush()
    return p


def _make_order(db, *, owner, borrower, payment=None, **overrides):
    """Create an Order with deposit_status='pending_review' by default."""
    from models.order import Order

    defaults = dict(
        owner_id=owner.user_id,
        borrower_id=borrower.user_id,
        status="BORROWING",
        action_type="borrow",
        shipping_method="post",
        deposit_or_sale_amount=20.00,   # dollars — fallback if payment is None
        owner_income_amount=0.00,
        service_fee_amount=0.00,
        total_paid_amount=20.00,
        deposit_status="pending_review",
        deposit_deducted_cents=0,
        contact_name="Bob Borrower",
        street="1 Test St",
        city="Perth",
        postcode="6000",
        country="Australia",
        payment_id=payment.payment_id if payment else None,
    )
    defaults.update(overrides)
    o = Order(**defaults)
    db.add(o)
    db.flush()
    return o


@pytest.fixture
def make_order(deposit_arbitration_schema, db):
    """
    Factory: create an Order in pending_review.

    By default the order has a paid Payment row linked. Pass `with_payment=False`
    to create an Order with `payment_id=None` — used to test code paths that
    skip Stripe when there's no payment to refund against.

    Usage:
        order = make_order(borrower=b, owner=o)                    # paid
        order = make_order(borrower=b, owner=o, deposit_cents=5000) # paid, custom amount
        order = make_order(borrower=b, owner=o, with_payment=False) # no payment
    """
    def _factory(*, owner, borrower, deposit_cents=2000, with_payment=True,
                 **order_overrides):
        payment = None
        if with_payment:
            payment = _make_payment(db, deposit=deposit_cents, amount=deposit_cents,
                                    user_id=borrower.user_id)
        return _make_order(db, owner=owner, borrower=borrower, payment=payment,
                           **order_overrides)
    return _factory


@pytest.fixture(scope="session")
def admin_refund_schema(deposit_arbitration_schema, engine):
    """
    Schema for MVP6 Phase 3 admin refund endpoint tests (Phase 6).

    Adds (in addition to deposit_arbitration_schema):
      - payment_splits — needed by manual refund / list / detail endpoints
      - audit_logs     — written by retry & manual endpoints
    """
    from models.payment_split import PaymentSplit
    from models.payment_gateway import AuditLog

    PaymentSplit.__table__.create(bind=engine, checkfirst=True)
    AuditLog.__table__.create(bind=engine, checkfirst=True)
    yield


@pytest.fixture(scope="session")
def restriction_guard_schema(deposit_strike_schema, engine):
    """
    Schema for create_order is_restricted guard tests (Phase 5).

    Adds checkout + checkout_item tables. These models live on a SEPARATE
    declarative_base in `models/checkout.py`, so they aren't picked up by
    `models.base.Base.metadata`. We create them table-by-table.
    """
    from models.checkout import Checkout, CheckoutItem

    Checkout.__table__.create(bind=engine, checkfirst=True)
    CheckoutItem.__table__.create(bind=engine, checkfirst=True)
    yield


def _make_checkout(db, user, **overrides):
    """Create a Checkout row for `user`."""
    from models.checkout import Checkout

    defaults = dict(
        checkout_id=overrides.pop("checkout_id", f"co-{uuid.uuid4().hex[:8]}"),
        user_id=user.user_id,
        contact_name="Bob Borrower",
        phone="0400-000-000",
        street="1 Test St",
        city="Perth",
        postcode="6000",
        country="Australia",
        status="PENDING",
    )
    defaults.update(overrides)
    co = Checkout(**defaults)
    db.add(co)
    db.flush()
    return co


def _make_checkout_item(db, checkout, *, action_type="BORROW", **overrides):
    """Create one CheckoutItem on a checkout."""
    from models.checkout import CheckoutItem

    defaults = dict(
        item_id=overrides.pop("item_id", f"ci-{uuid.uuid4().hex[:8]}"),
        checkout_id=checkout.checkout_id,
        book_id=overrides.pop("book_id", f"book-{uuid.uuid4().hex[:8]}"),
        owner_id=overrides.pop("owner_id", "owner-x"),
        action_type=action_type,
    )
    defaults.update(overrides)
    item = CheckoutItem(**defaults)
    db.add(item)
    db.flush()
    return item


@pytest.fixture
def make_checkout(restriction_guard_schema, db):
    """
    Factory: create a Checkout with N items.

    Usage:
        co = make_checkout(user=user, items=[("BORROW",), ("PURCHASE",)])
        co = make_checkout(user=user, items=[("borrow",)])    # lowercase ok
    """
    def _factory(*, user, items=(("BORROW",),), **checkout_overrides):
        co = _make_checkout(db, user, **checkout_overrides)
        for spec in items:
            action_type = spec[0] if spec else "BORROW"
            _make_checkout_item(db, co, action_type=action_type)
        return co
    return _factory


# ---------------------------------------------------------------------------
# FastAPI TestClient + dependency overrides (Phase 5+)
# ---------------------------------------------------------------------------

@pytest.fixture
def client(db):
    """
    A FastAPI TestClient with `get_db` overridden to use the per-test session.

    `get_current_user` is NOT overridden by default — endpoints that require
    auth will 401 until the test calls the `auth_as` helper.

    Lifespan is NOT executed (TestClient with no `with` context skips it),
    so production startup hooks like seed_sample_data and the scheduler
    don't fire during tests.
    """
    from main import app
    from core.dependencies import get_db
    from fastapi.testclient import TestClient

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def auth_as():
    """
    Helper to install/override the `get_current_user` dependency.

    Usage:
        def test_x(client, auth_as, some_user):
            auth_as(some_user)
            res = client.post(...)
    """
    from main import app
    from core.dependencies import get_current_user

    def _set(user):
        app.dependency_overrides[get_current_user] = lambda: user
    return _set


# ---------------------------------------------------------------------------
# Phase 6: Admin refund endpoint helpers
# ---------------------------------------------------------------------------

def _make_payment_split(db, *, order_id, payment_id, **overrides):
    from models.payment_split import PaymentSplit
    from models.payment_gateway import Payment

    defaults = dict(
        order_id=order_id,
        payment_id=payment_id,
        owner_id=overrides.pop("owner_id", "owner-x"),
        connected_account_id=overrides.pop("connected_account_id", "acct_test"),
        currency="aud",
        deposit_cents=2000,
        shipping_cents=500,
        service_fee_cents=0,
        transfer_amount_cents=0,
    )
    defaults.update(overrides)
    sp = PaymentSplit(**defaults)
    db.add(sp)

    # Sync the linked Payment.amount to the split totals. Production semantics:
    # Payment.amount = full Stripe charge = deposit + shipping + service_fee.
    # If we leave Payment.amount untouched (2000 cents from `_make_payment`)
    # while the split says 2000+500=2500, the refund-cap check inside
    # /refunds/admin/manual will reject any "full" refund as "would exceed
    # original payment amount" — which is a fixture bug, not a test target.
    payment = db.query(Payment).filter(Payment.payment_id == payment_id).first()
    if payment:
        payment.amount = (
            int(sp.deposit_cents or 0)
            + int(sp.shipping_cents or 0)
            + int(sp.service_fee_cents or 0)
        )

    db.flush()
    return sp


def _make_refund(db, *, payment_id, status="succeeded", amount=2000, **overrides):
    from models.payment_gateway import Refund
    defaults = dict(
        refund_id=overrides.pop("refund_id", f"re_test_{uuid.uuid4().hex[:10]}"),
        payment_id=payment_id,
        amount=amount,
        currency="aud",
        status=status,
        reason=overrides.pop("reason", "Test refund"),
    )
    defaults.update(overrides)
    r = Refund(**defaults)
    db.add(r)
    db.flush()
    return r


@pytest.fixture
def make_payment_split(admin_refund_schema, db):
    """Factory: create a PaymentSplit row for a given (order_id, payment_id)."""
    def _factory(*, order_id, payment_id, **overrides):
        return _make_payment_split(db, order_id=order_id, payment_id=payment_id, **overrides)
    return _factory


@pytest.fixture
def make_refund(admin_refund_schema, db):
    """Factory: create a Refund row directly (for retry/list tests)."""
    def _factory(*, payment_id, status="succeeded", amount=2000, **overrides):
        return _make_refund(db, payment_id=payment_id, status=status, amount=amount, **overrides)
    return _factory


@pytest.fixture
def stripe_refund_recorder(monkeypatch):
    """
    Patch `stripe.Refund.create` to a recording fake.

    Returns a list that gets one entry per call:
        [{"payment_intent": "pi_...", "amount": 1500, "currency": "aud",
          "id": "re_test_1", "status": "succeeded"}, ...]

    The fake always succeeds with a deterministic refund id so tests can
    assert on call shape without coupling to Stripe error handling. For
    failure-path coverage, override `stripe.Refund.create` again inside
    the test with `monkeypatch.setattr(...)`.
    """
    from types import SimpleNamespace
    import stripe

    calls = []

    def _fake_create(payment_intent, amount, **kwargs):
        # Use uuid to make refund_id globally unique — defensive against any
        # test data that survives rollback (sqlite + savepoints can be quirky)
        # and against the same fixture being reused across nested calls.
        record = {
            "payment_intent": payment_intent,
            "amount": amount,
            "id": f"re_test_{uuid.uuid4().hex[:10]}",
            "currency": "aud",
            "status": "succeeded",
            **kwargs,
        }
        calls.append(record)
        return SimpleNamespace(**record)

    monkeypatch.setattr(stripe.Refund, "create", _fake_create)
    return calls
