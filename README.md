# WindDesk: day-ahead wind forecast intelligence

WindDesk is a web app for a GB utility's day-ahead power procurement desk. For every delivery day it shows:

1. **The latest national wind forecast that was actually available at the auction gate closure** (D-1), with an empirical 80% planning band around it.
2. **How accurate those forecasts were**, measured against Elexon outturn: MAE, RMSE, bias, WAPE, band hit rate, error by lead time and by hour of day, plus a per-day scorecard.

Scope: national wind only, using Elexon BMRS `FUELHH` (actuals, `fuelType=WIND`) and `WINDFOR` (forecasts), for **purchase decisions made in January 2026**, i.e. delivery days 2 Jan to 1 Feb 2026.

**Live app:** `<VERCEL_URL>`  ·  **Demo video:** `<YOUTUBE_URL>`

---

## Quick start

### Docker (recommended)

```bash
docker compose up --build
# open http://localhost:8000
```

This builds the React app, installs the Python API, and serves both from a single container on port 8000. Set `DATA_MODE=live` to re-pull the data from Elexon at start-up instead of using the bundled snapshot.

### Local development

```bash
# API: http://localhost:8000 (OpenAPI docs at /docs)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# UI: http://localhost:5173 (proxies /api to :8000)
cd frontend
npm ci
npm run dev
```

### Tests and lint

```bash
cd backend && pytest -q && ruff check app tests scripts
cd frontend && npm run lint && npm run build
```

### Refreshing the data snapshot

```bash
cd backend && python -m scripts.refresh_snapshot
```

### Deploying to Vercel

The repo root is a Vercel project. The React build is served as static files, and `api/index.py` exposes the FastAPI app as a Python function (see `vercel.json`).

```bash
vercel --prod
```

---

## Repository layout

```
.
├── api/index.py               Vercel Python entrypoint, re-exports the FastAPI app
├── backend/
│   ├── app/
│   │   ├── config.py          Analysis window, auction gate closures, env settings
│   │   ├── elexon.py          Elexon BMRS stream client (chunked, de-duplicated)
│   │   ├── data_store.py      Loads snapshot/live data into tidy pandas frames (cached)
│   │   ├── analysis.py        Pure functions: decision-forecast selection, metrics, bands
│   │   ├── service.py         Builds API payloads, cached per gate time
│   │   └── main.py            FastAPI routes (/api/*) and static hosting of the UI
│   ├── data/                  Bundled snapshot: windfor.json, fuelhh.json
│   ├── scripts/refresh_snapshot.py
│   ├── tests/                 Unit tests (analysis) and API tests
│   ├── requirements.txt       Runtime dependencies
│   └── requirements-dev.txt   + pytest, ruff
├── frontend/
│   ├── src/
│   │   ├── App.tsx            Shell, tabs, auction selector, URL-hash state
│   │   ├── api.ts             Typed API client and useAsync hook
│   │   ├── types.ts           API response types
│   │   ├── format.ts          UK-time and MW/GW formatting
│   │   └── components/
│   │       ├── DecisionView.tsx   Per-day forecast vs actual, band, forecast versions
│   │       ├── AccuracyView.tsx   Metrics, charts, daily scorecard
│   │       ├── Methodology.tsx    Data and method explainer for users
│   │       └── ui.tsx             Card, KPI, legend, tooltip primitives
│   └── vite.config.ts         Dev proxy and chart chunk split
├── docs/
│   ├── ARCHITECTURE.md        Design notes for technical review
│   └── VIDEO_SCRIPT.md        Outline for the two-part demo video
├── Dockerfile                 Multi-stage: Node build, then Python runtime
├── docker-compose.yml
├── vercel.json                Vercel build and routing
├── requirements.txt           Python deps for the Vercel function
└── .github/workflows/ci.yml   Lint, tests, build, Docker build
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/meta` | Delivery days, auctions and gate closures, data source and counts |
| `GET /api/day/{YYYY-MM-DD}?auction=epex-60` | Half-hourly actuals, decision forecast, 80% band, every forecast version for the day, day summary |
| `GET /api/accuracy?auction=epex-60` | Overall metrics, error by lead time and by hour, daily scorecard, error histogram |
| `GET /api/health` | Liveness |

Both data endpoints also accept `gate=HH:MM` (UK time on D-1) instead of a named auction. Interactive docs are at `/docs`.

## Method in brief

- **Decision forecast:** for each delivery hour on day D, the latest `WINDFOR` value published at or before the gate closure on D-1 (EPEX hourly 09:20, N2EX 09:50, EPEX half-hourly 15:30, all UK time).
- **Error** = forecast − actual, compared on hourly timestamps. Positive means the desk is short.
- **80% band:** empirical P10/P90 of errors, computed leave-one-day-out so a day's band never uses that day's outcome.
- **Headline finding (EPEX 09:20):** MAE 2.0 GW (WAPE 18%). This is mostly a systematic +1.7 GW over-forecast, and wind came in below forecast on 27 of 31 days. Removing the bias would cut MAE to 1.4 GW. The band hit rate is 78% against an 80% target.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions and trade-offs.

## Use of AI tools

This project was built with AI assistance (Claude Code by Anthropic), which was used for researching the data, scaffolding, writing code and tests, and drafting documentation. All analysis choices, results and code were reviewed by the author.
