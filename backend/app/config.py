"""Static configuration: analysis window, market gate closures, data locations."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")

# Snapshot of the Elexon datasets bundled with the app (see scripts/refresh_snapshot.py).
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

# "snapshot" (default) reads the bundled JSON; "live" pulls from Elexon on first request.
DATA_MODE = os.getenv("DATA_MODE", "snapshot")

# Scope: purchase decisions made in January 2026. A decision on day D-1 buys power
# for delivery day D, so the delivery days span 2 Jan – 1 Feb 2026.
DECISION_FIRST_DAY = date(2026, 1, 1)
DECISION_LAST_DAY = date(2026, 1, 31)


@dataclass(frozen=True)
class Auction:
    id: str
    name: str
    gate_closure: time  # UK local time on D-1
    description: str


# GB day-ahead auctions the desk can trade in. Gate closure is on the day before delivery.
AUCTIONS: tuple[Auction, ...] = (
    Auction("epex-60", "EPEX GB Day-Ahead (hourly)", time(9, 20),
            "Main GB day-ahead auction, gate closure 09:20 UK time on D-1."),
    Auction("n2ex-60", "Nord Pool N2EX Day-Ahead (hourly)", time(9, 50),
            "Nord Pool GB auction, gate closure 09:50 UK time on D-1."),
    Auction("epex-30", "EPEX GB Day-Ahead (half-hourly)", time(15, 30),
            "Half-hourly GB auction, gate closure 15:30 UK time on D-1."),
)
DEFAULT_AUCTION = AUCTIONS[0]

# Horizons (hours between forecast publish time and target time) used for the
# accuracy-vs-lead-time curve.
HORIZON_BUCKETS_H: tuple[int, ...] = (0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48)
