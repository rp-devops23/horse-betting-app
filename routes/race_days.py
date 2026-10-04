# routes/race_days.py (Updated - Using DataService)
from flask import Blueprint, jsonify, request
from services import data_service
from auth import current_user_id

race_days_bp = Blueprint('race_days', __name__)

@race_days_bp.route('/index', methods=['GET'])
def get_race_days():
    """Get a list of all race days available."""
    index_data = data_service.get_race_day_index()
    return jsonify(index_data)

@race_days_bp.route('/<race_date>', methods=['GET'])
def get_race_day_data_by_date(race_date):
    """Get the full data for a specific race day."""
    day_data = data_service.get_race_day_data(race_date, current_user_id())
    if day_data:
        return jsonify(day_data)
    return jsonify({"error": "Race day not found"}), 404

@race_days_bp.route('/current', methods=['GET'])
def get_current_race_day():
    """Get the current/latest race day data."""
    from datetime import datetime
    current_date = datetime.now().strftime('%Y-%m-%d')
    day_data = data_service.get_race_day_data(current_date, current_user_id())
    if day_data:
        return jsonify({"data": day_data})
    
    # If no current day data, get the latest available
    index_data = data_service.get_race_day_index()
    if index_data.get("raceDays"):
        latest_date = index_data["raceDays"][0]["date"]  # First is most recent
        latest_data = data_service.get_race_day_data(latest_date, current_user_id())
        return jsonify({"data": latest_data})
    
    return jsonify({"data": None})

@race_days_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get overall leaderboard data."""
    leaderboard_data = data_service.get_leaderboard_data()
    return jsonify({"success": True, "leaderboard": leaderboard_data.get("users", [])})

@race_days_bp.route('/stats', methods=['GET'])
def get_all_stats():
    """Get all-time stats for all players."""
    stats = data_service.get_all_stats()
    return jsonify({"success": True, "stats": stats})

@race_days_bp.route('/leaderboard/current', methods=['GET'])
def get_current_leaderboard():
    """Get current day leaderboard data."""
    scores = data_service.calculate_current_user_scores()
    return jsonify({"success": True, "scores": scores})

@race_days_bp.route('/<race_date>/scores', methods=['GET'])
def get_race_day_scores(race_date):
    """Get scores for a specific race day."""
    try:
        scores = data_service.calculate_historical_user_scores(race_date)
        return jsonify({"success": True, "scores": scores})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@race_days_bp.route('/historical', methods=['GET'])
def get_historical_race_days():
    """Get historical race days."""
    index_data = data_service.get_race_day_index()
    historical_days = []
    for day in index_data.get("raceDays", []):
        historical_days.append({
            "date": day["date"],
            "status": "completed"  # You can make this more sophisticated
        })
    return jsonify({"success": True, "historical_race_days": historical_days})