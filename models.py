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
    pin = db.Column(db.String(4), nullable=True)

    # Relationships
    bets = db.relationship('Bet', backref='user', lazy=True, cascade='all, delete-orphan')
    scores = db.relationship('UserScore', backref='user', lazy=True, cascade='all, delete-orphan')

class Race(db.Model):
    __tablename__ = 'races'
    id = db.Column(db.String, primary_key=True)
    date = db.Column(db.String, nullable=False)
    race_number = db.Column(db.Integer, nullable=False)
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
    name = db.Column(db.String, nullable=False)
    odds = db.Column(db.Float, nullable=False)
    scratched = db.Column(db.Boolean, default=False)

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

class UserScore(db.Model):
    __tablename__ = 'user_scores'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    race_date = db.Column(db.String, nullable=False)
    score = db.Column(db.Integer, default=0)