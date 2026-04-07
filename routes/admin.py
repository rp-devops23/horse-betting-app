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

@admin_bp.route('/users', methods=['PUT'])
def update_user():
    """Updates a user's name."""
    data = request.json
    user_id = data.get('userId')
    name = data.get('name')
    
    if not user_id or not name:
        return jsonify({"error": "User ID and name are required"}), 400
    
    success = data_service.update_user(user_id, name)
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

@admin_bp.route('/files', methods=['GET'])
def get_file_tree():
    """
    Simulates a file tree. Since we are using a database, this is now a placeholder.
    """
    return jsonify({"error": "File tree not available when using a database."}), 400

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