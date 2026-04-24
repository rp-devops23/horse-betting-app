# routes/admin.py (Updated - Using DataService)
import os
from flask import Blueprint, jsonify, request
from services import data_service

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/login', methods=['POST'])
def admin_login():
    """Validates admin password against ADMIN_PASSWORD env var."""
    password = request.json.get('password', '')
    expected = os.getenv('ADMIN_PASSWORD', 'admin123')
    if password == expected:
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "error": "Invalid password"}), 401

@admin_bp.route('/users', methods=['GET'])
def get_users_with_pins():
    """Returns all users with their PINs (admin only)."""
    from models import User
    users = User.query.order_by(User.name).all()
    return jsonify([{'id': u.id, 'name': u.name, 'pin': u.pin} for u in users])

@admin_bp.route('/users', methods=['PUT'])
def update_user():
    """Updates a user's name and/or PIN."""
    data = request.json
    user_id = data.get('userId')
    name = data.get('name')
    pin = data.get('pin')

    if not user_id or (not name and not pin):
        return jsonify({"error": "User ID and at least one of name or PIN are required"}), 400

    success = data_service.update_user(user_id, name, pin)
    if success:
        return jsonify({"success": True, "message": f"User {user_id} updated successfully."}), 200
    else:
        return jsonify({"success": False, "error": "User not found or update failed."}), 404

@admin_bp.route('/users', methods=['DELETE'])
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
def delete_race_day(race_date):
    """Deletes a race day and all associated data."""
    success = data_service.delete_race_day(race_date)
    if success:
        return jsonify({"success": True, "message": f"Race day {race_date} deleted successfully."}), 200
    else:
        return jsonify({"success": False, "error": "Race day not found or deletion failed."}), 404

@admin_bp.route('/backup', methods=['GET'])
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
def get_file_tree():
    """
    Simulates a file tree. Since we are using a database, this is now a placeholder.
    """
    return jsonify({"error": "File tree not available when using a database."}), 400

@admin_bp.route('/settings', methods=['GET'])
def get_settings():
    """Returns the current scoring configuration."""
    return jsonify(data_service.get_scoring_config())

@admin_bp.route('/settings', methods=['PUT'])
def update_settings():
    """Saves a new scoring configuration."""
    config = request.get_json(force=True)
    if not config or 'tiers' not in config:
        return jsonify({"error": "Invalid configuration"}), 400
    if data_service.save_scoring_config(config):
        return jsonify({"success": True})
    return jsonify({"error": "Failed to save settings"}), 500

@admin_bp.route('/reset-data', methods=['POST'])
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