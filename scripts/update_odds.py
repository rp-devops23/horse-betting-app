"""
Odds updater — scheduled entry point.

Scrapes live Win odds from smspariaz.com and updates the current race day in
the database, without touching user bets or race results.

The script is a no-op if:
  - No races exist in the DB for today's MUT date, OR
  - The first race of the day has already started (Mauritius time, UTC+4).

Render cron schedule (render.yaml):
  "0 4,5,6,7,8 * * 6,0"  →  Sat+Sun every hour from 08:00–12:00 MUT (UTC+4)

Manual run:
  python scripts/update_odds.py              # use today's MUT date
  python scripts/update_odds.py 2026-05-02   # force a specific date
"""

import os
import sys
import logging
from datetime import datetime, timezone, timedelta

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

MUT = timezone(timedelta(hours=4))  # Mauritius Standard Time = UTC+4


def _first_race_started(races: list) -> bool:
    """Return True if the earliest race time has already passed (in MUT)."""
    now_mut = datetime.now(MUT)
    times = []
    for race in races:
        t = race.get("time", "")
        if t and t != "TBD":
            try:
                h, m = map(int, t.split(":"))
                times.append(h * 60 + m)
            except ValueError:
                pass
    if not times:
        return False
    first_start_min = min(times)
    now_min = now_mut.hour * 60 + now_mut.minute
    return now_min >= first_start_min


def run(date_str: str | None = None) -> None:
    from utils.smspariaz_odds_scraper import scrape_odds_from_smspariaz
    from server import app
    from services import data_service

    with app.app_context():
        if date_str is None:
            from models import Race as RaceModel
            today = datetime.now(MUT).strftime("%Y-%m-%d")
            next_race = RaceModel.query.filter(RaceModel.date >= today).order_by(RaceModel.date).first()
            date_str = next_race.date if next_race else today

        day_data = data_service.get_race_day_data(date_str)
        races = day_data.get("races", [])

        if not races:
            logger.info("No races in DB for %s — nothing to update.", date_str)
            return

        if _first_race_started(races):
            logger.info(
                "First race for %s has already started (MUT) — odds update skipped.",
                date_str,
            )
            return

        logger.info("Scraping odds from smspariaz.com for %s …", date_str)
        odds_data = scrape_odds_from_smspariaz()

        if not odds_data:
            logger.warning("No odds returned from smspariaz — nothing saved.")
            return

        n = data_service.update_race_day_odds(date_str, odds_data)
        logger.info("Done — updated %d horse(s) for %s.", n, date_str)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    run(args[0] if args else None)
