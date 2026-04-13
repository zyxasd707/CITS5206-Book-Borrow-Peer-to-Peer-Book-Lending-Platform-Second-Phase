"""
Tests for B1 — 3 refund functions in payment_gateway_service.py

Covers 3 refund scenarios:
  1. auto_refund_unshipped_orders  — lender didn't ship within 3 days
  2. auto_cancel_failed_payments   — payment failed, cancel order
  3. refund_on_cancel              — user cancels, immediate refund
"""

import sys
import os
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timedelta

# Ensure fastapi root is on sys.path so imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Helpers to build mock ORM objects
# ---------------------------------------------------------------------------

def _make_order(
    order_id="order-001",
    status="PENDING_SHIPMENT",
    created_at=None,
    tracking_number=None,
    payment_id="pi_test_123",
    books=None,
    total_refunded_amount=None,
):
    order = MagicMock()
    order.id = order_id
    order.status = status
    order.created_at = created_at or (datetime.utcnow() - timedelta(days=5))
    order.shipping_out_tracking_number = tracking_number
    order.payment_id = payment_id
    order.canceled_at = None
    order.total_refunded_amount = total_refunded_amount

    # books relationship — list of OrderBook-like objects
    if books is None:
        book_mock = MagicMock()
        book_mock.book_id = "book-001"
        order.books = [book_mock]
    else:
        order.books = books

    return order


def _make_payment_split(order_id="order-001", payment_id="pi_test_123",
                         deposit_cents=2000, shipping_cents=500):
    sp = MagicMock()
    sp.order_id = order_id
    sp.payment_id = payment_id
    sp.deposit_cents = deposit_cents
    sp.shipping_cents = shipping_cents
    return sp


def _make_payment(payment_id="pi_test_123", status="succeeded", amount=2500):
    p = MagicMock()
    p.payment_id = payment_id
    p.status = status
    p.amount = amount
    return p


def _make_book(book_id="book-001", status="lent"):
    b = MagicMock()
    b.id = book_id
    b.status = status
    return b


def _make_stripe_refund(refund_id="re_test_abc", currency="aud", status="succeeded"):
    r = MagicMock()
    r.id = refund_id
    r.currency = currency
    r.status = status
    return r


def _mock_db_query(db, mapping):
    """
    Configure db.query(...).filter(...).first()/.all() based on a mapping
    from model class -> return value.  Supports chaining.
    """
    original_query = db.query

    def query_side_effect(model):
        q = MagicMock()
        result = mapping.get(model)

        # .filter(...) returns a new chainable mock
        def make_filter(*args, **kwargs):
            fq = MagicMock()
            fq.filter = make_filter  # allow chaining .filter().filter()
            fq.filter_by = make_filter

            if isinstance(result, list):
                fq.all.return_value = result
                fq.first.return_value = result[0] if result else None
            else:
                fq.all.return_value = [result] if result else []
                fq.first.return_value = result

            # scalar support for sa_func queries
            fq.scalar.return_value = result
            return fq

        q.filter = make_filter
        q.filter_by = make_filter
        q.all.return_value = result if isinstance(result, list) else ([result] if result else [])
        q.first.return_value = result[0] if isinstance(result, list) and result else result
        return q

    db.query = MagicMock(side_effect=query_side_effect)


# ===========================================================================
# Test 1: auto_refund_unshipped_orders
# ===========================================================================

class TestAutoRefundUnshippedOrders:
    """B1-1: Orders stuck in PENDING_SHIPMENT > 3 days get auto-refunded."""

    @patch("services.payment_gateway_service.stripe")
    def test_refund_successful(self, mock_stripe):
        """Happy path: order > 3 days old, no tracking → Stripe refund + CANCELED."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.payment_gateway import Refund
        from models.order import Order
        from models.payment_split import PaymentSplit
        from models.book import Book

        order = _make_order(created_at=datetime.utcnow() - timedelta(days=5))
        sp = _make_payment_split()
        book = _make_book(status="lent")

        stripe_refund = _make_stripe_refund()
        mock_stripe.Refund.create.return_value = stripe_refund

        db = MagicMock()
        _mock_db_query(db, {
            Order: [order],
            PaymentSplit: sp,
            Book: book,
        })

        count = auto_refund_unshipped_orders(db)

        assert count == 1
        assert order.status == "CANCELED"
        assert order.canceled_at is not None
        # refund_amount = 2000 + 500 = 2500 cents
        mock_stripe.Refund.create.assert_called_once_with(
            payment_intent="pi_test_123", amount=2500
        )
        db.add.assert_called()  # Refund record added
        db.commit.assert_called()

    @patch("services.payment_gateway_service.stripe")
    def test_no_qualifying_orders(self, mock_stripe):
        """No orders match criteria → 0 refunded, no Stripe calls."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.order import Order

        db = MagicMock()
        _mock_db_query(db, {Order: []})

        count = auto_refund_unshipped_orders(db)

        assert count == 0
        mock_stripe.Refund.create.assert_not_called()

    @patch("services.payment_gateway_service.stripe")
    def test_no_payment_split_skips(self, mock_stripe):
        """Order exists but no PaymentSplit → skipped, not refunded."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.order import Order
        from models.payment_split import PaymentSplit

        order = _make_order()
        db = MagicMock()
        _mock_db_query(db, {Order: [order], PaymentSplit: None})

        count = auto_refund_unshipped_orders(db)

        assert count == 0
        assert order.status == "PENDING_SHIPMENT"  # unchanged

    @patch("services.payment_gateway_service.stripe")
    def test_zero_refund_amount_skips(self, mock_stripe):
        """PaymentSplit with 0 cents → skipped."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.order import Order
        from models.payment_split import PaymentSplit

        order = _make_order()
        sp = _make_payment_split(deposit_cents=0, shipping_cents=0)
        db = MagicMock()
        _mock_db_query(db, {Order: [order], PaymentSplit: sp})

        count = auto_refund_unshipped_orders(db)

        assert count == 0
        mock_stripe.Refund.create.assert_not_called()

    @patch("services.payment_gateway_service.stripe")
    def test_stripe_error_rolls_back(self, mock_stripe):
        """Stripe error → db.rollback() called, count stays 0."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.order import Order
        from models.payment_split import PaymentSplit
        from models.book import Book

        mock_stripe.error = __import__("stripe").error
        mock_stripe.Refund.create.side_effect = (
            __import__("stripe").error.StripeError("Test error")
        )

        order = _make_order()
        sp = _make_payment_split()
        book = _make_book()
        db = MagicMock()
        _mock_db_query(db, {Order: [order], PaymentSplit: sp, Book: book})

        count = auto_refund_unshipped_orders(db)

        assert count == 0
        db.rollback.assert_called()

    @patch("services.payment_gateway_service.stripe")
    def test_book_status_restored_to_listed(self, mock_stripe):
        """After refund, books with status lent/sold/unlisted → listed."""
        from services.payment_gateway_service import auto_refund_unshipped_orders
        from models.order import Order
        from models.payment_split import PaymentSplit
        from models.book import Book

        book = _make_book(status="sold")
        order = _make_order()
        sp = _make_payment_split()
        mock_stripe.Refund.create.return_value = _make_stripe_refund()

        db = MagicMock()
        _mock_db_query(db, {Order: [order], PaymentSplit: sp, Book: book})

        auto_refund_unshipped_orders(db)

        assert book.status == "listed"


# ===========================================================================
# Test 2: auto_cancel_failed_payments
# ===========================================================================

class TestAutoCancelFailedPayments:
    """B1-2: Failed/abandoned payments → orders get CANCELED (no Stripe refund)."""

    def test_cancel_successful(self):
        """Payment failed + order PENDING_PAYMENT → CANCELED, book restored."""
        from services.payment_gateway_service import auto_cancel_failed_payments
        from models.payment_gateway import Payment
        from models.order import Order
        from models.book import Book

        payment = _make_payment(status="failed")
        order = _make_order(status="PENDING_PAYMENT", payment_id="pi_test_123")
        book = _make_book(status="lent")

        db = MagicMock()
        _mock_db_query(db, {Payment: [payment], Order: [order], Book: book})

        count = auto_cancel_failed_payments(db)

        assert count == 1
        assert order.status == "CANCELED"
        assert order.canceled_at is not None
        db.commit.assert_called()

    def test_no_failed_payments(self):
        """No failed payments → 0 canceled."""
        from services.payment_gateway_service import auto_cancel_failed_payments
        from models.payment_gateway import Payment

        db = MagicMock()
        _mock_db_query(db, {Payment: []})

        count = auto_cancel_failed_payments(db)

        assert count == 0

    def test_failed_payment_no_matching_order(self):
        """Payment is failed but no order in PENDING_PAYMENT → 0 canceled."""
        from services.payment_gateway_service import auto_cancel_failed_payments
        from models.payment_gateway import Payment
        from models.order import Order

        payment = _make_payment(status="failed")
        db = MagicMock()
        _mock_db_query(db, {Payment: [payment], Order: []})

        count = auto_cancel_failed_payments(db)

        assert count == 0

    def test_book_restored_on_cancel(self):
        """When order canceled, associated books go back to 'listed'."""
        from services.payment_gateway_service import auto_cancel_failed_payments
        from models.payment_gateway import Payment
        from models.order import Order
        from models.book import Book

        payment = _make_payment(status="requires_payment_method")
        book = _make_book(status="unlisted")
        order = _make_order(status="PENDING_PAYMENT")

        db = MagicMock()
        _mock_db_query(db, {Payment: [payment], Order: [order], Book: book})

        auto_cancel_failed_payments(db)

        assert book.status == "listed"

    def test_exception_rolls_back(self):
        """If an unexpected error occurs, rollback is called."""
        from services.payment_gateway_service import auto_cancel_failed_payments
        from models.payment_gateway import Payment
        from models.order import Order

        payment = _make_payment(status="failed")
        order = _make_order(status="PENDING_PAYMENT")
        # Make commit raise to simulate error
        db = MagicMock()
        _mock_db_query(db, {Payment: [payment], Order: [order]})

        # Force an error inside the loop by making books iteration fail
        order.books = MagicMock(side_effect=TypeError("test"))
        # __iter__ needs to fail
        order.books.__iter__ = MagicMock(side_effect=TypeError("test"))

        count = auto_cancel_failed_payments(db)

        assert count == 0
        db.rollback.assert_called()


# ===========================================================================
# Test 3: refund_on_cancel
# ===========================================================================

class TestRefundOnCancel:
    """B1-3: User cancels → immediate Stripe refund."""

    @patch("services.payment_gateway_service.stripe")
    def test_refund_successful(self, mock_stripe):
        """Happy path: PENDING_SHIPMENT order → refunded + CANCELED."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from models.payment_split import PaymentSplit
        from models.payment_gateway import Payment, Refund
        from sqlalchemy import func as sa_func

        order = _make_order(status="PENDING_SHIPMENT")
        sp = _make_payment_split()
        payment = _make_payment(amount=2500)
        book = _make_book()
        stripe_refund = _make_stripe_refund()
        mock_stripe.Refund.create.return_value = stripe_refund

        db = MagicMock()
        _mock_db_query(db, {
            Order: order,
            PaymentSplit: sp,
            Payment: payment,
        })
        # For the sa_func.sum query (sum of refunds), return the refund amount
        # This is called via db.query(sa_func.coalesce(...))  — we handle it
        # via the generic scalar mock returning 2500

        from models.book import Book
        _mock_db_query(db, {
            Order: order,
            PaymentSplit: sp,
            Payment: payment,
            Book: book,
        })

        result = refund_on_cancel(db, "order-001", actor="user-123")

        assert result["order_id"] == "order-001"
        assert result["refund_id"] == "re_test_abc"
        assert result["amount"] == 2500
        assert order.status == "CANCELED"
        mock_stripe.Refund.create.assert_called_once_with(
            payment_intent="pi_test_123", amount=2500
        )

    @patch("services.payment_gateway_service.stripe")
    def test_order_not_found_raises_404(self, mock_stripe):
        """Non-existent order → HTTPException 404."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from fastapi import HTTPException

        db = MagicMock()
        _mock_db_query(db, {Order: None})

        with pytest.raises(HTTPException) as exc_info:
            refund_on_cancel(db, "nonexistent-order")
        assert exc_info.value.status_code == 404

    @patch("services.payment_gateway_service.stripe")
    def test_wrong_status_raises_400(self, mock_stripe):
        """Order not in PENDING_SHIPMENT → HTTPException 400."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from fastapi import HTTPException

        order = _make_order(status="BORROWING")
        db = MagicMock()
        _mock_db_query(db, {Order: order})

        with pytest.raises(HTTPException) as exc_info:
            refund_on_cancel(db, "order-001")
        assert exc_info.value.status_code == 400
        assert "PENDING_SHIPMENT" in str(exc_info.value.detail)

    @patch("services.payment_gateway_service.stripe")
    def test_no_payment_split_raises_404(self, mock_stripe):
        """Order exists but no PaymentSplit → 404."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from models.payment_split import PaymentSplit
        from fastapi import HTTPException

        order = _make_order(status="PENDING_SHIPMENT")
        db = MagicMock()
        _mock_db_query(db, {Order: order, PaymentSplit: None})

        with pytest.raises(HTTPException) as exc_info:
            refund_on_cancel(db, "order-001")
        assert exc_info.value.status_code == 404

    @patch("services.payment_gateway_service.stripe")
    def test_zero_amount_raises_400(self, mock_stripe):
        """PaymentSplit with 0 refundable amount → 400."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from models.payment_split import PaymentSplit
        from fastapi import HTTPException

        order = _make_order(status="PENDING_SHIPMENT")
        sp = _make_payment_split(deposit_cents=0, shipping_cents=0)
        db = MagicMock()
        _mock_db_query(db, {Order: order, PaymentSplit: sp})

        with pytest.raises(HTTPException) as exc_info:
            refund_on_cancel(db, "order-001")
        assert exc_info.value.status_code == 400

    @patch("services.payment_gateway_service.stripe")
    def test_already_refunded_idempotent(self, mock_stripe):
        """Stripe says 'charge_already_refunded' → still CANCELED, no error."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from models.payment_split import PaymentSplit

        mock_stripe.error = __import__("stripe").error
        mock_stripe.Refund.create.side_effect = (
            __import__("stripe").error.InvalidRequestError(
                message="charge_already_refunded", param=None
            )
        )

        order = _make_order(status="PENDING_SHIPMENT")
        sp = _make_payment_split()
        db = MagicMock()
        _mock_db_query(db, {Order: order, PaymentSplit: sp})

        result = refund_on_cancel(db, "order-001")

        assert result["message"] == "Already refunded"
        assert order.status == "CANCELED"
        db.commit.assert_called()

    @patch("services.payment_gateway_service.stripe")
    def test_stripe_other_error_raises_400(self, mock_stripe):
        """Stripe error other than already_refunded → HTTPException 400."""
        from services.payment_gateway_service import refund_on_cancel
        from models.order import Order
        from models.payment_split import PaymentSplit
        from fastapi import HTTPException

        mock_stripe.error = __import__("stripe").error
        mock_stripe.Refund.create.side_effect = (
            __import__("stripe").error.InvalidRequestError(
                message="Some other Stripe error", param=None
            )
        )

        order = _make_order(status="PENDING_SHIPMENT")
        sp = _make_payment_split()
        db = MagicMock()
        _mock_db_query(db, {Order: order, PaymentSplit: sp})

        with pytest.raises(HTTPException) as exc_info:
            refund_on_cancel(db, "order-001")
        assert exc_info.value.status_code == 400
