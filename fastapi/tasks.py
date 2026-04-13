"""
tasks.py - Background tasks for order status updates and automated refunds

This module defines scheduled jobs to:
- Update order statuses (PENDING_SHIPMENT → BORROWING, BORROWING → OVERDUE, etc.)
- Auto refund orders where lender never shipped (every hour)
- Auto cancel orders with failed payments (every 24 hours)

Usage:
    from task import start_scheduler, stop_scheduler

    # Start scheduler when FastAPI app starts
    start_scheduler()

    # Stop scheduler when FastAPI app shuts down
    stop_scheduler()
"""

from apscheduler.schedulers.background import BackgroundScheduler
from services.order_service import OrderService
from core.dependencies import get_db

scheduler = BackgroundScheduler()

def update_order_statuses():
    """hourly check and update order status"""
    db = next(get_db())
    try:
        borrowing_count = OrderService.update_borrowing_status(db)
        overdue_count = OrderService.update_overdue_status(db)
        completed_count = OrderService.update_completed_status(db)
        print(f"Updated {borrowing_count} orders to BORROWING, {overdue_count} to OVERDUE, {completed_count} to COMPLETED")
    finally:
        db.close()


def refund_unshipped_orders():
    """Hourly: auto refund orders where lender did not ship within 3 days."""
    from services.payment_gateway_service import auto_refund_unshipped_orders

    db = next(get_db())
    try:
        count = auto_refund_unshipped_orders(db)
        if count:
            print(f"[scheduler] Auto refunded {count} unshipped orders")
    finally:
        db.close()


def cancel_failed_payments():
    """Daily: auto cancel orders whose payments failed or were abandoned."""
    from services.payment_gateway_service import auto_cancel_failed_payments

    db = next(get_db())
    try:
        count = auto_cancel_failed_payments(db)
        if count:
            print(f"[scheduler] Auto canceled {count} orders with failed payments")
    finally:
        db.close()


def start_scheduler():
    """Start the scheduled task scheduler"""
    # Run once on startup
    update_order_statuses()

    # Existing: order status transitions (every hour)
    scheduler.add_job(update_order_statuses, 'interval', hours=1, id="order_status_job")

    # MVP6: auto refund unshipped orders (every hour)
    scheduler.add_job(refund_unshipped_orders, 'interval', hours=1, id="refund_unshipped_job")

    # MVP6: auto cancel failed payments (every 24 hours)
    scheduler.add_job(cancel_failed_payments, 'interval', hours=24, id="cancel_failed_payments_job")

    scheduler.start()
    print("Order status scheduler started (with MVP6 refund jobs)")

def stop_scheduler():
    """Stop the scheduled task scheduler"""
    scheduler.shutdown()
    print("Order status scheduler stopped")