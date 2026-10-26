"""Thin client for the Elexon Insights (BMRS) stream endpoints."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from .config import ELEXON_BASE_URL

_TIMEOUT = httpx.Timeout(60.0)
_CHUNK_DAYS = 7  # keep each request small; the stream endpoints have no paging


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(client: httpx.Client, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
    resp = client.get(f"{ELEXON_BASE_URL}{path}", params=params)
    resp.raise_for_status()
    return resp.json()


def fetch_wind_forecasts(publish_from: datetime, publish_to: datetime) -> list[dict[str, Any]]:
    """WINDFOR rows (publishTime, startTime, generation) published within the window."""
    rows: list[dict[str, Any]] = []
    with httpx.Client(timeout=_TIMEOUT) as client:
        start = publish_from
        while start < publish_to:
            end = min(start + timedelta(days=_CHUNK_DAYS), publish_to)
            rows += _get(client, "/datasets/WINDFOR/stream", {
                "publishDateTimeFrom": _iso(start),
                "publishDateTimeTo": _iso(end),
            })
            start = end
    # Chunk boundaries are inclusive on both ends, so drop duplicates.
    unique = {(r["publishTime"], r["startTime"]): r for r in rows}
    return list(unique.values())


def fetch_wind_actuals(settlement_from: date, settlement_to: date) -> list[dict[str, Any]]:
    """FUELHH rows for fuelType WIND across the settlement-date window (inclusive)."""
    rows: list[dict[str, Any]] = []
    with httpx.Client(timeout=_TIMEOUT) as client:
        start = settlement_from
        while start <= settlement_to:
            end = min(start + timedelta(days=_CHUNK_DAYS - 1), settlement_to)
            rows += _get(client, "/datasets/FUELHH/stream", {
                "settlementDateFrom": start.isoformat(),
                "settlementDateTo": end.isoformat(),
                "fuelType": "WIND",
            })
            start = end + timedelta(days=1)
    unique = {r["startTime"]: r for r in rows if r.get("fuelType") == "WIND"}
    return list(unique.values())
