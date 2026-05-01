"""Move Phase 2 runtime schema patches into Alembic.

This migration is intentionally defensive because the VPS database may
already contain columns that were previously added by application startup.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text

revision: str = "20260501_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    bind = op.get_bind()
    columns = inspect(bind).get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def _execute_if_missing(table_name: str, column_name: str, ddl: str) -> None:
    if _column_exists(table_name, column_name):
        return
    op.execute(text(ddl))


def _execute_if_present(table_name: str, column_name: str, ddl: str) -> None:
    if not _column_exists(table_name, column_name):
        return
    op.execute(text(ddl))


def _ensure_deposit_status_enum() -> None:
    ddl = (
        "ALTER TABLE orders MODIFY COLUMN deposit_status "
        "ENUM('held','pending_review','released','partially_deducted','forfeited','refund_ready') "
        "NOT NULL DEFAULT 'held'"
    )
    if not _column_exists("orders", "deposit_status"):
        op.execute(
            text(
                "ALTER TABLE orders ADD COLUMN deposit_status "
                "ENUM('held','pending_review','released','partially_deducted','forfeited','refund_ready') "
                "NOT NULL DEFAULT 'held'"
            )
        )
        return

    existing_type = op.get_bind().execute(
        text(
            "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' "
            "AND COLUMN_NAME = 'deposit_status'"
        )
    ).scalar()
    if existing_type and "refund_ready" in existing_type:
        return
    op.execute(text(ddl))


def upgrade() -> None:
    _execute_if_missing(
        "book",
        "deposit_income_percentage",
        "ALTER TABLE book ADD COLUMN deposit_income_percentage INTEGER NOT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "checkout",
        "owner_income_amount",
        "ALTER TABLE checkout ADD COLUMN owner_income_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
    )
    _execute_if_missing(
        "orders",
        "owner_income_amount",
        "ALTER TABLE orders ADD COLUMN owner_income_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
    )
    _ensure_deposit_status_enum()
    _execute_if_missing(
        "orders",
        "deposit_deducted_cents",
        "ALTER TABLE orders ADD COLUMN deposit_deducted_cents INTEGER NOT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "orders",
        "damage_severity_final",
        "ALTER TABLE orders ADD COLUMN damage_severity_final "
        "ENUM('none','light','medium','severe') NULL",
    )
    _execute_if_missing(
        "users",
        "damage_strike_count",
        "ALTER TABLE users ADD COLUMN damage_strike_count INTEGER NOT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "users",
        "damage_severity_score",
        "ALTER TABLE users ADD COLUMN damage_severity_score INTEGER NOT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "users",
        "is_restricted",
        "ALTER TABLE users ADD COLUMN is_restricted BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _execute_if_missing(
        "users",
        "restriction_reason",
        "ALTER TABLE users ADD COLUMN restriction_reason VARCHAR(255) NULL",
    )
    _execute_if_missing(
        "payments",
        "checkout_id",
        "ALTER TABLE payments ADD COLUMN checkout_id VARCHAR(255) NULL UNIQUE AFTER payment_id",
    )
    _execute_if_missing(
        "payments",
        "purchase",
        "ALTER TABLE payments ADD COLUMN purchase INTEGER NOT NULL DEFAULT 0 AFTER status",
    )


def downgrade() -> None:
    _execute_if_present("payments", "purchase", "ALTER TABLE payments DROP COLUMN purchase")
    _execute_if_present("payments", "checkout_id", "ALTER TABLE payments DROP COLUMN checkout_id")
    _execute_if_present("users", "restriction_reason", "ALTER TABLE users DROP COLUMN restriction_reason")
    _execute_if_present("users", "is_restricted", "ALTER TABLE users DROP COLUMN is_restricted")
    _execute_if_present("users", "damage_severity_score", "ALTER TABLE users DROP COLUMN damage_severity_score")
    _execute_if_present("users", "damage_strike_count", "ALTER TABLE users DROP COLUMN damage_strike_count")
    _execute_if_present("orders", "damage_severity_final", "ALTER TABLE orders DROP COLUMN damage_severity_final")
    _execute_if_present("orders", "deposit_deducted_cents", "ALTER TABLE orders DROP COLUMN deposit_deducted_cents")
    _execute_if_present("orders", "deposit_status", "ALTER TABLE orders DROP COLUMN deposit_status")
    _execute_if_present("orders", "owner_income_amount", "ALTER TABLE orders DROP COLUMN owner_income_amount")
    _execute_if_present("checkout", "owner_income_amount", "ALTER TABLE checkout DROP COLUMN owner_income_amount")
    _execute_if_present("book", "deposit_income_percentage", "ALTER TABLE book DROP COLUMN deposit_income_percentage")
