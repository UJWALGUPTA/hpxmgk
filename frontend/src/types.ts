// Shapes returned by the FastAPI backend (see backend/app/service.py).

export interface Auction {
  id: string
  name: string
  gate_closure: string // HH:MM UK time on D-1
  description: string
}

export interface Meta {
  source: string
  loaded_at: string
  decision_window: { from: string; to: string }
  delivery_days: string[]
  auctions: Auction[]
  default_auction: string
  band_quantiles: [number, number]
  counts: { forecast_rows: number; forecast_vintages: number; actual_rows: number }
}

export interface SeriesPoint {
  time: string
  actual: number | null
  forecast: number | null
  wind_low: number | null
  wind_high: number | null
}

export interface Vintage {
  publish_time: string
  available_at_gate: boolean
  is_decision: boolean
  points: { time: string; forecast: number | null }[]
}

export interface DayView {
  date: string
  auction: string | null
  gate_closure: string
  decision_publish_time: string | null
  series: SeriesPoint[]
  vintages: Vintage[]
  summary: {
    forecast_gwh: number | null
    actual_gwh: number | null
    forecast_min_mw: number | null
    forecast_max_mw: number | null
    wind_low_min_mw: number | null
    mean_horizon_h: number | null
    mae: number | null
    bias: number | null
    max_short: number | null
    max_long: number | null
    coverage: number | null
  }
}

export interface Metrics {
  n: number
  mae?: number
  rmse?: number
  bias?: number
  mae_debiased?: number
  wape?: number
  p10?: number
  p50?: number
  p90?: number
  max_short?: number
  max_long?: number
  mean_actual?: number
}

export interface Accuracy {
  gate_closure_local: string
  overall: Metrics & {
    coverage: number | null
    horizon_min_h: number
    horizon_max_h: number
    horizon_mean_h: number
  }
  by_horizon: (Metrics & { from_h: number; to_h: number })[]
  by_hour: (Metrics & { hour: number })[]
  daily: {
    date: string
    decision_publish_time: string
    forecast_gwh: number
    actual_gwh: number
    mae: number
    bias: number
    max_short: number
    coverage: number | null
  }[]
  histogram: { from: number; to: number; count: number }[]
}
