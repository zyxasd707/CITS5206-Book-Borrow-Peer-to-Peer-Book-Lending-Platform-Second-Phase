"""Phase B.1: link Complaint to deposit arbitration + system_generated flag.

Adds:
  * complaint.linked_arbitration_order_id  — VARCHAR(36) NULL
  * complaint.auto_action_taken            — VARCHAR(32) NULL
  * complaint.system_generated             — BOOLEAN NOT NULL DEFAULT FALSE
  * deposit_evidence.source_complaint_id   — VARCHAR(36) NULL
  * complaint.type ENUM += 'damage-on-return'

Defensive style (matches 20260501_0001) so reruns on a partially-patched
database are no-ops. Reverse migration drops the columns and rebuilds the
original ENUM.
"""

import re
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text

revision: str = "20260502_0002"
down_revision: Union[str, None] = "20260501_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ORIGINAL_COMPLAINT_TYPES = (
    "book-condition",
    "delivery",
    "user-behavior",
    "other",
    "overdue",
)
_B1_COMPLAINT_TYPES = _ORIGINAL_COMPLAINT_TYPES + ("damage-on-return",)


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
        "complaint",
        "linked_arbitration_order_id",
        "ALTER TABLE complaint ADD COLUMN linked_arbitration_order_id VARCHAR(36) NULL",
    )
    _execute_if_missing(
        "complaint",
        "auto_action_taken",
        "ALTER TABLE complaint ADD COLUMN auto_action_taken VARCHAR(32) NULL",
    )
    _execute_if_missing(
        "complaint",
        "system_generated",
        "ALTER TABLE complaint ADD COLUMN system_generated BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _execute_if_missing(
        "deposit_evidence",
        "source_complaint_id",
        "ALTER TABLE deposit_evidence ADD COLUMN source_complaint_id VARCHAR(36) NULL",
    )
    _ensure_complaint_type_enum(_B1_COMPLAINT_TYPES)


def downgrade() -> None:
    # Restore original enum first so any rows using 'damage-on-return' fail
    # loudly during rollback (intentional — we never want silent data loss).
    _ensure_complaint_type_enum(_ORIGINAL_COMPLAINT_TYPES)
    _execute_if_present(
        "deposit_evidence",
        "source_complaint_id",
        "ALTER TABLE deposit_evidence DROP COLUMN source_complaint_id",
    )
    _execute_if_present(
        "complaint",
        "system_generated",
        "ALTER TABLE complaint DROP COLUMN system_generated",
    )
    _execute_if_present(
        "complaint",
        "auto_action_taken",
        "ALTER TABLE complaint DROP COLUMN auto_action_taken",
    )
    _execute_if_present(
        "complaint",
        "linked_arbitration_order_id",
        "ALTER TABLE complaint DROP COLUMN linked_arbitration_order_id",
    )
