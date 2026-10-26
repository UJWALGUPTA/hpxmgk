# Architecture and design notes

## Overview

```
 Elexon BMRS API ──(scripts/refresh_snapshot.py or DATA_MODE=live)──► backend/data/*.json
                                                                          │
                                         data_store.get_data()  (lru_cache, pandas frames)
                                                                          │
                     analysis.py (pure functions) ◄── service.py (payload builders, cached per gate)
                                                                          │
                                                 main.py (FastAPI, /api/*, GZip, CORS)
                                                                          │
                      React SPA (Vite + TypeScript + Recharts) ── fetch /api/* ──┘
```

Deployment targets:

- **Docker:** one container. A multi-stage build compiles the SPA, then uvicorn serves both the API and the static `dist/`.
- **Vercel:** the SPA is served from the CDN (`frontend/dist`), and `/api/*` is rewritten to a Python function (`api/index.py`) that imports the same FastAPI app. The data snapshot ships inside the function bundle (`includeFiles`).

## Key decisions

| Decision | Why | Trade-off |
|---|---|---|
| Bundle a data snapshot instead of calling Elexon per request | The analysis window is historical and fixed. The snapshot gives fast, deterministic responses and no runtime dependency on Elexon. | Needs a refresh script for new periods. `DATA_MODE=live` covers that case. |
| pandas in-memory, with no database | About 20k forecast rows and 1.7k actual rows fit easily in memory. Each analysis runs in milliseconds and is cached per gate time. | For multi-year or multi-asset data, move to Postgres/DuckDB with materialised decision tables. |
| `analysis.py` as pure functions | Easy to unit-test with tiny synthetic frames, and no FastAPI or network inside the logic. | None significant. |
| Gate closure is configurable (auction id or `gate=HH:MM`) | Different desks trade different auctions, and the "latest available forecast" depends entirely on the deadline. | None significant. |
| Leave-one-day-out error bands | Stops a day's own outcome from leaking into its band, which keeps the hit rate an honest out-of-sample number. | Bands are global quantiles, not conditional on wind level or weather regime. That is a possible next step. |
| Compare on hourly timestamps | `WINDFOR` is hourly and `FUELHH` is half-hourly. Matching exact `startTime` follows the brief and avoids interpolation assumptions. | The :30 actuals are shown on charts but not scored. |
| UK local time throughout the UI | Gate closures and delivery days are defined in UK time. The backend uses `zoneinfo` (tested on a 23-hour clock-change day). | None. |
| URL-hash UI state | Views can be shared and bookmarked (`#accuracy?auction=n2ex-60`) without a router dependency. | None. |

## Domain conventions

- Delivery day D runs from 00:00 to 24:00 UK time. The decision is made on D-1 at the auction's gate closure.
- Decision forecast = for each target hour, the row with the maximum `publishTime` that is no later than the gate closure.
- `error = forecast − actual`. Positive error means wind under-delivered, so the desk is short and buys the gap intraday or pays imbalance.
- Lead-time analysis uses every forecast version for the delivery window, bucketed in 4-hour bands.

## Findings worth discussing

- There is a large, persistent positive bias (+1.7 GW at a 28-hour lead, still about +1.4 GW at 0–4 hours). Because it barely shrinks with lead time, it is structural rather than weather-driven. Likely causes are transmission constraints and curtailment (FUELHH is metered output after curtailment) and coverage differences between the datasets. A simple bias correction would cut MAE by about 30%.
- Accuracy improves only moderately with shorter lead times (about 2.0 GW at 28 hours versus 1.7 GW at 0–4 hours). Most of the error is bias rather than horizon.

## Testing and quality

- `tests/test_analysis.py` covers gate-closure maths (GMT and BST), clock-change day length, decision selection (a post-gate forecast is never used), the error sign convention, metrics, leave-one-out band and coverage.
- `tests/test_api.py` covers contract tests against the real snapshot, including a check that the decision vintage is published no later than the gate closure.
- CI (GitHub Actions) runs ruff, pytest, eslint, the TypeScript build and the Docker build.

## Next steps

1. Bands conditioned on forecast level and season, plus a rolling recalibration window.
2. A bias-corrected forecast as a first-class series, backtested.
3. Add demand forecasts (e.g. NDF) and solar to compute residual demand, which is the volume the desk actually buys.
4. Scheduled ingestion (cron) into a database, plus alerting when a new forecast moves materially before the gate.
