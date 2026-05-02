"""Phase B.4 backfill — DepositEvidence → virtual Complaint.

The Phase B redesign (BRD v2.4 §10.5/§13.2/§16.2 B-AC5) makes Complaint the
single source of truth for damage arbitration. Pre-Phase-B orders ran the old
flow where the lender's evidence was written directly to deposit_evidence with
no surrounding Complaint row — which means A.4's main arbitration view ("Linked
Arbitration & Refund" section) cannot join those legacy orders to a complaint.

This script writes one virtual Complaint per legacy evidence and back-links
the evidence row, so historical orders render correctly in the new UI without
mutating any deposit/order/refund state.

Usage (run inside the fastapi-backend container):

    python -m scripts.backfill_deposit_evidence_to_complaint --dry-run
    python -m scripts.backfill_deposit_evidence_to_complaint --apply
    python -m scripts.backfill_deposit_evidence_to_complaint --rollback

Guarantees:
  * Idempotent — re-running --apply only writes Complaints for evidences whose
    source_complaint_id is still NULL. If the same order has multiple legacy
    evidences (e.g. lender + borrower counter), the second one reuses the
    Complaint created by the first instead of creating a duplicate.
  * Reversible — --rollback deletes only Complaints with
    migrated_from_deposit_evidence=TRUE and clears the corresponding
    source_complaint_id back to NULL. No other complaint or evidence row is
    touched.
  * No side effects on money state — bypasses ComplaintService.create() so the
    order's deposit_status is NOT advanced (legacy orders already have a
    terminal deposit_status) and admin notifications are NOT fanned out.
  * Preserves history — Complaint.created_at is set to evidence.submitted_at.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

# Allow `python -m scripts.backfill_...` from /app and direct execution.
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
_FASTAPI_ROOT = os.path.dirname(_HERE)
if _FASTAPI_ROOT not in sys.path:
    sys.path.insert(0, _FASTAPI_ROOT)

from database.connection import SessionLocal  # noqa: E402
# Import the full graph SQLAlchemy needs to resolve relationship() string refs
# (Order → Payment → User → ...). Mirrors seed.py's minimum-viable import set.
from models.user import User  # noqa: E402,F401
from models.book import Book  # noqa: E402,F401
from models.order import Order, OrderBook  # noqa: E402,F401
from models.payment_gateway import Payment  # noqa: E402,F401
from models.complaint import Complaint  # noqa: E402
from models.deposit_evidence import DepositEvidence  # noqa: E402


# Map a legacy evidence row to the complaint type a B.1+ flow would have chosen.
_TYPE_BY_ROLE = {
    "lender":   "damage-on-return",   # lender flagged damage on receiving the book back
    "borrower": "damage-on-receipt",  # borrower flagged damage on receiving the book
}

# Map terminal deposit_status to the right complaint status. Active arbitration
# (pending_review) is left as 'investigating' so admin can still act on it.
_STATUS_BY_DEPOSIT = {
    "released":            "resolved",
    "partially_deducted":  "resolved",
    "forfeited":           "resolved",
    "refund_ready":        "resolved",   # admin already decided
    "pending_review":      "investigating",
    "held":                "pending",
}


@dataclass
class _BackfillRow:
    evidence_id: str
    order_id: str
    submitter_role: str
    inferred_type: str
    inferred_status: str
    will_create_complaint: bool   # False when reusing a complaint from an earlier evidence
    reused_complaint_id: Optional[str]
    needs_manual_review: bool
    reason_if_review: Optional[str]


def _plan(db: Session) -> List[_BackfillRow]:
    """Walk the unmigrated evidences in submission order and decide what to do."""
    candidates: List[DepositEvidence] = (
        db.query(DepositEvidence)
        .filter(DepositEvidence.source_complaint_id.is_(None))
        .order_by(DepositEvidence.submitted_at.asc(), DepositEvidence.id.asc())
        .all()
    )

    # Track complaints planned in this run, so two evidences on the same order
    # share one virtual complaint (idempotent within a single --apply pass).
    planned_complaint_by_order: dict[str, str] = {}

    rows: List[_BackfillRow] = []
    for ev in candidates:
        order: Optional[Order] = db.query(Order).filter(Order.id == ev.order_id).first()
        if order is None:
            rows.append(_BackfillRow(
                evidence_id=ev.id, order_id=ev.order_id, submitter_role=ev.submitter_role,
                inferred_type="?", inferred_status="?", will_create_complaint=False,
                reused_complaint_id=None,
                needs_manual_review=True,
                reason_if_review="parent order is missing — cannot infer respondent",
            ))
            continue

        # Reuse a complaint from a prior evidence in this run (defensive — also
        # handles the lender + borrower counter-evidence case).
        existing_in_run = planned_complaint_by_order.get(ev.order_id)
        # Or reuse a complaint from a previous --apply pass (idempotency).
        existing_persisted = (
            db.query(Complaint)
            .filter(
                Complaint.migrated_from_deposit_evidence.is_(True),
                Complaint.linked_arbitration_order_id == ev.order_id,
            )
            .first()
        )
        existing_id = existing_in_run or (existing_persisted.id if existing_persisted else None)

        if existing_id:
            rows.append(_BackfillRow(
                evidence_id=ev.id, order_id=ev.order_id, submitter_role=ev.submitter_role,
                inferred_type="(linked to existing)", inferred_status="(linked to existing)",
                will_create_complaint=False,
                reused_complaint_id=existing_id,
                needs_manual_review=False, reason_if_review=None,
            ))
            continue

        inferred_type = _TYPE_BY_ROLE.get(ev.submitter_role, "damage-on-return")
        inferred_status = _STATUS_BY_DEPOSIT.get(order.deposit_status, "pending")
        # Flag for human review when state is unusual: held + evidence exists
        # means something orphaned the state machine.
        needs_review = order.deposit_status == "held"
        review_reason = (
            "order.deposit_status is 'held' despite evidence existing — "
            "advance to pending_review or resolve manually after backfill"
            if needs_review else None
        )

        new_id = str(uuid.uuid4())
        planned_complaint_by_order[ev.order_id] = new_id
        rows.append(_BackfillRow(
            evidence_id=ev.id, order_id=ev.order_id, submitter_role=ev.submitter_role,
            inferred_type=inferred_type, inferred_status=inferred_status,
            will_create_complaint=True,
            reused_complaint_id=None,
            needs_manual_review=needs_review, reason_if_review=review_reason,
        ))

    return rows


def _print_report(rows: List[_BackfillRow], *, mode: str) -> None:
    creates = sum(1 for r in rows if r.will_create_complaint)
    relinks = sum(1 for r in rows if not r.will_create_complaint and r.reused_complaint_id)
    review  = sum(1 for r in rows if r.needs_manual_review)

    print(f"=== Phase B.4 backfill — {mode} ===")
    print(f"unmigrated deposit_evidence rows: {len(rows)}")
    print(f"  → will create new complaint:   {creates}")
    print(f"  → will relink to existing:     {relinks}")
    print(f"  → flagged for manual review:   {review}")
    if not rows:
        print("(nothing to do)")
        return
    print()
    print(f"{'evidence_id':38} {'order_id':38} {'role':9} {'type':24} {'status':14} action")
    for r in rows:
        action = (
            "CREATE+LINK" if r.will_create_complaint
            else f"RELINK→{r.reused_complaint_id[:8]}…" if r.reused_complaint_id
            else "SKIP (review)"
        )
        review_marker = "  ⚠ " + r.reason_if_review if r.reason_if_review else ""
        print(
            f"{r.evidence_id:38} {r.order_id:38} {r.submitter_role:9} "
            f"{r.inferred_type:24} {r.inferred_status:14} {action}{review_marker}"
        )


def _apply(db: Session, rows: List[_BackfillRow]) -> Tuple[int, int]:
    """Write the planned complaints and update source_complaint_id."""
    created = 0
    relinked = 0

    # Re-fetch evidences and orders we're about to touch so SQLAlchemy session
    # is consistent with the planning step.
    for r in rows:
        ev = db.query(DepositEvidence).filter(DepositEvidence.id == r.evidence_id).first()
        if ev is None or ev.source_complaint_id is not None:
            # Either it's gone or another writer raced us — skip.
            continue

        if r.will_create_complaint:
            order = db.query(Order).filter(Order.id == r.order_id).first()
            if order is None:
                continue
            # complainant = submitter; respondent = the other party on the order.
            if ev.submitter_role == "lender":
                complainant_id = order.owner_id
                respondent_id  = order.borrower_id
            else:
                complainant_id = order.borrower_id
                respondent_id  = order.owner_id

            new_id = str(uuid.uuid4())
            subject = f"[Migrated B.4] Damage report on order {r.order_id[:8]}"
            description_parts = [
                "Synthesized by Phase B.4 backfill from a pre-Phase-B DepositEvidence row.",
                f"Original evidence id: {ev.id}",
                f"Submitter role: {ev.submitter_role}",
                f"Claimed severity: {ev.claimed_severity}",
            ]
            if ev.note:
                description_parts.append(f"Submitter note: {ev.note}")
            description = "\n".join(description_parts)

            complaint = Complaint(
                id=new_id,
                order_id=r.order_id,
                complainant_id=complainant_id,
                respondent_id=respondent_id,
                type=r.inferred_type,
                subject=subject,
                description=description,
                status=r.inferred_status,
                damage_severity=ev.claimed_severity,
                evidence_photos=ev.photos,  # already stored as JSON-array text
                system_generated=True,
                migrated_from_deposit_evidence=True,
                linked_arbitration_order_id=r.order_id,
                auto_action_taken="backfilled_from_deposit_evidence",
            )
            # Preserve the historical timestamp so admin audit trails make sense.
            complaint.created_at = ev.submitted_at
            complaint.updated_at = ev.submitted_at
            db.add(complaint)
            db.flush()  # assign PK so subsequent evidences in same order can reuse
            ev.source_complaint_id = new_id
            db.add(ev)
            created += 1
        elif r.reused_complaint_id:
            ev.source_complaint_id = r.reused_complaint_id
            db.add(ev)
            relinked += 1

    return created, relinked


def _rollback(db: Session) -> Tuple[int, int]:
    """Reverse a previous --apply: delete migrated complaints + clear back-links."""
    migrated = (
        db.query(Complaint)
        .filter(Complaint.migrated_from_deposit_evidence.is_(True))
        .all()
    )
    migrated_ids = [c.id for c in migrated]
    if not migrated_ids:
        return 0, 0

    cleared = (
        db.query(DepositEvidence)
        .filter(DepositEvidence.source_complaint_id.in_(migrated_ids))
        .update({DepositEvidence.source_complaint_id: None}, synchronize_session=False)
    )
    deleted = (
        db.query(Complaint)
        .filter(Complaint.id.in_(migrated_ids))
        .delete(synchronize_session=False)
    )
    return deleted, cleared


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true",
                       help="Print what would happen without writing any rows.")
    group.add_argument("--apply", action="store_true",
                       help="Run the backfill and commit.")
    group.add_argument("--rollback", action="store_true",
                       help="Delete previously-backfilled complaints + clear back-links.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    db = SessionLocal()
    try:
        if args.rollback:
            deleted, cleared = _rollback(db)
            print(f"=== Phase B.4 rollback ===")
            print(f"complaints deleted: {deleted}")
            print(f"deposit_evidence rows whose source_complaint_id was cleared: {cleared}")
            db.commit()
            return 0

        rows = _plan(db)
        _print_report(rows, mode="DRY RUN" if args.dry_run else "APPLY")
        if args.dry_run:
            return 0

        created, relinked = _apply(db, rows)
        db.commit()
        print()
        print(f"committed: {created} new complaint(s), {relinked} evidence row(s) relinked")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
