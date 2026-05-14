"""
Supertote.mu scraper for horse racing data.

Fetches the race-card index page for a given date, follows each race link,
and extracts: race number, race time, race name, horse number, horse name,
jockey, trainer, age, weight, form, win odds, and place odds.

Output format is compatible with DataService.save_current_race_day_data().
"""

import re
import time
import random
import logging
from datetime import datetime

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://www.supertote.mu"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": BASE_URL,
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_supertote_date(date_str: str) -> str:
    """Convert YYYY-MM-DD to the DD-mmm-YYYY format used in supertote URLs.

    Example: '2026-04-25' → '25-apr-2026'
    """
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%d-%b-%Y").lower()


def _fetch(url: str, session: requests.Session) -> BeautifulSoup | None:
    """GET a URL with a small random delay and return a BeautifulSoup object.

    Returns None on any HTTP or connection error.
    """
    try:
        time.sleep(random.uniform(0.8, 1.8))
        response = session.get(url, headers=_HEADERS, timeout=15)
        response.raise_for_status()
        logger.info("Fetched %s (%d chars)", url, len(response.text))
        return BeautifulSoup(response.text, "html.parser")
    except requests.RequestException as exc:
        logger.error("Request failed for %s: %s", url, exc)
        return None


def _find_horse_container(horse_link_tag) -> BeautifulSoup:
    """Walk up the DOM from a horse-name <a> tag to find the element that
    also contains the odds links for that horse.

    Climbs at most 8 levels; stops early when an odds link is found inside.
    """
    container = horse_link_tag.parent
    for _ in range(8):
        if container.find("a", href=re.compile(r"/browse/")):
            break
        parent = container.parent
        if parent is None or parent.name in ("body", "html"):
            break
        container = parent
    return container


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def _to_24h(time_str: str) -> str:
    """Normalise a supertote time string to HH:MM 24-hour format.

    Supertote omits the leading '1' for afternoon hours, e.g. '1:10' means
    13:10 and '4:55' means 16:55.  Mauritius racing runs ~12:00–17:00, so
    any hour in the range 1–9 is treated as 13–21 (i.e. add 12).
    Hours already >= 10 are left as-is.
    """
    try:
        h, m = map(int, time_str.split(":"))
        if 1 <= h <= 9:
            h += 12
        return f"{h:02d}:{m:02d}"
    except (ValueError, AttributeError):
        return time_str


# ---------------------------------------------------------------------------
# Race-page scraper
# ---------------------------------------------------------------------------

def _scrape_race_page(
    url: str,
    race_number: int,
    date_str: str,
    session: requests.Session,
) -> dict | None:
    """Scrape a single race detail page.

    Returns a race dict compatible with the app's day_data structure, or
    None if the page could not be fetched.
    """
    soup = _fetch(url, session)
    if not soup:
        return None

    # ------------------------------------------------------------------
    # Race time, name, and distance
    # ------------------------------------------------------------------
    race_time = "TBD"
    race_name = f"Race {race_number}"
    race_distance = None

    headings = soup.find_all(["h1", "h2", "h3", "h4"])

    # Heading that contains "Race N : HH.MM" or "Race N - HH:MM"
    for h in headings:
        text = h.get_text(" ", strip=True)
        m = re.search(r"Race\s+\d+\s*[:\-]\s*(\d{1,2}[.:]\d{2})", text, re.IGNORECASE)
        if m:
            race_time = _to_24h(m.group(1).replace(".", ":"))
            break

    # Separate heading that holds the race title (no "Race N" in it)
    title_headings = [
        h.get_text(" ", strip=True)
        for h in headings
        if not re.search(r"\bRace\s+\d+\b", h.get_text(), re.IGNORECASE)
        and len(h.get_text(strip=True)) > 5
    ]
    if title_headings:
        race_name = title_headings[0]

    # Distance — look for a standalone "NNNNm" pattern anywhere on the page
    page_text = soup.get_text(" ")
    dist_m = re.search(r"\b(\d{3,5})\s*m\b", page_text)
    if dist_m:
        race_distance = f"{dist_m.group(1)}m"

    # ------------------------------------------------------------------
    # Horses — anchor tags whose href begins with /horse/
    # ------------------------------------------------------------------
    horse_links = soup.find_all("a", href=re.compile(r"^/horse/"))
    if not horse_links:
        logger.warning("No horse links found on %s", url)

    horses = []
    for position, horse_link in enumerate(horse_links, start=1):
        horse_name = horse_link.get_text(strip=True)
        if not horse_name:
            continue

        container = _find_horse_container(horse_link)
        full_text = container.get_text(" ", strip=True)

        # Horse number ─ look for a short standalone digit string inside the
        # container; fall back to ordinal position if none found.
        horse_number = position
        for candidate in container.find_all(string=re.compile(r"^\s*\d{1,2}\s*$")):
            try:
                horse_number = int(str(candidate).strip())
                break
            except ValueError:
                pass

        # Stall number — span with class "r-lane"
        stall_tag = container.find("span", class_="r-lane")
        stall_number = None
        if stall_tag:
            try:
                stall_number = int(stall_tag.get_text(strip=True))
            except (ValueError, AttributeError):
                pass

        # Jockey — span with class "r-jockey"
        jockey_tag = container.find("span", class_="r-jockey")
        jockey = jockey_tag.get_text(strip=True) if jockey_tag else ""

        # Trainer — span with class "r-trainer"
        trainer_tag = container.find("span", class_="r-trainer")
        trainer = trainer_tag.get_text(strip=True) if trainer_tag else ""

        # Age
        age_m = re.search(r"\bAge\s+(\d+)\b", full_text, re.IGNORECASE)
        age = int(age_m.group(1)) if age_m else None

        # Weight (kg)
        weight_m = re.search(r"(\d+(?:\.\d+)?)\s*kg", full_text, re.IGNORECASE)
        weight_kg = float(weight_m.group(1)) if weight_m else None

        # Recent form (e.g. "2-11-2-2-4-3")
        form_m = re.search(r"\b(\d[\d\-]{3,})\b", full_text)
        form = form_m.group(1) if form_m else ""

        # Odds are intentionally not scraped from supertote — smspariaz is the
        # sole source of odds and will populate them separately.
        horses.append({
            "number": horse_number,
            "stall": stall_number,
            "name": horse_name,
            "jockey": jockey,
            "trainer": trainer,
            "age": age,
            "weight_kg": weight_kg,
            "form": form,
            "odds": 0.0,
        })

    horses.sort(key=lambda h: h["number"])

    date_compact = date_str.replace("-", "")
    race_id = f"supertote_R{race_number}_{date_compact}"

    logger.info(
        "Race %d (%s): %d horse(s), time=%s",
        race_number, race_id, len(horses), race_time,
    )

    return {
        "id": race_id,
        "name": race_name,
        "time": race_time,
        "distance": race_distance,
        "horses": horses,
        "winner": None,
        "status": "upcoming",
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def _detect_next_race_date(session: requests.Session) -> str | None:
    """Auto-detect the next race day by fetching /racing (no date).

    Supertote's /racing page always shows the current or next upcoming race day.
    We parse the date from the race links on that page.

    Returns a YYYY-MM-DD string, or None if detection fails.
    """
    soup = _fetch(f"{BASE_URL}/racing", session)
    if not soup:
        return None

    # Race links look like /racing/02-may-2026/champ-de-mars-1
    race_link = soup.find("a", href=re.compile(r"/racing/\d{2}-[a-z]{3}-\d{4}/"))
    if not race_link or not hasattr(race_link, "get"):
        return None

    m = re.search(r"/racing/(\d{2}-[a-z]{3}-\d{4})/", str(race_link.get("href", "")))
    if not m:
        return None

    try:
        return datetime.strptime(m.group(1), "%d-%b-%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def scrape_races_from_supertote(date_str: str | None = None) -> dict:
    """Scrape horse racing data from supertote.mu for a given date.

    Args:
        date_str: Race date in YYYY-MM-DD format.
                  If omitted, auto-detects the next race day from /racing.

    Returns:
        A day_data dict compatible with DataService.save_current_race_day_data():
        {
            "date": "YYYY-MM-DD",
            "status": "upcoming",
            "races": [
                {
                    "id": "supertote_R1_YYYYMMDD",
                    "name": "<race title>",
                    "time": "HH:MM",
                    "horses": [
                        {
                            "number": 1,
                            "name": "HORSE NAME",
                            "jockey": "C. Hewitson",
                            "trainer": "K. Ramsamy",
                            "age": 4,
                            "weight_kg": 61.5,
                            "form": "2-11-2-2-4-3",
                            "odds": 1.20,        # win (decimal, centesimal ÷ 100)
                            "place_odds": 1.40,  # place (decimal, centesimal ÷ 100)
                            "points": 1,         # scoring tier
                        },
                        ...
                    ],
                    "winner": None,
                    "status": "upcoming",
                },
                ...
            ],
            "bets": {},
            "bankers": {},
            "userScores": [],
        }

    Note:
        Only the fields "number", "name", "odds", and "points" are persisted
        to the database by DataService (Horse model). The extra fields
        (jockey, trainer, age, weight_kg, form, place_odds) are returned for
        informational use and are safely ignored during save.
    """
    session = requests.Session()

    if date_str is None:
        logger.info("No date provided — auto-detecting next race day from %s/racing", BASE_URL)
        date_str = _detect_next_race_date(session)
        if date_str:
            logger.info("Auto-detected race date: %s", date_str)
        else:
            logger.warning("Could not auto-detect race date; falling back to today.")
            date_str = datetime.now().strftime("%Y-%m-%d")

    supertote_date = _to_supertote_date(date_str)
    index_url = f"{BASE_URL}/racing/{supertote_date}"

    empty_day = {
        "date": date_str,
        "status": "upcoming",
        "races": [],
        "bets": {},
        "bankers": {},
        "userScores": [],
    }

    # ------------------------------------------------------------------
    # Step 1: fetch race-day index and collect individual race URLs
    # ------------------------------------------------------------------
    logger.info("Fetching race day index: %s", index_url)
    index_soup = _fetch(index_url, session)
    if not index_soup:
        logger.error("Failed to load race day index page.")
        return empty_day

    # Race links match /racing/<date>/<venue>-<number>
    link_pattern = re.compile(
        rf"/racing/{re.escape(supertote_date)}/[^/\s\"']+"
    )
    seen_hrefs: set[str] = set()
    race_urls: list[str] = []

    from bs4 import Tag  # local import to avoid circular issues at module level
    for a_tag in index_soup.find_all("a", href=link_pattern):
        if not isinstance(a_tag, Tag):
            continue
        href = str(a_tag["href"])
        if href not in seen_hrefs:
            seen_hrefs.add(href)
            full_url = href if href.startswith("http") else BASE_URL + href
            race_urls.append(full_url)

    if not race_urls:
        logger.warning("No race links found for %s on %s", date_str, index_url)
        return empty_day

    logger.info("Found %d race link(s) for %s", len(race_urls), date_str)

    # ------------------------------------------------------------------
    # Step 2: scrape each race page
    # ------------------------------------------------------------------
    races: list[dict] = []

    for url in race_urls:
        # Extract race number from URL tail, e.g. "/champ-de-mars-3" → 3
        tail_match = re.search(r"-(\d+)$", url.rstrip("/"))
        race_number = int(tail_match.group(1)) if tail_match else len(races) + 1

        logger.info("Scraping race %d: %s", race_number, url)
        race_data = _scrape_race_page(url, race_number, date_str, session)
        if race_data:
            races.append(race_data)
        else:
            logger.warning("Skipping race %d — page scrape failed.", race_number)

    # Sort by race number for consistency
    def _race_sort_key(r: dict) -> int:
        m = re.search(r"R(\d+)", r["id"])
        return int(m.group(1)) if m else 0

    races.sort(key=_race_sort_key)

    logger.info("Done — scraped %d race(s) for %s", len(races), date_str)

    return {
        "date": date_str,
        "status": "upcoming",
        "races": races,
        "bets": {},
        "bankers": {},
        "userScores": [],
    }
