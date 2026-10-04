# services/season_service.py
"""
Seasons, player profiles and trophies.

Everything here is computed from completed races only (bets are revealed once a
race locks), so it never leaks pending bets. Day scores are recomputed from the
bets with the current scoring config (same rules as DataService), so they are
right even if the stored UserScore rows were never refreshed.

A season is a calendar year (Mauritius time); its champion is crowned once the
year is over.
"""

import logging
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from models import Bet, Horse, Race, User
from services.data_service import MAURITIUS_TZ

logger = logging.getLogger(__name__)

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

RARITIES = {
    'common': 'Commun',
    'rare': 'Rare',
    'epic': 'Épique',
    'legendary': 'Légendaire',
}

# Trophies. Each is counted every time it is achieved:
#   kind 'event'  -> one count per occurrence; `target` is the bar to reach
#                    (progress shows the best attempt so far until the first one)
#   kind 'every'  -> one count per `target` occurrences of the underlying stat
TROPHIES = [
    # id,            emoji, name,                     description,                                                        rarity,      kind,    target
    ('king',          '👑', 'Roi de la piste',        'Finir 1er d’une journée 5 fois',                                     'rare',      'every', 5),
    ('runner_up',     '🥈', 'Éternel second',         'Finir 2e d’une journée 10 fois',                                     'rare',      'every', 10),
    ('four_wins',     '🍀', 'Carré gagnant',          'Trouver 4 gagnants dans la même journée',                            'rare',      'event', 4),
    ('five_wins',     '🖐️', 'Main de maître',         'Trouver 5 gagnants dans la même journée',                            'epic',      'event', 5),
    ('perfect_day',   '💎', 'Sans faute',             'Trouver le gagnant de toutes les courses d’une journée (6 min.)',   'legendary', 'event', 6),
    ('unicorn',       '🦄', 'Licorne',                'Gagner sur un cheval à cote 25 ou plus',                             'rare',      'event', 25),
    ('double_long',   '🎰', 'Coup double',            'Deux gagnants à cote 10 ou plus dans la même journée',               'epic',      'event', 2),
    ('lone_wolf',     '🐺', 'Seul contre tous',       'Être le seul à trouver le gagnant d’une course (4 parieurs min.)',   'rare',      'event', 1),
    ('bold_banker',   '⭐', 'Banker culotté',         'Banker gagnant sur un cheval à cote 8 ou plus',                      'rare',      'event', 8),
    ('jackpot',       '💰', 'Jackpot',                'Marquer 25 points en une journée',                                   'epic',      'event', 25),
    ('triple_crown',  '🔥', 'Triplé royal',           'Finir 1er de 3 journées d’affilée',                                  'legendary', 'event', 3),
    ('champion',      '🏆', 'Champion de la saison',  'Remporter une saison',                                               'legendary', 'event', 1),
    ('red_lantern',   '🐢', 'Lanterne rouge',         'Choisir 3 chevaux arrivés derniers dans la même journée',            'rare',      'event', 3),
    ('regular',       '📅', 'Pilier de l’hippodrome', 'Jouer 25 journées',                                                  'common',    'every', 25),
]


def season_label(period: str) -> str:
    return 'Depuis toujours' if period == 'all' else f'Saison {period}'


def _current_season() -> str:
    return datetime.now(MAURITIUS_TZ).strftime('%Y')


def _in_period(date: str, period: str) -> bool:
    return period == 'all' or date.startswith(period)


def _rank(entries: List[Dict[str, Any]], key: str = 'score') -> None:
    """Competition ranking (ties share a rank: 1, 1, 3), entries already sorted."""
    for i, entry in enumerate(entries):
        if i > 0 and entry[key] == entries[i - 1][key]:
            entry['rank'] = entries[i - 1]['rank']
        else:
            entry['rank'] = i + 1


class History:
    """All completed results loaded in a few bulk queries, with day scores recomputed."""

    def __init__(self):
        from services import data_service
        config = data_service.get_scoring_config()
        penalty = config.get('last_place_penalty', 0)

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

        self.races_per_day = defaultdict(int)
        for race in self.races.values():
            self.races_per_day[race.date] += 1
        self.bets_per_race = defaultdict(list)
        for bet in self.bets:
            self.bets_per_race[bet.race_id].append(bet)

        # Per day and player: points (same rules as DataService), winners, banker hit
        self.participants = defaultdict(set)              # date -> {user_id}
        raw = defaultdict(lambda: defaultdict(int))       # date -> uid -> points before banker
        wins = defaultdict(lambda: defaultdict(int))      # date -> uid -> winning bets
        banker_hit = defaultdict(set)                     # date -> {uid}
        for bet in self.bets:
            race = self.races[bet.race_id]
            date = race.date
            self.participants[date].add(bet.user_id)
            if race.winner_horse_number == bet.horse_number:
                horse = self.horses.get((race.id, bet.horse_number))
                if horse:
                    raw[date][bet.user_id] += data_service._calc_points(horse.odds or 0, config)
                wins[date][bet.user_id] += 1
                if bet.is_banker:
                    banker_hit[date].add(bet.user_id)
            elif penalty and race.last_horse_number and race.last_horse_number == bet.horse_number:
                raw[date][bet.user_id] += penalty

        self.dates = sorted(self.participants)
        self.day_scores = {}  # date -> {user_id: score}
        self.day_wins = {}    # date -> {user_id: winning bets}
        for date in self.dates:
            self.day_scores[date] = {
                uid: raw[date][uid] * (2 if uid in banker_hit[date] else 1)
                for uid in self.participants[date]
            }
            self.day_wins[date] = {uid: wins[date][uid] for uid in self.participants[date]}
        self._ranks = {}

    def bets_of(self, user_id: str) -> List[Bet]:
        return [b for b in self.bets if b.user_id == user_id]

    def day_ranks(self, date: str) -> Dict[str, int]:
        if date not in self._ranks:
            ordered = sorted(self.day_scores[date].items(), key=lambda kv: -kv[1])
            ranks, prev, rank = {}, None, 0
            for i, (uid, score) in enumerate(ordered):
                if score != prev:
                    rank, prev = i + 1, score
                ranks[uid] = rank
            self._ranks[date] = ranks
        return self._ranks[date]

    def day_winners(self, date: str) -> set:
        """Players who topped the day (ties all count), if the top score is positive."""
        scores = self.day_scores[date]
        top = max(scores.values(), default=0)
        return {uid for uid, s in scores.items() if s == top} if top > 0 else set()

    def crowns(self, period: str = 'all') -> Dict[str, int]:
        counts = defaultdict(int)
        for date in self.dates:
            if _in_period(date, period):
                for uid in self.day_winners(date):
                    counts[uid] += 1
        return counts

    def standings(self, period: str = 'all') -> List[Dict[str, Any]]:
        crowns = self.crowns(period)
        totals = {uid: {'score': 0, 'wins': 0, 'days': 0} for uid in self.users}
        for date in self.dates:
            if not _in_period(date, period):
                continue
            for uid, score in self.day_scores[date].items():
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

    def season_champions(self) -> Dict[str, List[str]]:
        """{'YYYY': [user_id, ...]} for finished seasons with a positive top score."""
        current = _current_season()
        champions = {}
        for season in sorted({d[:4] for d in self.dates if d[:4] < current}):
            table = [e for e in self.standings(season) if e['daysPlayed']]
            if table and table[0]['score'] > 0:
                champions[season] = [e['userId'] for e in table if e['score'] == table[0]['score']]
        return champions

    # --- Per-player numbers ---

    def player_numbers(self, user_id: str) -> Dict[str, Any]:
        bets = self.bets_of(user_id)
        winning, banker_total, banker_wins, last_picks = 0, 0, 0, 0
        biggest = None
        for bet in bets:
            race = self.races[bet.race_id]
            won = race.winner_horse_number == bet.horse_number
            horse = self.horses.get((race.id, bet.horse_number))
            if won:
                winning += 1
                odds = (horse.odds or 0) if horse else 0
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

        return {
            'totalBets': len(bets),
            'wins': winning,
            'winRate': round(winning / len(bets) * 100) if bets else 0,
            'bankerTotal': banker_total,
            'bankerWins': banker_wins,
            'bankerRate': round(banker_wins / banker_total * 100) if banker_total else None,
            'daysPlayed': len(played),
            'totalScore': sum(p for _, p in day_points),
            'bestDay': {'date': best_day[0], 'score': best_day[1]} if best_day else None,
            'biggestUpset': biggest,
            'lastPicks': last_picks,
            'bestStreak': best_streak,
            'currentStreak': streak,
        }

    def trophies(self, user_id: str, champions: Dict[str, List[str]] = None) -> List[Dict[str, Any]]:
        """Each trophy with how many times it was achieved and progress towards the next."""
        champions = champions if champions is not None else self.season_champions()
        stat = defaultdict(int)   # occurrences per trophy
        best = defaultdict(int)   # best attempt so far (for progress before the first one)

        first_run = 0
        for date in self.dates:
            # Triple crown: 3 consecutive race days on top (counted per block of 3)
            if user_id in self.day_winners(date):
                stat['king'] += 1
                first_run += 1
                best['triple_crown'] = max(best['triple_crown'], first_run % 3 or 3)
                if first_run % 3 == 0:
                    stat['triple_crown'] += 1
            else:
                first_run = 0
            if user_id not in self.participants[date]:
                continue
            stat['regular'] += 1
            if self.day_ranks(date)[user_id] == 2 and self.day_scores[date][user_id] > 0 \
                    and user_id not in self.day_winners(date):
                stat['runner_up'] += 1

            day_wins = self.day_wins[date][user_id]
            for tid, need in (('four_wins', 4), ('five_wins', 5)):
                best[tid] = max(best[tid], day_wins)
                if day_wins >= need:
                    stat[tid] += 1
            if self.races_per_day[date] >= 6:
                best['perfect_day'] = max(best['perfect_day'], day_wins)
                if day_wins == self.races_per_day[date]:
                    stat['perfect_day'] += 1
            score = self.day_scores[date][user_id]
            best['jackpot'] = max(best['jackpot'], score)
            if score >= 25:
                stat['jackpot'] += 1

        long_wins_by_day = defaultdict(int)
        lasts_by_day = defaultdict(int)
        for bet in self.bets_of(user_id):
            race = self.races[bet.race_id]
            if race.winner_horse_number != bet.horse_number:
                if race.last_horse_number == bet.horse_number:
                    lasts_by_day[race.date] += 1
                continue
            horse = self.horses.get((race.id, bet.horse_number))
            odds = (horse.odds or 0) if horse else 0
            best['unicorn'] = max(best['unicorn'], odds)
            if odds >= 25:
                stat['unicorn'] += 1
            if odds >= 10:
                long_wins_by_day[race.date] += 1
            if bet.is_banker:
                best['bold_banker'] = max(best['bold_banker'], odds)
                if odds >= 8:
                    stat['bold_banker'] += 1
            bettors = self.bets_per_race[race.id]
            winners = [b for b in bettors if b.horse_number == race.winner_horse_number]
            if len(bettors) >= 4 and len(winners) == 1:
                stat['lone_wolf'] += 1
        for count in long_wins_by_day.values():
            best['double_long'] = max(best['double_long'], count)
            if count >= 2:
                stat['double_long'] += 1
        for count in lasts_by_day.values():
            best['red_lantern'] = max(best['red_lantern'], count)
            if count >= 3:
                stat['red_lantern'] += 1
        stat['champion'] = sum(1 for winners in champions.values() if user_id in winners)

        result = []
        for tid, emoji, name, description, rarity, kind, target in TROPHIES:
            if kind == 'every':
                count = stat[tid] // target
                progress = stat[tid] % target
            else:
                count = stat[tid]
                progress = target if count else min(best[tid], target)
            result.append({
                'id': tid, 'emoji': emoji, 'name': name, 'description': description,
                'rarity': rarity, 'rarityLabel': RARITIES[rarity],
                'count': count, 'earned': count > 0,
                'progress': round(progress, 1), 'target': target,
                'repeatProgress': kind == 'every',
            })
        return result


class SeasonService:

    def get_standings(self, period: str = 'all') -> Dict[str, Any]:
        h = History()
        entries = h.standings(period)
        champions = h.season_champions()
        for entry in entries:
            earned = [t for t in h.trophies(entry['userId'], champions) if t['earned']]
            entry['badges'] = [t['emoji'] for t in earned]
            entry['trophyCount'] = sum(t['count'] for t in earned)
            entry['titles'] = sum(1 for w in champions.values() if entry['userId'] in w)
        return {'period': period, 'label': season_label(period), 'standings': entries}

    def get_seasons(self) -> Dict[str, Any]:
        h = History()
        current = _current_season()
        champions = h.season_champions()
        race_years = {r[0][:4] for r in Race.query.with_entities(Race.date).distinct().all()
                      if r[0] and DATE_RE.match(r[0])}
        seasons = []
        for season in sorted(race_years | {current}, reverse=True):
            table = [e for e in h.standings(season) if e['daysPlayed']]
            seasons.append({
                'id': season,
                'label': season_label(season),
                'isCurrent': season == current,
                'isOver': season < current,
                'raceDays': len([d for d in h.dates if d.startswith(season)]),
                'leader': table[0] if table and table[0]['score'] > 0 else None,
                'champions': [{'userId': uid, 'name': h.users[uid].name}
                              for uid in champions.get(season, []) if uid in h.users],
            })
        return {'current': current, 'seasons': seasons}

    def get_player_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        h = History()
        user = h.users.get(user_id)
        if not user:
            return None
        numbers = h.player_numbers(user_id)
        champions = h.season_champions()

        overall = h.standings('all')
        me = next(e for e in overall if e['userId'] == user_id)
        season = h.standings(_current_season())
        me_season = next(e for e in season if e['userId'] == user_id)

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
                'crowns': h.crowns().get(user_id, 0),
                'rank': me['rank'],
                'players': len(overall),
                'avgPerDay': me['avgPerDay'],
                'seasonLabel': season_label(_current_season()),
                'seasonScore': me_season['score'],
                'seasonRank': me_season['rank'] if me_season['daysPlayed'] else None,
            },
            'titles': [{'id': s, 'label': season_label(s)}
                       for s, winners in sorted(champions.items(), reverse=True) if user_id in winners],
            'form': form,
            'favouriteHorses': top(horse_stats),
            'favouriteJockeys': top(jockey_stats),
            'headToHead': head_to_head,
            'achievements': h.trophies(user_id, champions),
        }
