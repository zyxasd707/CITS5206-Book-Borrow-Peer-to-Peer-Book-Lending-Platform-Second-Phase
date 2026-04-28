"""
Tests for MVP6 Phase 3 admin refund endpoints (routes/payment_gateway.py):

  - GET  /api/v1/payment_gateway/refunds/admin               (list with KPI/pagination)
  - POST /api/v1/payment_gateway/refunds/admin/{rid}/retry   (retry failed refund)
  - POST /api/v1/payment_gateway/refunds/admin/manual        (admin-issued refund)

Goals:
  - Verify the admin auth gate fires for non-admin users.
  - Verify retry endpoint state guard (only 'failed' status).
  - Verify manual endpoint validates order/split existence and refund amount caps.
  - Verify the audit-log side effect on retry/manual.

Heavy pieces (the list endpoint's enrichment with book titles, dispute
join, trigger inference) are NOT covered here — that's a lot of cross-table
plumbing for low test value. We do confirm the endpoint responds and
returns the KPI shape.
"""

import pytest


LIST_URL = "/api/v1/payment_gateway/refunds/admin"
RETRY_URL = "/api/v1/payment_gateway/refunds/admin/{refund_id}/retry"
MANUAL_URL = "/api/v1/payment_gateway/refunds/admin/manual"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(make_user):
    return make_user(name="Admin Alice", is_admin=True)


@pytest.fixture
def regular_user(make_user):
    return make_user(name="Carl Customer", is_admin=False)


@pytest.fixture
def lender(make_user):
    return make_user(name="Lender Linda")


@pytest.fixture
def borrower(make_user):
    return make_user(name="Borrower Bob")


# ===========================================================================
# Admin auth gate
# ===========================================================================

class TestAdminAuthGate:
    def test_non_admin_user_gets_403_on_list(
        self, client, auth_as, regular_user, admin_refund_schema,
    ):
        auth_as(regular_user)
        res = client.get(LIST_URL)
        assert res.status_code == 403
        assert "Admin" in res.json()["detail"]

    def test_admin_user_passes_auth_gate(
        self, client, auth_as, admin_user, admin_refund_schema,
    ):
        auth_as(admin_user)
        res = client.get(LIST_URL)
        # Auth passed even if no data — endpoint returns 200 with empty list
        assert res.status_code == 200


# ===========================================================================
# GET /refunds/admin — light coverage
# ===========================================================================

class TestAdminRefundList:
    def test_response_has_kpi_pagination_and_refunds_keys(
        self, client, auth_as, admin_user, admin_refund_schema,
    ):
        auth_as(admin_user)
        res = client.get(LIST_URL)

        assert res.status_code == 200
        body = res.json()
        # Top-level shape contract — frontend depends on these keys
        assert set(body.keys()) >= {"kpi", "pagination", "refunds"}
        assert set(body["kpi"].keys()) >= {
            "total_count", "total_amount", "succeeded_count",
            "failed_count", "pending_count", "success_rate",
        }
        assert set(body["pagination"].keys()) >= {
            "page", "page_size", "total", "total_pages",
        }

    def test_kpi_counts_reflect_my_added_refunds(
        self, client, auth_as, admin_user, make_refund, admin_refund_schema,
    ):
        """
        Add a known set of refunds and verify the KPI counts went UP by at
        least that many. Uses delta-style assertions because the in-memory
        sqlite engine carries leftover Refund rows from other tests
        (see feedback_test_isolation memory).
        """
        auth_as(admin_user)
        before = client.get(LIST_URL).json()["kpi"]

        # Three refunds: 2 succeeded + 1 failed
        make_refund(payment_id="pi_kpi_1", status="succeeded", amount=1000)
        make_refund(payment_id="pi_kpi_2", status="succeeded", amount=2000)
        make_refund(payment_id="pi_kpi_3", status="failed", amount=500)

        after = client.get(LIST_URL).json()["kpi"]

        assert after["total_count"] - before["total_count"] >= 3
        assert after["succeeded_count"] - before["succeeded_count"] >= 2
        assert after["failed_count"] - before["failed_count"] >= 1
        assert after["total_amount"] - before["total_amount"] >= 3500


# ===========================================================================
# POST /refunds/admin/{refund_id}/retry
# ===========================================================================

class TestAdminRefundRetry:
    def test_404_when_refund_not_found(
        self, client, auth_as, admin_user, admin_refund_schema,
    ):
        auth_as(admin_user)
        res = client.post(RETRY_URL.format(refund_id="re_does_not_exist"))
        assert res.status_code == 404

    def test_400_when_refund_status_not_failed(
        self, client, auth_as, admin_user, make_refund,
    ):
        """Retry is only valid for 'failed' refunds — succeeded/pending should reject."""
        refund = make_refund(payment_id="pi_succeeded", status="succeeded")
        auth_as(admin_user)

        res = client.post(RETRY_URL.format(refund_id=refund.refund_id))
        assert res.status_code == 400
        assert "failed" in res.json()["detail"].lower()

    def test_happy_path_retries_failed_refund(
        self, client, auth_as, admin_user, make_refund, stripe_refund_recorder, db,
    ):
        """
        A failed refund + retry → Stripe.Refund.create called once, refund_id
        replaced with new id, an admin_retry_refund audit log row written.
        """
        from models.payment_gateway import Refund, AuditLog

        refund = make_refund(
            payment_id="pi_retry",
            status="failed",
            amount=1500,
            reason="Original failure",
        )
        old_refund_id = refund.refund_id

        auth_as(admin_user)
        res = client.post(RETRY_URL.format(refund_id=old_refund_id))

        assert res.status_code == 200
        body = res.json()
        assert body["old_refund_id"] == old_refund_id
        assert body["new_refund_id"] != old_refund_id
        assert body["amount"] == 1500
        assert body["status"] == "succeeded"

        # Stripe was hit once with the failed refund's payment_id and amount
        assert len(stripe_refund_recorder) == 1
        call = stripe_refund_recorder[0]
        assert call["payment_intent"] == "pi_retry"
        assert call["amount"] == 1500

        # Refund row is updated with new Stripe id (NOT a new row)
        db.expire_all()  # invalidate cached objects so we re-read from DB
        refresh_refund = (
            db.query(Refund)
            .filter(Refund.refund_id == body["new_refund_id"])
            .first()
        )
        assert refresh_refund is not None
        assert refresh_refund.amount == 1500

        # Audit log written
        log = (
            db.query(AuditLog)
            .filter(
                AuditLog.event_type == "admin_retry_refund",
                AuditLog.actor == admin_user.user_id,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert old_refund_id in log.message
        assert body["new_refund_id"] in log.message


# ===========================================================================
# POST /refunds/admin/manual
# ===========================================================================

class TestAdminManualRefund:
    def test_404_when_order_not_found(
        self, client, auth_as, admin_user, admin_refund_schema,
    ):
        auth_as(admin_user)
        res = client.post(MANUAL_URL, json={
            "order_id": "ghost-order-id",
            "refund_type": "full",
            "reason": "test",
        })
        assert res.status_code == 404
        assert "Order" in res.json()["detail"]

    def test_404_when_payment_split_missing(
        self, client, auth_as, admin_user, make_order, lender, borrower,
    ):
        """Order exists but no PaymentSplit → 404 referencing payment split."""
        order = make_order(owner=lender, borrower=borrower)
        auth_as(admin_user)

        res = client.post(MANUAL_URL, json={
            "order_id": order.id,
            "refund_type": "full",
            "reason": "test",
        })
        assert res.status_code == 404
        assert "Payment split" in res.json()["detail"]

    def test_happy_path_full_refund(
        self, client, auth_as, admin_user, make_order, make_payment_split,
        lender, borrower, stripe_refund_recorder, db,
    ):
        """
        Full refund: Stripe gets called with deposit + shipping cents,
        Refund row persisted, audit log written, borrower notified.
        """
        from models.payment_gateway import Refund, AuditLog
        from models.system_notification import SystemNotification

        order = make_order(owner=lender, borrower=borrower, deposit_cents=2000)
        make_payment_split(
            order_id=order.id, payment_id=order.payment_id,
            deposit_cents=2000, shipping_cents=500,
        )
        auth_as(admin_user)

        res = client.post(MANUAL_URL, json={
            "order_id": order.id,
            "refund_type": "full",
            "reason": "Customer goodwill",
        })

        assert res.status_code == 201
        # Stripe called with deposit + shipping = 2500
        assert len(stripe_refund_recorder) == 1
        assert stripe_refund_recorder[0]["amount"] == 2500

        # Refund row persisted with the right amount
        refund_rows = db.query(Refund).filter(
            Refund.payment_id == order.payment_id,
            Refund.amount == 2500,
        ).all()
        assert len(refund_rows) >= 1

        # Audit log: manual_refund event tied to this admin + order, message
        # carries the type and amount so an auditor can reconstruct the call.
        log = (
            db.query(AuditLog)
            .filter(
                AuditLog.event_type == "manual_refund",
                AuditLog.actor == admin_user.user_id,
                AuditLog.reference_id == order.id,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert "full" in log.message
        assert "2500" in log.message
        assert "Customer goodwill" in log.message

        # Borrower received a REFUND notification scoped to this order
        borrower_notifs = (
            db.query(SystemNotification)
            .filter(
                SystemNotification.user_id == borrower.user_id,
                SystemNotification.order_id == order.id,
                SystemNotification.type == "REFUND",
            )
            .all()
        )
        assert len(borrower_notifs) == 1
        assert "25.00" in borrower_notifs[0].message  # ${amount/100:.2f}

    def test_deposit_only_refund_amount(
        self, client, auth_as, admin_user, make_order, make_payment_split,
        lender, borrower, stripe_refund_recorder,
    ):
        """refund_type='deposit' refunds ONLY deposit_cents, ignoring shipping."""
        order = make_order(owner=lender, borrower=borrower)
        make_payment_split(
            order_id=order.id, payment_id=order.payment_id,
            deposit_cents=3000, shipping_cents=700,
        )
        auth_as(admin_user)

        res = client.post(MANUAL_URL, json={
            "order_id": order.id,
            "refund_type": "deposit",
            "reason": "Deposit only",
        })

        assert res.status_code == 201
        assert stripe_refund_recorder[0]["amount"] == 3000

    def test_400_when_refund_amount_zero(
        self, client, auth_as, admin_user, make_order, make_payment_split,
        lender, borrower, stripe_refund_recorder,
    ):
        """Splits with zero shipping → shipping refund is 0 → 400 'No refundable amount'."""
        order = make_order(owner=lender, borrower=borrower)
        make_payment_split(
            order_id=order.id, payment_id=order.payment_id,
            deposit_cents=2000, shipping_cents=0,
        )
        auth_as(admin_user)

        res = client.post(MANUAL_URL, json={
            "order_id": order.id,
            "refund_type": "shipping",
            "reason": "Refund shipping",
        })

        assert res.status_code == 400
        assert "No refundable amount" in res.json()["detail"]
        # Stripe was never called
        assert stripe_refund_recorder == []

    def test_400_when_refund_would_exceed_payment_amount(
        self, client, auth_as, admin_user, make_order, make_payment_split,
        make_refund, lender, borrower, stripe_refund_recorder,
    ):
        """
        If the order's payment was already fully refunded, attempting another
        full refund should be rejected with 400.
        """
        order = make_order(owner=lender, borrower=borrower, deposit_cents=2000)
        make_payment_split(
            order_id=order.id, payment_id=order.payment_id,
            deposit_cents=2000, shipping_cents=0,
        )
        # Pre-existing succeeded refund of the full amount
        make_refund(payment_id=order.payment_id, status="succeeded", amount=2000)

        auth_as(admin_user)
        res = client.post(MANUAL_URL, json={
            "order_id": order.id,
            "refund_type": "full",
            "reason": "Double refund attempt",
        })

        assert res.status_code == 400
        assert "exceed" in res.json()["detail"].lower()
        # No NEW Stripe call
        assert stripe_refund_recorder == []
