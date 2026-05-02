"""Phase B.4: flag complaints created by the deposit-evidence backfill.

Adds:
  * complaint.migrated_from_deposit_evidence  — BOOLEAN NOT NULL DEFAULT FALSE

The backfill script (fastapi/scripts/backfill_deposit_evidence_to_complaint.py)
sets this to TRUE for every virtual complaint it writes, so the admin UI can
surface a protective banner ("migrated from pre-Phase-B data") and rollback
can target only its own rows without touching legitimate complaints.

Defensive style mirrors 20260502_0003 — reruns on a partially-patched DB are
no-ops; reverse migration drops the column.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text


revision: str = "20260502_0004"
down_revision: Union[str, None] = "20260502_0003"
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
        "complaint",
        "migrated_from_deposit_evidence",
        "ALTER TABLE complaint ADD COLUMN migrated_from_deposit_evidence "
        "BOOLEAN NOT NULL DEFAULT FALSE",
    )


def downgrade() -> None:
    _execute_if_present(
        "complaint",
        "migrated_from_deposit_evidence",
        "ALTER TABLE complaint DROP COLUMN migrated_from_deposit_evidence",
    )
