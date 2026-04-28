"""
Tests for the MVP6-1 `is_restricted` guard in routes/order.py::create_order.

Spec (locked): a borrower whose `is_restricted=True` cannot start any new
borrow flow. The check fires when the linked checkout has at least one
CheckoutItem with action_type='borrow' (case-insensitive). Pure-purchase
checkouts pass through to the normal order-creation pipeline.

These tests exercise the route via FastAPI TestClient with `get_db` and
`get_current_user` overridden, and `OrderService.create_orders_data_with_validation`
mocked — the goal is to verify the GUARD's behaviour, not the downstream
order-creation logic (which has its own broader concerns).
"""

import pytest
from types import SimpleNamespace


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CREATE_ORDER_URL = "/api/v1/orders/"


@pytest.fixture
def regular_user(make_user):
    return make_user(name="Alice Allowed", is_restricted=False)


@pytest.fixture
def restricted_user(make_user):
    return make_user(
        name="Restricted Bob",
        is_restricted=True,
        restriction_reason="Auto-restricted: 3 damage strikes, severity score 4.",
    )


@pytest.fixture
def stub_create_orders(monkeypatch):
    """
    Replace OrderService.create_orders_data_with_validation with a no-op stub
    that returns a single SimpleNamespace order. This isolates the guard test
    from the full order-creation pipeline (Stripe, books, payment splits, etc).

    Returns the call list so tests can assert whether the service was reached.
    """
    from services.order_service import OrderService

    calls = []

    def _stub(db, *, checkout_id, user_id, payment_id):
        calls.append({"checkout_id": checkout_id, "user_id": user_id,
                      "payment_id": payment_id})
        return [SimpleNamespace(id=f"order-{len(calls)}")]

    monkeypatch.setattr(
        OrderService,
        "create_orders_data_with_validation",
        staticmethod(_stub),
    )
    return calls


# ===========================================================================
# Guard FIRES: restricted user attempting to borrow → 403
# ===========================================================================

class TestRestrictedBorrowBlocked:
    def test_pure_borrow_checkout_returns_403(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        co = make_checkout(user=restricted_user, items=[("BORROW",)])
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_irrelevant",
        })

        assert res.status_code == 403
        # Downstream service was NOT reached
        assert stub_create_orders == []

    def test_403_detail_carries_restriction_reason(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        """
        The user-facing error should explain WHY they're blocked. Production
        code reads `current_user.restriction_reason`; verify it's surfaced.
        """
        co = make_checkout(user=restricted_user, items=[("BORROW",)])
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_irrelevant",
        })

        assert res.status_code == 403
        assert "3 damage strikes" in res.json()["detail"]

    def test_403_detail_falls_back_when_reason_is_null(
        self, client, auth_as, make_user, make_checkout, stub_create_orders,
    ):
        """If restriction_reason is somehow NULL, a generic message is used."""
        user = make_user(is_restricted=True, restriction_reason=None)
        co = make_checkout(user=user, items=[("BORROW",)])
        auth_as(user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_irrelevant",
        })

        assert res.status_code == 403
        assert "restricted" in res.json()["detail"].lower()

    def test_mixed_borrow_and_purchase_still_blocks(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        """
        Even ONE borrow item in a multi-item cart triggers the guard. The
        user can't bypass restriction by adding a purchase to the cart.
        """
        co = make_checkout(
            user=restricted_user,
            items=[("PURCHASE",), ("BORROW",), ("PURCHASE",)],
        )
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_irrelevant",
        })

        assert res.status_code == 403
        assert stub_create_orders == []

    def test_lowercase_action_type_also_blocked(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        """
        Production filter uses `func.lower(action_type) == "borrow"` for
        case-insensitive matching — guard against any future regression that
        replaces this with a strict-case comparison.
        """
        co = make_checkout(user=restricted_user, items=[("borrow",)])
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_irrelevant",
        })

        assert res.status_code == 403
        assert stub_create_orders == []


# ===========================================================================
# Guard PASSES: scenarios that should NOT 403
# ===========================================================================

class TestGuardPasses:
    def test_unrestricted_user_borrowing_passes(
        self, client, auth_as, regular_user, make_checkout, stub_create_orders,
    ):
        co = make_checkout(user=regular_user, items=[("BORROW",)])
        auth_as(regular_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_xyz",
        })

        assert res.status_code == 201
        assert len(stub_create_orders) == 1
        # Service was called with the correct checkout & user
        assert stub_create_orders[0]["checkout_id"] == co.checkout_id
        assert stub_create_orders[0]["user_id"] == regular_user.user_id

    def test_restricted_user_pure_purchase_passes(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        """
        Spec: deposit policy penalises borrowing behaviour, not buying.
        A restricted user can still buy a book outright.
        """
        co = make_checkout(user=restricted_user, items=[("PURCHASE",)])
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_xyz",
        })

        assert res.status_code == 201
        assert len(stub_create_orders) == 1

    def test_restricted_user_mixed_purchases_only_passes(
        self, client, auth_as, restricted_user, make_checkout, stub_create_orders,
    ):
        """Multi-item, all PURCHASE — guard does not fire."""
        co = make_checkout(
            user=restricted_user,
            items=[("PURCHASE",), ("PURCHASE",), ("PURCHASE",)],
        )
        auth_as(restricted_user)

        res = client.post(CREATE_ORDER_URL, json={
            "checkout_id": co.checkout_id,
            "payment_id": "pi_test_xyz",
        })

        assert res.status_code == 201
        assert len(stub_create_orders) == 1
