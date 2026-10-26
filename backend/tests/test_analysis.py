from datetime import date, time

import pandas as pd
import pytest

from app import analysis as an
from app.data_store import actuals_frame, forecasts_frame


def _fc(rows):
    return forecasts_frame([{"publishTime": p, "startTime": s, "generation": g} for p, s, g in rows])


def _act(rows):
    return actuals_frame([{"startTime": s, "generation": g} for s, g in rows])


def test_delivery_days_cover_january_decisions():
    days = an.delivery_days()
    assert days[0] == date(2026, 1, 2)   # decided 1 Jan
    assert days[-1] == date(2026, 2, 1)  # decided 31 Jan
    assert len(days) == 31


def test_gate_closure_is_previous_day_uk_time():
    assert an.gate_closure_utc(date(2026, 1, 15), time(9, 20)) == pd.Timestamp("2026-01-14T09:20Z")
    # In summer UK time is BST (UTC+1), so 09:20 local is 08:20 UTC.
    assert an.gate_closure_utc(date(2026, 7, 15), time(9, 20)) == pd.Timestamp("2026-07-14T08:20Z")


def test_day_bounds_handle_clock_change():
    start, end = an.day_bounds_utc(date(2026, 3, 29))  # clocks go forward: 23h day
    assert (end - start) == pd.Timedelta(hours=23)


def test_decision_forecast_uses_latest_vintage_before_gate_only():
    fc = _fc([
        ("2026-01-14T02:30Z", "2026-01-15T12:00Z", 100),  # old
        ("2026-01-14T07:30Z", "2026-01-15T12:00Z", 200),  # latest before 09:20 gate
        ("2026-01-14T09:30Z", "2026-01-15T12:00Z", 999),  # after gate: must be ignored
    ])
    dec = an.decision_forecasts(fc, time(9, 20), days=[date(2026, 1, 15)])
    assert len(dec) == 1
    row = dec.iloc[0]
    assert row["forecast"] == 200
    assert row["publish_time"] == pd.Timestamp("2026-01-14T07:30Z")
    assert row["horizon_h"] == pytest.approx(28.5)

    # A later gate makes the 09:30 vintage eligible.
    later = an.decision_forecasts(fc, time(9, 50), days=[date(2026, 1, 15)])
    assert later.iloc[0]["forecast"] == 999


def test_error_sign_positive_means_short():
    fc = _fc([("2026-01-14T07:30Z", "2026-01-15T12:00Z", 10_000)])
    dec = an.decision_forecasts(fc, time(9, 20), days=[date(2026, 1, 15)])
    joined = an.with_actuals(dec, _act([("2026-01-15T12:00Z", 8_000), ("2026-01-15T12:30Z", 1)]))
    assert list(joined["error"]) == [2_000]


def test_error_metrics():
    df = pd.DataFrame({"error": [100.0, -100.0, 300.0, -300.0], "actual": [1000.0] * 4})
    m = an.error_metrics(df)
    assert m["n"] == 4
    assert m["mae"] == 200
    assert m["bias"] == 0
    assert m["rmse"] == pytest.approx((50_000) ** 0.5)
    assert m["wape"] == pytest.approx(0.2)
    assert an.error_metrics(df.iloc[0:0]) == {"n": 0}


def test_planning_band_is_leave_one_day_out():
    d1, d2, d3 = date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 4)
    errors = pd.DataFrame({"delivery_day": [d1, d2, d3], "error": [10_000.0, 100.0, 100.0]})
    target = pd.DataFrame({"delivery_day": [d1], "forecast": [5_000.0]})
    banded = an.planning_band(errors, target)
    # Day 1's huge error must not widen day 1's own band.
    assert banded.iloc[0]["wind_low"] == pytest.approx(4_900)
    assert banded.iloc[0]["wind_high"] == pytest.approx(4_900)


def test_band_coverage():
    df = pd.DataFrame({"actual": [5, 15, 25], "wind_low": [0, 0, 0], "wind_high": [20, 20, 20]})
    assert an.band_coverage(df) == pytest.approx(2 / 3)
