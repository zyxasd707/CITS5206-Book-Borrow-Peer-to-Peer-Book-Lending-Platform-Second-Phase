"""Persist the lender deposit-transfer outcome on the audit log.

Adds to deposit_audit_log:
  * transfer_id      — VARCHAR(255) NULL  (Stripe Transfer id, tr_...)
  * transfer_status  — VARCHAR(50)  NULL  (succeeded / failed /
                       skipped_no_account / skipped_zero_amount)

Before this, admin_deduct / admin_forfeit obtained a Stripe transfer id and
returned it in the HTTP response only — it was never persisted, so a
deduction could not be reconciled against Stripe and a silent transfer
failure was invisible.

Defensive style mirrors 20260502_0004 — reruns on a partially-patched DB are
no-ops; the reverse migration drops the columns.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text


revision: str = "20260519_0001"
down_revision: Union[str, None] = "20260502_0004"
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


def upgrade() -> None:
    _execute_if_missing(
        "deposit_audit_log",
        "transfer_id",
        "ALTER TABLE deposit_audit_log ADD COLUMN transfer_id VARCHAR(255) NULL",
    )
    _execute_if_missing(
        "deposit_audit_log",
        "transfer_status",
        "ALTER TABLE deposit_audit_log ADD COLUMN transfer_status VARCHAR(50) NULL",
    )


def downgrade() -> None:
    _execute_if_present(
        "deposit_audit_log",
        "transfer_status",
        "ALTER TABLE deposit_audit_log DROP COLUMN transfer_status",
    )
    _execute_if_present(
        "deposit_audit_log",
        "transfer_id",
        "ALTER TABLE deposit_audit_log DROP COLUMN transfer_id",
    )
