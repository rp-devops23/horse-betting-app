# models_worldcup.py
"""
World Cup knockout-phase betting models.
Temporary feature — delete this file after the tournament.
"""

from database import db


class WCMatch(db.Model):
    __tablename__ = 'wc_matches'
    id = db.Column(db.String, primary_key=True)           # e.g. "R32-1", "QF-3", "F"
    round = db.Column(db.String, nullable=False)           # R32, R16, QF, SF, 3RD, F
    match_number = db.Column(db.Integer, nullable=False)
    team_a = db.Column(db.String, nullable=True)           # null = TBD
    team_b = db.Column(db.String, nullable=True)
    kickoff_utc = db.Column(db.DateTime, nullable=True)
    venue = db.Column(db.String, nullable=True)
    score_a = db.Column(db.Integer, nullable=True)
    score_b = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String, default='upcoming')      # upcoming | completed
    # Links to previous-round matches whose winners feed into this one
    source_a = db.Column(db.String, nullable=True)         # e.g. "R32-1"
    source_b = db.Column(db.String, nullable=True)         # e.g. "R32-2"

    bets = db.relationship('WCBet', backref='match', lazy=True, cascade='all, delete-orphan')


class WCBet(db.Model):
    __tablename__ = 'wc_bets'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    match_id = db.Column(db.String, db.ForeignKey('wc_matches.id'), nullable=False)
    predicted_a = db.Column(db.Integer, nullable=False)
    predicted_b = db.Column(db.Integer, nullable=False)
    points_awarded = db.Column(db.Integer, nullable=True)
