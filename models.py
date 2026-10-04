# models.py
"""
Database models for the horse betting application.
This file contains all SQLAlchemy models and breaks circular imports.
"""

from database import db

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)
    pin = db.Column(db.String(255), nullable=True)  # werkzeug hash
    is_admin = db.Column(db.Boolean, default=False)
    avatar = db.Column(db.String, nullable=True)  # emoji picked by the player

    # Relationships
    bets = db.relationship('Bet', backref='user', lazy=True, cascade='all, delete-orphan')
    scores = db.relationship('UserScore', backref='user', lazy=True, cascade='all, delete-orphan')

class Race(db.Model):
    __tablename__ = 'races'
    id = db.Column(db.String, primary_key=True)
    date = db.Column(db.String, nullable=False)
    race_number = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String, nullable=True)
    time = db.Column(db.String, nullable=True)
    distance = db.Column(db.String, nullable=True)
    status = db.Column(db.String, default='upcoming')
    winner_horse_number = db.Column(db.Integer, nullable=True)
    last_horse_number = db.Column(db.Integer, nullable=True)

    # Relationships
    horses = db.relationship('Horse', backref='race', lazy=True, cascade='all, delete-orphan')
    bets = db.relationship('Bet', backref='race', lazy=True, cascade='all, delete-orphan')

class Horse(db.Model):
    __tablename__ = 'horses'
    id = db.Column(db.String, primary_key=True)
    race_id = db.Column(db.String, db.ForeignKey('races.id'), nullable=False)
    horse_number = db.Column(db.Integer, nullable=False)
    stall_number = db.Column(db.Integer, nullable=True)
    name = db.Column(db.String, nullable=False)
    odds = db.Column(db.Float, nullable=False)
    scratched = db.Column(db.Boolean, default=False)
    jockey = db.Column(db.String, nullable=True)
    trainer = db.Column(db.String, nullable=True)
    weight_kg = db.Column(db.Float, nullable=True)
    age = db.Column(db.Integer, nullable=True)
    form = db.Column(db.String, nullable=True)

class AppSetting(db.Model):
    __tablename__ = 'app_settings'
    key = db.Column(db.String, primary_key=True)
    value = db.Column(db.Text, nullable=False)

class Bet(db.Model):
    __tablename__ = 'bets'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    race_id = db.Column(db.String, db.ForeignKey('races.id'), nullable=False)
    horse_number = db.Column(db.Integer, nullable=False)
    is_banker = db.Column(db.Boolean, default=False)
    points_awarded = db.Column(db.Integer, nullable=True)

class BetLog(db.Model):
    __tablename__ = 'bet_logs'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    race_id = db.Column(db.String, db.ForeignKey('races.id'), nullable=False)
    action = db.Column(db.String, nullable=False)  # 'placed', 'changed', 'banker_set', 'banker_moved'
    old_horse_number = db.Column(db.Integer, nullable=True)
    new_horse_number = db.Column(db.Integer, nullable=False)
    old_is_banker = db.Column(db.Boolean, nullable=True)
    new_is_banker = db.Column(db.Boolean, nullable=False)
    changed_by = db.Column(db.String, nullable=True)  # null = user self, otherwise admin user_id
    timestamp = db.Column(db.DateTime, nullable=False)

    user = db.relationship('User', backref=db.backref('bet_logs', lazy=True))
    race = db.relationship('Race', backref=db.backref('bet_logs', lazy=True))

class JobLog(db.Model):
    __tablename__ = 'job_logs'
    id = db.Column(db.String, primary_key=True)
    job_type = db.Column(db.String, nullable=False)  # 'scrape_races', 'update_odds', 'scrape_results'
    status = db.Column(db.String, nullable=False)  # 'started', 'success', 'error'
    race_date = db.Column(db.String, nullable=True)
    message = db.Column(db.Text, nullable=True)
    details = db.Column(db.Text, nullable=True)  # JSON string with extra context (e.g. horses updated, races found)
    snapshot = db.Column(db.Text, nullable=True)  # JSON snapshot of affected data before the job ran (for rollback)
    timestamp = db.Column(db.DateTime, nullable=False)

class UserScore(db.Model):
    __tablename__ = 'user_scores'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    race_date = db.Column(db.String, nullable=False)
    score = db.Column(db.Integer, default=0)
    wins = db.Column(db.Integer, default=0)