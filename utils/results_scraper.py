"""
Supertote.mu results scraper.

Fetches race winners for a given date by scraping each race page
and looking for the "1st" finishing position marker.

Returns a list of {race_number, winner_horse_number} dicts compatible
with DataService.scrape_race_results().
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


def _to_supertote_date(date_str: str) -> str:
    """'2026-04-25' → '25-apr-2026'"""
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%d-%b-%Y").lower()


def _fetch(url: str, session: requests.Session):
    try:
        time.sleep(random.uniform(0.8, 1.8))
        response = session.get(url, headers=_HEADERS, timeout=15)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except requests.RequestException as exc:
        logger.error("Request failed for %s: %s", url, exc)
        return None


def _extract_winner(soup: BeautifulSoup):
    """Return the winning horse number from a race result page, or None."""
    text = soup.get_text(" ")
    # Supertote shows "1st  1  Iko Iko" — match "1st" followed by a 1-2 digit number
    m = re.search(r'\b1st\s+(\d{1,2})\b', text)
    if m:
        return int(m.group(1))
    return None


def scrape_race_results_from_supertote(date_str: str = None) -> list:
    """Scrape race winners from supertote.mu for the given date.

    Args:
        date_str: Race date in YYYY-MM-DD format. Defaults to today.

    Returns:
        List of dicts: [{"race_number": 1, "winner_horse_number": 3}, ...]
        Only races that have a published result are included.
    """
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    supertote_date = _to_supertote_date(date_str)
    index_url = f"{BASE_URL}/racing/{supertote_date}"

    session = requests.Session()

    logger.info("Fetching race day index for results: %s", index_url)
    index_soup = _fetch(index_url, session)
    if not index_soup:
        logger.error("Could not load index page for %s", date_str)
        return []

    # Collect race page URLs (same pattern as the race scraper)
    link_pattern = re.compile(
        rf"/racing/{re.escape(supertote_date)}/[^/\s\"']+"
    )
    seen: set[str] = set()
    race_urls: list[tuple[str, int]] = []

    for a_tag in index_soup.find_all("a", href=link_pattern):
        href = str(a_tag["href"])
        if href in seen:
            continue
        seen.add(href)
        tail_match = re.search(r"-(\d+)$", href.rstrip("/"))
        if not tail_match:
            continue
        race_number = int(tail_match.group(1))
        full_url = href if href.startswith("http") else BASE_URL + href
        race_urls.append((full_url, race_number))

    if not race_urls:
        logger.warning("No race links found for %s", date_str)
        return []

    logger.info("Found %d race link(s) — scraping results…", len(race_urls))

    results = []
    for url, race_number in sorted(race_urls, key=lambda x: x[1]):
        soup = _fetch(url, session)
        if not soup:
            logger.warning("Could not fetch race %d page", race_number)
            continue

        winner = _extract_winner(soup)
        if winner is not None:
            logger.info("Race %d → winner: horse #%d", race_number, winner)
            results.append({
                "race_number": race_number,
                "winner_horse_number": winner,
            })
        else:
            logger.info("Race %d → no result published yet", race_number)

    logger.info("Done — %d result(s) found for %s", len(results), date_str)
    return results


# Legacy wrapper used by get_scrapers() in data_service
def scrape_results_with_fallback():
    return scrape_race_results_from_supertote()
