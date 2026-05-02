"""Phase B.2: arbitration rental decision (Q4=B) + complaint type expansion.

Adds:
  * orders.rental_deducted_cents              — INT NULL DEFAULT 0
  * deposit_audit_log.rental_refunded_cents   — INT NULL DEFAULT 0
  * complaint.linked_refund_id                — VARCHAR(255) NULL
  * refunds.source                            — VARCHAR(32) NULL
  * refunds.source_complaint_id               — VARCHAR(36) NULL
  * complaint.type ENUM expansion (BRD §13.2 — eight new values; one-shot
    so the next Phase B step does not need a follow-up enum migration).

Defensive style mirrors 20260502_0002 so reruns on a partially-patched DB
are no-ops. Reverse migration drops the columns and rebuilds the previous
B.1 enum value set.
"""

import re
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text


revision: str = "20260502_0003"
down_revision: Union[str, None] = "20260502_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_B1_COMPLAINT_TYPES = (
    "book-condition",
    "delivery",
    "user-behavior",
    "other",
    "overdue",
    "damage-on-return",
)
_B2_COMPLAINT_TYPES = _B1_COMPLAINT_TYPES + (
    "damage-on-receipt",
    "rental-defect",
    "no-return",
    "lender-no-ship",
    "package-lost",
    "wrong-item",
    "object-clean-return",
    "lender-reverse",
)


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


def _ensure_complaint_type_enum(desired: Sequence[str]) -> None:
    if not _column_exists("complaint", "type"):
        return
    existing_type = op.get_bind().execute(
        text(
            "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaint' "
            "AND COLUMN_NAME = 'type'"
        )
    ).scalar() or ""
    existing_values = set(re.findall(r"'([^']+)'", existing_type))
    if existing_values == set(desired):
        return
    enum_literal = ",".join(f"'{v}'" for v in desired)
    op.execute(text(f"ALTER TABLE complaint MODIFY COLUMN type ENUM({enum_literal}) NOT NULL"))


def upgrade() -> None:
    _execute_if_missing(
        "orders",
        "rental_deducted_cents",
        "ALTER TABLE orders ADD COLUMN rental_deducted_cents INT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "deposit_audit_log",
        "rental_refunded_cents",
        "ALTER TABLE deposit_audit_log ADD COLUMN rental_refunded_cents INT NULL DEFAULT 0",
    )
    _execute_if_missing(
        "complaint",
        "linked_refund_id",
        "ALTER TABLE complaint ADD COLUMN linked_refund_id VARCHAR(255) NULL",
    )
    _execute_if_missing(
        "refunds",
        "source",
        "ALTER TABLE refunds ADD COLUMN source VARCHAR(32) NULL",
    )
    _execute_if_missing(
        "refunds",
        "source_complaint_id",
        "ALTER TABLE refunds ADD COLUMN source_complaint_id VARCHAR(36) NULL",
    )
    _ensure_complaint_type_enum(_B2_COMPLAINT_TYPES)


def downgrade() -> None:
    # Restore the B.1 enum first so any rows using B.2-only types fail loudly
    # during rollback (intentional — silent data loss is worse than rollback
    # error during recovery).
    _ensure_complaint_type_enum(_B1_COMPLAINT_TYPES)
    _execute_if_present(
        "refunds",
        "source_complaint_id",
        "ALTER TABLE refunds DROP COLUMN source_complaint_id",
    )
    _execute_if_present(
        "refunds",
        "source",
        "ALTER TABLE refunds DROP COLUMN source",
    )
    _execute_if_present(
        "complaint",
        "linked_refund_id",
        "ALTER TABLE complaint DROP COLUMN linked_refund_id",
    )
    _execute_if_present(
        "deposit_audit_log",
        "rental_refunded_cents",
        "ALTER TABLE deposit_audit_log DROP COLUMN rental_refunded_cents",
    )
    _execute_if_present(
        "orders",
        "rental_deducted_cents",
        "ALTER TABLE orders DROP COLUMN rental_deducted_cents",
    )
