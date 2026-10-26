"""Loads wind actuals and forecasts into tidy DataFrames (cached for the process lifetime)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from . import elexon
from .config import DATA_DIR, DATA_MODE, DECISION_FIRST_DAY, DECISION_LAST_DAY, UK_TZ

FORECASTS_FILE = "windfor.json"
ACTUALS_FILE = "fuelhh.json"


@dataclass(frozen=True)
class WindData:
    # columns: publish_time, start_time (UTC), generation (MW)
    forecasts: pd.DataFrame
    # columns: start_time (UTC), generation (MW); half-hourly
    actuals: pd.DataFrame
    source: str
    loaded_at: datetime


def fetch_window() -> tuple[datetime, datetime]:
    """Publish-time window needed to cover every forecast relevant to January decisions.

    The earliest decision is on 1 Jan for delivery on 2 Jan; we keep two extra days of
    history so the lead-time analysis can see forecasts up to ~66h ahead.
    """
    start = datetime.combine(DECISION_FIRST_DAY - timedelta(days=2), time(0), UK_TZ)
    end = datetime.combine(DECISION_LAST_DAY + timedelta(days=2), time(0), UK_TZ)
    return start, end


def forecasts_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    df = df.rename(columns={"publishTime": "publish_time", "startTime": "start_time"})
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["generation"] = df["generation"].astype(float)
    return (df.drop_duplicates(["publish_time", "start_time"], keep="last")
              .sort_values(["publish_time", "start_time"]).reset_index(drop=True))


def actuals_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["startTime", "generation"])
    df = df.rename(columns={"startTime": "start_time"})
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["generation"] = df["generation"].astype(float)
    return (df.drop_duplicates("start_time", keep="last")
              .sort_values("start_time").reset_index(drop=True))


def _load_snapshot(data_dir: Path) -> tuple[list, list]:
    with open(data_dir / FORECASTS_FILE) as f:
        forecasts = json.load(f)
    with open(data_dir / ACTUALS_FILE) as f:
        actuals = json.load(f)
    return forecasts, actuals


def _load_live() -> tuple[list, list]:
    start, end = fetch_window()
    forecasts = elexon.fetch_wind_forecasts(start, end)
    actuals = elexon.fetch_wind_actuals(start.date(), end.date())
    return forecasts, actuals


@lru_cache(maxsize=1)
def get_data() -> WindData:
    if DATA_MODE == "live":
        forecasts, actuals = _load_live()
        source = "Elexon BMRS API (live)"
    else:
        forecasts, actuals = _load_snapshot(DATA_DIR)
        source = "Elexon BMRS API (bundled snapshot)"
    return WindData(
        forecasts=forecasts_frame(forecasts),
        actuals=actuals_frame(actuals),
        source=source,
        loaded_at=datetime.now(UK_TZ),
    )
