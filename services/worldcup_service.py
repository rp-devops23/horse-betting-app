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

    def enter_result(self, match_id, score_a, score_b, penalty_winner=None, require_penalty=True):
        """Admin enters final score. Scores bets and propagates winner."""
        try:
            match = WCMatch.query.get(match_id)
            if not match:
                return False, "Match not found"
            if score_a == score_b and not penalty_winner and require_penalty:
                return False, "Draw in knockout: penalty_winner ('a' or 'b') is required"
            match.score_a = score_a
            match.score_b = score_b
            match.penalty_winner = penalty_winner if score_a == score_b else None
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

    def place_prediction(self, user_id, match_id, predicted_a, predicted_b, predicted_pen_winner=None):
        match = WCMatch.query.get(match_id)
        if not match:
            return False, "Match not found"
        if match.status == 'completed':
            return False, "Match already completed"
        if match.kickoff_utc and datetime.now(timezone.utc) >= match.kickoff_utc:
            return False, "Match has already started"
        if not match.team_a or not match.team_b:
            return False, "Teams not yet determined"
        pen = predicted_pen_winner if predicted_a == predicted_b else None
        if predicted_a == predicted_b and not pen:
            return False, "Draw predicted: choose a penalty winner (penaltyWinner: 'a' or 'b')"

        try:
            existing = WCBet.query.filter_by(user_id=user_id, match_id=match_id).first()
            if existing:
                existing.predicted_a = predicted_a
                existing.predicted_b = predicted_b
                existing.predicted_pen_winner = pen
                existing.points_awarded = None
            else:
                bet = WCBet(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    match_id=match_id,
                    predicted_a=predicted_a,
                    predicted_b=predicted_b,
                    predicted_pen_winner=pen,
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
            'predicted_pen_winner': b.predicted_pen_winner,
            'points_awarded': b.points_awarded,
        } for b in bets}

    def get_match_predictions(self, match_id):
        """Get all predictions for a completed match (for post-match comparison)."""
        from models import User
        match = WCMatch.query.get(match_id)
        if not match or match.status != 'completed':
            return []
        bets = WCBet.query.filter_by(match_id=match_id).all()
        users = {u.id: u.name for u in User.query.all()}
        return [{
            'userId': b.user_id,
            'name': users.get(b.user_id, b.user_id),
            'predicted_a': b.predicted_a,
            'predicted_b': b.predicted_b,
            'predicted_pen_winner': b.predicted_pen_winner,
            'points_awarded': b.points_awarded,
        } for b in sorted(bets, key=lambda x: -(x.points_awarded or 0))]

    def get_all_predictions(self):
        """Get all predictions grouped by match (only for completed matches)."""
        from models import User
        completed_ids = [m.id for m in WCMatch.query.filter_by(status='completed').all()]
        if not completed_ids:
            return {}
        bets = WCBet.query.filter(WCBet.match_id.in_(completed_ids)).all()
        users = {u.id: u.name for u in User.query.all()}
        result = {}
        for b in bets:
            result.setdefault(b.match_id, []).append({
                'userId': b.user_id,
                'name': users.get(b.user_id, b.user_id),
                'predicted_a': b.predicted_a,
                'predicted_b': b.predicted_b,
                'predicted_pen_winner': b.predicted_pen_winner,
                'points_awarded': b.points_awarded,
            })
        for mid in result:
            result[mid].sort(key=lambda x: -(x['points_awarded'] or 0))
        return result

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
        pen = match.penalty_winner  # 'a', 'b', or None
        for bet in bets:
            pa, pb = bet.predicted_a, bet.predicted_b
            # Exact score match
            if pa == sa and pb == sb:
                if sa == sb:
                    # Both draw — check penalty winner prediction
                    bet.points_awarded = 3 if bet.predicted_pen_winner == pen else 2
                else:
                    bet.points_awarded = 3
            elif (pa - pb) == (sa - sb) and _same_outcome(pa, pb, sa, sb):
                bet.points_awarded = 2
            elif self._same_winner(pa, pb, bet.predicted_pen_winner, sa, sb, pen):
                bet.points_awarded = 1
            else:
                bet.points_awarded = 0

    @staticmethod
    def _same_winner(pa, pb, pred_pen, sa, sb, actual_pen):
        """Check if predicted and actual winners match (accounting for penalties)."""
        # Determine predicted winner
        if pa > pb:
            pred_w = 'a'
        elif pb > pa:
            pred_w = 'b'
        else:
            pred_w = pred_pen  # draw → penalty winner
        # Determine actual winner
        if sa > sb:
            act_w = 'a'
        elif sb > sa:
            act_w = 'b'
        else:
            act_w = actual_pen  # draw → penalty winner
        return pred_w == act_w and pred_w is not None

    def _propagate_winner(self, match):
        """After a result, update the downstream match with the winner team."""
        if match.score_a > match.score_b:
            winner = match.team_a
        elif match.score_b > match.score_a:
            winner = match.team_b
        elif match.penalty_winner == 'a':
            winner = match.team_a
        elif match.penalty_winner == 'b':
            winner = match.team_b
        else:
            return  # Can't propagate without knowing the winner
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
            'penalty_winner': m.penalty_winner,
            'status': m.status,
            'source_a': m.source_a,
            'source_b': m.source_b,
        }
