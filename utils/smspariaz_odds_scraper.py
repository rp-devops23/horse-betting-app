"""
smspariaz.com odds scraper — fetches live Win odds for each race.

Uses Selenium because smspariaz.com is JavaScript-rendered.

XPath structure (provided by user):
  Races container : /html/body/div[1]/div[3]/div[2]/div[2]
  Race identity   : .../div[N]        (each child = one race header+rows block)
  Horse/odds rows : .../div[N]/div[2] (second child of each race div)

Returns:
    {race_number (int): {horse_number (int): win_odds (float)}}
    Empty dict on failure.
"""

import re
import time
import logging

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

logger = logging.getLogger(__name__)

BASE_URL = "https://www.smspariaz.com/local/"
RACES_CONTAINER_XPATH = "/html/body/div[1]/div[3]/div[2]/div[2]"
_ODDS_DIVISOR = 100.0


def _make_driver() -> webdriver.Chrome:
    """Create a headless Chrome WebDriver."""
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return driver


def _parse_odds(text: str) -> float:
    """Parse centesimal odds text (e.g. '310') into decimal odds (3.10)."""
    numeric = re.sub(r"[^\d.]", "", text.strip())
    if not numeric:
        return 0.0
    try:
        return round(float(numeric) / _ODDS_DIVISOR, 2)
    except ValueError:
        return 0.0


def scrape_odds_from_smspariaz() -> dict:
    """
    Scrape live Win odds from smspariaz.com/local/.

    Returns:
        {race_number (int): {horse_number (int): win_odds (float)}}
        Empty dict on failure.
    """
    driver = None
    result: dict[int, dict[int, float]] = {}

    try:
        driver = _make_driver()
        logger.info("Loading %s", BASE_URL)
        driver.get(BASE_URL)

        # Wait for the races container to be present
        wait = WebDriverWait(driver, 20)
        try:
            wait.until(EC.presence_of_element_located((By.XPATH, RACES_CONTAINER_XPATH)))
        except TimeoutException:
            logger.warning("Races container not found within timeout — attempting anyway")

        time.sleep(2)  # Let any late JS settle

        container = driver.find_element(By.XPATH, RACES_CONTAINER_XPATH)
        race_divs = container.find_elements(By.XPATH, "./div")
        logger.info("Found %d top-level divs in races container", len(race_divs))

        for div in race_divs:
            # Identify race number from data-id attribute (e.g. "R1") or inner text
            data_id = div.get_attribute("data-id") or ""
            m = re.search(r"R(\d+)", data_id, re.IGNORECASE)
            if not m:
                first_line = (div.text or "").split("\n")[0]
                m = re.search(r"R(\d+)", first_line, re.IGNORECASE)
            if not m:
                continue  # not a race div

            race_number = int(m.group(1))
            result[race_number] = {}

            # Horse rows are in div[2] child of the race div
            try:
                rows_container = div.find_element(By.XPATH, "./div[2]")
            except NoSuchElementException:
                logger.warning("Race %d: no horse rows container (div[2])", race_number)
                continue

            horse_rows = rows_container.find_elements(By.XPATH, "./div")
            for row in horse_rows:
                # Horse number
                try:
                    num_el = row.find_element(By.CSS_SELECTOR, "div.number")
                    horse_number = int(num_el.text.strip())
                except (NoSuchElementException, ValueError):
                    continue

                # Win odds — first div.odds element
                try:
                    odds_el = row.find_element(By.CSS_SELECTOR, "div.odds")
                    odds = _parse_odds(odds_el.text)
                except NoSuchElementException:
                    odds = 0.0

                if odds > 0:
                    result[race_number][horse_number] = odds

            logger.info(
                "Race %d: %d horse(s) with odds", race_number, len(result[race_number])
            )

    except NoSuchElementException:
        logger.error("Races container not found via XPath: %s", RACES_CONTAINER_XPATH)
        return {}
    except Exception as exc:
        logger.error("Error scraping smspariaz: %s", exc)
        return {}
    finally:
        if driver:
            driver.quit()
            logger.info("WebDriver closed")

    total = sum(len(v) for v in result.values())
    logger.info("Done — %d race(s), %d horse(s) with odds", len(result), total)
    return result
