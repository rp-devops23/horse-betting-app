# routes/betting.py (Updated - Using DataService)
from flask import Blueprint, jsonify, request
import logging
from services import data_service
from auth import require_user, current_user_id

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

betting_bp = Blueprint('betting', __name__)

def _place(is_banker):
    from models import Race
    data = request.get_json(silent=True) or {}
    user_id = current_user_id()
    race_id = data.get('raceId')
    horse_number = data.get('horseNumber')

    if not all([race_id, horse_number]):
        return jsonify({"success": False, "error": "Missing required fields: raceId, horseNumber"}), 400
    if data.get('userId') and str(data['userId']) != str(user_id):
        return jsonify({"success": False, "error": "Tu ne peux parier que pour toi-même"}), 403

    race = Race.query.get(race_id)
    if not race:
        return jsonify({"success": False, "error": "Race not found"}), 404
    lock_error = data_service.bet_lock_error(race, bool(is_banker))
    if lock_error:
        return jsonify({"success": False, "error": lock_error}), 400

    if data_service.place_bet(user_id, race_id, int(horse_number), is_banker=is_banker):
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "error": "Failed to place bet"}), 500

@betting_bp.route('/bet', methods=['POST'])
@require_user
def place_bet():
    """Place (or change) the logged-in player's bet. Keeps the banker flag."""
    return _place(is_banker=None)

@betting_bp.route('/banker', methods=['POST'])
@require_user
def place_banker_bet():
    """Make the logged-in player's bet on this race their banker for the day."""
    return _place(is_banker=True)

@betting_bp.route('/bets', methods=['GET'])
def get_all_bets():
    """All bets visible to the caller: their own, plus everyone's once a race locks."""
    return jsonify(data_service.get_visible_bets(current_user_id()))

@betting_bp.route('/bankers', methods=['GET'])
def get_all_bankers():
    """Banker bets {userId: raceId}; others' are hidden until the day's first race starts."""
    race_date = request.args.get('race_date')
    return jsonify(data_service.get_visible_bankers(race_date, current_user_id()))


@betting_bp.route('/bets/revealed', methods=['GET'])
def get_bets_revealed():
    """Whether the admin made every bet visible to everyone."""
    return jsonify({"revealed": data_service.get_bets_revealed()})
