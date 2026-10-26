import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, useAsync } from '../api'
import { dateIso, fmtDay, fmtDayShort, fmtDayTime, fmtTime, gw, gwh, hours, mw, signedGw } from '../format'
import type { Auction, DayView, Meta } from '../types'
import { Card, ErrorState, Kpi, Legend, Loading, TooltipBox } from './ui'

interface Props {
  meta: Meta
  auction: Auction
  day: string
  onDayChange: (d: string) => void
}

export function DecisionView({ meta, auction, day, onDayChange }: Props) {
  const { data, error, loading } = useAsync(() => api.day(day, auction.id), [day, auction.id])
  const days = meta.delivery_days
  const idx = days.indexOf(day)

  return (
    <>
      <div className="controls">
        <div>
          <div className="control-label">Delivery day</div>
          <div className="day-picker">
            <button className="icon-btn" aria-label="Previous day" disabled={idx <= 0}
                    onClick={() => onDayChange(days[idx - 1])}>‹</button>
            <select className="select" value={day} onChange={(e) => onDayChange(e.target.value)} aria-label="Delivery day">
              {days.map((d) => <option key={d} value={d}>{fmtDay(dateIso(d))}</option>)}
            </select>
            <button className="icon-btn" aria-label="Next day" disabled={idx >= days.length - 1}
                    onClick={() => onDayChange(days[idx + 1])}>›</button>
          </div>
        </div>
      </div>
      {error && <ErrorState message={error} />}
      {!data && loading && <Loading what="forecast" />}
      {data && <DayContent data={data} auction={auction} />}
    </>
  )
}

function DayContent({ data, auction }: { data: DayView; auction: Auction }) {
  const [showActual, setShowActual] = useState(true)
  const [showVintages, setShowVintages] = useState(false)
  const s = data.summary
  // Forecasts that arrived between the gate and the start of delivery: newer information
  // the desk could only act on intraday.
  const dayStart = data.series[0]?.time ?? data.date
  const later = data.vintages.filter((v) => !v.available_at_gate && v.publish_time < dayStart).length

  const rows = useMemo(() => {
    const byTime = data.vintages.map((v) => new Map(v.points.map((p) => [p.time, p.forecast])))
    return data.series.map((p) => {
      const row: Record<string, number | number[] | null | string> = {
        t: new Date(p.time).getTime(),
        time: p.time,
        actual: p.actual,
        forecast: p.forecast,
        band: p.wind_low != null && p.wind_high != null ? [p.wind_low, p.wind_high] : null,
      }
      byTime.forEach((m, i) => { row[`v${i}`] = m.get(p.time) ?? null })
      return row
    })
  }, [data])

  const ticks = rows.filter((_, i) => i % 6 === 0).map((r) => r.t as number)
  // Round the y-axis up to a whole number of 4 GW steps so ticks read cleanly.
  const peak = Math.max(...data.series.flatMap((p) => [p.actual ?? 0, p.wind_high ?? 0]),
    ...data.vintages.flatMap((v) => v.points.map((p) => p.forecast ?? 0)))
  const yMax = Math.max(4000, Math.ceil(peak / 4000) * 4000)
  const yTicks = Array.from({ length: yMax / 4000 + 1 }, (_, i) => i * 4000)

  return (
    <>
      <div className="decision-banner" role="status">
        <span>Bid deadline <strong>{fmtDayTime(data.gate_closure)}</strong> ({auction.name})</span>
        <span className="dot">•</span>
        <span>Latest forecast available then: published <strong>{data.decision_publish_time ? fmtDayTime(data.decision_publish_time) : '—'}</strong></span>
        <span className="dot">•</span>
        <span>{later} newer forecast{later === 1 ? '' : 's'} arrived between the gate and delivery</span>
      </div>

      <div className="grid kpis">
        <Kpi label="Forecast wind energy" value={gwh(s.forecast_gwh)}
             hint={`Hourly range ${gw(s.forecast_min_mw)} – ${gw(s.forecast_max_mw)}`} />
        <Kpi label="90% confidence floor" value={gw(s.wind_low_min_mw)}
             hint="Lowest hour of the band floor; wind beat the floor ~90% of the time historically" />
        <Kpi label="Forecast lead time" value={hours(s.mean_horizon_h)}
             hint="Average time between forecast publish and delivery hour" />
        <Kpi hindsight label="Actual wind energy" value={gwh(s.actual_gwh)}
             hint={`Avg error ${gw(s.mae)} · bias ${signedGw(s.bias)}`} />
        <Kpi hindsight label="Worst hour shortfall" value={gw(s.max_short != null ? Math.max(s.max_short, 0) : null)}
             hint="Largest hour where wind fell short of the forecast" />
      </div>

      <Card
        title={`Wind generation · ${fmtDay(dateIso(data.date))}`}
        sub="Forecast the desk could see at gate closure, the 80% planning band around it, and what actually happened."
        actions={
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label className="toggle"><input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} /> Actuals</label>
            <label className="toggle"><input type="checkbox" checked={showVintages} onChange={(e) => setShowVintages(e.target.checked)} /> All forecast versions</label>
          </div>
        }
      >
        <Legend items={[
          { label: 'Decision forecast', color: 'var(--c-forecast)' },
          { label: '80% planning band', color: 'var(--c-band)', kind: 'area' },
          ...(showActual ? [{ label: 'Actual', color: 'var(--c-actual)' }] : []),
          ...(showVintages ? [{ label: 'Other forecast versions', color: 'var(--c-vintage)' }] : []),
        ]} />
        <div className="chart" style={{ marginTop: 12 }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={ticks}
                     tickFormatter={(t) => fmtTime(new Date(t).toISOString())} stroke="var(--border)" />
              <YAxis tickFormatter={(v) => `${v / 1000}`} stroke="var(--border)" width={44}
                     domain={[0, yMax]} ticks={yTicks}
                     label={{ value: 'GW', angle: -90, position: 'insideLeft', offset: 10 }} />
              <Tooltip content={<DayTooltip />} />
              <Area dataKey="band" stroke="none" fill="var(--c-band)" isAnimationActive={false} connectNulls />
              {showVintages && data.vintages.map((v, i) => !v.is_decision && (
                <Line key={v.publish_time} dataKey={`v${i}`} stroke="var(--c-vintage)" strokeWidth={1}
                      strokeDasharray={v.available_at_gate ? undefined : '4 3'} dot={false}
                      connectNulls isAnimationActive={false} activeDot={false} />
              ))}
              <Line dataKey="forecast" stroke="var(--c-forecast)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              {showActual && <Line dataKey="actual" stroke="var(--c-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {showVintages && (
          <p className="sub" style={{ marginTop: 8 }}>
            Solid grey lines were published before the gate; dashed lines came in after it and could not inform the bid.
          </p>
        )}
        <details className="table-wrap">
          <summary>Hourly table</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Hour (UK)</th><th>Forecast</th><th>Band low</th><th>Band high</th><th>Actual</th><th>Error (F−A)</th></tr>
              </thead>
              <tbody>
                {data.series.filter((p) => p.forecast != null).map((p) => (
                  <tr key={p.time}>
                    <td>{fmtTime(p.time)}</td>
                    <td>{mw(p.forecast)}</td>
                    <td>{mw(p.wind_low)}</td>
                    <td>{mw(p.wind_high)}</td>
                    <td>{mw(p.actual)}</td>
                    <td>{p.actual != null && p.forecast != null ? mw(p.forecast - p.actual) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DayTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const band = r.band as number[] | null
  return (
    <TooltipBox
      title={`${fmtDayShort(r.time)} ${fmtTime(r.time)}`}
      rows={[
        ['Forecast', mw(r.forecast)],
        ['Band', band ? `${gw(band[0])} – ${gw(band[1])}` : '—'],
        ['Actual', mw(r.actual)],
        ...(r.forecast != null && r.actual != null
          ? [['Error (F−A)', mw(r.forecast - r.actual)] as [string, string]]
          : []),
      ]}
    />
  )
}
