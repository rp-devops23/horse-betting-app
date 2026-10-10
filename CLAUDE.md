# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A family horse-racing betting game ("Lekours"). Users pick horses across race day, and a scoring system awards points based on odds. One bet per day can be marked as a "banker" which doubles the user's total daily score if correct.

## Running the app

**Backend** (from repo root, with venv activated):
```bash
python server.py
```

**Frontend** (from `horse-betting-frontend/`):
```bash
npm start
```

**Install backend deps:**
```bash
pip install -r requirements.txt
```

**Install frontend deps:**
```bash
cd horse-betting-frontend && npm install
```

## Backend architecture

The backend is a Flask API deployed on Render. All routes delegate to a single shared `DataService` instance — routes themselves contain no business logic.

```
server.py              # App factory (create_app). Reads DATABASE_URL env var. Runs migrations on startup.
database.py            # Creates shared SQLAlchemy db instance
auth.py                # Signed bearer tokens, require_user / require_admin / require_admin_or_job decorators
models.py              # User, Race, Horse, Bet, UserScore, AppSetting, BetLog, JobLog
services/
  __init__.py          # Instantiates and exports the data_service and season_service singletons
  data_service.py      # Core DB operations (users, races, bets, scoring, locks/visibility)
  season_service.py    # Read-only: standings per period, monthly seasons, player profiles, achievements
routes/
  users.py             # /api/users
  races.py             # /api/races — includes scraping and result entry
  betting.py           # /api/bet, /api/banker, /api/bets, /api/bankers
  race_days.py         # /api/race-days — leaderboard, historical data
  admin.py             # /api/admin — user management, data reset
utils/
  supertote_scraper.py      # Race cards from supertote.mu
  smspariaz_odds_scraper.py # Live odds from smspariaz.com
  results_scraper.py        # Race winners from supertote.mu
```

Scheduled GitHub Actions (`.github/workflows/`) call the scrape/odds/results endpoints with an `X-Job-Token` header.

**Import order matters** in `server.py` to avoid circular imports: `database.py` → `init_db(app)` → then models and routes are imported inside `create_app()`.

## Database

- PostgreSQL on Render free tier
- Connection string injected automatically by Render as `DATABASE_URL`
- Render provides `postgres://` prefix; `server.py` rewrites it to `postgresql://` for SQLAlchemy
- Tables are created automatically via `create_tables(app)` on startup when run directly
- **Render free PostgreSQL expires after 90 days** — needs recreation when it does

## Auth & bet rules

- Players log in with a 4-digit PIN (stored hashed with werkzeug); `/api/users/login` returns a signed token the frontend sends as `Authorization: Bearer …` (see `horse-betting-frontend/src/api.js`). The admin password login (`/api/admin/login`) also returns a token.
- Admin is either `User.is_admin` or a session that logged in with `ADMIN_PASSWORD`. All `/api/admin/*` routes (except login and `GET /settings`) and race mutation routes require it.
- Login attempts are throttled in memory (5 failures → 5 minute lockout).
- Bets lock server-side when a race starts (race time is Mauritius local, UTC+4) or has a result. Bankers lock for the whole day once the first race starts. Admins can override via `/api/admin/bet` and `/api/admin/banker`.
- **Other players' bets are hidden until the race locks**; bankers are hidden until the first race of the day starts. `DataService.get_visible_bets` / `get_visible_bankers` / `get_race_day_data(viewer_id)` enforce this — never return raw bets from a public endpoint. An admin can lift the secret for everyone with the "Paris visibles par tous" switch on the race day tab: it stores `AppSetting('bets_revealed')` (`PUT /api/admin/bets-revealed`, read via public `GET /api/bets/revealed`), and the visibility functions then return every bet to every player. Off by default.

## Seasons & trophies

A season is a calendar year (Mauritius time); the top scorer when the year ends is its champion. `season_service.History` recomputes every day's scores from the bets with the current scoring config (it does not trust stored `UserScore` rows). Trophies (`season_service.TROPHIES`) are computed on the fly, nothing is stored; each has a rarity and counts how many times it was achieved. Ties on points are broken by the number of winning horses; only players equal on both share a rank (1, 1, 3), and the podium puts them on the same step. The last-placed horse is not collected, so no trophy relies on it.

## Scoring rules

Points per winning bet come from the configurable tiers stored in `AppSetting('scoring_config')` (default: odds ≥ 20 → 5, ≥ 10 → 3, ≥ 5 → 2, otherwise 1). An optional `last_place_penalty` applies when the picked horse finishes last.

If the user's banker bet wins, their entire day's score is doubled.

## Frontend architecture

React 19 SPA with Tailwind CSS, deployed separately (static site).

- `App.js` — root component, holds all shared state (users, races, bets, bankers, selectedRaceDay, selectedUserId), the header/nav, login (player picker + PIN pad) and avatar picker
- `src/api.js` — `apiFetch` (attaches the auth token) and the localStorage session
- `src/components/` — one file per tab: `HomePage`, `RaceDayTab`, `LeaderboardTab` (seasons), `PlayersTab` → `PlayerProfile`, `StatsTab` (charts: points race + ranked bars per metric, from `/api/race-days/compare`), `AdminTab`; shared bits in `ui.jsx`
- Playful design system: colours `grape`/`sunny`/`coral`/`mint`/`sky2`, fonts Baloo 2 + Nunito, and component classes (`card`, `btn-primary`, `chip`, `input`, …) in `tailwind.config.js` and `src/index.css`
- `src/utils/` — `time.js` (countdowns, client-side race locks), `scoring.js`, `celebrate.js` (confetti), `userColors.js` (avatar emojis; player colours = a colourblind-validated chart palette in fixed order, shared by avatars and chart lines)
- API base URL switches automatically: `localhost:5000` in development, `horse-betting-backend.onrender.com` in production

## Environment variables

| Variable | Where set | Purpose |
|---|---|---|
| `DATABASE_URL` | Render (auto-injected) | PostgreSQL connection string |
| `PORT` | Render (auto-injected) | Flask listening port |
| `ADMIN_PASSWORD` | Render | Admin password login |
| `SECRET_KEY` | Render | Signs auth tokens (falls back to a key derived from `ADMIN_PASSWORD`) |
| `JOB_TOKEN` | Render + GitHub secret | Shared secret for the scheduled scrape jobs (if unset, job endpoints are open) |

No `.env` file is needed in production. Locally, create a `.env` with `DATABASE_URL` pointing to your dev database.

## Known incomplete areas

- Admin tab has file-editing UI state props (`backendFiles`, `fileContent`, etc.) that are wired up but the backend `/api/admin/files` endpoint returns a 404-style error since the app now uses a database instead of files
