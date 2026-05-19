"""
Tests for persisting the lender deposit-transfer outcome.

Before this change, admin_deduct / admin_forfeit obtained a Stripe transfer id
and returned it in the HTTP response only -- it was never persisted, so a
deduction could not be reconciled against Stripe and a silent transfer failure
was invisible. Two pieces are covered here:

  1. _stripe_transfer_to_lender -- now returns {'id', 'status'} with a status
     of succeeded / failed / skipped_no_account / skipped_zero_amount.
  2. admin_deduct / admin_forfeit -- write that id + status onto the
     DepositAuditLog row for the deduction / forfeit.
"""

import uuid
from types import SimpleNamespace

import pytest
import stripe

from services import deposit_service
from services.deposit_service import admin_deduct, admin_forfeit
from models.deposit_audit_log import DepositAuditLog


# ===========================================================================
# 1. _stripe_transfer_to_lender -- return shape
# ===========================================================================

def _fake_order(*, stripe_account_id="acct_lender", payment_id=None):
    """Minimal duck-typed order -- _stripe_transfer_to_lender only touches
    .owner(.stripe_account_id), .owner_id and .payment_id."""
    return SimpleNamespace(
        owner=SimpleNamespace(stripe_account_id=stripe_account_id),
        owner_id="user-lender",
        payment_id=payment_id,
    )


class TestStripeTransferToLenderResult:
    def test_success_returns_id_and_succeeded(self, monkeypatch):
        monkeypatch.setattr(stripe.Transfer, "create",
                            lambda **kw: SimpleNamespace(id="tr_ok"))

        result = deposit_service._stripe_transfer_to_lender(_fake_order(), 500)

        assert result == {"id": "tr_ok", "status": "succeeded"}

    def test_stripe_error_returns_failed(self, monkeypatch):
        """A Stripe outage must surface as status='failed', not a silent None."""
        def _boom(**kw):
            raise stripe.error.StripeError("simulated Stripe outage")

        monkeypatch.setattr(stripe.Transfer, "create", _boom)

        result = deposit_service._stripe_transfer_to_lender(_fake_order(), 500)

        assert result == {"id": None, "status": "failed"}

    def test_no_connected_account_returns_skipped(self):
        """Lender never onboarded Stripe -- distinct status, not 'failed'."""
        result = deposit_service._stripe_transfer_to_lender(
            _fake_order(stripe_account_id=None), 500,
        )

        assert result == {"id": None, "status": "skipped_no_account"}

    def test_zero_amount_returns_skipped(self):
        result = deposit_service._stripe_transfer_to_lender(_fake_order(), 0)

        assert result == {"id": None, "status": "skipped_zero_amount"}


# ===========================================================================
# 2. admin_deduct / admin_forfeit -- persist the transfer onto the audit log
# ===========================================================================

@pytest.fixture
def fake_transfer(monkeypatch):
    """Mock stripe.Transfer.create to a deterministic success."""
    monkeypatch.setattr(stripe.Transfer, "create",
                        lambda **kw: SimpleNamespace(id="tr_integration"))


def _audit_row(db, order_id, action):
    return (
        db.query(DepositAuditLog)
        .filter(DepositAuditLog.order_id == order_id,
                DepositAuditLog.action == action)
        .first()
    )


class TestAdminDeductPersistsTransfer:
    def test_deduct_records_succeeded_transfer(
        self, db, make_order, make_user, fake_transfer,
    ):
        # users.stripe_account_id is UNIQUE; uuid-suffix it so the integration
        # tests don't collide under sqlite + SAVEPOINT isolation leakage.
        lender = make_user(name="Lender",
                           stripe_account_id=f"acct_{uuid.uuid4().hex[:12]}")
        borrower = make_user(name="Borrower")
        admin = make_user(name="Admin", is_admin=True)
        # with_payment=False -> no Stripe PaymentIntent.retrieve inside the transfer
        order = make_order(owner=lender, borrower=borrower, with_payment=False)

        result = admin_deduct(db, order.id, admin, severity="light")

        log = _audit_row(db, order.id, "partial_deduct")
        assert log is not None
        assert log.transfer_id == "tr_integration"
        assert log.transfer_status == "succeeded"
        assert result["lender_transfer_id"] == "tr_integration"
        assert result["lender_transfer_status"] == "succeeded"

    def test_deduct_records_skipped_when_lender_has_no_account(
        self, db, make_order, make_user,
    ):
        """Realistic current-production case: lender never onboarded Stripe.
        The deduction is still recorded -- with an honest skipped status, not
        a silent None that hides the un-transferred money."""
        lender = make_user(name="Lender No Stripe")  # no stripe_account_id
        borrower = make_user(name="Borrower")
        admin = make_user(name="Admin", is_admin=True)
        order = make_order(owner=lender, borrower=borrower, with_payment=False)

        admin_deduct(db, order.id, admin, severity="light")

        log = _audit_row(db, order.id, "partial_deduct")
        assert log is not None
        assert log.transfer_id is None
        assert log.transfer_status == "skipped_no_account"


class TestAdminForfeitPersistsTransfer:
    def test_forfeit_records_succeeded_transfer(
        self, db, make_order, make_user, fake_transfer,
    ):
        # users.stripe_account_id is UNIQUE; uuid-suffix it so the integration
        # tests don't collide under sqlite + SAVEPOINT isolation leakage.
        lender = make_user(name="Lender",
                           stripe_account_id=f"acct_{uuid.uuid4().hex[:12]}")
        borrower = make_user(name="Borrower")
        admin = make_user(name="Admin", is_admin=True)
        order = make_order(owner=lender, borrower=borrower, with_payment=False)

        result = admin_forfeit(db, order.id, admin)

        log = _audit_row(db, order.id, "forfeit")
        assert log is not None
        assert log.transfer_id == "tr_integration"
        assert log.transfer_status == "succeeded"
        assert result["lender_transfer_status"] == "succeeded"
