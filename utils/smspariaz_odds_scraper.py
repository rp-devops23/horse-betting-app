"""
smspariaz.com odds scraper — fetches live Win odds via the site's JSON API.

The page https://www.smspariaz.com/local/ loads race data through jQuery
from https://www.smspariaz.com/service/local_json.php, which returns plain
JSON — no browser / Selenium required.

Response structure:
    [
      {
        "races": [
          {
            "race": {"race_number": "1", "race_time": "12h30", "race_details": "..."},
            "runners": [
              {"horse_number": "1", "horse_name": "DIAMOND DAYS", "win": "450", ...},
              ...
            ]
          },
          ...
        ]
      }
    ]

Win odds are centesimal integers (e.g. "450" → 4.50 decimal).

Returns:
    {race_number (int): {horse_number (int): win_odds (float)}}
    Empty dict on failure.
"""

import logging
import requests

logger = logging.getLogger(__name__)

_API_URL = "https://www.smspariaz.com/service/local_json.php"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.smspariaz.com/local/",
    "Accept": "application/json, text/javascript, */*",
}
_ODDS_DIVISOR = 100.0


def scrape_odds_from_smspariaz() -> dict:
    """
    Fetch live Win odds from smspariaz.com's JSON API.

    Returns:
        {race_number (int): {horse_number (int): win_odds (float)}}
        Empty dict on failure.
    """
    logger.info("Fetching odds from %s", _API_URL)
    try:
        response = requests.get(_API_URL, headers=_HEADERS, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.error("Request failed: %s", exc)
        return {}

    try:
        payload = response.json()
    except ValueError as exc:
        logger.error("JSON parse error: %s", exc)
        return {}

    if not payload or not isinstance(payload, list):
        logger.warning("Unexpected payload format: %r", payload)
        return {}

    races_list = payload[0].get("races", [])
    if not races_list:
        logger.warning("No races in API response")
        return {}

    result: dict[int, dict[int, float]] = {}

    for entry in races_list:
        race_info = entry.get("race", {})
        try:
            race_number = int(race_info.get("race_number", 0))
        except (ValueError, TypeError):
            continue
        if race_number == 0:
            continue

        result[race_number] = {}

        for runner in entry.get("runners", []):
            try:
                horse_number = int(runner.get("horse_number", 0))
            except (ValueError, TypeError):
                continue
            if horse_number == 0:
                continue

            try:
                win_raw = runner.get("win", 0)
                win_odds = round(float(win_raw) / _ODDS_DIVISOR, 2)
            except (ValueError, TypeError):
                win_odds = 0.0

            if win_odds > 0:
                result[race_number][horse_number] = win_odds

        logger.info(
            "Race %d: %d horse(s) with odds", race_number, len(result[race_number])
        )

    total = sum(len(v) for v in result.values())
    logger.info("Done — %d race(s), %d horse(s) with odds", len(result), total)
    return result
