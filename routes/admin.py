# routes/admin.py (Updated - Using DataService)
import os
from flask import Blueprint, jsonify, request
from services import data_service
from auth import require_admin, issue_token, current_user_id, is_locked_out, record_failed_attempt, clear_failed_attempts

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/login', methods=['POST'])
def admin_login():
    """Validates admin password against ADMIN_PASSWORD env var."""
    import hmac
    password = (request.get_json(silent=True) or {}).get('password', '')
    expected = os.getenv('ADMIN_PASSWORD')
    if not expected:
        raise RuntimeError("ADMIN_PASSWORD environment variable is not set")
    if is_locked_out('admin'):
        return jsonify({"success": False, "error": "Trop d'essais. Réessaie dans quelques minutes."}), 429
    if hmac.compare_digest(password.encode(), expected.encode()):
        clear_failed_attempts('admin')
        # Keep the logged-in player (if any) attached to the admin session
        return jsonify({"success": True, "token": issue_token(current_user_id(), admin_password=True)}), 200
    record_failed_attempt('admin')
    return jsonify({"success": False, "error": "Invalid password"}), 401

@admin_bp.route('/users', methods=['GET'])
@require_admin
def get_users_with_pins():
    """Returns all users and whether they have a PIN set (PINs are hashed)."""
    from models import User
    users = User.query.order_by(User.name).all()
    return jsonify([{'id': u.id, 'name': u.name, 'has_pin': bool(u.pin)} for u in users])

@admin_bp.route('/users', methods=['PUT'])
@require_admin
def update_user():
    """Updates a user's name and/or PIN."""
    data = request.json
    user_id = data.get('userId')
    name = data.get('name')
    pin = data.get('pin')

    if not user_id or (not name and not pin):
        return jsonify({"error": "User ID and at least one of name or PIN are required"}), 400
    if pin and (len(str(pin)) != 4 or not str(pin).isdigit()):
        return jsonify({"error": "PIN must be 4 digits"}), 400

    success = data_service.update_user(user_id, name, pin)
    if success:
        return jsonify({"success": True, "message": f"User {user_id} updated successfully."}), 200
    else:
        return jsonify({"success": False, "error": "User not found or update failed."}), 404

@admin_bp.route('/users', methods=['DELETE'])
@require_admin
def delete_user():
    """Deletes a user and all their associated data."""
    user_id = request.json.get('userId')
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    success = data_service.delete_user(user_id)
    if success:
        return jsonify({"success": True, "message": f"User {user_id} deleted successfully."}), 200
    else:
        return jsonify({"success": False, "error": "User not found or deletion failed."}), 404

@admin_bp.route('/race-days/<race_date>', methods=['DELETE'])
@require_admin
def delete_race_day(race_date):
    """Deletes a race day and all associated data."""
    success = data_service.delete_race_day(race_date)
    if success:
        return jsonify({"success": True, "message": f"Race day {race_date} deleted successfully."}), 200
    else:
        return jsonify({"success": False, "error": "Race day not found or deletion failed."}), 404

@admin_bp.route('/backup', methods=['GET'])
@require_admin
def backup_data():
    """Download a full JSON backup of the database."""
    backup = data_service.backup_all_data()
    filename = f"lekours_backup_{backup['exported_at'][:10]}.json"
    from flask import Response
    import json
    return Response(
        json.dumps(backup, indent=2, ensure_ascii=False),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )

@admin_bp.route('/restore', methods=['POST'])
@require_admin
def restore_data():
    """Restore the database from a JSON backup. Wipes all existing data first."""
    backup = request.get_json(force=True)
    if not backup or backup.get('version') != '1':
        return jsonify({"error": "Invalid or missing backup payload."}), 400
    success = data_service.restore_all_data(backup)
    if success:
        return jsonify({"success": True, "message": "Database restored from backup."}), 200
    return jsonify({"success": False, "error": "Restore failed — check server logs."}), 500

@admin_bp.route('/files', methods=['GET'])
@require_admin
def get_file_tree():
    """
    Simulates a file tree. Since we are using a database, this is now a placeholder.
    """
    return jsonify({"error": "File tree not available when using a database."}), 400

@admin_bp.route('/users/toggle-admin', methods=['POST'])
@require_admin
def toggle_user_admin():
    """Grants or revokes admin flag for a user."""
    data = request.get_json(force=True)
    user_id = data.get('userId')
    is_admin = bool(data.get('isAdmin', False))
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    if data_service.set_user_admin(user_id, is_admin):
        return jsonify({"success": True})
    return jsonify({"error": "User not found"}), 404

@admin_bp.route('/settings', methods=['GET'])
def get_settings():
    """Returns the current scoring configuration."""
    return jsonify(data_service.get_scoring_config())

@admin_bp.route('/settings', methods=['PUT'])
@require_admin
def update_settings():
    """Saves a new scoring configuration."""
    config = request.get_json(force=True)
    if not config or 'tiers' not in config:
        return jsonify({"error": "Invalid configuration"}), 400
    if data_service.save_scoring_config(config):
        return jsonify({"success": True})
    return jsonify({"error": "Failed to save settings"}), 500

@admin_bp.route('/races/<race_id>/horses', methods=['GET'])
@require_admin
def list_race_horses(race_id):
    """Lists all horses and bets for a specific race (for debugging duplicate-horse issues)."""
    from models import Race, Horse, Bet, User
    race = Race.query.get(race_id)
    if not race:
        return jsonify({"error": "Race not found"}), 404
    horses = Horse.query.filter_by(race_id=race_id).order_by(Horse.horse_number).all()
    bets = Bet.query.filter_by(race_id=race_id).all()
    users = {u.id: u.name for u in User.query.all()}
    return jsonify({
        "race_id": race_id,
        "race_number": race.race_number,
        "date": race.date,
        "winner_horse_number": race.winner_horse_number,
        "horses": [{"id": h.id, "number": h.horse_number, "name": h.name, "scratched": h.scratched} for h in horses],
        "bets": [{"user": users.get(b.user_id, b.user_id), "horse_number": b.horse_number, "is_banker": b.is_banker} for b in bets],
    })


@admin_bp.route('/races/<race_id>/horses/<int:horse_number>', methods=['DELETE'])
@require_admin
def delete_horse(race_id, horse_number):
    """Deletes a specific horse record (use to remove duplicates created by re-scraping)."""
    from models import Horse, Bet
    from database import db
    horse = Horse.query.filter_by(race_id=race_id, horse_number=horse_number).first()
    if not horse:
        return jsonify({"error": "Horse not found"}), 404
    bet_count = Bet.query.filter_by(race_id=race_id, horse_number=horse_number).count()
    if bet_count > 0:
        return jsonify({"error": f"Cannot delete — {bet_count} bet(s) reference this horse number"}), 409
    db.session.delete(horse)
    db.session.commit()
    return jsonify({"success": True, "message": f"Horse #{horse_number} deleted from race {race_id}"}), 200


@admin_bp.route('/bet', methods=['POST'])
@require_admin
def admin_place_bet():
    """Admin: place or change any bet for any user, bypassing all restrictions."""
    data = request.get_json(force=True) or {}
    user_id = data.get('userId')
    race_id = data.get('raceId')
    horse_number = data.get('horseNumber')
    is_banker = bool(data['isBanker']) if 'isBanker' in data else None  # None keeps the current flag
    admin_id = current_user_id() or 'admin'
    if not all([user_id, race_id, horse_number]):
        return jsonify({"error": "userId, raceId and horseNumber are required"}), 400
    success = data_service.place_bet(user_id, race_id, int(horse_number), is_banker=is_banker, force=True, changed_by=None if admin_id == user_id else admin_id)
    if success:
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "error": "Failed to place bet"}), 500


@admin_bp.route('/banker', methods=['POST'])
@require_admin
def admin_set_banker():
    """Force-set a banker for any user on any race, bypassing the completed-race restriction."""
    data = request.get_json(force=True) or {}
    user_id = data.get('userId')
    race_id = data.get('raceId')
    horse_number = data.get('horseNumber')
    admin_id = current_user_id() or 'admin'
    if not all([user_id, race_id, horse_number]):
        return jsonify({"error": "userId, raceId and horseNumber are required"}), 400
    success = data_service.place_bet(user_id, race_id, int(horse_number), is_banker=True, force=True, changed_by=None if admin_id == user_id else admin_id)
    if success:
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "error": "Failed to set banker"}), 500


@admin_bp.route('/day-bets', methods=['GET'])
@require_admin
def get_day_bets():
    """All bets and bankers of a race day, including ones still hidden from players (admin view)."""
    from models import Bet, Race
    race_date = request.args.get('race_date')
    if not race_date:
        return jsonify({"error": "race_date is required"}), 400
    bets = Bet.query.join(Race).filter(Race.date == race_date).all()
    return jsonify({
        "bets": [{"userId": b.user_id, "raceId": b.race_id, "horse": b.horse_number,
                  "is_banker": bool(b.is_banker)} for b in bets],
        "bankers": {b.user_id: b.race_id for b in bets if b.is_banker},
    })


@admin_bp.route('/bet-logs', methods=['GET'])
@require_admin
def get_bet_logs():
    """Returns bet change logs, optionally filtered by race_date or user_id."""
    from models import BetLog, User, Race, Horse
    race_date = request.args.get('race_date')
    user_id = request.args.get('user_id')

    query = BetLog.query.join(Race).join(User)
    if race_date:
        query = query.filter(Race.date == race_date)
    if user_id:
        query = query.filter(BetLog.user_id == user_id)

    logs = query.order_by(BetLog.timestamp.desc()).limit(200).all()

    result = []
    for log in logs:
        # Resolve horse names
        old_horse = None
        new_horse = None
        if log.old_horse_number:
            h = Horse.query.filter_by(race_id=log.race_id, horse_number=log.old_horse_number).first()
            old_horse = h.name if h else None
        h = Horse.query.filter_by(race_id=log.race_id, horse_number=log.new_horse_number).first()
        new_horse = h.name if h else None

        # Resolve admin name if changed_by is set
        admin_name = None
        if log.changed_by:
            admin_user = User.query.get(log.changed_by)
            admin_name = admin_user.name if admin_user else log.changed_by

        result.append({
            "id": log.id,
            "userId": log.user_id,
            "userName": log.user.name,
            "raceId": log.race_id,
            "raceDate": log.race.date,
            "raceNumber": log.race.race_number,
            "action": log.action,
            "oldHorseNumber": log.old_horse_number,
            "oldHorseName": old_horse,
            "newHorseNumber": log.new_horse_number,
            "newHorseName": new_horse,
            "oldIsBanker": log.old_is_banker,
            "newIsBanker": log.new_is_banker,
            "changedBy": admin_name,
            "timestamp": log.timestamp.isoformat()
        })
    return jsonify(result)


@admin_bp.route('/job-logs', methods=['GET'])
@require_admin
def get_job_logs():
    """Returns job execution logs, optionally filtered by job_type or race_date."""
    from models import JobLog
    import json
    job_type = request.args.get('job_type')
    race_date = request.args.get('race_date')

    query = JobLog.query
    if job_type:
        query = query.filter(JobLog.job_type == job_type)
    if race_date:
        query = query.filter(JobLog.race_date == race_date)

    logs = query.order_by(JobLog.timestamp.desc()).limit(100).all()

    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "jobType": log.job_type,
            "status": log.status,
            "raceDate": log.race_date,
            "message": log.message,
            "details": json.loads(log.details) if log.details else None,
            "hasSnapshot": log.snapshot is not None,
            "timestamp": log.timestamp.isoformat()
        })
    return jsonify(result)


@admin_bp.route('/reset-data', methods=['POST'])
@require_admin
def reset_all_data():
    """Delete all user data (bets, bankers, users)."""
    try:
        from models import User, Bet, UserScore
        from database import db
        
        # Delete all data
        Bet.query.delete()
        UserScore.query.delete()
        User.query.delete()
        
        db.session.commit()
        return jsonify({"success": True, "message": "All user data cleared"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500