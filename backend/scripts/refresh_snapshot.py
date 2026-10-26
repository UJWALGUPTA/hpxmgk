"""Re-download the Elexon datasets into backend/data (the snapshot the app serves).

Usage (from backend/):  python -m scripts.refresh_snapshot
"""

from __future__ import annotations

import json

from app.config import DATA_DIR
from app.data_store import ACTUALS_FILE, FORECASTS_FILE, fetch_window
from app.elexon import fetch_wind_actuals, fetch_wind_forecasts


def main() -> None:
    start, end = fetch_window()
    forecasts = fetch_wind_forecasts(start, end)
    actuals = fetch_wind_actuals(start.date(), end.date())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    keep_fc = ("publishTime", "startTime", "generation")
    keep_act = ("startTime", "settlementDate", "settlementPeriod", "generation")
    with open(DATA_DIR / FORECASTS_FILE, "w") as f:
        json.dump([{k: r[k] for k in keep_fc} for r in forecasts], f)
    with open(DATA_DIR / ACTUALS_FILE, "w") as f:
        json.dump([{k: r[k] for k in keep_act} for r in actuals], f)
    print(f"Saved {len(forecasts)} forecast rows and {len(actuals)} actual rows to {DATA_DIR}")


if __name__ == "__main__":
    main()
