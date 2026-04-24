# services/data_service.py
"""
Data service with fixed imports - no more circular dependencies.
This version imports models and database directly, not from server.py.
"""

import logging
import uuid
import os
import re
from typing import Dict, List, Any, Tuple
from datetime import datetime

# Import database and models directly (no circular import)
from database import db
from models import User, Race, Horse, Bet, UserScore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# A helper function to get the scrapers
def get_scrapers():
    """Import and return the scraper functions."""
    from utils.smspariaz_scraper import scrape_horses_from_smspariaz
    from utils.results_scraper import scrape_results_with_fallback
    return scrape_horses_from_smspariaz, scrape_results_with_fallback

class DataService:
    """
    Manages all application data operations using SQLAlchemy.
    Now with proper imports and no circular dependencies.
    """

    # --- User Management ---
    
    def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users from the database."""
        users = User.query.all()
        return [{"id": user.id, "name": user.name} for user in users]

    def add_user(self, name: str, pin: str = None) -> Dict[str, Any]:
        """Add a new user to the database."""
        user_id = str(uuid.uuid4())
        new_user = User(id=user_id, name=name, pin=pin)
        db.session.add(new_user)
        db.session.commit()
        return {"id": user_id, "name": name}

    def verify_user_pin(self, user_id: str, pin: str) -> bool:
        """Verify a user's PIN."""
        user = User.query.get(user_id)
        if user and user.pin:
            return user.pin == pin
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
                    "odds": horse.odds
                })

            bets_data = {bet.user_id: bet.horse_number for bet in Bet.query.filter_by(race_id=race.id).all()}
            bankers_data = [
                {"userId": bet.user_id, "horseNumber": bet.horse_number}
                for bet in Bet.query.filter_by(race_id=race.id, is_banker=True).all()
            ]

            races_data.append({
                "id": race.id,
                "raceNumber": race.race_number,
                "status": race.status,
                "winner": race.winner_horse_number,
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
        """Saves a race day structure to the database, first clearing existing data for that day."""
        try:
            race_date = day_data.get('date')
            if not race_date:
                logger.error("No date provided in day data.")
                return False

            # Delete existing data for this race day
            existing_races = Race.query.filter_by(date=race_date).all()
            for race in existing_races:
                # Delete related bets and horses
                Bet.query.filter_by(race_id=race.id).delete()
                Horse.query.filter_by(race_id=race.id).delete()
                db.session.delete(race)

            db.session.commit()
            
            # Insert new data
            for race_data in day_data.get('races', []):
                # Extract race number from race_data ID (e.g., "smspariaz_R1_20250816" -> 1) 
                # or from race name (e.g., "Race 1" -> 1)
                race_number = 1
                race_id = race_data.get('id', '')
                race_name = race_data.get('name', '')
                
                # Try to extract from ID first
                match = re.search(r'R(\d+)', race_id, re.IGNORECASE)
                if match:
                    race_number = int(match.group(1))
                else:
                    # Try to extract from name as fallback
                    match = re.search(r'Race\s+(\d+)', race_name, re.IGNORECASE)
                    if match:
                        race_number = int(match.group(1))
                
                new_race = Race(
                    id=race_data['id'],
                    date=race_date,
                    race_number=race_number,
                    status=race_data.get('status', 'upcoming'),
                    winner_horse_number=race_data.get('winner')
                )
                db.session.add(new_race)

                for horse_data in race_data.get('horses', []):
                    new_horse = Horse(
                        id=str(uuid.uuid4()),
                        race_id=new_race.id,
                        horse_number=horse_data['number'],
                        name=horse_data['name'],
                        odds=horse_data['odds']
                    )
                    db.session.add(new_horse)

                if 'bets' in race_data:
                    for user_id, horse_number in race_data['bets'].items():
                        new_bet = Bet(
                            id=str(uuid.uuid4()),
                            user_id=user_id,
                            race_id=new_race.id,
                            horse_number=horse_number,
                            is_banker=False
                        )
                        db.session.add(new_bet)
            
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
            
    # --- User Score Management ---

    def calculate_current_user_scores(self) -> List[Dict[str, Any]]:
        """Calculate and update user scores for the current race day."""
        current_date = datetime.now().strftime('%Y-%m-%d')
        
        users = User.query.all()
        scores = []
        
        for user in users:
            total_score = 0
            races_won = 0
            banker_correct = False

            # Get all bets for the user on the current day with a join to Race
            user_bets = Bet.query.join(Race).filter(
                Bet.user_id == user.id,
                Race.date == current_date
            ).all()

            for bet in user_bets:
                race = Race.query.get(bet.race_id)

                if race and race.status == 'completed' and race.winner_horse_number == bet.horse_number:
                    horse = Horse.query.filter_by(race_id=race.id, horse_number=bet.horse_number).first()
                    if horse:
                        points = 0
                        if horse.odds >= 10:
                            points = 3
                        elif horse.odds >= 5:
                            points = 2
                        else:
                            points = 1

                        total_score += points
                        races_won += 1

                        # Check if this winning bet was a banker
                        if bet.is_banker:
                            banker_correct = True

            # Apply banker multiplier to entire daily score if banker bet was correct
            if banker_correct:
                total_score *= 2

            # Update or create UserScore record
            user_score = UserScore.query.filter_by(user_id=user.id, race_date=current_date).first()
            if user_score:
                user_score.score = total_score
            else:
                user_score = UserScore(id=str(uuid.uuid4()), user_id=user.id, race_date=current_date, score=total_score)
                db.session.add(user_score)

            scores.append({"userId": user.id, "name": user.name, "score": total_score, "races_won": races_won})
            
        db.session.commit()
        
        # Sort scores to determine rank
        scores.sort(key=lambda x: x['score'], reverse=True)
        
        for i, score_entry in enumerate(scores):
            score_entry['rank'] = i + 1
        
        return scores

    def calculate_historical_user_scores(self, race_date: str) -> List[Dict[str, Any]]:
        """Calculate and update user scores for a specific historical race day."""
        from models import User, Bet, Race, Horse, UserScore
        from database import db
        import uuid
        
        users = User.query.all()
        scores = []
        
        for user in users:
            total_score = 0
            races_won = 0
            banker_correct = False

            # Get all bets for the user on the specified date with a join to Race
            user_bets = Bet.query.join(Race).filter(
                Bet.user_id == user.id,
                Race.date == race_date
            ).all()

            for bet in user_bets:
                race = Race.query.get(bet.race_id)

                if race and race.status == 'completed' and race.winner_horse_number == bet.horse_number:
                    horse = Horse.query.filter_by(race_id=race.id, horse_number=bet.horse_number).first()
                    if horse:
                        points = 0
                        if horse.odds >= 10:
                            points = 3
                        elif horse.odds >= 5:
                            points = 2
                        else:
                            points = 1

                        total_score += points
                        races_won += 1

                        # Check if this winning bet was a banker
                        if bet.is_banker:
                            banker_correct = True

            # Apply banker multiplier to entire daily score if banker bet was correct
            if banker_correct:
                total_score *= 2

            # Update or create UserScore record
            user_score = UserScore.query.filter_by(user_id=user.id, race_date=race_date).first()
            if user_score:
                user_score.score = total_score
            else:
                user_score = UserScore(id=str(uuid.uuid4()), user_id=user.id, race_date=race_date, score=total_score)
                db.session.add(user_score)

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

    def scrape_new_races(self) -> Dict[str, Any]:
        """Scrapes horse data for a new race day and returns it."""
        scrape_horses_from_smspariaz, _ = get_scrapers()
        return scrape_horses_from_smspariaz()

    def scrape_race_results(self) -> Dict[str, Any]:
        """Scrapes results for completed races and returns them."""
        _, scrape_results_with_fallback = get_scrapers()
        return scrape_results_with_fallback()
