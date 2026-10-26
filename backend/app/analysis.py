"""Forecast selection and accuracy analytics.

All functions are pure: they take DataFrames and return DataFrames/dicts, which keeps
them easy to unit-test without the API or network.

Conventions
-----------
* Times are tz-aware UTC internally; delivery days and gate closures are UK local.
* ``error = forecast - actual`` (MW). Positive error means wind under-delivered against
  the forecast the desk bought on, i.e. the desk is *short* and must top up later in
  intraday/balancing. Negative error means the desk is long.
* Forecasts are hourly, actuals half-hourly; they are compared on the hourly
  timestamps where both exist.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from .config import DECISION_FIRST_DAY, DECISION_LAST_DAY, HORIZON_BUCKETS_H, UK_TZ

BAND_QUANTILES = (0.1, 0.9)  # 80% planning band


# --------------------------------------------------------------------------- time helpers

def delivery_days() -> list[date]:
    """Delivery days whose purchase decision falls in the configured window (D-1)."""
    n = (DECISION_LAST_DAY - DECISION_FIRST_DAY).days + 1
    return [DECISION_FIRST_DAY + timedelta(days=i + 1) for i in range(n)]


def day_bounds_utc(day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a UK delivery day in UTC (handles 23h/25h clock-change days)."""
    start = datetime.combine(day, time(0), UK_TZ)
    end = datetime.combine(day + timedelta(days=1), time(0), UK_TZ)
    return pd.Timestamp(start).tz_convert("UTC"), pd.Timestamp(end).tz_convert("UTC")


def gate_closure_utc(day: date, gate: time) -> pd.Timestamp:
    """Decision deadline for delivery ``day``: ``gate`` (UK local) on the day before."""
    return pd.Timestamp(datetime.combine(day - timedelta(days=1), gate, UK_TZ)).tz_convert("UTC")


def _uk_date(ts: pd.Series) -> pd.Series:
    return ts.dt.tz_convert(UK_TZ).dt.date


# --------------------------------------------------------------------------- selection

def decision_forecasts(forecasts: pd.DataFrame, gate: time,
                       days: list[date] | None = None) -> pd.DataFrame:
    """For every target hour of each delivery day, the latest forecast published at or
    before that day's gate closure. This is exactly what the desk could see when bidding.

    Returns columns: delivery_day, start_time, publish_time, forecast, horizon_h.
    """
    days = days or delivery_days()
    df = forecasts.copy()
    df["delivery_day"] = _uk_date(df["start_time"])
    df = df[df["delivery_day"].isin(days)]
    cutoffs = {d: gate_closure_utc(d, gate) for d in days}
    df = df[df["publish_time"] <= df["delivery_day"].map(cutoffs)]
    if df.empty:
        return pd.DataFrame(columns=["delivery_day", "start_time", "publish_time",
                                     "forecast", "horizon_h"])
    latest = df.loc[df.groupby("start_time")["publish_time"].idxmax()]
    latest = latest.rename(columns={"generation": "forecast"})
    latest["horizon_h"] = (latest["start_time"] - latest["publish_time"]).dt.total_seconds() / 3600
    return latest[["delivery_day", "start_time", "publish_time", "forecast", "horizon_h"]] \
        .sort_values("start_time").reset_index(drop=True)


def with_actuals(fc: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Inner-join forecasts to actuals on target time and add ``error``."""
    out = fc.merge(actuals.rename(columns={"generation": "actual"}), on="start_time", how="inner")
    out["error"] = out["forecast"] - out["actual"]
    return out


# --------------------------------------------------------------------------- metrics

def error_metrics(df: pd.DataFrame) -> dict:
    """Summary statistics of ``df.error`` (and ``df.actual`` for normalisation)."""
    if df.empty:
        return {"n": 0}
    e = df["error"].to_numpy()
    actual_sum = float(df["actual"].sum())
    return {
        "n": int(e.size),
        "mae": float(np.mean(np.abs(e))),
        "rmse": float(np.sqrt(np.mean(e ** 2))),
        "bias": float(np.mean(e)),
        # MAE that would remain if the systematic bias were removed: the weather-driven part.
        "mae_debiased": float(np.mean(np.abs(e - np.mean(e)))),
        # Weighted absolute percentage error: robust to near-zero wind hours, unlike MAPE.
        "wape": float(np.sum(np.abs(e)) / actual_sum) if actual_sum else None,
        "p10": float(np.quantile(e, 0.1)),
        "p50": float(np.quantile(e, 0.5)),
        "p90": float(np.quantile(e, 0.9)),
        "max_short": float(np.max(e)),   # worst under-delivery vs forecast
        "max_long": float(np.min(e)),    # worst over-delivery vs forecast
        "mean_actual": float(df["actual"].mean()),
    }


def planning_band(errors: pd.DataFrame, target: pd.DataFrame,
                  q: tuple[float, float] = BAND_QUANTILES) -> pd.DataFrame:
    """Add an empirical uncertainty band around ``target.forecast``.

    For each delivery day the band is built from the error distribution of the *other*
    days (leave-one-day-out), so the band shown for a day never peeks at that day's
    outcome. With the default quantiles, actual wind is expected to land between
    ``wind_low`` and ``wind_high`` 80% of the time and above ``wind_low`` 90% of the time.
    """
    out = target.copy()
    lo, hi = [], []
    for day, grp in out.groupby("delivery_day", sort=False):
        others = errors.loc[errors["delivery_day"] != day, "error"]
        e_lo, e_hi = np.quantile(others, q) if len(others) else (0.0, 0.0)
        # actual = forecast - error, so a high error quantile gives the low wind bound.
        lo.append(pd.Series(np.maximum(grp["forecast"] - e_hi, 0.0), index=grp.index))
        hi.append(pd.Series(grp["forecast"] - e_lo, index=grp.index))
    out["wind_low"] = pd.concat(lo) if lo else []
    out["wind_high"] = pd.concat(hi) if hi else []
    return out


def band_coverage(banded: pd.DataFrame) -> float | None:
    """Share of actuals that fell inside their (out-of-sample) planning band."""
    df = banded.dropna(subset=["actual"])
    if df.empty:
        return None
    inside = (df["actual"] >= df["wind_low"]) & (df["actual"] <= df["wind_high"])
    return float(inside.mean())


def metrics_by_horizon(forecasts: pd.DataFrame, actuals: pd.DataFrame,
                       days: list[date] | None = None,
                       buckets: tuple[int, ...] = HORIZON_BUCKETS_H) -> list[dict]:
    """Accuracy of *all* forecast vintages, grouped by lead time. Shows how much
    accuracy the desk gives up by deciding a day ahead rather than closer to delivery."""
    days = days or delivery_days()
    df = forecasts.copy()
    df["delivery_day"] = _uk_date(df["start_time"])
    df = df[df["delivery_day"].isin(days)]
    df = with_actuals(df.rename(columns={"generation": "forecast"}), actuals)
    df["horizon_h"] = (df["start_time"] - df["publish_time"]).dt.total_seconds() / 3600
    rows = []
    for lo, hi in zip(buckets[:-1], buckets[1:]):
        grp = df[(df["horizon_h"] >= lo) & (df["horizon_h"] < hi)]
        rows.append({"from_h": lo, "to_h": hi, **error_metrics(grp)})
    return rows


def metrics_by_hour(df: pd.DataFrame) -> list[dict]:
    """Decision-forecast accuracy by UK hour of day of the target time."""
    hours = df["start_time"].dt.tz_convert(UK_TZ).dt.hour
    return [{"hour": int(h), **error_metrics(grp)} for h, grp in df.groupby(hours)]


def daily_summary(banded: pd.DataFrame) -> list[dict]:
    """One row per delivery day: energy forecast vs actual and error stats."""
    rows = []
    for day, grp in banded.groupby("delivery_day"):
        m = error_metrics(grp)
        rows.append({
            "date": day.isoformat(),
            "decision_publish_time": grp["publish_time"].max().isoformat(),
            # hourly MW points * 1h = MWh, reported in GWh
            "forecast_gwh": float(grp["forecast"].sum() / 1000),
            "actual_gwh": float(grp["actual"].sum() / 1000),
            "mae": m.get("mae"),
            "bias": m.get("bias"),
            "max_short": m.get("max_short"),
            "coverage": band_coverage(grp),
        })
    return rows


def error_histogram(errors: pd.Series, width: float = 500.0) -> list[dict]:
    if errors.empty:
        return []
    lo = np.floor(errors.min() / width) * width
    hi = np.ceil(errors.max() / width) * width + width
    counts, edges = np.histogram(errors, bins=np.arange(lo, hi, width))
    return [{"from": float(a), "to": float(b), "count": int(c)}
            for a, b, c in zip(edges[:-1], edges[1:], counts)]
