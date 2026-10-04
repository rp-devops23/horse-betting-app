# services/season_service.py
"""
Seasons, player profiles and trophies.

Everything here is computed from completed races only (bets are revealed once a
race locks), so it never leaks pending bets. Day scores come from UserScore,
which DataService keeps up to date when results come in.

Seasons are calendar months (Mauritius time). A month's champion is crowned
once the month is over.
"""

import logging
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from models import Bet, Horse, Race, User, UserScore
from services.data_service import MAURITIUS_TZ

MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
             'août', 'septembre', 'octobre', 'novembre', 'décembre']

# id, emoji, name, description, target
ACHIEVEMENTS = [
    ('first_win',   '🎉', 'Premier sang',     'Gagner un premier pari', 1),
    ('crown',       '👑', 'Roi du jour',      'Finir une journée en tête', 1),
    ('champion',    '🏆', 'Champion du mois', 'Remporter une saison mensuelle', 1),
    ('outsider',    '🦄', 'Licorne',          'Gagner sur un cheval à cote 20 ou plus', 20),
    ('hat_trick',   '🎩', 'Coup du chapeau',  'Gagner 3 courses dans la même journée', 3),
    ('banker_gold', '⭐', 'Banker en or',     'Réussir 3 bankers', 3),
    ('on_fire',     '🔥', 'En feu',           'Gagner au moins une course 3 journées de suite', 3),
    ('jackpot',     '💰', 'Jackpot',          'Marquer 20 points en une journée', 20),
    ('faithful',    '📅', 'Fidèle au poste',  'Jouer 10 journées', 10),
    ('centurion',   '💯', 'Centurion',        'Atteindre 100 points au total', 100),
    ('red_lantern', '🐢', 'Lanterne rouge',   'Choisir 3 fois le cheval arrivé dernier', 3),
]


logger = logging.getLogger(__name__)

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def month_label(period: str) -> str:
    year, month = period.split('-')
    return f"{MONTHS_FR[int(month) - 1].capitalize()} {year}"


def period_label(period: str) -> str:
    if period == 'all':
        return 'Depuis toujours'
    if len(period) == 4:
        return f"Année {period}"
    return month_label(period)


def _current_month() -> str:
    return datetime.now(MAURITIUS_TZ).strftime('%Y-%m')


def _rank(entries: List[Dict[str, Any]], key: str = 'score') -> None:
    """Competition ranking (ties share a rank), entries already sorted."""
    for i, entry in enumerate(entries):
        if i > 0 and entry[key] == entries[i - 1][key]:
            entry['rank'] = entries[i - 1]['rank']
        else:
            entry['rank'] = i + 1


class History:
    """All completed results loaded in a few bulk queries."""

    def __init__(self):
        self.users = {u.id: u for u in User.query.all()}
        races = Race.query.filter(Race.winner_horse_number.isnot(None)).all()
        # Ignore races with a malformed date rather than failing every page
        self.races = {r.id: r for r in races if r.date and DATE_RE.match(r.date)}
        race_ids = list(self.races)
        self.horses = {}
        self.bets = []
        if race_ids:
            self.horses = {(h.race_id, h.horse_number): h
                           for h in Horse.query.filter(Horse.race_id.in_(race_ids)).all()}
            self.bets = [b for b in Bet.query.filter(Bet.race_id.in_(race_ids)).all()
                         if b.user_id in self.users]

        # Per-day participation and scores
        self.participants = defaultdict(set)  # date -> {user_id}
        for bet in self.bets:
            self.participants[self.races[bet.race_id].date].add(bet.user_id)
        self.dates = sorted(self.participants)

        stored = {(s.user_id, s.race_date): s for s in UserScore.query.all()}
        self.day_scores = {}  # date -> {user_id: score}
        self.day_wins = {}    # date -> {user_id: wins}
        for date in self.dates:
            self.day_scores[date] = {}
            self.day_wins[date] = {}
            for uid in self.participants[date]:
                s = stored.get((uid, date))
                self.day_scores[date][uid] = (s.score or 0) if s else 0
                self.day_wins[date][uid] = (s.wins or 0) if s else 0

    def bets_of(self, user_id: str) -> List[Bet]:
        return [b for b in self.bets if b.user_id == user_id]

    def day_ranks(self, date: str) -> Dict[str, int]:
        ordered = sorted(self.day_scores[date].items(), key=lambda kv: -kv[1])
        ranks, prev, rank = {}, None, 0
        for i, (uid, score) in enumerate(ordered):
            if score != prev:
                rank, prev = i + 1, score
            ranks[uid] = rank
        return ranks

    def crowns(self, period: str = 'all') -> Dict[str, int]:
        """Days won (top score > 0, ties all count) per user."""
        counts = defaultdict(int)
        for date in self.dates:
            if period != 'all' and not date.startswith(period):
                continue
            scores = self.day_scores[date]
            top = max(scores.values(), default=0)
            if top <= 0:
                continue
            for uid, score in scores.items():
                if score == top:
                    counts[uid] += 1
        return counts

    def standings(self, period: str = 'all') -> List[Dict[str, Any]]:
        crowns = self.crowns(period)
        totals = {uid: {'score': 0, 'wins': 0, 'days': 0} for uid in self.users}
        for date in self.dates:
            if period != 'all' and not date.startswith(period):
                continue
            for uid, score in self.day_scores[date].items():
                if uid in totals:
                    totals[uid]['score'] += score
                    totals[uid]['wins'] += self.day_wins[date][uid]
                    totals[uid]['days'] += 1
        entries = [{
            'userId': uid,
            'name': self.users[uid].name,
            'score': t['score'],
            'wins': t['wins'],
            'daysPlayed': t['days'],
            'crowns': crowns.get(uid, 0),
            'avgPerDay': round(t['score'] / t['days'], 1) if t['days'] else 0,
        } for uid, t in totals.items()]
        entries.sort(key=lambda e: (-e['score'], -e['wins'], -e['daysPlayed'], e['name'].lower()))
        _rank(entries)
        return entries

    def month_champions(self) -> Dict[str, List[str]]:
        """{'YYYY-MM': [user_id, ...]} for finished months that had a positive top score."""
        current = _current_month()
        months = sorted({d[:7] for d in self.dates if d[:7] < current})
        champions = {}
        for month in months:
            table = [e for e in self.standings(month) if e['daysPlayed']]
            if table and table[0]['score'] > 0:
                champions[month] = [e['userId'] for e in table if e['score'] == table[0]['score']]
        return champions

    # --- Per-player numbers ---

    def player_numbers(self, user_id: str) -> Dict[str, Any]:
        bets = self.bets_of(user_id)
        winning_odds, banker_total, banker_wins, last_picks = [], 0, 0, 0
        biggest = None
        for bet in bets:
            race = self.races[bet.race_id]
            won = race.winner_horse_number == bet.horse_number
            horse = self.horses.get((race.id, bet.horse_number))
            if won:
                odds = (horse.odds or 0) if horse else 0
                winning_odds.append(odds)
                if horse and odds and (biggest is None or odds > biggest['odds']):
                    biggest = {'horse': horse.name, 'odds': odds, 'date': race.date}
            elif race.last_horse_number == bet.horse_number:
                last_picks += 1
            if bet.is_banker:
                banker_total += 1
                banker_wins += 1 if won else 0

        played = [d for d in self.dates if user_id in self.participants[d]]
        day_points = [(d, self.day_scores[d][user_id]) for d in played]
        best_day = max(day_points, key=lambda dp: dp[1], default=None)

        # Longest run of consecutive race days with at least one winning bet
        streak = best_streak = 0
        for date in self.dates:
            if self.day_wins[date].get(user_id, 0) > 0:
                streak += 1
                best_streak = max(best_streak, streak)
            else:
                streak = 0
        current_streak = streak

        return {
            'totalBets': len(bets),
            'wins': len(winning_odds),
            'winRate': round(len(winning_odds) / len(bets) * 100) if bets else 0,
            'bankerTotal': banker_total,
            'bankerWins': banker_wins,
            'bankerRate': round(banker_wins / banker_total * 100) if banker_total else None,
            'daysPlayed': len(played),
            'totalScore': sum(p for _, p in day_points),
            'bestDay': {'date': best_day[0], 'score': best_day[1]} if best_day else None,
            'maxDayWins': max((self.day_wins[d][user_id] for d in played), default=0),
            'biggestUpset': biggest,
            'lastPicks': last_picks,
            'bestStreak': best_streak,
            'currentStreak': current_streak,
        }

    def achievements(self, user_id: str, numbers: Dict[str, Any] = None,
                     crowns: Dict[str, int] = None,
                     champions: Dict[str, List[str]] = None) -> List[Dict[str, Any]]:
        n = numbers or self.player_numbers(user_id)
        crowns = crowns if crowns is not None else self.crowns()
        champions = champions if champions is not None else self.month_champions()
        titles = sum(1 for winners in champions.values() if user_id in winners)
        progress = {
            'first_win': n['wins'],
            'crown': crowns.get(user_id, 0),
            'champion': titles,
            'outsider': n['biggestUpset']['odds'] if n['biggestUpset'] else 0,
            'hat_trick': n['maxDayWins'],
            'banker_gold': n['bankerWins'],
            'on_fire': n['bestStreak'],
            'jackpot': n['bestDay']['score'] if n['bestDay'] else 0,
            'faithful': n['daysPlayed'],
            'centurion': n['totalScore'],
            'red_lantern': n['lastPicks'],
        }
        # Badges you can earn more than once show a count
        repeatable = {'crown', 'champion'}
        result = []
        for aid, emoji, name, description, target in ACHIEVEMENTS:
            value = progress[aid]
            result.append({
                'id': aid, 'emoji': emoji, 'name': name, 'description': description,
                'earned': value >= target,
                'progress': min(value, target), 'target': target,
                'count': value if aid in repeatable else None,
            })
        return result


class SeasonService:

    def get_standings(self, period: str = 'all') -> Dict[str, Any]:
        h = History()
        entries = h.standings(period)
        crowns, champions = h.crowns(), h.month_champions()
        for entry in entries:
            earned = [a for a in h.achievements(entry['userId'], crowns=crowns, champions=champions) if a['earned']]
            entry['badges'] = [a['emoji'] for a in earned]
            entry['titles'] = sum(1 for w in champions.values() if entry['userId'] in w)
        return {'period': period, 'label': period_label(period), 'standings': entries}

    def get_seasons(self) -> Dict[str, Any]:
        h = History()
        current = _current_month()
        champions = h.month_champions()
        race_months = {r[0][:7] for r in Race.query.with_entities(Race.date).distinct().all()
                       if r[0] and DATE_RE.match(r[0])}
        months = sorted(race_months | {current}, reverse=True)
        seasons = []
        for month in months:
            table = [e for e in h.standings(month) if e['daysPlayed']]
            seasons.append({
                'id': month,
                'label': month_label(month),
                'isCurrent': month == current,
                'isOver': month < current,
                'raceDays': len([d for d in h.dates if d.startswith(month)]),
                'leader': table[0] if table and table[0]['score'] > 0 else None,
                'champions': [{'userId': uid, 'name': h.users[uid].name}
                              for uid in champions.get(month, []) if uid in h.users],
            })
        years = sorted({m[:4] for m in months}, reverse=True)
        return {'current': current, 'months': seasons, 'years': years}

    def get_player_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        h = History()
        user = h.users.get(user_id)
        if not user:
            return None
        numbers = h.player_numbers(user_id)
        crowns, champions = h.crowns(), h.month_champions()

        overall = h.standings('all')
        me = next(e for e in overall if e['userId'] == user_id)
        month = h.standings(_current_month())
        me_month = next(e for e in month if e['userId'] == user_id)

        form = []
        for date in h.dates:
            if user_id in h.participants[date]:
                form.append({
                    'date': date,
                    'score': h.day_scores[date][user_id],
                    'wins': h.day_wins[date][user_id],
                    'rank': h.day_ranks(date)[user_id],
                    'players': len(h.participants[date]),
                })

        horse_stats = defaultdict(lambda: {'bets': 0, 'wins': 0})
        jockey_stats = defaultdict(lambda: {'bets': 0, 'wins': 0})
        for bet in h.bets_of(user_id):
            race = h.races[bet.race_id]
            horse = h.horses.get((race.id, bet.horse_number))
            if not horse:
                continue
            won = race.winner_horse_number == bet.horse_number
            for key, stats in ((horse.name, horse_stats), (horse.jockey, jockey_stats)):
                if key:
                    stats[key]['bets'] += 1
                    stats[key]['wins'] += 1 if won else 0

        def top(stats):
            ranked = sorted(stats.items(), key=lambda kv: (-kv[1]['bets'], -kv[1]['wins'], kv[0]))
            return [{'name': name, **s} for name, s in ranked[:5]]

        head_to_head = []
        for other_id, other in h.users.items():
            if other_id == user_id:
                continue
            won = lost = drawn = 0
            for date in h.dates:
                scores = h.day_scores[date]
                if user_id in scores and other_id in scores:
                    if scores[user_id] > scores[other_id]:
                        won += 1
                    elif scores[user_id] < scores[other_id]:
                        lost += 1
                    else:
                        drawn += 1
            if won + lost + drawn:
                head_to_head.append({'userId': other_id, 'name': other.name,
                                     'won': won, 'lost': lost, 'drawn': drawn})
        head_to_head.sort(key=lambda r: -(r['won'] + r['lost'] + r['drawn']))

        return {
            'user': {'id': user.id, 'name': user.name},
            'summary': {
                **numbers,
                'crowns': crowns.get(user_id, 0),
                'rank': me['rank'],
                'players': len(overall),
                'avgPerDay': me['avgPerDay'],
                'monthScore': me_month['score'],
                'monthRank': me_month['rank'] if me_month['daysPlayed'] else None,
            },
            'titles': [{'id': m, 'label': month_label(m)}
                       for m, winners in sorted(champions.items(), reverse=True) if user_id in winners],
            'form': form,
            'favouriteHorses': top(horse_stats),
            'favouriteJockeys': top(jockey_stats),
            'headToHead': head_to_head,
            'achievements': h.achievements(user_id, numbers, crowns, champions),
        }
