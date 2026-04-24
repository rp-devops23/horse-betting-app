"""
SMS Pariaz scraper module for horse racing data
Based on working racecard_scraper.py implementation
"""
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
from datetime import datetime
import time
import re
import random
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def scrape_horses_from_smspariaz():
    """Scrape horse racing data from smspariaz.com using working implementation"""
    base_url = "https://www.smspariaz.com/local/"
    driver = None
    races_data = []
    
    try:
        # Setup Chrome WebDriver with options to mimic real user
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        
        # User agent to mimic real browser
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        # Additional options to avoid detection
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # Set up the driver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Execute script to remove webdriver property
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # Set up explicit wait
        wait = WebDriverWait(driver, 15)
        
        logger.info("✓ Chrome WebDriver setup completed")
        
        # Load the page
        logger.info(f"Loading page: {base_url}")
        driver.get(base_url)
        
        # Wait for page to load
        time.sleep(random.uniform(2, 4))
        
        # Wait for any dynamic content to load
        try:
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            logger.info("✓ Page loaded successfully")
        except TimeoutException:
            logger.warning("Page load timeout, but continuing...")
        
        # Mimic human behavior - random scrolling
        try:
            scroll_height = driver.execute_script("return document.body.scrollHeight")
            for _ in range(3):
                scroll_to = random.randint(0, scroll_height // 2)
                driver.execute_script(f"window.scrollTo(0, {scroll_to});")
                time.sleep(random.uniform(0.5, 1.5))
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(random.uniform(1, 2))
        except Exception as e:
            logger.warning(f"Error during human behavior simulation: {e}")
        
        # Get page source and create BeautifulSoup object
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        logger.info(f"✓ Page content extracted ({len(page_source)} characters)")
        
        # Extract races using the specific structure from the working scraper
        race_headers = soup.select('div.header-row.fixture-toggle')
        logger.info(f"Found {len(race_headers)} race headers with specific selector")
        
        # If not found, try broader selectors
        if not race_headers:
            logger.info("Trying broader selectors...")
            race_headers = soup.select('div[class*="header-row"]')
            logger.info(f"Found {len(race_headers)} race headers with broader selector")
            
            if not race_headers:
                race_headers = soup.select('div[data-id*="R"]')
                logger.info(f"Found {len(race_headers)} elements with R data-id")
        
        if not race_headers:
            logger.warning("No race headers found")
            return []
        
        for header in race_headers:
            try:
                # Extract race index from data-id attribute
                race_index = header.get('data-id', '')
                
                # Extract race number from race index (e.g., "R1" -> 1)
                race_number = 1
                if race_index:
                    match = re.search(r'R(\d+)', race_index, re.IGNORECASE)
                    if match:
                        race_number = int(match.group(1))
                
                # Extract race title and time from the title div
                title_div = header.select_one('div.title')
                race_time = "TBD"
                race_title = f"Race {race_number}"
                
                race_distance = None
                if title_div:
                    title_text = title_div.get_text(strip=True)

                    # Extract time and title from format: "12:45 - FASHION HEIGHTS - MIA BIJOUX CUP - [0 - 25] - 1400m"
                    time_match = re.search(r'^(\d{1,2}:\d{2})', title_text)
                    if time_match:
                        race_time = time_match.group(1)
                        race_title = title_text.replace(f"{race_time} - ", "").strip()
                    else:
                        race_title = title_text

                    # Extract distance (e.g. "1400m") and strip it from the name
                    dist_match = re.search(r'(\d{3,5}m)\s*$', race_title)
                    if dist_match:
                        race_distance = dist_match.group(1)
                        race_title = race_title[:dist_match.start()].rstrip(' -')
                
                # Extract horses for this race
                horses = []
                horse_rows = soup.select(f'div.rows[data-id="{race_index}"] div.row')
                logger.info(f"Found {len(horse_rows)} horse rows for {race_index}")
                
                # If not found, try broader selectors
                if not horse_rows:
                    horse_rows = soup.select(f'[data-id="{race_index}"] div.row')
                    logger.info(f"Found {len(horse_rows)} horse rows with broader selector for {race_index}")
                
                for row in horse_rows:
                    try:
                        # Extract horse number from the number div
                        number_div = row.select_one('div.number')
                        horse_number = 0
                        if number_div:
                            number_text = number_div.get_text(strip=True)
                            try:
                                horse_number = int(number_text)
                            except ValueError:
                                logger.warning(f"Could not parse horse number: {number_text}")
                        
                        # Extract horse name from the horse div
                        horse_div = row.select_one('div.horse')
                        horse_name = "Unknown"
                        if horse_div:
                            horse_name = horse_div.get_text(strip=True)
                            # Clean up horse name (remove any extra whitespace)
                            horse_name = re.sub(r'\s+', ' ', horse_name).strip()
                        
                        # Extract Win odds from the first odds div
                        odds_divs = row.select('div.odds')
                        horse_odds = 0.0
                        if odds_divs and len(odds_divs) >= 1:
                            # The first odds div is the "Win" odds
                            win_odds_text = odds_divs[0].get_text(strip=True)
                            try:
                                # Convert odds to decimal format (e.g., "310" -> 3.10)
                                horse_odds = float(win_odds_text) / 100.0
                            except ValueError:
                                logger.warning(f"Could not parse win odds: {win_odds_text}")
                        
                        # Calculate points based on odds
                        points = 1
                        if horse_odds > 10:
                            points = 3
                        elif horse_odds > 5:
                            points = 2
                        
                        horses.append({
                            "number": horse_number,
                            "name": horse_name,
                            "odds": horse_odds,
                            "points": points
                        })
                        
                    except Exception as e:
                        logger.error(f"Error extracting horse from row: {e}")
                        continue
                
                # Sort horses by number
                horses.sort(key=lambda x: x['number'])
                
                # Add race to results
                races_data.append({
                    "id": f"smspariaz_{race_index}_{datetime.now().strftime('%Y%m%d')}",
                    "name": race_title,
                    "time": race_time,
                    "distance": race_distance,
                    "horses": horses,
                    "winner": None,
                    "status": "upcoming"
                })
                
                logger.info(f"Successfully extracted race {race_index} with {len(horses)} horses")
                
            except Exception as e:
                logger.error(f"Error extracting race from header: {e}")
                continue
        
        # Sort races by race number for consistency
        races_data.sort(key=lambda x: int(re.search(r'R(\d+)', x['id'], re.IGNORECASE).group(1)) if re.search(r'R(\d+)', x['id'], re.IGNORECASE) else 0)
        
        logger.info(f"Successfully extracted {len(races_data)} races")
        
        # Create the proper day structure format expected by the application
        current_date = datetime.now().strftime('%Y-%m-%d')
        day_data = {
            "date": current_date,
            "status": "upcoming",
            "races": races_data,
            "bets": {},
            "bankers": {},
            "userScores": []
        }
        
        logger.info(f"✓ Created day data structure for {current_date}")
        
    except Exception as e:
        logger.error(f"Error during scraping: {e}")
        # Return empty structure on error
        current_date = datetime.now().strftime('%Y-%m-%d')
        day_data = {
            "date": current_date,
            "status": "upcoming", 
            "races": [],
            "bets": {},
            "bankers": {},
            "userScores": []
        }
        
    finally:
        if driver:
            driver.quit()
            logger.info("✓ WebDriver closed")
    
    return day_data
