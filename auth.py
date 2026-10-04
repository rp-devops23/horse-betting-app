# auth.py
"""
Token-based authentication for the API.

Players log in with their PIN and receive a signed token; the admin password
login also returns a token. The frontend sends it back as
`Authorization: Bearer <token>`.

Scheduled GitHub Actions jobs authenticate with the `X-Job-Token` header,
which must match the JOB_TOKEN env var.
"""

import functools
import hashlib
import hmac
import logging
import os
import time
from collections import defaultdict

from flask import g, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

logger = logging.getLogger(__name__)

TOKEN_MAX_AGE = 60 * 60 * 24 * 90  # 90 days

# Brute-force protection for 4-digit PINs and the admin password
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 5 * 60
_failed_attempts = defaultdict(list)  # key -> [timestamps]


def _secret_key() -> str:
    key = os.getenv('SECRET_KEY')
    if key:
        return key
    # Fall back to a key derived from the admin password so existing
    # deployments keep working without a new env var.
    admin_password = os.getenv('ADMIN_PASSWORD')
    if admin_password:
        return hashlib.sha256(f'lekours-token:{admin_password}'.encode()).hexdigest()
    raise RuntimeError("SECRET_KEY (or ADMIN_PASSWORD) environment variable must be set")


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_secret_key(), salt='lekours-auth')


def issue_token(user_id: str = None, admin_password: bool = False) -> str:
    """Issue a token for a player (user_id) and/or an admin-password session."""
    return _serializer().dumps({'uid': user_id, 'apw': bool(admin_password)})


def _load_auth():
    """Parse the bearer token. Returns {'user_id', 'is_admin'} or None."""
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return None
    try:
        payload = _serializer().loads(header[7:], max_age=TOKEN_MAX_AGE)
    except BadSignature:
        return None

    from models import User
    user_id = payload.get('uid')
    is_admin = bool(payload.get('apw'))
    if user_id:
        user = User.query.get(user_id)
        if not user:
            return None
        is_admin = is_admin or bool(user.is_admin)
    elif not is_admin:
        return None
    return {'user_id': user_id, 'is_admin': is_admin}


def current_auth():
    """Return the authenticated identity for this request (cached), or None."""
    if 'auth' not in g:
        g.auth = _load_auth()
    return g.auth


def current_user_id():
    auth = current_auth()
    return auth['user_id'] if auth else None


def is_admin_request() -> bool:
    auth = current_auth()
    return bool(auth and auth['is_admin'])


def _is_job_request() -> bool:
    expected = os.getenv('JOB_TOKEN')
    if not expected:
        logger.warning("JOB_TOKEN is not set — scheduled job endpoints are unauthenticated")
        return True
    provided = request.headers.get('X-Job-Token', '')
    return hmac.compare_digest(provided, expected)


def require_user(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            return jsonify({"success": False, "error": "Connexion requise"}), 401
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not is_admin_request():
            return jsonify({"success": False, "error": "Accès admin requis"}), 403
        return f(*args, **kwargs)
    return wrapper


def require_admin_or_job(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not (is_admin_request() or _is_job_request()):
            return jsonify({"success": False, "error": "Accès admin requis"}), 403
        return f(*args, **kwargs)
    return wrapper


# --- Login throttling ---

def is_locked_out(key: str) -> bool:
    now = time.time()
    attempts = [t for t in _failed_attempts[key] if now - t < LOCKOUT_SECONDS]
    _failed_attempts[key] = attempts
    return len(attempts) >= MAX_FAILED_ATTEMPTS


def attempts_left(key: str) -> int:
    is_locked_out(key)  # prunes expired attempts
    return max(0, MAX_FAILED_ATTEMPTS - len(_failed_attempts[key]))


def record_failed_attempt(key: str):
    _failed_attempts[key].append(time.time())


def clear_failed_attempts(key: str):
    _failed_attempts.pop(key, None)
