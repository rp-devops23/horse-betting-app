"""
Race card scraper — scheduled entry point.

On each run the script:
  1. Fetches the supertote.mu calendar to discover every race date that has a
     published race card (only dates with a live /racing/ link are returned).
  2. Compares that list against race dates already stored in the database.
  3. Scrapes and saves every new date that is not yet in the database.

This makes the logic completely general — it does not assume which day of the
week a race falls on.  The four scheduled runs per week simply ensure the DB
is populated as soon as supertote.mu publishes a new card:

  Thu 18:00 MUT  — Saturday cards typically appear Thursday
  Fri 18:00 MUT  — Sunday cards typically appear Friday
  Sat 08:00 MUT  — morning check / fallback for Saturday
  Sun 08:00 MUT  — morning check / fallback for Sunday

Render cron schedule (render.yaml):
  Evening runs  →  "0 14 * * 4,5"   (Thu+Fri at 14:00 UTC = 18:00 MUT)
  Morning runs  →  "0 4 * * 6,0"    (Sat+Sun at 04:00 UTC = 08:00 MUT)

Safety note:
  save_current_race_day_data() clears ALL existing data for a date (including
  user bets) before reinserting.  This script therefore skips any date that
  already has races in the database, so that user bets placed after the first
  scrape are never accidentally wiped.

Manual run (useful for back-filling or testing):
  python scripts/scrape_weekend_races.py              # normal scheduled logic
  python scripts/scrape_weekend_races.py 2026-04-26   # force a specific date
  python scripts/scrape_weekend_races.py --force 2026-04-26  # overwrite even if in DB
"""

import os
import re
import sys
import logging
import requests
from datetime import datetime, date, timedelta
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Repo root on sys.path so all app modules are importable from scripts/
# ---------------------------------------------------------------------------
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

BASE_URL = "https://www.supertote.mu"
CALENDAR_URL = f"{BASE_URL}/calendar"
# Only look at race dates within this window to avoid scraping stale history
LOOKAHEAD_DAYS = 30


# ---------------------------------------------------------------------------
# Calendar helpers
# ---------------------------------------------------------------------------

def _fetch_html(url: str) -> BeautifulSoup | None:
    """GET a URL and return BeautifulSoup, or None on failure."""
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout=15,
        )
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        logger.error("Failed to fetch %s: %s", url, exc)
        return None


def _supertote_to_iso(supertote_date: str) -> str | None:
    """Convert '25-apr-2026' → '2026-04-25'.  Returns None if unparseable."""
    try:
        return datetime.strptime(supertote_date, "%d-%b-%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def get_published_race_dates() -> list[str]:
    """
    Fetch the supertote.mu calendar and return every race date (YYYY-MM-DD)
    that currently has a published race card (i.e. an active /racing/ link),
    filtered to today … today + LOOKAHEAD_DAYS.
    """
    soup = _fetch_html(CALENDAR_URL)
    if not soup:
        logger.warning("Could not fetch calendar — will fall back to empty list.")
        return []

    today = date.today()
    cutoff = today + timedelta(days=LOOKAHEAD_DAYS)

    # Every link whose href looks like /racing/DD-mmm-YYYY
    pattern = re.compile(r"^/racing/(\d{2}-[a-z]{3}-\d{4})$", re.IGNORECASE)

    from bs4 import Tag
    dates: list[str] = []
    for a in soup.find_all("a", href=pattern):
        if not isinstance(a, Tag):
            continue
        m = pattern.match(str(a["href"]))
        if not m:
            continue
        iso = _supertote_to_iso(m.group(1))
        if iso is None:
            continue
        race_date = date.fromisoformat(iso)
        if today <= race_date <= cutoff:
            dates.append(iso)

    dates.sort()
    logger.info(
        "Calendar: %d published race date(s) in the next %d days: %s",
        len(dates), LOOKAHEAD_DAYS, dates or "none",
    )
    return dates


# ---------------------------------------------------------------------------
# DB helpers (require Flask app context — call inside `with app.app_context()`)
# ---------------------------------------------------------------------------

def _get_dates_in_db() -> set[str]:
    """Return the set of race dates already stored in the database."""
    from services import data_service
    index = data_service.get_race_day_index()
    return {entry["date"] for entry in index.get("raceDays", [])}


def _save(day_data: dict) -> bool:
    """Persist a scraped day_data dict to the database."""
    from services import data_service
    return data_service.save_current_race_day_data(day_data)


# ---------------------------------------------------------------------------
# Core scrape-and-save logic
# ---------------------------------------------------------------------------

def scrape_and_save(target_date_str: str, force: bool = False) -> bool:
    """
    Scrape supertote.mu for target_date_str and save to the DB if:
      - races are found on supertote, AND
      - the date is not already in the DB (unless force=True)

    Returns True if data was saved, False otherwise.
    """
    from utils.supertote_scraper import scrape_races_from_supertote
    from server import app

    with app.app_context():
        if not force and target_date_str in _get_dates_in_db():
            logger.info(
                "%s already in database — skipping (use --force to overwrite).",
                target_date_str,
            )
            return False

    logger.info("Scraping supertote.mu for %s ...", target_date_str)
    day_data = scrape_races_from_supertote(target_date_str)
    race_count = len(day_data.get("races", []))

    if race_count == 0:
        logger.info("No race card found on supertote.mu for %s.", target_date_str)
        return False

    logger.info(
        "%d race(s) found for %s — saving to database ...",
        race_count, target_date_str,
    )

    with app.app_context():
        success = _save(day_data)

    if success:
        logger.info("✓ Saved %d race(s) for %s.", race_count, target_date_str)
        for race in day_data["races"]:
            logger.info(
                "    %-30s  time=%-5s  horses=%d",
                race["id"], race["time"], len(race.get("horses", [])),
            )
    else:
        logger.error("✗ Database save failed for %s.", target_date_str)

    return success


def run_scheduled(force: bool = False) -> None:
    """
    Discover all published race dates on supertote.mu that are not yet in the
    database, then scrape and save each one.
    """
    published = get_published_race_dates()
    if not published:
        logger.info("No newly published race dates found — nothing to do.")
        return

    from server import app
    with app.app_context():
        in_db = _get_dates_in_db()

    new_dates = [d for d in published if force or d not in in_db]

    if not new_dates:
        logger.info(
            "All %d published date(s) are already in the database — nothing to do.",
            len(published),
        )
        return

    logger.info(
        "%d new date(s) to scrape: %s",
        len(new_dates), new_dates,
    )

    saved = 0
    for d in new_dates:
        if scrape_and_save(d, force=force):
            saved += 1

    logger.info("Done — %d/%d date(s) successfully saved.", saved, len(new_dates))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = sys.argv[1:]
    force = "--force" in args
    date_args = [a for a in args if a != "--force"]

    if date_args:
        # Manual: python scripts/scrape_weekend_races.py [--force] YYYY-MM-DD
        date_str = date_args[0].strip()
        try:
            date.fromisoformat(date_str)
        except ValueError:
            logger.error("Invalid date '%s'. Expected YYYY-MM-DD.", date_str)
            sys.exit(1)
        logger.info("Manual run — target date: %s%s", date_str, " (force)" if force else "")
        ok = scrape_and_save(date_str, force=force)
        sys.exit(0 if ok else 1)
    else:
        # Scheduled / no-arg run — discover and scrape all new dates
        run_scheduled(force=force)
