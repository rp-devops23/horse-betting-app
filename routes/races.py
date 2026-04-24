from flask import Blueprint, jsonify, request
from services import data_service
from datetime import datetime

races_bp = Blueprint('races', __name__)

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
        current_day = data_service.scrape_new_races()
        data_service.save_current_race_day_data(current_day)
        
        print(f"[OK] Scraped {len(current_day.get('races', []))} races for {current_day.get('date')}")
        return jsonify({"success": True, "message": "Races scraped and saved successfully."}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/result', methods=['POST'])
def update_single_race_result(race_id):
    """Manually updates the result for a specific race."""
    try:
        winner_number = request.json.get('winner')
        if winner_number is None:
            return jsonify({"error": "Winner number is required"}), 400
            
        if data_service.save_race_result(race_id, winner_number):
            # Recalculate and update current user scores after race result change
            data_service.calculate_current_user_scores()
            print(f"[OK] Race result updated and synced to current race day")
            return jsonify({"success": True, "message": f"Race {race_id} winner set to horse #{winner_number}"}), 200
        else:
            return jsonify({"error": "Race not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/winner', methods=['POST'])
def set_race_winner(race_id):
    """Sets the winner for a specific race (alternative endpoint)."""
    try:
        winner_number = request.json.get('winnerHorseNumber')
        if winner_number is None:
            return jsonify({"error": "Winner horse number is required"}), 400
            
        if data_service.save_race_result(race_id, winner_number):
            # Recalculate and update current user scores after race result change
            data_service.calculate_current_user_scores()
            print(f"[OK] Race winner set: Race {race_id} won by horse #{winner_number}")
            return jsonify({"success": True, "message": f"Race {race_id} winner set to horse #{winner_number}"}), 200
        else:
            return jsonify({"error": "Race not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/last', methods=['POST'])
def set_last_horse(race_id):
    """Sets the last-place horse for a race (admin only)."""
    try:
        horse_number = request.json.get('lastHorseNumber')
        if horse_number is None:
            return jsonify({"error": "lastHorseNumber is required"}), 400
        if data_service.set_last_horse(race_id, horse_number):
            data_service.calculate_current_user_scores()
            return jsonify({"success": True}), 200
        return jsonify({"error": "Race not found"}), 404
    except Exception as e:
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
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/refresh-scores', methods=['POST'])
def refresh_scores():
    """Refreshes user scores for a specific race day by recalculating them."""
    try:
        from models import UserScore
        from database import db
        from datetime import datetime
        
        # Get race date from request, default to current date
        race_date = request.json.get('race_date') if request.json else None
        if not race_date:
            race_date = datetime.now().strftime('%Y-%m-%d')
        
        # Delete existing scores for the specified date
        UserScore.query.filter_by(race_date=race_date).delete()
        db.session.commit()
        
        # Recalculate scores for the specified date
        if race_date == datetime.now().strftime('%Y-%m-%d'):
            # Current day - use existing method
            scores = data_service.calculate_current_user_scores()
        else:
            # Historical day - need to implement historical score calculation
            scores = data_service.calculate_historical_user_scores(race_date)
        
        print(f"[OK] Scores refreshed for {race_date}: {len(scores)} users")
        return jsonify({"success": True, "message": f"Scores refreshed for {len(scores)} users on {race_date}", "scores": scores, "race_date": race_date}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/<race_id>/horses/<int:horse_number>/odds', methods=['PUT'])
def update_horse_odds(race_id, horse_number):
    """Updates the odds for a specific horse (admin only)."""
    try:
        odds = request.json.get('odds')
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
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/results', methods=['POST'])
def scrape_results():
    """Scrapes results for completed races."""
    try:
        results = data_service.scrape_race_results()
        return jsonify({"success": True, "message": "Race results scraped successfully.", "data": results}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500