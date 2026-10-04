# routes/users.py (Fixed imports)
"""
User-related routes with proper imports.
"""

from flask import Blueprint, jsonify, request
from services import data_service
from auth import (issue_token, current_auth, current_user_id, require_admin, require_user,
                  is_locked_out, record_failed_attempt, clear_failed_attempts)

users_bp = Blueprint('users', __name__)

@users_bp.route('/users', methods=['GET'])
def get_users():
    """Get all users."""
    users = data_service.get_all_users()
    return jsonify(users)

@users_bp.route('/users', methods=['POST'])
def add_user():
    """Add a new user."""
    new_user_name = request.json.get('name')
    pin = request.json.get('pin')
    if not new_user_name:
        return jsonify({"error": "Name is required"}), 400
    if not pin or len(str(pin)) != 4 or not str(pin).isdigit():
        return jsonify({"error": "A 4-digit PIN is required"}), 400
    new_user = data_service.add_user(name=new_user_name, pin=str(pin))
    return jsonify({**new_user, "token": issue_token(new_user["id"])}), 201

@users_bp.route('/users/login', methods=['POST'])
def login_user():
    """Verify a user's PIN."""
    user_id = request.json.get('userId')
    pin = request.json.get('pin')
    if not user_id or not pin:
        return jsonify({"error": "userId and pin are required"}), 400
    if is_locked_out(f'user:{user_id}'):
        return jsonify({"success": False, "error": "Trop d'essais. Réessaie dans quelques minutes."}), 429
    result = data_service.verify_user_pin(user_id, str(pin))
    if result:
        clear_failed_attempts(f'user:{user_id}')
        return jsonify({**result, "token": issue_token(user_id)}), 200
    record_failed_attempt(f'user:{user_id}')
    return jsonify({"success": False, "error": "Invalid PIN"}), 401

@users_bp.route('/users/me', methods=['GET'])
def get_me():
    """Returns the player behind the current token (used to restore a session)."""
    auth = current_auth()
    if not auth:
        return jsonify({"success": False, "error": "Not logged in"}), 401
    from models import User
    user = User.query.get(auth['user_id']) if auth['user_id'] else None
    return jsonify({
        "success": True,
        "id": user.id if user else None,
        "name": user.name if user else None,
        "is_admin": auth['is_admin'],
    })
    
AVATARS = {'🐴', '🦄', '🏇', '🐎', '🦓', '🐢', '🦊', '🐯', '🦁', '🐼', '🐸', '🐙', '🦖', '🐝', '🦜', '🐬', '👑', '🍀', '🌟', '🔥', '🎩', '🌈', '🍍', '🥥'}

@users_bp.route('/users/me', methods=['PUT'])
@require_user
def update_me():
    """Lets a player change their avatar emoji."""
    avatar = (request.get_json(silent=True) or {}).get('avatar')
    if avatar is not None and avatar not in AVATARS:
        return jsonify({"success": False, "error": "Avatar inconnu"}), 400
    data_service.set_user_avatar(current_user_id(), avatar)
    return jsonify({"success": True, "avatar": avatar})

@users_bp.route('/users/<user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id):
    """Delete a user."""
    if data_service.delete_user(user_id):
        return jsonify({"success": True, "message": f"User {user_id} deleted"}), 200
    return jsonify({"error": f"User {user_id} not found"}), 404