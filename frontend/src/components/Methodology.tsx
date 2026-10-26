import type { Meta } from '../types'
import { fmtDayTime } from '../format'

export function Methodology({ meta }: { meta: Meta }) {
  return (
    <div className="card prose">
      <h2 style={{ marginTop: 0 }}>Data</h2>
      <ul>
        <li><b>Actual wind generation:</b> Elexon BMRS <code>FUELHH</code>, fuel type <code>WIND</code>, half-hourly national output (MW).</li>
        <li><b>Wind forecasts:</b> Elexon BMRS <code>WINDFOR</code>, hourly national forecasts (MW). A new version is published about 8 times a day, each looking up to ~2.5 days ahead.</li>
        <li><b>Scope:</b> purchase decisions made 1–31 January 2026, i.e. delivery days {meta.decision_window.from} to {meta.decision_window.to}. {meta.counts.forecast_vintages} forecast versions, {meta.counts.actual_rows.toLocaleString()} half-hours of actuals.</li>
        <li><b>Source:</b> {meta.source}, loaded {fmtDayTime(meta.loaded_at)}.</li>
      </ul>

      <h2>How the “decision forecast” is chosen</h2>
      <p>
        Day-ahead power for delivery day D is bought in an auction on D-1. For each delivery hour, the decision forecast is the
        <b> latest forecast published at or before that auction’s gate closure</b>. Anything published later is shown as context only and never used for the bid.
        Gate closures (UK time, D-1): {meta.auctions.map((a) => `${a.name} ${a.gate_closure}`).join(' · ')}.
      </p>

      <h2>Accuracy metrics</h2>
      <ul>
        <li><b>Error</b> = forecast − actual, compared on the hourly timestamps where both exist. Positive means wind under-delivered, so the desk is short and must buy the gap intraday or in balancing.</li>
        <li><b>MAE / RMSE:</b> average absolute and root-mean-square error in MW. RMSE weights large misses more heavily.</li>
        <li><b>Bias:</b> mean error. A persistent positive bias is a systematic over-forecast and can be corrected.</li>
        <li><b>WAPE:</b> total absolute error divided by total actual output. Unlike MAPE, it stays stable in low-wind hours.</li>
      </ul>

      <h2>80% planning band</h2>
      <p>
        The band around each decision forecast comes from the empirical 10th and 90th percentiles of past errors at the same gate.
        To keep the band honest, each day’s band uses only <b>the other days’ errors</b> (leave-one-day-out). The hit rate is the share of
        hours whose actual output landed inside the band, and should be close to 80%.
      </p>

      <h2>Known limitations</h2>
      <ul>
        <li>Actual output reflects curtailment and covers only metered (transmission-connected) wind. The forecast may include potential output the grid could not take, which partly explains the systematic over-forecast.</li>
        <li>One month of data gives a useful but small sample. The band and bias estimates should be refreshed on a rolling window in production.</li>
        <li>Demand and other renewables are out of scope for this pilot.</li>
      </ul>
    </div>
  )
}
