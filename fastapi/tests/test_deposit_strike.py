"""
Unit tests for `deposit_service._apply_strike` (MVP6-1).

What this function does (paraphrased from services/deposit_service.py:109):
  - Increments the borrower's damage_strike_count by 1.
  - Increments damage_severity_score by STRIKE_WEIGHTS[severity]
    (light=1, medium=2, severe=3).
  - If the borrower isn't already restricted AND
        strike_count >= 3 OR severity_score >= 6
    → flips is_restricted=True, sets restriction_reason, fires a
      USER_RESTRICTED notification (commit=False), and returns
      restrict_applied=True.
  - suggest_ban := (severity == 'severe')
  - auto_ban    := (severity_score >= 10)

Tests focus on the boundary conditions because that is where requirements
were locked by the teacher (2026-04-19 spec). All NotificationService side
effects are exercised against a real sqlite-in-memory DB to catch shape
regressions.
"""

from services.deposit_service import (
    _apply_strike,
    AUTO_RESTRICT_STRIKE_THRESHOLD,
    AUTO_RESTRICT_SCORE_THRESHOLD,
    AUTO_BAN_SCORE_THRESHOLD,
    STRIKE_WEIGHTS,
)
from models.system_notification import SystemNotification


# ---------------------------------------------------------------------------
# Counter increment + return shape
# ---------------------------------------------------------------------------

class TestStrikeCounters:
    def test_light_increments_count_by_1_and_score_by_1(self, db, borrower):
        result = _apply_strike(db, borrower, "light")

        assert borrower.damage_strike_count == 1
        assert borrower.damage_severity_score == 1
        assert result["strike_count"] == 1
        assert result["severity_score"] == 1

    def test_medium_increments_count_by_1_and_score_by_2(self, db, borrower):
        result = _apply_strike(db, borrower, "medium")

        assert borrower.damage_strike_count == 1
        assert borrower.damage_severity_score == 2
        assert result["severity_score"] == 2

    def test_severe_increments_count_by_1_and_score_by_3(self, db, borrower):
        result = _apply_strike(db, borrower, "severe")

        assert borrower.damage_strike_count == 1
        assert borrower.damage_severity_score == 3
        assert result["severity_score"] == 3

    def test_unknown_severity_increments_count_but_not_score(self, db, borrower):
        """STRIKE_WEIGHTS.get() returns 0 for unknown — defensive default."""
        result = _apply_strike(db, borrower, "unknown_tier")

        assert borrower.damage_strike_count == 1
        assert borrower.damage_severity_score == 0
        assert result["severity_score"] == 0

    def test_consecutive_strikes_accumulate(self, db, borrower):
        _apply_strike(db, borrower, "light")
        _apply_strike(db, borrower, "medium")
        result = _apply_strike(db, borrower, "light")

        # 1 + 1 + 1 = 3 strikes; 1 + 2 + 1 = 4 score
        assert borrower.damage_strike_count == 3
        assert borrower.damage_severity_score == 4
        assert result["strike_count"] == 3
        assert result["severity_score"] == 4


# ---------------------------------------------------------------------------
# Auto-restrict thresholds
# ---------------------------------------------------------------------------

class TestAutoRestrictByStrikeCount:
    """Threshold: 3 strikes (regardless of score)."""

    def test_below_threshold_does_not_restrict(self, db, borrower):
        # 2 light strikes: count=2, score=2 — both below thresholds
        _apply_strike(db, borrower, "light")
        result = _apply_strike(db, borrower, "light")

        assert borrower.is_restricted is False
        assert result["restrict_applied"] is False

    def test_third_strike_triggers_restrict(self, db, borrower):
        # 3 light strikes: count=3 (= threshold), score=3 (below score threshold)
        _apply_strike(db, borrower, "light")
        _apply_strike(db, borrower, "light")
        result = _apply_strike(db, borrower, "light")

        assert borrower.is_restricted is True
        assert result["restrict_applied"] is True
        assert "3 damage strikes" in (borrower.restriction_reason or "")

    def test_strike_threshold_uses_constant(self):
        """Guard against accidental constant changes; spec is locked at 3."""
        assert AUTO_RESTRICT_STRIKE_THRESHOLD == 3


class TestAutoRestrictBySeverityScore:
    """Threshold: severity_score >= 6 (regardless of strike count)."""

    def test_two_medium_below_score_threshold(self, db, borrower):
        # 2 medium: count=2, score=4 — below both thresholds
        _apply_strike(db, borrower, "medium")
        result = _apply_strike(db, borrower, "medium")

        assert borrower.is_restricted is False
        assert result["restrict_applied"] is False

    def test_score_path_triggers_with_count_far_below_threshold(self, db, make_user):
        """
        Pure score-path test: pre-load score=5, count=1; +medium → score=7,
        count=2. count is still well below the strike threshold (3), so the
        ONLY way restrict can fire is via the score branch. If the strike-count
        check is accidentally removed/broken, this test still proves the score
        branch is wired correctly.
        """
        borrower = make_user(damage_strike_count=1, damage_severity_score=5)

        result = _apply_strike(db, borrower, "medium")

        assert borrower.damage_strike_count == 2          # below count threshold
        assert borrower.damage_severity_score == 7        # above score threshold
        assert borrower.is_restricted is True
        assert result["restrict_applied"] is True
        assert "severity score 7" in (borrower.restriction_reason or "")

    def test_score_threshold_uses_constant(self):
        assert AUTO_RESTRICT_SCORE_THRESHOLD == 6


class TestAlreadyRestricted:
    """If borrower is already restricted, restrict_applied stays False."""

    def test_already_restricted_does_not_re_apply(self, db, make_user):
        borrower = make_user(
            damage_strike_count=5,
            damage_severity_score=8,
            is_restricted=True,
            restriction_reason="Manually restricted by admin",
        )
        result = _apply_strike(db, borrower, "medium")

        # Counters still bump, but restrict_applied stays False
        assert borrower.damage_strike_count == 6
        assert borrower.damage_severity_score == 10
        assert result["restrict_applied"] is False
        # restriction_reason is NOT overwritten
        assert "Manually restricted by admin" in (borrower.restriction_reason or "")


# ---------------------------------------------------------------------------
# suggest_ban / auto_ban signals
# ---------------------------------------------------------------------------

class TestSuggestBan:
    def test_severe_severity_sets_suggest_ban(self, db, borrower):
        result = _apply_strike(db, borrower, "severe")
        assert result["suggest_ban"] is True

    def test_light_does_not_set_suggest_ban(self, db, borrower):
        result = _apply_strike(db, borrower, "light")
        assert result["suggest_ban"] is False

    def test_medium_does_not_set_suggest_ban(self, db, borrower):
        result = _apply_strike(db, borrower, "medium")
        assert result["suggest_ban"] is False


class TestAutoBan:
    """auto_ban is purely a function of severity_score >= 10."""

    def test_score_below_10_no_auto_ban(self, db, make_user):
        borrower = make_user(damage_severity_score=6)
        result = _apply_strike(db, borrower, "light")  # → score 7

        assert result["auto_ban"] is False

    def test_score_exactly_10_triggers_auto_ban(self, db, make_user):
        borrower = make_user(damage_severity_score=8)
        result = _apply_strike(db, borrower, "medium")  # → score 10

        assert borrower.damage_severity_score == 10
        assert result["auto_ban"] is True

    def test_score_above_10_triggers_auto_ban(self, db, make_user):
        borrower = make_user(damage_severity_score=9)
        result = _apply_strike(db, borrower, "severe")  # → score 12

        assert result["auto_ban"] is True

    def test_auto_ban_threshold_uses_constant(self):
        assert AUTO_BAN_SCORE_THRESHOLD == 10


class TestSignalIndependence:
    """The three signals are independent — each can fire alone or together."""

    def test_severe_first_strike_only_suggests_ban(self, db, borrower):
        # 1 severe: count=1, score=3 — below restrict + below auto-ban
        result = _apply_strike(db, borrower, "severe")

        assert result["restrict_applied"] is False
        assert result["suggest_ban"] is True
        assert result["auto_ban"] is False

    def test_count_threshold_and_severe_fire_together(self, db, make_user):
        # Pre-state: count=2, score=5 (both still below thresholds).
        # +severe → count=3 (hit strike threshold), score=8 (below auto-ban),
        #   severity=severe (suggest_ban). restrict + suggest_ban fire; auto_ban does not.
        borrower = make_user(damage_strike_count=2, damage_severity_score=5)
        result = _apply_strike(db, borrower, "severe")

        assert result["restrict_applied"] is True
        assert result["suggest_ban"] is True
        assert result["auto_ban"] is False

    def test_all_three_signals_can_fire_at_once(self, db, make_user):
        # Pre-state: count=2, score=8 (just below restrict by score, below ban)
        # Apply severe → count=3 (hit restrict), score=11 (hit auto-ban),
        # severity=severe (suggest_ban)
        borrower = make_user(
            damage_strike_count=2,
            damage_severity_score=8,
            is_restricted=False,
        )
        result = _apply_strike(db, borrower, "severe")

        assert result["restrict_applied"] is True
        assert result["suggest_ban"] is True
        assert result["auto_ban"] is True


# ---------------------------------------------------------------------------
# USER_RESTRICTED notification side effect
# ---------------------------------------------------------------------------

class TestRestrictionNotification:
    """
    NotificationService.create is called with commit=False, so the row is in
    the session but not flushed. The production session is autoflush=False
    (database/connection.py), so we mirror that here by explicitly flushing
    before asserting — same flush boundary that admin_deduct's db.commit()
    would cross in real code.
    """

    def test_restriction_creates_notification(self, db, borrower):
        # Cross threshold with 3 light strikes
        _apply_strike(db, borrower, "light")
        _apply_strike(db, borrower, "light")
        _apply_strike(db, borrower, "light")
        db.flush()

        notifs = (
            db.query(SystemNotification)
            .filter(SystemNotification.user_id == borrower.user_id)
            .all()
        )
        assert len(notifs) == 1
        assert notifs[0].type == "USER_RESTRICTED"
        assert "restricted" in notifs[0].title.lower()

    def test_no_notification_when_below_threshold(self, db, borrower):
        _apply_strike(db, borrower, "light")
        _apply_strike(db, borrower, "light")
        db.flush()

        notifs = (
            db.query(SystemNotification)
            .filter(SystemNotification.user_id == borrower.user_id)
            .all()
        )
        assert notifs == []

    def test_no_duplicate_notification_when_already_restricted(self, db, make_user):
        borrower = make_user(
            damage_strike_count=5,
            damage_severity_score=10,
            is_restricted=True,
        )
        _apply_strike(db, borrower, "medium")
        db.flush()

        notifs = (
            db.query(SystemNotification)
            .filter(SystemNotification.user_id == borrower.user_id)
            .all()
        )
        # No new USER_RESTRICTED notification — they're already restricted
        assert notifs == []


# ---------------------------------------------------------------------------
# STRIKE_WEIGHTS source-of-truth check
# ---------------------------------------------------------------------------

def test_strike_weights_match_locked_spec():
    """Weights are spec'd (teacher 2026-04-19): light=1, medium=2, severe=3."""
    assert STRIKE_WEIGHTS == {"light": 1, "medium": 2, "severe": 3}
