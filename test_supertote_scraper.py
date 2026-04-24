"""
Quick manual test for the supertote scraper.

Run from the repo root (with venv activated):
    python test_supertote_scraper.py [YYYY-MM-DD]

Defaults to today if no date is supplied.
Prints the scraped day_data as formatted JSON.
"""

import sys
import json
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

from utils.supertote_scraper import scrape_races_from_supertote

if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    result = scrape_races_from_supertote(date_arg)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n--- Summary ---")
    print(f"Date  : {result['date']}")
    print(f"Races : {len(result['races'])}")
    for race in result["races"]:
        print(
            f"  Race {race['id']}  time={race['time']}  "
            f"name='{race['name']}'  horses={len(race['horses'])}"
        )
        for h in race["horses"]:
            print(
                f"    #{h['number']:2d}  {h['name']:<30s}  "
                f"jockey={h['jockey']:<20s}  "
                f"win={h['odds']:.2f}  place={h['place_odds']:.2f}  pts={h['points']}"
            )
