"""
Integration tests for deposit_service admin arbitration actions (MVP6-1):

  - admin_release      → 100% refund to borrower, severity='none'
  - admin_deduct       → partial refund (light=25% / medium=50% kept by lender)
  - admin_forfeit      → 0% refund, lender keeps full deposit, severity='severe'

These are NOT pure unit tests; they exercise the full code path against a
sqlite-in-memory schema with real ORM rows for User/Order/Payment/Refund/
DepositAuditLog/SystemNotification. Stripe is mocked via `stripe_refund_recorder`
so we can assert the exact `(payment_intent, amount)` it was called with.
"""

import pytest
from fastapi import HTTPException

from services.deposit_service import (
    admin_release,
    admin_deduct,
    admin_forfeit,
    DEDUCTION_PCT,
)
from models.deposit_audit_log import DepositAuditLog
from models.payment_gateway import Refund, Payment
from models.system_notification import SystemNotification


# ---------------------------------------------------------------------------
# Test scaffolding helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def lender(make_user):
    return make_user(name="Lender Linda")


@pytest.fixture
def borrower_for_arbitration(make_user):
    """Borrower user dedicated to arbitration tests (clean strike state)."""
    return make_user(name="Bob Borrower")


@pytest.fixture
def admin_actor(make_user):
    return make_user(name="Admin Alice", is_admin=True)


def _audit_logs_for(db, order_id, action=None):
    q = db.query(DepositAuditLog).filter(DepositAuditLog.order_id == order_id)
    if action:
        q = q.filter(DepositAuditLog.action == action)
    return q.all()


def _notifs_for(db, user_id):
    return (
        db.query(SystemNotification)
        .filter(SystemNotification.user_id == user_id)
        .order_by(SystemNotification.title)
        .all()
    )


# ===========================================================================
# admin_release
# ===========================================================================

class TestAdminRelease:
    def test_happy_path_refunds_full_deposit(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        stripe_refund_recorder,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_cents=2000)
        order_id = order.id
        payment_id = order.payment_id

        result = admin_release(db, order_id, admin_actor, note="Looks fine")

        # Stripe was called once with the full deposit amount
        assert len(stripe_refund_recorder) == 1
        assert stripe_refund_recorder[0]["payment_intent"] == payment_id
        assert stripe_refund_recorder[0]["amount"] == 2000

        # Order state mutated
        db.refresh(order)
        assert order.deposit_status == "released"
        assert order.deposit_deducted_cents == 0
        assert order.damage_severity_final == "none"

        # Refund row persisted
        refunds = db.query(Refund).filter(Refund.payment_id == payment_id).all()
        assert len(refunds) == 1
        assert refunds[0].amount == 2000
        assert refunds[0].status == "succeeded"

        # Payment marked refunded (full refund == payment.amount)
        payment = db.query(Payment).filter(Payment.payment_id == payment_id).first()
        assert payment.status == "refunded"

        # Audit log: 1 release entry, no restrict entry
        logs = _audit_logs_for(db, order_id)
        assert len(logs) == 1
        assert logs[0].action == "release"
        assert logs[0].final_severity == "none"
        assert logs[0].amount_cents == 2000
        assert logs[0].note == "Looks fine"

        # Both parties notified (DEPOSIT_UPDATED)
        lender_notifs = _notifs_for(db, lender.user_id)
        borrower_notifs = _notifs_for(db, borrower_for_arbitration.user_id)
        assert len(lender_notifs) == 1
        assert len(borrower_notifs) == 1
        assert lender_notifs[0].type == "DEPOSIT_UPDATED"
        assert borrower_notifs[0].type == "DEPOSIT_UPDATED"

        # Borrower NOT struck (release means no fault)
        db.refresh(borrower_for_arbitration)
        assert borrower_for_arbitration.damage_strike_count == 0
        assert borrower_for_arbitration.damage_severity_score == 0
        assert borrower_for_arbitration.is_restricted is False

        # Return value shape
        assert result["order_id"] == order_id
        assert result["deposit_status"] == "released"
        assert result["refunded_cents"] == 2000

    def test_404_when_order_not_found(self, db, admin_actor, deposit_arbitration_schema):
        with pytest.raises(HTTPException) as exc:
            admin_release(db, "nonexistent-order-id", admin_actor)
        assert exc.value.status_code == 404

    def test_409_when_not_pending_review(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_status="released")
        with pytest.raises(HTTPException) as exc:
            admin_release(db, order.id, admin_actor)
        assert exc.value.status_code == 409
        assert "pending_review" in str(exc.value.detail)

    def test_skips_stripe_when_no_payment_id(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        stripe_refund_recorder,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           with_payment=False)

        # Snapshot Refund count before the call so we can assert no NEW refund
        # was created (rather than asserting the global count is 0 — which is
        # fragile across tests sharing an in-memory sqlite engine; see the
        # tech-debt note in conftest about sqlite + SAVEPOINT isolation).
        refunds_before = db.query(Refund).count()

        result = admin_release(db, order.id, admin_actor)

        # Stripe never called
        assert stripe_refund_recorder == []
        # No NEW Refund row was created by this call
        assert db.query(Refund).count() == refunds_before
        # Order still moved to released (operationally complete)
        db.refresh(order)
        assert order.deposit_status == "released"
        assert result["refunded_cents"] == 0


# ===========================================================================
# admin_deduct
# ===========================================================================

class TestAdminDeduct:
    def test_light_deducts_25pct(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        stripe_refund_recorder,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_cents=2000)

        result = admin_deduct(db, order.id, admin_actor, severity="light")

        # 25% kept (500), 75% refunded (1500)
        assert stripe_refund_recorder[0]["amount"] == 1500
        db.refresh(order)
        assert order.deposit_status == "partially_deducted"
        assert order.deposit_deducted_cents == 500
        assert order.damage_severity_final == "light"
        assert result["deducted_cents"] == 500
        assert result["refunded_cents"] == 1500

        # Strike applied (light = +1 count, +1 score)
        db.refresh(borrower_for_arbitration)
        assert borrower_for_arbitration.damage_strike_count == 1
        assert borrower_for_arbitration.damage_severity_score == 1
        # Below restrict thresholds — nothing escalated
        assert borrower_for_arbitration.is_restricted is False
        assert result["strike"]["restrict_applied"] is False
        assert result["strike"]["suggest_ban"] is False
        assert result["strike"]["auto_ban"] is False

    def test_medium_deducts_50pct(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        stripe_refund_recorder,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_cents=2000)

        admin_deduct(db, order.id, admin_actor, severity="medium")

        assert stripe_refund_recorder[0]["amount"] == 1000  # 50% refunded
        db.refresh(order)
        assert order.deposit_deducted_cents == 1000
        assert order.damage_severity_final == "medium"

        db.refresh(borrower_for_arbitration)
        assert borrower_for_arbitration.damage_severity_score == 2  # medium weight

    def test_third_deduct_triggers_restrict_and_audit(
        self, db, make_order, lender, admin_actor, make_user, stripe_refund_recorder,
    ):
        """
        Three consecutive light deducts on the same borrower must:
          - bump strike_count to 3
          - flip is_restricted=True
          - produce a 'restrict' audit log entry on top of the 'partial_deduct' one
          - return restrict_applied=True in the strike signal
        """
        borrower = make_user(name="Repeat Offender")
        # Three separate orders so each can be in pending_review independently
        o1 = make_order(owner=lender, borrower=borrower)
        o2 = make_order(owner=lender, borrower=borrower)
        o3 = make_order(owner=lender, borrower=borrower)

        admin_deduct(db, o1.id, admin_actor, severity="light")
        admin_deduct(db, o2.id, admin_actor, severity="light")
        result = admin_deduct(db, o3.id, admin_actor, severity="light")

        # Stripe must have been called once per deduct — guards against any
        # short-circuit that would skip the partial refund call yet still
        # bump the strike counter.
        assert len(stripe_refund_recorder) == 3

        db.refresh(borrower)
        assert borrower.damage_strike_count == 3
        assert borrower.is_restricted is True
        assert result["strike"]["restrict_applied"] is True

        # Third order's audit log has BOTH partial_deduct and restrict entries
        o3_logs = _audit_logs_for(db, o3.id)
        actions = sorted(log.action for log in o3_logs)
        assert actions == ["partial_deduct", "restrict"]

    def test_severe_severity_rejected_with_400(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration)
        with pytest.raises(HTTPException) as exc:
            admin_deduct(db, order.id, admin_actor, severity="severe")
        assert exc.value.status_code == 400
        assert "light" in str(exc.value.detail) and "medium" in str(exc.value.detail)

    def test_unknown_severity_rejected_with_400(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration)
        with pytest.raises(HTTPException) as exc:
            admin_deduct(db, order.id, admin_actor, severity="catastrophic")
        assert exc.value.status_code == 400

    def test_404_when_borrower_missing(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        deposit_arbitration_schema,
    ):
        """
        Guards a defensive code path that is unreachable in production with
        FK enforcement — MySQL would reject the borrower_id update before
        admin_deduct even runs. sqlite (no FK enforcement by default) lets
        us reach the `if not borrower: raise 404` branch so the line is at
        least exercised. Keep the test as a regression guard, not as proof
        that prod can hit this path.
        """
        order = make_order(owner=lender, borrower=borrower_for_arbitration)
        order.borrower_id = "ghost-user-id"
        db.flush()

        with pytest.raises(HTTPException) as exc:
            admin_deduct(db, order.id, admin_actor, severity="light")
        assert exc.value.status_code == 404
        assert "Borrower" in str(exc.value.detail)

    def test_deduction_pct_matches_locked_spec(self):
        """Spec lock — teacher 2026-04-19: light=25%, medium=50%, severe=100%."""
        assert DEDUCTION_PCT == {"light": 25, "medium": 50, "severe": 100}


# ===========================================================================
# admin_forfeit
# ===========================================================================

class TestAdminForfeit:
    def test_happy_path_keeps_full_deposit(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
        stripe_refund_recorder,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_cents=2000)

        result = admin_forfeit(db, order.id, admin_actor, note="No return")

        # Stripe NEVER called (no refund — lender keeps everything)
        assert stripe_refund_recorder == []

        db.refresh(order)
        assert order.deposit_status == "forfeited"
        assert order.deposit_deducted_cents == 2000
        assert order.damage_severity_final == "severe"

        assert result["deducted_cents"] == 2000
        assert result["refunded_cents"] == 0

        # Strike applied with severe weight
        db.refresh(borrower_for_arbitration)
        assert borrower_for_arbitration.damage_strike_count == 1
        assert borrower_for_arbitration.damage_severity_score == 3
        # 1 strike, score=3 — below restrict threshold; suggest_ban=True (severe)
        assert result["strike"]["restrict_applied"] is False
        assert result["strike"]["suggest_ban"] is True

        # Audit log
        logs = _audit_logs_for(db, order.id)
        assert len(logs) == 1
        assert logs[0].action == "forfeit"
        assert logs[0].final_severity == "severe"
        assert logs[0].amount_cents == 2000
        assert logs[0].note == "No return"

    def test_forfeit_can_trigger_restrict(
        self, db, make_order, lender, admin_actor, make_user, stripe_refund_recorder,
    ):
        """Borrower already at score 5: one severe forfeit (+3) -> score 8 >= 6 -> restrict."""
        borrower = make_user(damage_strike_count=2, damage_severity_score=5)
        order = make_order(owner=lender, borrower=borrower)

        result = admin_forfeit(db, order.id, admin_actor)

        db.refresh(borrower)
        assert borrower.is_restricted is True
        assert result["strike"]["restrict_applied"] is True

        # Audit log includes restrict entry alongside forfeit
        logs = _audit_logs_for(db, order.id)
        actions = sorted(log.action for log in logs)
        assert actions == ["forfeit", "restrict"]

    def test_409_when_not_pending_review(
        self, db, make_order, lender, borrower_for_arbitration, admin_actor,
    ):
        order = make_order(owner=lender, borrower=borrower_for_arbitration,
                           deposit_status="forfeited")
        with pytest.raises(HTTPException) as exc:
            admin_forfeit(db, order.id, admin_actor)
        assert exc.value.status_code == 409
