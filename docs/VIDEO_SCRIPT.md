# Demo video script (max 10 minutes)

## Part 1: client pitch (about 4.5 minutes)

**0:00 Problem (30s).** "Every morning your desk commits to day-ahead volumes before 09:20. Wind can swing by several gigawatts, and the question is always the same: how much wind can we count on, and how much do we need to buy? We ran a pilot on January 2026 to answer that with your own market timeline."

**0:30 Decision view (90s).** Open Thu 15 Jan.
- Banner: bid deadline Wed 14 Jan 09:20. The latest forecast available then was published at 07:30, and N newer forecasts arrived after the gate. "This is exactly what you could see when you bid, with no hindsight."
- KPIs: 279 GWh forecast and a 90% confidence floor. "If you need to be 90% sure, plan on the floor, not the point forecast."
- Chart: the orange line is the decision forecast, the shaded area is the 80% planning band, and the blue line is what happened.
- Toggle *All forecast versions* to show how the forecast evolved, and how dashed post-gate versions could not inform the bid.
- Switch auction to N2EX 09:50 or EPEX half-hourly 15:30. "A later gate means a fresher forecast."

**2:00 Accuracy (2 min).** Open the Forecast accuracy tab.
- Insight box: average error 2.0 GW, which is 18% of output.
- "The big finding: forecasts were systematically about 1.7 GW too high. Wind under-delivered on 27 of 31 days. Correct for that alone and the error drops to 1.4 GW."
- Daily bias chart: point to 11–12 Jan and 28 Jan (shortfalls above 4.5 GW). Click a bar to open that day.
- Lead-time chart: "Waiting longer helps less than you'd think. The bias stays even a few hours out."
- Band hit rate of 78% against an 80% target: the bands are honest and tested out-of-sample.

**4:00 Value and next steps (30s).** Fewer surprise shortfalls, quantified risk for each bid, and an audit trail. Next: add demand and solar to show net purchase volume, bias-corrected forecasts, and live daily refresh.

## Part 2: technical review (about 4.5 minutes)

**0:00 Architecture (60s).** Show the diagram in docs/ARCHITECTURE.md. The stack is FastAPI with pandas, a bundled Elexon snapshot, and a React SPA built with Vite, TypeScript and Recharts. It runs as one Docker container, or on Vercel with the CDN serving the SPA and a Python function for `/api`.

**1:00 Data and domain logic (90s).** Walk through `backend/app/analysis.py`:
- `gate_closure_utc` handles UK time and BST.
- `decision_forecasts` uses groupby/idxmax to pick the latest publish time at or before the gate per target hour.
- The error sign convention is documented.
- `planning_band` is computed leave-one-day-out.
- `metrics_by_horizon` covers every forecast version.

**2:30 API and frontend (60s).** Walk through `service.py` (payloads, `lru_cache` per gate) and `main.py` (routes, validation, static hosting). In the frontend: the `useAsync` hook, typed client, URL-hash state, and charts with hover tooltips plus table views.

**3:30 Practices (45s).** pytest unit and contract tests, ruff, eslint, TypeScript strict mode, GitHub Actions CI (including the Docker build), a reproducible snapshot script, and env-driven config.

**4:15 Trade-offs and next steps (30s).** In-memory versus a database, global versus conditional bands, and hourly-only scoring. Mention the AI-assistance disclosure in the README.
