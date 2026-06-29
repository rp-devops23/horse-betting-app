# routes/worldcup.py
"""
World Cup knockout-phase betting routes.
Temporary feature — delete this file after the tournament.
"""

from flask import Blueprint, jsonify, request
from services.worldcup_service import WorldCupService

worldcup_bp = Blueprint('worldcup', __name__)
wc_service = WorldCupService()


@worldcup_bp.route('/matches', methods=['GET'])
def get_matches():
    return jsonify(wc_service.get_all_matches())


@worldcup_bp.route('/bracket', methods=['GET'])
def get_bracket():
    return jsonify(wc_service.get_bracket())


@worldcup_bp.route('/matches/seed', methods=['POST'])
def seed_matches():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected a JSON array of matches"}), 400
    if wc_service.seed_matches(data):
        return jsonify({"success": True, "count": len(data)})
    return jsonify({"error": "Failed to seed matches"}), 500


@worldcup_bp.route('/matches/<match_id>/result', methods=['POST'])
def enter_result(match_id):
    data = request.get_json(force=True) or {}
    score_a = data.get('score_a')
    score_b = data.get('score_b')
    if score_a is None or score_b is None:
        return jsonify({"error": "score_a and score_b are required"}), 400
    penalty_winner = data.get('penalty_winner')  # 'a' or 'b'
    success, error = wc_service.enter_result(match_id, int(score_a), int(score_b), penalty_winner=penalty_winner)
    if success:
        return jsonify({"success": True})
    return jsonify({"error": error}), 400


@worldcup_bp.route('/matches/<match_id>/teams', methods=['PUT'])
def update_teams(match_id):
    data = request.get_json(force=True) or {}
    success = wc_service.update_match_teams(
        match_id,
        team_a=data.get('team_a'),
        team_b=data.get('team_b'),
    )
    if success:
        return jsonify({"success": True})
    return jsonify({"error": "Match not found"}), 404


@worldcup_bp.route('/predict', methods=['POST'])
def place_prediction():
    data = request.get_json(force=True) or {}
    user_id = data.get('userId')
    match_id = data.get('matchId')
    predicted_a = data.get('predictedA')
    predicted_b = data.get('predictedB')
    penalty_winner = data.get('penaltyWinner')  # 'a' or 'b'
    if not all(v is not None for v in [user_id, match_id, predicted_a, predicted_b]):
        return jsonify({"error": "userId, matchId, predictedA and predictedB are required"}), 400
    success, error = wc_service.place_prediction(user_id, match_id, int(predicted_a), int(predicted_b), predicted_pen_winner=penalty_winner)
    if success:
        return jsonify({"success": True})
    return jsonify({"error": error}), 400


@worldcup_bp.route('/predictions/<user_id>', methods=['GET'])
def get_predictions(user_id):
    return jsonify(wc_service.get_user_predictions(user_id))


@worldcup_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    return jsonify(wc_service.get_leaderboard())


@worldcup_bp.route('/matches/<match_id>/predictions', methods=['GET'])
def get_match_predictions(match_id):
    return jsonify(wc_service.get_match_predictions(match_id))


@worldcup_bp.route('/all-predictions', methods=['GET'])
def get_all_predictions():
    return jsonify(wc_service.get_all_predictions())


@worldcup_bp.route('/fetch', methods=['POST'])
def fetch_from_espn():
    """Fetch matches from ESPN API and seed/update the database."""
    from utils.worldcup_fetcher import fetch_matches
    from models_worldcup import WCMatch
    from database import db

    matches = fetch_matches()
    if not matches:
        return jsonify({"error": "No matches returned from ESPN"}), 502

    # Check if we already have matches seeded
    existing = WCMatch.query.count()
    if existing == 0:
        # First time: seed all matches
        seed_data = [{
            "id": m["id"],
            "round": m["round"],
            "match_number": m["match_number"],
            "team_a": m["team_a"],
            "team_b": m["team_b"],
            "kickoff_utc": m["kickoff_utc"].isoformat() if m["kickoff_utc"] else None,
            "venue": m["venue"],
        } for m in matches]
        wc_service.seed_matches(seed_data)

    # Update scores and teams for all matches
    updated = 0
    for m in matches:
        match = WCMatch.query.get(m["id"])
        if not match:
            # New match (e.g. next round just appeared on ESPN)
            from datetime import datetime
            kickoff = None
            if m["kickoff_utc"]:
                kickoff = m["kickoff_utc"] if isinstance(m["kickoff_utc"], datetime) else datetime.fromisoformat(str(m["kickoff_utc"]).replace("Z", "+00:00"))
            match = WCMatch(
                id=m["id"], round=m["round"], match_number=m["match_number"],
                team_a=m["team_a"], team_b=m["team_b"],
                kickoff_utc=kickoff, venue=m["venue"], status="upcoming",
            )
            db.session.add(match)

        # Update teams if they changed (TBD → actual team)
        if m["team_a"] and not match.team_a:
            match.team_a = m["team_a"]
        if m["team_b"] and not match.team_b:
            match.team_b = m["team_b"]

        # Update score if match completed and we haven't scored it yet
        if m["status"] == "completed" and match.status != "completed":
            wc_service.enter_result(m["id"], m["score_a"], m["score_b"], require_penalty=False)
            updated += 1

    db.session.commit()
    return jsonify({"success": True, "total": len(matches), "updated": updated})


@worldcup_bp.route('/data', methods=['DELETE'])
def delete_all():
    if wc_service.delete_all_wc_data():
        return jsonify({"success": True})
    return jsonify({"error": "Failed to delete WC data"}), 500
