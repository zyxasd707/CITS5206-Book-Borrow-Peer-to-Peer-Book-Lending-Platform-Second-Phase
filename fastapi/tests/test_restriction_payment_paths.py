"""
Tests for the MVP6-1 borrowing-restriction guard at the two enforcement
points BELOW routes/order.py — added so a restricted borrower cannot slip a
borrow through a code path that never passes through `create_order`:

  1. OrderService.create_orders_data_with_validation — the chokepoint that
     every order-creation path funnels through (direct endpoint, Stripe
     webhook, and the webhook fallback).
  2. payment_gateway_service.initiate_payment — the early gate that blocks a
     restricted borrower BEFORE any Stripe PaymentIntent is created, so they
     never reach a "deposit paid but no order" state.

The guard in routes/order.py::create_order itself is covered separately by
test_create_order_restriction.py.

Strategy: both guards run BEFORE the heavy downstream logic, so each test
stubs the first step AFTER the guard (`split_checkout_to_orders` /
`stripe.PaymentIntent.create`). A guard that FIRES raises HTTPException(403)
and the stub is never reached; a guard that PASSES lets execution through to
the stub. This isolates the test to the guard itself.
"""

import pytest
import stripe
from fastapi import HTTPException

from services.order_service import OrderService
from services.payment_gateway_service import initiate_payment


class _ReachedDownstream(Exception):
    """Raised by a stub standing in for logic AFTER the chokepoint guard,
    to prove the guard let execution through."""


class _ReachedStripe(Exception):
    """Raised by a fake stripe.PaymentIntent.create, to prove initiate_payment
    got past the early gate. Deliberately NOT a stripe.error.StripeError, so it
    propagates instead of being swallowed by initiate_payment's except clause."""


# ===========================================================================
# 1. OrderService.create_orders_data_with_validation — chokepoint guard
# ===========================================================================

@pytest.fixture
def stub_split(monkeypatch):
    """Replace split_checkout_to_orders (the first step AFTER the guard) with a
    stub that records calls and aborts, so tests assert purely on the guard."""
    calls = []

    def _stub(checkout, db, user_id):
        calls.append(user_id)
        raise _ReachedDownstream()

    monkeypatch.setattr(OrderService, "split_checkout_to_orders", staticmethod(_stub))
    return calls


def _create_orders(db, checkout, user):
    return OrderService.create_orders_data_with_validation(
        db, checkout.checkout_id, user.user_id, "pi_test_irrelevant",
    )


class TestChokepointGuardFires:
    """Restricted borrower + a borrow item → 403, downstream never reached."""

    def test_restricted_borrow_raises_403(self, db, make_user, make_checkout, stub_split):
        user = make_user(
            is_restricted=True,
            restriction_reason="Auto-restricted: 3 damage strikes, severity score 6.",
        )
        co = make_checkout(user=user, items=[("BORROW",)])

        with pytest.raises(HTTPException) as exc:
            _create_orders(db, co, user)

        assert exc.value.status_code == 403
        assert "3 damage strikes" in exc.value.detail
        assert stub_split == []  # bailed before the downstream pipeline

    def test_null_restriction_reason_uses_generic_message(
        self, db, make_user, make_checkout, stub_split,
    ):
        user = make_user(is_restricted=True, restriction_reason=None)
        co = make_checkout(user=user, items=[("BORROW",)])

        with pytest.raises(HTTPException) as exc:
            _create_orders(db, co, user)

        assert exc.value.status_code == 403
        assert "restricted" in exc.value.detail.lower()
        assert stub_split == []

    def test_mixed_cart_with_one_borrow_still_blocks(
        self, db, make_user, make_checkout, stub_split,
    ):
        """One borrow item among purchases is enough — no bypass via mixed cart."""
        user = make_user(is_restricted=True, restriction_reason="restricted")
        co = make_checkout(user=user, items=[("PURCHASE",), ("BORROW",), ("PURCHASE",)])

        with pytest.raises(HTTPException) as exc:
            _create_orders(db, co, user)

        assert exc.value.status_code == 403
        assert stub_split == []

    def test_lowercase_action_type_still_blocks(
        self, db, make_user, make_checkout, stub_split,
    ):
        """Guard uses func.lower(action_type) — case must not be a bypass."""
        user = make_user(is_restricted=True, restriction_reason="restricted")
        co = make_checkout(user=user, items=[("borrow",)])

        with pytest.raises(HTTPException) as exc:
            _create_orders(db, co, user)

        assert exc.value.status_code == 403
        assert stub_split == []


class TestChokepointGuardPasses:
    """Scenarios that must NOT 403 — execution reaches the downstream stub."""

    def test_unrestricted_user_borrowing_passes(
        self, db, make_user, make_checkout, stub_split,
    ):
        user = make_user(is_restricted=False)
        co = make_checkout(user=user, items=[("BORROW",)])

        with pytest.raises(_ReachedDownstream):
            _create_orders(db, co, user)

        assert stub_split == [user.user_id]  # guard passed, downstream reached

    def test_restricted_user_pure_purchase_passes(
        self, db, make_user, make_checkout, stub_split,
    ):
        """Restriction penalises borrowing, not buying — a restricted user can
        still purchase outright, so the guard must not fire on a pure-purchase
        checkout."""
        user = make_user(is_restricted=True, restriction_reason="restricted")
        co = make_checkout(user=user, items=[("PURCHASE",)])

        with pytest.raises(_ReachedDownstream):
            _create_orders(db, co, user)

        assert stub_split == [user.user_id]


# ===========================================================================
# 2. payment_gateway_service.initiate_payment — early gate (before Stripe)
# ===========================================================================

@pytest.fixture
def no_audit(monkeypatch):
    """initiate_payment is wrapped by @audit, which writes to the audit_logs
    table on both success and failure. Stub log_event so these tests need not
    create that table."""
    monkeypatch.setattr(
        "services.payment_gateway_service.log_event", lambda *a, **k: None,
    )


@pytest.fixture
def stripe_intent_recorder(monkeypatch):
    """Record calls to stripe.PaymentIntent.create. The fake raises
    _ReachedStripe so a PASS test can assert the gate let execution through;
    a BLOCK test asserts the recorder stayed empty (no charge attempted)."""
    calls = []

    def _fake(**kwargs):
        calls.append(kwargs)
        raise _ReachedStripe()

    monkeypatch.setattr(stripe.PaymentIntent, "create", _fake)
    return calls


def _initiate(db, checkout, user):
    return initiate_payment(
        {
            "user_id": user.user_id,
            "checkout_id": checkout.checkout_id,
            "amount": 2000,
            "currency": "aud",
        },
        db=db,
    )


class TestInitiatePaymentGateBlocks:
    """Restricted borrower → 403 raised BEFORE any Stripe PaymentIntent."""

    def test_restricted_borrow_blocked_before_stripe(
        self, db, make_user, make_checkout, no_audit, stripe_intent_recorder,
    ):
        user = make_user(
            is_restricted=True,
            restriction_reason="Auto-restricted: 4 damage strikes.",
        )
        co = make_checkout(user=user, items=[("BORROW",)])

        with pytest.raises(HTTPException) as exc:
            _initiate(db, co, user)

        assert exc.value.status_code == 403
        assert "4 damage strikes" in exc.value.detail
        assert stripe_intent_recorder == []  # no charge was ever attempted

    def test_restricted_mixed_cart_blocked(
        self, db, make_user, make_checkout, no_audit, stripe_intent_recorder,
    ):
        user = make_user(is_restricted=True, restriction_reason="restricted")
        co = make_checkout(user=user, items=[("PURCHASE",), ("borrow",)])

        with pytest.raises(HTTPException) as exc:
            _initiate(db, co, user)

        assert exc.value.status_code == 403
        assert stripe_intent_recorder == []


class TestInitiatePaymentGatePasses:
    """Scenarios that must reach Stripe — the gate does not fire."""

    def test_unrestricted_borrow_reaches_stripe(
        self, db, make_user, make_checkout, no_audit, stripe_intent_recorder,
    ):
        user = make_user(is_restricted=False)
        co = make_checkout(user=user, items=[("BORROW",)])

        with pytest.raises(_ReachedStripe):
            _initiate(db, co, user)

        assert len(stripe_intent_recorder) == 1

    def test_restricted_purchase_only_reaches_stripe(
        self, db, make_user, make_checkout, no_audit, stripe_intent_recorder,
    ):
        """A restricted user buying (not borrowing) must not be gated."""
        user = make_user(is_restricted=True, restriction_reason="restricted")
        co = make_checkout(user=user, items=[("PURCHASE",)])

        with pytest.raises(_ReachedStripe):
            _initiate(db, co, user)

        assert len(stripe_intent_recorder) == 1
