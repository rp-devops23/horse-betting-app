# services/worldcup_service.py
"""
World Cup knockout-phase betting service.
Temporary feature — delete this file after the tournament.
"""

import uuid
import logging
from datetime import datetime, timezone

from database import db
from models_worldcup import WCMatch, WCBet

logger = logging.getLogger(__name__)

# Round ordering for display
ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F']


def _same_outcome(pa, pb, sa, sb):
    """Check if predicted and actual outcomes match (win/draw/loss)."""
    return (pa > pb) == (sa > sb) and (pa < pb) == (sa < sb)


class WorldCupService:

    # --- Matches ---

    def get_all_matches(self):
        matches = WCMatch.query.order_by(WCMatch.kickoff_utc).all()
        return [self._match_to_dict(m) for m in matches]

    def get_bracket(self):
        matches = WCMatch.query.order_by(WCMatch.match_number).all()
        bracket = {}
        for m in matches:
            bracket.setdefault(m.round, []).append(self._match_to_dict(m))
        return bracket

    def seed_matches(self, matches_data):
        """Bulk-insert match data. Replaces existing matches."""
        try:
            WCBet.query.delete()
            WCMatch.query.delete()
            for m in matches_data:
                kickoff = None
                if m.get('kickoff_utc'):
                    kickoff = datetime.fromisoformat(m['kickoff_utc'].replace('Z', '+00:00'))
                match = WCMatch(
                    id=m['id'],
                    round=m['round'],
                    match_number=m.get('match_number', 0),
                    team_a=m.get('team_a'),
                    team_b=m.get('team_b'),
                    kickoff_utc=kickoff,
                    venue=m.get('venue'),
                    status='upcoming',
                    source_a=m.get('source_a'),
                    source_b=m.get('source_b'),
                )
                db.session.add(match)
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(f"[WC] seed_matches error: {e}")
            return False

    def update_match_teams(self, match_id, team_a=None, team_b=None):
        """Update teams for a match (e.g. when group stage results are known)."""
        try:
            match = WCMatch.query.get(match_id)
            if not match:
                return False
            if team_a is not None:
                match.team_a = team_a
            if team_b is not None:
                match.team_b = team_b
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(f"[WC] update_match_teams error: {e}")
            return False

    def enter_result(self, match_id, score_a, score_b):
        """Admin enters final score. Scores bets and propagates winner."""
        try:
            match = WCMatch.query.get(match_id)
            if not match:
                return False, "Match not found"
            match.score_a = score_a
            match.score_b = score_b
            match.status = 'completed'
            # Score all bets for this match
            self._score_match(match)
            # Propagate winner to downstream match
            self._propagate_winner(match)
            db.session.commit()
            return True, None
        except Exception as e:
            db.session.rollback()
            logger.error(f"[WC] enter_result error: {e}")
            return False, str(e)

    # --- Predictions ---

    def place_prediction(self, user_id, match_id, predicted_a, predicted_b):
        match = WCMatch.query.get(match_id)
        if not match:
            return False, "Match not found"
        if match.status == 'completed':
            return False, "Match already completed"
        if match.kickoff_utc and datetime.now(timezone.utc) >= match.kickoff_utc:
            return False, "Match has already started"
        if not match.team_a or not match.team_b:
            return False, "Teams not yet determined"

        try:
            existing = WCBet.query.filter_by(user_id=user_id, match_id=match_id).first()
            if existing:
                existing.predicted_a = predicted_a
                existing.predicted_b = predicted_b
                existing.points_awarded = None
            else:
                bet = WCBet(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    match_id=match_id,
                    predicted_a=predicted_a,
                    predicted_b=predicted_b,
                )
                db.session.add(bet)
            db.session.commit()
            return True, None
        except Exception as e:
            db.session.rollback()
            logger.error(f"[WC] place_prediction error: {e}")
            return False, str(e)

    def get_user_predictions(self, user_id):
        bets = WCBet.query.filter_by(user_id=user_id).all()
        return {b.match_id: {
            'predicted_a': b.predicted_a,
            'predicted_b': b.predicted_b,
            'points_awarded': b.points_awarded,
        } for b in bets}

    # --- Leaderboard ---

    def get_leaderboard(self):
        """Build leaderboard from all scored bets."""
        from models import User
        bets = WCBet.query.filter(WCBet.points_awarded.isnot(None)).all()
        scores = {}
        for b in bets:
            if b.user_id not in scores:
                scores[b.user_id] = {'total': 0, 'exact': 0, 'correct': 0, 'played': 0}
            scores[b.user_id]['total'] += b.points_awarded
            scores[b.user_id]['played'] += 1
            if b.points_awarded == 3:
                scores[b.user_id]['exact'] += 1
            if b.points_awarded >= 1:
                scores[b.user_id]['correct'] += 1

        users = {u.id: u.name for u in User.query.all()}
        leaderboard = []
        for uid, s in scores.items():
            leaderboard.append({
                'userId': uid,
                'name': users.get(uid, uid),
                'total': s['total'],
                'exact': s['exact'],
                'correct': s['correct'],
                'played': s['played'],
            })
        # Also include users with 0 points who have placed bets
        all_bettors = db.session.query(WCBet.user_id).distinct().all()
        for (uid,) in all_bettors:
            if uid not in scores:
                leaderboard.append({
                    'userId': uid,
                    'name': users.get(uid, uid),
                    'total': 0, 'exact': 0, 'correct': 0, 'played': 0,
                })
        leaderboard.sort(key=lambda x: (-x['total'], -x['exact']))
        return leaderboard

    # --- Cleanup ---

    def delete_all_wc_data(self):
        try:
            WCBet.query.delete()
            WCMatch.query.delete()
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(f"[WC] delete_all error: {e}")
            return False

    # --- Internal helpers ---

    def _score_match(self, match):
        bets = WCBet.query.filter_by(match_id=match.id).all()
        sa, sb = match.score_a, match.score_b
        for bet in bets:
            pa, pb = bet.predicted_a, bet.predicted_b
            if pa == sa and pb == sb:
                bet.points_awarded = 3
            elif (pa - pb) == (sa - sb) and _same_outcome(pa, pb, sa, sb):
                bet.points_awarded = 2
            elif _same_outcome(pa, pb, sa, sb):
                bet.points_awarded = 1
            else:
                bet.points_awarded = 0

    def _propagate_winner(self, match):
        """After a result, update the downstream match with the winner team."""
        winner = match.team_a if match.score_a > match.score_b else match.team_b
        if match.score_a == match.score_b:
            return  # Draw in knockout needs penalties — admin updates manually
        # Find any match that has this match as source_a or source_b
        downstream_a = WCMatch.query.filter_by(source_a=match.id).first()
        if downstream_a:
            downstream_a.team_a = winner
        downstream_b = WCMatch.query.filter_by(source_b=match.id).first()
        if downstream_b:
            downstream_b.team_b = winner

    def _match_to_dict(self, m):
        return {
            'id': m.id,
            'round': m.round,
            'match_number': m.match_number,
            'team_a': m.team_a,
            'team_b': m.team_b,
            'kickoff_utc': m.kickoff_utc.isoformat() + 'Z' if m.kickoff_utc else None,
            'venue': m.venue,
            'score_a': m.score_a,
            'score_b': m.score_b,
            'status': m.status,
            'source_a': m.source_a,
            'source_b': m.source_b,
        }
