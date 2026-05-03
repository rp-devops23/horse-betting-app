from flask import Blueprint, jsonify, request
from services import data_service
from datetime import datetime

races_bp = Blueprint('races', __name__)


def _json():
    """Return parsed JSON body, or {} if missing/invalid Content-Type."""
    return request.get_json(silent=True) or {}


@races_bp.route('/races', methods=['GET'])
def get_races():
    """Returns a list of all races for the current race day."""
    current_day_data = data_service.get_race_day_data(datetime.now().strftime('%Y-%m-%d'))
    races = current_day_data.get("races", [])
    return jsonify(races)

@races_bp.route('/races/scrape', methods=['POST'])
def scrape_races():
    """Scrapes races for a new race day and sets it as current."""
    try:
        date_str = _json().get('date')  # optional: "YYYY-MM-DD"
        current_day = data_service.scrape_new_races(date_str)
        data_service.save_current_race_day_data(current_day)
        n = len(current_day.get('races', []))
        print(f"[OK] Scraped {n} races for {current_day.get('date')} (supertote.mu)")
        return jsonify({"success": True, "message": f"{n} courses importées depuis supertote.mu.", "date": current_day.get('date')}), 200
    except Exception as e:
        print(f"[ERROR] /races/scrape: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/result', methods=['POST'])
def update_single_race_result(race_id):
    """Manually updates the result for a specific race."""
    try:
        winner_number = _json().get('winner')
        if winner_number is None:
            return jsonify({"error": "Winner number is required"}), 400
        if data_service.save_race_result(race_id, winner_number):
            data_service.calculate_current_user_scores()
            print(f"[OK] Race result updated and synced to current race day")
            return jsonify({"success": True, "message": f"Race {race_id} winner set to horse #{winner_number}"}), 200
        else:
            return jsonify({"error": "Race not found"}), 404
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/result: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/winner', methods=['POST'])
def set_race_winner(race_id):
    """Sets the winner for a specific race (alternative endpoint)."""
    try:
        winner_number = _json().get('winnerHorseNumber')
        if winner_number is None:
            return jsonify({"error": "Winner horse number is required"}), 400
        if data_service.save_race_result(race_id, winner_number):
            data_service.calculate_current_user_scores()
            print(f"[OK] Race winner set: Race {race_id} won by horse #{winner_number}")
            return jsonify({"success": True, "message": f"Race {race_id} winner set to horse #{winner_number}"}), 200
        else:
            return jsonify({"error": "Race not found"}), 404
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/winner: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/last', methods=['POST'])
def set_last_horse(race_id):
    """Sets the last-place horse for a race (admin only)."""
    try:
        horse_number = _json().get('lastHorseNumber')
        if horse_number is None:
            return jsonify({"error": "lastHorseNumber is required"}), 400
        if data_service.set_last_horse(race_id, horse_number):
            data_service.calculate_current_user_scores()
            return jsonify({"success": True}), 200
        return jsonify({"error": "Race not found"}), 404
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/last: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/horses/<int:horse_number>/scratch', methods=['POST'])
def toggle_scratch(race_id, horse_number):
    """Toggles a horse's scratched status; redirects bets to favorite if scratched."""
    try:
        result = data_service.toggle_horse_scratch(race_id, horse_number)
        if result.get('success'):
            return jsonify(result), 200
        return jsonify(result), 404
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/horses/{horse_number}/scratch: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/refresh-scores', methods=['POST'])
def refresh_scores():
    """Refreshes user scores for a specific race day by recalculating them."""
    try:
        from models import UserScore
        from database import db

        race_date = _json().get('race_date') or datetime.now().strftime('%Y-%m-%d')

        UserScore.query.filter_by(race_date=race_date).delete()
        db.session.commit()

        if race_date == datetime.now().strftime('%Y-%m-%d'):
            scores = data_service.calculate_current_user_scores()
        else:
            scores = data_service.calculate_historical_user_scores(race_date)

        print(f"[OK] Scores refreshed for {race_date}: {len(scores)} users")
        return jsonify({"success": True, "message": f"Scores refreshed for {len(scores)} users on {race_date}", "scores": scores, "race_date": race_date}), 200
    except Exception as e:
        print(f"[ERROR] /races/refresh-scores: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/horses/<int:horse_number>/odds', methods=['PUT'])
def update_horse_odds(race_id, horse_number):
    """Updates the odds for a specific horse (admin only)."""
    try:
        odds = _json().get('odds')
        if odds is None:
            return jsonify({"error": "odds is required"}), 400
        odds = float(odds)
        if odds <= 0:
            return jsonify({"error": "odds must be positive"}), 400
        if data_service.update_horse_odds(race_id, horse_number, odds):
            return jsonify({"success": True}), 200
        return jsonify({"error": "Horse not found"}), 404
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid odds value"}), 400
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/horses/{horse_number}/odds: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/update-odds', methods=['POST'])
def update_odds():
    """Scrapes live Win odds from smspariaz.com and updates the current race day."""
    try:
        from utils.smspariaz_odds_scraper import scrape_odds_from_smspariaz
        from models import Race as RaceModel
        date_str = _json().get('date')
        if not date_str:
            today = datetime.now().strftime('%Y-%m-%d')
            next_race = RaceModel.query.filter(RaceModel.date >= today).order_by(RaceModel.date).first()
            date_str = next_race.date if next_race else today
        print(f"[INFO] update-odds: targeting race day {date_str}")
        odds_data = scrape_odds_from_smspariaz()
        if not odds_data:
            return jsonify({"success": False, "error": "Aucune côte trouvée sur smspariaz.com"}), 200
        n = data_service.update_race_day_odds(date_str, odds_data)
        print(f"[OK] Updated odds for {n} horse(s) on {date_str} (smspariaz.com)")
        return jsonify({"success": True, "message": f"{n} côte(s) mise(s) à jour.", "date": date_str}), 200
    except Exception as e:
        print(f"[ERROR] /races/update-odds: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/results', methods=['POST'])
def scrape_results():
    """Scrapes results from supertote.mu and applies them to the DB."""
    try:
        from models import Race as RaceModel
        date_str = _json().get('date')
        if not date_str:
            today = datetime.now().strftime('%Y-%m-%d')
            # Find most recent race day on/before today that still has races without a winner
            race = RaceModel.query.filter(
                RaceModel.date <= today,
                RaceModel.winner_horse_number == None
            ).order_by(RaceModel.date.desc()).first()
            date_str = race.date if race else today
        print(f"[INFO] /races/results: targeting race day {date_str}")
        data = data_service.scrape_race_results(date_str)
        n = data.get('count', 0)
        return jsonify({"success": True, "message": f"{n} résultat(s) importé(s) pour le {data.get('date')}.", "date": date_str, "data": data}), 200
    except Exception as e:
        print(f"[ERROR] /races/results: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
