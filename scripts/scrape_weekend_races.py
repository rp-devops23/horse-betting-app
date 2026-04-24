"""
Weekend race scraper — scheduled entry point.

Scheduled runs (no arguments):
  Thursday evening → checks supertote.mu for Saturday races; scrapes + saves if found.
  Friday evening   → checks supertote.mu for Sunday races;   scrapes + saves if found.
  Any other day    → exits immediately with a log message (safe to call any time).

Manual run (pass an explicit date):
  python scripts/scrape_weekend_races.py 2026-04-26

The script is the sole owner of DB population for supertote races.  It imports the
Flask app to get a proper SQLAlchemy context, then calls DataService directly.

Render cron schedule (render.yaml):
  Thursday 18:00 MUT (UTC+4) = 14:00 UTC  →  "0 14 * * 4"
  Friday   18:00 MUT (UTC+4) = 14:00 UTC  →  "0 14 * * 5"
"""

import os
import sys
import logging
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Ensure the repo root is on sys.path so all app modules are importable
# whether this script is invoked from the repo root or from scripts/.
# ---------------------------------------------------------------------------
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _target_date_from_weekday() -> date | None:
    """Return the weekend date to check based on today's weekday.

    Thursday (3) → this Saturday  (+2 days)
    Friday   (4) → this Sunday    (+2 days)
    Anything else → None (no scheduled action today)
    """
    today = date.today()
    weekday = today.weekday()  # Monday=0 … Sunday=6

    if weekday == 3:   # Thursday
        target = today + timedelta(days=2)  # Saturday
        logger.info("Thursday detected — targeting Saturday %s", target)
        return target

    if weekday == 4:   # Friday
        target = today + timedelta(days=2)  # Sunday
        logger.info("Friday detected — targeting Sunday %s", target)
        return target

    logger.info(
        "Today is %s — not Thursday or Friday, no scheduled action.",
        today.strftime("%A"),
    )
    return None


# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def scrape_and_save(target_date_str: str) -> None:
    """Scrape supertote.mu for target_date_str and save to the database if races exist."""

    # Import here (after sys.path is set) so errors surface clearly
    from utils.supertote_scraper import scrape_races_from_supertote

    logger.info("Checking supertote.mu for races on %s ...", target_date_str)
    day_data = scrape_races_from_supertote(target_date_str)

    race_count = len(day_data.get("races", []))

    if race_count == 0:
        logger.info("No races found on supertote.mu for %s — nothing saved.", target_date_str)
        return

    logger.info(
        "Found %d race(s) on %s — saving to database ...",
        race_count,
        target_date_str,
    )

    # Import the Flask app (creates app + initialises db) and the shared data_service.
    # server.py creates the 'app' singleton at module level, so importing it is enough.
    from server import app
    from services import data_service

    with app.app_context():
        success = data_service.save_current_race_day_data(day_data)

    if success:
        logger.info(
            "✓ Saved %d race(s) for %s to the database.", race_count, target_date_str
        )
        for race in day_data["races"]:
            horse_count = len(race.get("horses", []))
            logger.info(
                "  %s  time=%-5s  horses=%d  name=%s",
                race["id"], race["time"], horse_count, race["name"],
            )
    else:
        logger.error("✗ Database save failed for %s.", target_date_str)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Manual override: python scripts/scrape_weekend_races.py YYYY-MM-DD
        date_arg = sys.argv[1].strip()
        try:
            date.fromisoformat(date_arg)  # validate format
        except ValueError:
            logger.error("Invalid date format '%s'. Expected YYYY-MM-DD.", date_arg)
            sys.exit(1)
        logger.info("Manual run — target date: %s", date_arg)
        scrape_and_save(date_arg)
    else:
        target = _target_date_from_weekday()
        if target is None:
            sys.exit(0)  # nothing to do today
        scrape_and_save(target.strftime("%Y-%m-%d"))
