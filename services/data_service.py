# services/data_service.py
"""
Data service with fixed imports - no more circular dependencies.
This version imports models and database directly, not from server.py.
"""

import json
import logging
import uuid
import os
import re
from typing import Dict, List, Any, Tuple
from datetime import datetime

# Import database and models directly (no circular import)
from database import db
from models import User, Race, Horse, Bet, UserScore, AppSetting

DEFAULT_SCORING_CONFIG = {
    "tiers": [
        {"min_odds": 20, "points": 5},
        {"min_odds": 10, "points": 3},
        {"min_odds": 5, "points": 2},
        {"min_odds": 0, "points": 1}
    ],
    "last_place_penalty": 0
}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# A helper function to get the scrapers
def get_scrapers():
    """Import and return the scraper functions."""
    from utils.supertote_scraper import scrape_races_from_supertote
    from utils.results_scraper import scrape_results_with_fallback
    return scrape_races_from_supertote, scrape_results_with_fallback

class DataService:
    """
    Manages all application data operations using SQLAlchemy.
    Now with proper imports and no circular dependencies.
    """

    # --- User Management ---
    
    def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users from the database."""
        users = User.query.all()
        return [{"id": user.id, "name": user.name, "is_admin": bool(user.is_admin)} for user in users]

    def add_user(self, name: str, pin: str = None) -> Dict[str, Any]:
        """Add a new user to the database."""
        user_id = str(uuid.uuid4())
        new_user = User(id=user_id, name=name, pin=pin)
        db.session.add(new_user)
        db.session.commit()
        return {"id": user_id, "name": name}

    def verify_user_pin(self, user_id: str, pin: str):
        """Verify a user's PIN. Returns dict with is_admin on success, False on failure."""
        user = User.query.get(user_id)
        if user and user.pin and user.pin == pin:
            return {"success": True, "is_admin": bool(user.is_admin)}
        return False

    def set_user_admin(self, user_id: str, is_admin: bool) -> bool:
        """Set or unset admin flag for a user."""
        try:
            user = User.query.get(user_id)
            if user:
                user.is_admin = is_admin
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error setting admin flag: {e}")
            db.session.rollback()
            return False

    def delete_user(self, user_id: str) -> bool:
        """Deletes a user and all their associated data."""
        try:
            # Delete user's bets and scores first to avoid foreign key constraints
            Bet.query.filter_by(user_id=user_id).delete()
            UserScore.query.filter_by(user_id=user_id).delete()

            # Now delete the user
            user = User.query.get(user_id)
            if user:
                db.session.delete(user)
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting user {user_id}: {e}")
            db.session.rollback()
            return False

    def update_user(self, user_id: str, name: str = None, pin: str = None) -> bool:
        """Update a user's name and/or PIN in the database."""
        try:
            user = User.query.get(user_id)
            if user:
                if name:
                    user.name = name
                if pin:
                    user.pin = pin
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error updating user {user_id}: {e}")
            db.session.rollback()
            return False

    # --- Race Day Management ---
    
    def get_race_day_index(self) -> Dict[str, Any]:
        """Get the list of all race days from the database."""
        race_dates = db.session.query(Race.date).group_by(Race.date).order_by(Race.date.desc()).all()
        return {"raceDays": [{"date": d[0]} for d in race_dates]}
        
    def get_race_day_data(self, race_date: str) -> Dict[str, Any]:
        """Get all data for a specific race day from the database."""
        races = Race.query.filter_by(date=race_date).order_by(Race.race_number).all()
        
        if not races:
            return {}
            
        races_data = []
        for race in races:
            horses_data = []
            for horse in Horse.query.filter_by(race_id=race.id).all():
                horses_data.append({
                    "number": horse.horse_number,
                    "name": horse.name,
                    "odds": horse.odds,
                    "scratched": bool(horse.scratched)
                })

            bets_data = {bet.user_id: bet.horse_number for bet in Bet.query.filter_by(race_id=race.id).all()}
            bankers_data = [
                {"userId": bet.user_id, "horseNumber": bet.horse_number}
                for bet in Bet.query.filter_by(race_id=race.id, is_banker=True).all()
            ]

            races_data.append({
                "id": race.id,
                "raceNumber": race.race_number,
                "name": race.name,
                "time": race.time,
                "distance": race.distance,
                "status": race.status,
                "winner": race.winner_horse_number,
                "lastHorse": race.last_horse_number,
                "horses": horses_data,
                "bets": bets_data,
                "bankers": bankers_data
            })

        user_scores = UserScore.query.filter_by(race_date=race_date).all()
        user_scores_data = []
        for score in user_scores:
            user = User.query.get(score.user_id)
            if user:
                user_scores_data.append({
                    "userId": score.user_id,
                    "name": user.name,
                    "score": score.score
                })
        
        return {
            "date": race_date,
            "races": races_data,
            "userScores": user_scores_data
        }

    def save_current_race_day_data(self, day_data: Dict[str, Any]) -> bool:
        """Upserts race day data — updates metadata and odds without touching existing bets."""
        try:
            race_date = day_data.get('date')
            if not race_date:
                logger.error("No date provided in day data.")
                return False

            for race_data in day_data.get('races', []):
                race_id = race_data.get('id', '')
                race_name = race_data.get('name', '')

                # Derive race number from ID or name
                race_number = 1
                match = re.search(r'R(\d+)', race_id, re.IGNORECASE)
                if match:
                    race_number = int(match.group(1))
                else:
                    match = re.search(r'Race\s+(\d+)', race_name, re.IGNORECASE)
                    if match:
                        race_number = int(match.group(1))

                # Upsert race — update metadata if exists, create if not
                existing_race = Race.query.get(race_id)
                if existing_race:
                    existing_race.name = race_data.get('name', existing_race.name)
                    existing_race.time = race_data.get('time', existing_race.time)
                    existing_race.distance = race_data.get('distance', existing_race.distance)
                    # Don't overwrite winner/status set manually by admin
                    if existing_race.status == 'upcoming':
                        existing_race.status = race_data.get('status', 'upcoming')
                    race_obj = existing_race
                else:
                    race_obj = Race(
                        id=race_id,
                        date=race_date,
                        race_number=race_number,
                        name=race_data.get('name'),
                        time=race_data.get('time'),
                        distance=race_data.get('distance'),
                        status=race_data.get('status', 'upcoming'),
                        winner_horse_number=race_data.get('winner')
                    )
                    db.session.add(race_obj)

                # Upsert horses — update odds/name if exists, create if not
                # Bets are never touched
                for horse_data in race_data.get('horses', []):
                    existing_horse = Horse.query.filter_by(
                        race_id=race_id, horse_number=horse_data['number']
                    ).first()
                    if existing_horse:
                        existing_horse.name = horse_data['name']
                        existing_horse.odds = horse_data['odds']
                        # Don't overwrite manually-set scratched status
                    else:
                        db.session.add(Horse(
                            id=str(uuid.uuid4()),
                            race_id=race_id,
                            horse_number=horse_data['number'],
                            name=horse_data['name'],
                            odds=horse_data['odds']
                        ))

            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Error saving race day data: {e}")
            db.session.rollback()
            return False
            
    def save_race_result(self, race_id: str, winner_horse_number: int) -> bool:
        """Updates the winner of a single race and sets its status to completed."""
        try:
            race = Race.query.filter_by(id=race_id).first()
            if race:
                race.winner_horse_number = winner_horse_number
                race.status = 'completed'
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error saving race result: {e}")
            db.session.rollback()
            return False

    def update_horse_odds(self, race_id: str, horse_number: int, odds: float) -> bool:
        """Updates the odds for a specific horse."""
        try:
            horse = Horse.query.filter_by(race_id=race_id, horse_number=horse_number).first()
            if horse:
                horse.odds = odds
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error updating horse odds: {e}")
            db.session.rollback()
            return False

    def delete_race_day(self, race_date: str) -> bool:
        """Deletes a race day and all its associated data (races, horses, bets, scores)."""
        try:
            races_to_delete = Race.query.filter_by(date=race_date).all()
            race_ids = [race.id for race in races_to_delete]

            # Delete dependent data first
            Bet.query.filter(Bet.race_id.in_(race_ids)).delete(synchronize_session=False)
            Horse.query.filter(Horse.race_id.in_(race_ids)).delete(synchronize_session=False)
            UserScore.query.filter_by(race_date=race_date).delete(synchronize_session=False)
            
            # Then delete the races themselves
            Race.query.filter_by(date=race_date).delete(synchronize_session=False)

            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Error deleting race day {race_date}: {e}")
            db.session.rollback()
            return False
            
    # --- Betting Management ---

    def place_bet(self, user_id: str, race_id: str, horse_number: int, is_banker: bool) -> bool:
        """Places a bet for a user on a specific horse in a race."""
        try:
            # Check if user and race exist
            user_exists = User.query.get(user_id) is not None
            race = Race.query.get(race_id)
            if not user_exists or not race:
                return False
            
            # Check if race is completed - no betting allowed on completed races
            if race.status == 'completed':
                return False

            # If setting as banker, remove any existing banker for this user on the same race date
            if is_banker:
                target_race = Race.query.get(race_id)
                if target_race:
                    # Find all banker bets for this user on the same race date
                    existing_bankers = Bet.query.join(Race).filter(
                        Bet.user_id == user_id,
                        Bet.is_banker == True,
                        Race.date == target_race.date
                    ).all()
                    
                    # Remove banker status from existing bets on same race date
                    for banker_bet in existing_bankers:
                        banker_bet.is_banker = False

            # Check if bet already exists
            existing_bet = Bet.query.filter_by(user_id=user_id, race_id=race_id).first()
            if existing_bet:
                existing_bet.horse_number = horse_number
                existing_bet.is_banker = is_banker
            else:
                new_bet = Bet(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    race_id=race_id,
                    horse_number=horse_number,
                    is_banker=is_banker
                )
                db.session.add(new_bet)
            
            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Error placing bet: {e}")
            db.session.rollback()
            return False
            
    # --- Scoring Config ---

    def get_scoring_config(self) -> dict:
        """Returns the current scoring configuration."""
        setting = AppSetting.query.get('scoring_config')
        if setting:
            try:
                return json.loads(setting.value)
            except Exception:
                pass
        return DEFAULT_SCORING_CONFIG.copy()

    def save_scoring_config(self, config: dict) -> bool:
        """Saves the scoring configuration."""
        try:
            setting = AppSetting.query.get('scoring_config')
            if setting:
                setting.value = json.dumps(config)
            else:
                db.session.add(AppSetting(key='scoring_config', value=json.dumps(config)))
            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Error saving scoring config: {e}")
            db.session.rollback()
            return False

    def _calc_points(self, odds: float, config: dict) -> int:
        """Returns points for a winning bet based on odds and scoring config."""
        tiers = sorted(config.get('tiers', []), key=lambda t: t['min_odds'], reverse=True)
        for tier in tiers:
            if odds >= tier['min_odds']:
                return tier['points']
        return 1

    # --- Last Horse / Scratch ---

    def set_last_horse(self, race_id: str, horse_number: int) -> bool:
        """Records the last-place horse for a race."""
        try:
            race = Race.query.get(race_id)
            if race:
                race.last_horse_number = horse_number
                db.session.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"Error setting last horse: {e}")
            db.session.rollback()
            return False

    def toggle_horse_scratch(self, race_id: str, horse_number: int) -> dict:
        """Toggles a horse's scratched status; redirects affected bets to the favorite."""
        try:
            horse = Horse.query.filter_by(race_id=race_id, horse_number=horse_number).first()
            if not horse:
                return {"success": False, "error": "Horse not found"}
            horse.scratched = not horse.scratched
            db.session.flush()
            redirected = 0
            if horse.scratched:
                favorite = (Horse.query
                            .filter_by(race_id=race_id, scratched=False)
                            .order_by(Horse.odds.asc())
                            .first())
                if favorite:
                    affected = Bet.query.filter_by(race_id=race_id, horse_number=horse_number).all()
                    for bet in affected:
                        bet.horse_number = favorite.horse_number
                    redirected = len(affected)
            db.session.commit()
            return {"success": True, "scratched": horse.scratched, "redirected": redirected}
        except Exception as e:
            logger.error(f"Error toggling scratch: {e}")
            db.session.rollback()
            return {"success": False, "error": str(e)}

    # --- User Score Management ---

    def calculate_current_user_scores(self) -> List[Dict[str, Any]]:
        """Calculate and update user scores for the current race day."""
        current_date = datetime.now().strftime('%Y-%m-%d')
        config = self.get_scoring_config()
        penalty = config.get('last_place_penalty', 0)

        users = User.query.all()
        scores = []

        for user in users:
            total_score = 0
            races_won = 0
            banker_correct = False

            user_bets = Bet.query.join(Race).filter(
                Bet.user_id == user.id,
                Race.date == current_date
            ).all()

            for bet in user_bets:
                race = Race.query.get(bet.race_id)
                if not race or race.status != 'completed':
                    continue

                if race.winner_horse_number == bet.horse_number:
                    horse = Horse.query.filter_by(race_id=race.id, horse_number=bet.horse_number).first()
                    if horse:
                        points = self._calc_points(horse.odds, config)
                        total_score += points
                        races_won += 1
                        if bet.is_banker:
                            banker_correct = True

                elif penalty and race.last_horse_number and race.last_horse_number == bet.horse_number:
                    total_score += penalty

            if banker_correct:
                total_score *= 2

            user_score = UserScore.query.filter_by(user_id=user.id, race_date=current_date).first()
            if user_score:
                user_score.score = total_score
            else:
                db.session.add(UserScore(id=str(uuid.uuid4()), user_id=user.id, race_date=current_date, score=total_score))

            scores.append({"userId": user.id, "name": user.name, "score": total_score, "races_won": races_won})

        db.session.commit()
        scores.sort(key=lambda x: x['score'], reverse=True)
        for i, entry in enumerate(scores):
            entry['rank'] = i + 1
        return scores

    def calculate_historical_user_scores(self, race_date: str) -> List[Dict[str, Any]]:
        """Calculate and update user scores for a specific historical race day."""
        config = self.get_scoring_config()
        penalty = config.get('last_place_penalty', 0)

        users = User.query.all()
        scores = []

        for user in users:
            total_score = 0
            races_won = 0
            banker_correct = False

            user_bets = Bet.query.join(Race).filter(
                Bet.user_id == user.id,
                Race.date == race_date
            ).all()

            for bet in user_bets:
                race = Race.query.get(bet.race_id)
                if not race or race.status != 'completed':
                    continue

                if race.winner_horse_number == bet.horse_number:
                    horse = Horse.query.filter_by(race_id=race.id, horse_number=bet.horse_number).first()
                    if horse:
                        points = self._calc_points(horse.odds, config)
                        total_score += points
                        races_won += 1
                        if bet.is_banker:
                            banker_correct = True

                elif penalty and race.last_horse_number and race.last_horse_number == bet.horse_number:
                    total_score += penalty

            if banker_correct:
                total_score *= 2

            user_score = UserScore.query.filter_by(user_id=user.id, race_date=race_date).first()
            if user_score:
                user_score.score = total_score
            else:
                db.session.add(UserScore(id=str(uuid.uuid4()), user_id=user.id, race_date=race_date, score=total_score))

            scores.append({"userId": user.id, "name": user.name, "score": total_score, "races_won": races_won})

        db.session.commit()

        # Sort scores to determine rank
        scores.sort(key=lambda x: x['score'], reverse=True)

        for i, score_entry in enumerate(scores):
            score_entry['rank'] = i + 1
        
        return scores

    def get_leaderboard_data(self) -> Dict[str, Any]:
        """Get overall leaderboard data from the database across all race days."""
        from models import User, UserScore
        from database import db
        
        # Get all users
        users = User.query.all()
        total_scores = []
        
        for user in users:
            # Get all user scores across all race days
            user_scores = UserScore.query.filter_by(user_id=user.id).all()
            total_score = sum(score.score for score in user_scores)
            
            total_scores.append({
                "userId": user.id,
                "name": user.name,
                "score": total_score
            })
        
        # Sort by total score (descending)
        total_scores.sort(key=lambda x: x['score'], reverse=True)
        
        # Add rank
        for i, score_entry in enumerate(total_scores):
            score_entry['rank'] = i + 1
        
        return {
            "users": total_scores,
            "date": "all-time",
            "type": "overall"
        }

    # --- Backup / Restore ---

    def backup_all_data(self) -> Dict[str, Any]:
        """Export every table to a plain dict suitable for JSON serialisation."""
        from models import User, Race, Horse, Bet, UserScore
        from datetime import datetime
        return {
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "version": "1",
            "users":  [{"id": u.id, "name": u.name, "pin": u.pin}
                       for u in User.query.all()],
            "races":  [{"id": r.id, "date": r.date, "race_number": r.race_number,
                        "status": r.status, "winner_horse_number": r.winner_horse_number}
                       for r in Race.query.all()],
            "horses": [{"id": h.id, "race_id": h.race_id, "horse_number": h.horse_number,
                        "name": h.name, "odds": h.odds}
                       for h in Horse.query.all()],
            "bets":   [{"id": b.id, "user_id": b.user_id, "race_id": b.race_id,
                        "horse_number": b.horse_number, "is_banker": b.is_banker,
                        "points_awarded": b.points_awarded}
                       for b in Bet.query.all()],
            "scores": [{"id": s.id, "user_id": s.user_id, "race_date": s.race_date,
                        "score": s.score}
                       for s in UserScore.query.all()],
        }

    def restore_all_data(self, backup: Dict[str, Any]) -> bool:
        """Wipe the database and reimport from a backup dict."""
        from models import User, Race, Horse, Bet, UserScore
        try:
            UserScore.query.delete()
            Bet.query.delete()
            Horse.query.delete()
            Race.query.delete()
            User.query.delete()
            db.session.flush()

            for u in backup.get("users", []):
                db.session.add(User(id=u["id"], name=u["name"], pin=u.get("pin")))
            for r in backup.get("races", []):
                db.session.add(Race(id=r["id"], date=r["date"],
                                    race_number=r["race_number"], status=r["status"],
                                    winner_horse_number=r.get("winner_horse_number")))
            for h in backup.get("horses", []):
                db.session.add(Horse(id=h["id"], race_id=h["race_id"],
                                     horse_number=h["horse_number"],
                                     name=h["name"], odds=h["odds"]))
            for b in backup.get("bets", []):
                db.session.add(Bet(id=b["id"], user_id=b["user_id"],
                                   race_id=b["race_id"], horse_number=b["horse_number"],
                                   is_banker=b["is_banker"],
                                   points_awarded=b.get("points_awarded")))
            for s in backup.get("scores", []):
                db.session.add(UserScore(id=s["id"], user_id=s["user_id"],
                                         race_date=s["race_date"], score=s["score"]))
            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            db.session.rollback()
            return False

    # --- Scraping Logic ---

    def scrape_new_races(self, date_str: str = None) -> Dict[str, Any]:
        """Scrapes races from supertote.mu for today (or a given date)."""
        scrape_races_from_supertote, _ = get_scrapers()
        return scrape_races_from_supertote(date_str)

    def scrape_race_results(self) -> Dict[str, Any]:
        """Scrapes results for completed races and returns them."""
        _, scrape_results_with_fallback = get_scrapers()
        return scrape_results_with_fallback()
