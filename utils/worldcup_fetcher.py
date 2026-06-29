# utils/worldcup_fetcher.py
"""
Fetches World Cup 2026 match data from ESPN's public API.
Temporary feature — delete this file after the tournament.

Can be run standalone:
    python -m utils.worldcup_fetcher          # just prints matches
    python -m utils.worldcup_fetcher --seed   # seeds the database
"""

import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# ESPN public API for FIFA World Cup
ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"

# Round of 32 spans June 28 – July 3, then knockout rounds follow
DATE_RANGES = [
    ("20260628", "20260703"),   # Round of 32
    ("20260704", "20260708"),   # Round of 16
    ("20260709", "20260712"),   # Quarter-finals
    ("20260713", "20260716"),   # Semi-finals
    ("20260717", "20260720"),   # 3rd place + Final
]

# ESPN stage names → our round codes
STAGE_MAP = {
    "Round of 32": "R32",
    "Round of 16": "R16",
    "Quarterfinals": "QF",
    "Quarter-Finals": "QF",
    "Semifinals": "SF",
    "Semi-Finals": "SF",
    "Third-Place": "3RD",
    "Third Place": "3RD",
    "Final": "F",
}


def _parse_stage(event):
    """Extract our round code from an ESPN event."""
    # Try the season type or notes
    status_type = event.get("status", {}).get("type", {}).get("description", "")
    # Try the event name or competition slug
    name = event.get("name", "")
    season = event.get("season", {}).get("slug", "")

    # Check notes first (ESPN sometimes puts stage there)
    for note in event.get("notes", []):
        headline = note.get("headline", "")
        for key, code in STAGE_MAP.items():
            if key.lower() in headline.lower():
                return code

    # Check event name
    for key, code in STAGE_MAP.items():
        if key.lower() in name.lower():
            return code

    # Fallback: try status
    for key, code in STAGE_MAP.items():
        if key.lower() in status_type.lower():
            return code

    return "R32"  # default to R32 during group/early knockout


def fetch_matches():
    """Fetch all World Cup knockout matches from ESPN API.

    Returns a list of dicts ready for our WCMatch model.
    """
    all_matches = []
    seen_ids = set()

    for date_from, date_to in DATE_RANGES:
        try:
            url = f"{ESPN_SCOREBOARD_URL}?dates={date_from}-{date_to}"
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            for event in data.get("events", []):
                espn_id = event.get("id", "")
                if espn_id in seen_ids:
                    continue
                seen_ids.add(espn_id)

                competition = event.get("competitions", [{}])[0]
                competitors = competition.get("competitors", [])

                # ESPN lists home first, away second
                team_a_data = competitors[0] if len(competitors) > 0 else {}
                team_b_data = competitors[1] if len(competitors) > 1 else {}

                team_a = team_a_data.get("team", {}).get("displayName")
                team_b = team_b_data.get("team", {}).get("displayName")

                score_a = None
                score_b = None
                status = "upcoming"
                state = event.get("status", {}).get("type", {}).get("state", "")
                if state == "post":
                    status = "completed"
                    score_a = int(team_a_data.get("score", 0))
                    score_b = int(team_b_data.get("score", 0))

                kickoff_str = event.get("date", "")
                kickoff_utc = None
                if kickoff_str:
                    # ESPN dates look like "2026-06-28T19:00Z"
                    try:
                        kickoff_utc = datetime.fromisoformat(kickoff_str.replace("Z", "+00:00"))
                    except ValueError:
                        pass

                venue_data = competition.get("venue", {})
                venue_name = venue_data.get("fullName", "")
                venue_city = venue_data.get("address", {}).get("city", "")
                venue = f"{venue_name}, {venue_city}" if venue_city else venue_name

                round_code = _parse_stage(event)

                all_matches.append({
                    "espn_id": espn_id,
                    "team_a": team_a,
                    "team_b": team_b,
                    "kickoff_utc": kickoff_utc,
                    "venue": venue,
                    "score_a": score_a,
                    "score_b": score_b,
                    "status": status,
                    "round": round_code,
                })

        except Exception as e:
            logger.error(f"[WC Fetcher] Error fetching {date_from}-{date_to}: {e}")

    # Sort by kickoff time
    all_matches.sort(key=lambda m: m["kickoff_utc"] or datetime.min.replace(tzinfo=None))

    # Assign sequential match numbers and IDs
    round_counters = {}
    for m in all_matches:
        r = m["round"]
        round_counters[r] = round_counters.get(r, 0) + 1
        m["match_number"] = round_counters[r]
        m["id"] = f"{r}-{round_counters[r]}"

    return all_matches


def seed_database():
    """Fetch matches from ESPN and seed into our database."""
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from server import app
    from services.worldcup_service import WorldCupService

    matches = fetch_matches()
    if not matches:
        print("No matches found from ESPN API.")
        return

    wc_service = WorldCupService()
    seed_data = []
    for m in matches:
        seed_data.append({
            "id": m["id"],
            "round": m["round"],
            "match_number": m["match_number"],
            "team_a": m["team_a"],
            "team_b": m["team_b"],
            "kickoff_utc": m["kickoff_utc"].isoformat() if m["kickoff_utc"] else None,
            "venue": m["venue"],
        })

    with app.app_context():
        if wc_service.seed_matches(seed_data):
            print(f"Seeded {len(seed_data)} matches successfully.")
            # Now update scores for completed matches
            from models_worldcup import WCMatch
            from database import db
            for m in matches:
                if m["status"] == "completed":
                    match = WCMatch.query.get(m["id"])
                    if match:
                        match.score_a = m["score_a"]
                        match.score_b = m["score_b"]
                        match.status = "completed"
            db.session.commit()
            print("Updated completed match scores.")
        else:
            print("Failed to seed matches.")


if __name__ == "__main__":
    import sys
    if "--seed" in sys.argv:
        seed_database()
    else:
        matches = fetch_matches()
        for m in matches:
            status_str = f"{m['score_a']}-{m['score_b']}" if m["status"] == "completed" else m["status"]
            kickoff = m["kickoff_utc"].strftime("%d/%m %H:%M UTC") if m["kickoff_utc"] else "TBD"
            print(f"[{m['id']}] {m['round']:3s} | {kickoff} | {m['team_a'] or 'TBD':20s} vs {m['team_b'] or 'TBD':20s} | {status_str} | {m['venue']}")
        print(f"\nTotal: {len(matches)} matches")
