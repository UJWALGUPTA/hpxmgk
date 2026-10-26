"""Builds API payloads from the data store + analysis functions (cached per gate time)."""

from __future__ import annotations

from datetime import date, time, timedelta
from functools import lru_cache

import pandas as pd

from . import analysis as an
from .config import AUCTIONS, DEFAULT_AUCTION, Auction
from .data_store import get_data


class NotFound(ValueError):
    pass


def resolve_gate(auction_id: str | None, gate: str | None) -> tuple[Auction | None, time]:
    """A custom ``HH:MM`` gate wins over a named auction; default is EPEX hourly."""
    if gate:
        try:
            hh, mm = (int(x) for x in gate.split(":"))
            return None, time(hh, mm)
        except ValueError as exc:
            raise ValueError(f"gate must be HH:MM, got {gate!r}") from exc
    auction = next((a for a in AUCTIONS if a.id == (auction_id or DEFAULT_AUCTION.id)), None)
    if auction is None:
        raise ValueError(f"unknown auction {auction_id!r}")
    return auction, auction.gate_closure


def _iso(ts) -> str | None:
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).isoformat()


def _num(x, digits: int = 1) -> float | None:
    return None if x is None or pd.isna(x) else round(float(x), digits)


# Ratios keep more precision than MW values.
_RATIO_KEYS = {"wape", "coverage"}


@lru_cache(maxsize=16)
def _banded(gate: time) -> pd.DataFrame:
    """Decision forecasts for every delivery day, joined to actuals, with planning band."""
    data = get_data()
    dec = an.decision_forecasts(data.forecasts, gate)
    errors = an.with_actuals(dec, data.actuals)
    banded = an.planning_band(errors, dec)
    return banded.merge(data.actuals.rename(columns={"generation": "actual"}),
                        on="start_time", how="left")


def meta() -> dict:
    data = get_data()
    days = an.delivery_days()
    return {
        "source": data.source,
        "loaded_at": data.loaded_at.isoformat(),
        "decision_window": {"from": days[0].isoformat(), "to": days[-1].isoformat()},
        "delivery_days": [d.isoformat() for d in days],
        "auctions": [{"id": a.id, "name": a.name, "gate_closure": a.gate_closure.strftime("%H:%M"),
                      "description": a.description} for a in AUCTIONS],
        "default_auction": DEFAULT_AUCTION.id,
        "band_quantiles": list(an.BAND_QUANTILES),
        "counts": {"forecast_rows": int(len(data.forecasts)),
                   "forecast_vintages": int(data.forecasts["publish_time"].nunique()),
                   "actual_rows": int(len(data.actuals))},
    }


def day_view(day: date, gate: time, auction: Auction | None) -> dict:
    if day not in an.delivery_days():
        raise NotFound(f"{day} is outside the analysed delivery window")
    data = get_data()
    start, end = an.day_bounds_utc(day)
    cutoff = an.gate_closure_utc(day, gate)

    dec = _banded(gate)
    dec = dec[dec["delivery_day"] == day].set_index("start_time")
    actuals = data.actuals[(data.actuals["start_time"] >= start) & (data.actuals["start_time"] < end)]
    actuals = actuals.set_index("start_time")["generation"]

    grid = pd.date_range(start, end, freq="30min", inclusive="left")
    series = [{
        "time": t.isoformat(),
        "actual": _num(actuals.get(t)),
        "forecast": _num(dec["forecast"].get(t)),
        "wind_low": _num(dec["wind_low"].get(t)),
        "wind_high": _num(dec["wind_high"].get(t)),
    } for t in grid]

    # Every forecast vintage that covered this day, from two days before the gate up to
    # the end of the day, so the desk can see how the picture evolved.
    fc = data.forecasts
    fc = fc[(fc["start_time"] >= start) & (fc["start_time"] < end)
            & (fc["publish_time"] >= cutoff - timedelta(hours=48))]
    decision_pub = dec["publish_time"].max() if not dec.empty else None
    vintages = [{
        "publish_time": pub.isoformat(),
        "available_at_gate": bool(pub <= cutoff),
        "is_decision": bool(decision_pub is not None and pub == decision_pub),
        "points": [{"time": r.start_time.isoformat(), "forecast": _num(r.generation)}
                   for r in grp.itertuples()],
    } for pub, grp in fc.groupby("publish_time")]

    matched = dec.dropna(subset=["actual"]).reset_index()
    matched["error"] = matched["forecast"] - matched["actual"]
    m = an.error_metrics(matched)
    summary = {
        "forecast_gwh": _num(dec["forecast"].sum() / 1000),
        "actual_gwh": _num(dec["actual"].sum() / 1000) if dec["actual"].notna().all() else None,
        "forecast_min_mw": _num(dec["forecast"].min()),
        "forecast_max_mw": _num(dec["forecast"].max()),
        "wind_low_min_mw": _num(dec["wind_low"].min()),
        "mean_horizon_h": _num(((dec.index - dec["publish_time"]).dt.total_seconds() / 3600).mean()),
        "mae": _num(m.get("mae")), "bias": _num(m.get("bias")),
        "max_short": _num(m.get("max_short")), "max_long": _num(m.get("max_long")),
        "coverage": an.band_coverage(matched) if not matched.empty else None,
    }
    return {
        "date": day.isoformat(),
        "auction": auction.id if auction else None,
        "gate_closure": cutoff.isoformat(),
        "decision_publish_time": _iso(decision_pub),
        "series": series,
        "vintages": vintages,
        "summary": summary,
    }


@lru_cache(maxsize=16)
def accuracy(gate: time) -> dict:
    data = get_data()
    banded = _banded(gate)
    matched = banded.dropna(subset=["actual"]).copy()
    matched["error"] = matched["forecast"] - matched["actual"]
    horizons = matched["horizon_h"]

    def clean(d: dict) -> dict:
        return {k: (_num(v, 3 if k in _RATIO_KEYS else 1) if isinstance(v, float) else v)
                for k, v in d.items()}

    return {
        "gate_closure_local": gate.strftime("%H:%M"),
        "overall": {**clean({**an.error_metrics(matched), "coverage": an.band_coverage(matched)}),
                    "horizon_min_h": _num(horizons.min()), "horizon_max_h": _num(horizons.max()),
                    "horizon_mean_h": _num(horizons.mean())},
        "by_horizon": [clean(r) for r in an.metrics_by_horizon(data.forecasts, data.actuals)],
        "by_hour": [clean(r) for r in an.metrics_by_hour(matched)],
        "daily": [clean(r) for r in an.daily_summary(matched)],
        "histogram": an.error_histogram(matched["error"]),
    }
