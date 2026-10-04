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
    log_id = None
    try:
        date_str = _json().get('date')  # optional: "YYYY-MM-DD"
        log_id = data_service.log_job('scrape_races', 'started', race_date=date_str,
                                       message='Importing races from supertote.mu')
        current_day = data_service.scrape_new_races(date_str)
        race_date = current_day.get('date')
        n = len(current_day.get('races', []))

        # Take snapshot of existing horse odds before overwriting
        from models import Race as RaceModel, Horse as HorseModel, JobLog
        from database import db
        import json as _json_mod
        existing_races = RaceModel.query.filter_by(date=race_date).all()
        snapshot = {}
        for r in existing_races:
            horses = HorseModel.query.filter_by(race_id=r.id).all()
            snapshot[str(r.race_number)] = {str(h.horse_number): {'name': h.name, 'odds': h.odds} for h in horses}
        if snapshot:
            job_log = JobLog.query.get(log_id)
            if job_log:
                job_log.snapshot = _json_mod.dumps(snapshot)
                db.session.commit()

        data_service.save_current_race_day_data(current_day)
        data_service.update_job_log(log_id, 'success',
                                     message=f'{n} courses importées depuis supertote.mu.',
                                     details={'races_count': n, 'date': race_date})
        print(f"[OK] Scraped {n} races for {race_date} (supertote.mu)")
        return jsonify({"success": True, "message": f"{n} courses importées depuis supertote.mu.", "date": race_date}), 200
    except Exception as e:
        print(f"[ERROR] /races/scrape: {e}")
        if log_id:
            data_service.update_job_log(log_id, 'error', message=str(e))
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

@races_bp.route('/races/<race_id>/horses/<int:horse_number>', methods=['PUT'])
def update_horse(race_id, horse_number):
    """Updates any editable fields on a horse (admin only)."""
    try:
        fields = _json()
        if not fields:
            return jsonify({"error": "No fields provided"}), 400
        if data_service.update_horse(race_id, horse_number, fields):
            return jsonify({"success": True}), 200
        return jsonify({"error": "Horse not found"}), 404
    except Exception as e:
        print(f"[ERROR] /races/{race_id}/horses/{horse_number}: {e}")
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
    log_id = None
    try:
        from utils.smspariaz_odds_scraper import scrape_odds_from_smspariaz
        from models import Race as RaceModel
        date_str = _json().get('date')
        if not date_str:
            today = datetime.now().strftime('%Y-%m-%d')
            next_race = RaceModel.query.filter(RaceModel.date >= today).order_by(RaceModel.date).first()
            date_str = next_race.date if next_race else today
        log_id = data_service.log_job('update_odds', 'started', race_date=date_str,
                                       message='Fetching odds from smspariaz.com')
        print(f"[INFO] update-odds: targeting race day {date_str}")
        odds_data = scrape_odds_from_smspariaz()
        if not odds_data:
            data_service.update_job_log(log_id, 'error', message='Aucune côte trouvée sur smspariaz.com',
                                         details={'races_in_response': 0})
            return jsonify({"success": False, "error": "Aucune côte trouvée sur smspariaz.com"}), 200
        races_with_odds = {k: len(v) for k, v in odds_data.items()}
        n = data_service.update_race_day_odds(date_str, odds_data)
        data_service.update_job_log(log_id, 'success',
                                     message=f'{n} côte(s) mise(s) à jour.',
                                     details={'horses_updated': n, 'races_in_response': races_with_odds})
        print(f"[OK] Updated odds for {n} horse(s) on {date_str} (smspariaz.com)")
        return jsonify({"success": True, "message": f"{n} côte(s) mise(s) à jour.", "date": date_str}), 200
    except Exception as e:
        print(f"[ERROR] /races/update-odds: {e}")
        if log_id:
            data_service.update_job_log(log_id, 'error', message=str(e))
        return jsonify({"success": False, "error": str(e)}), 500

@races_bp.route('/races/results', methods=['POST'])
def scrape_results():
    """Scrapes results from supertote.mu and applies them to the DB."""
    log_id = None
    try:
        from models import Race as RaceModel
        date_str = _json().get('date')
        if not date_str:
            today = datetime.now().strftime('%Y-%m-%d')
            race = RaceModel.query.filter(
                RaceModel.date <= today,
                RaceModel.winner_horse_number == None
            ).order_by(RaceModel.date.desc()).first()
            date_str = race.date if race else today
        log_id = data_service.log_job('scrape_results', 'started', race_date=date_str,
                                       message='Fetching results from supertote.mu')
        print(f"[INFO] /races/results: targeting race day {date_str}")
        data = data_service.scrape_race_results(date_str)
        n = data.get('count', 0)
        data_service.update_job_log(log_id, 'success',
                                     message=f'{n} résultat(s) importé(s) pour le {date_str}.',
                                     details={'results_applied': n, 'date': date_str})
        return jsonify({"success": True, "message": f"{n} résultat(s) importé(s) pour le {data.get('date')}.", "date": date_str, "data": data}), 200
    except Exception as e:
        print(f"[ERROR] /races/results: {e}")
        if log_id:
            data_service.update_job_log(log_id, 'error', message=str(e))
        return jsonify({"success": False, "error": str(e)}), 500
