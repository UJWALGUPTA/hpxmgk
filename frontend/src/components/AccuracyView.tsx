import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, useAsync } from '../api'
import { dateIso, fmtDay, fmtDayShort, fmtTime, gw, gwh, mw, pct, signedGw } from '../format'
import type { Accuracy, Auction } from '../types'
import { Card, ErrorState, Kpi, Legend, Loading, TooltipBox } from './ui'

const axis = { stroke: 'var(--border)' }
const gwTick = (v: number) => `${(v / 1000).toFixed(1)}`

export function AccuracyView({ auction, onSelectDay }: { auction: Auction; onSelectDay: (d: string) => void }) {
  const { data, error, loading } = useAsync(() => api.accuracy(auction.id), [auction.id])
  if (error) return <ErrorState message={error} />
  if (!data) return loading ? <Loading what="accuracy analysis" /> : null
  return <AccuracyContent a={data} auction={auction} onSelectDay={onSelectDay} />
}

function AccuracyContent({ a, auction, onSelectDay }: { a: Accuracy; auction: Auction; onSelectDay: (d: string) => void }) {
  const o = a.overall
  const short = a.daily.filter((d) => d.bias > 0).length
  const nearest = a.by_horizon[0]
  const atDecision = a.by_horizon.find((b) => o.horizon_mean_h >= b.from_h && o.horizon_mean_h < b.to_h)

  return (
    <>
      <div className="insight">
        <h3>What January 2026 tells the desk ({auction.name}, gate {a.gate_closure_local} on D-1)</h3>
        <ul>
          <li>
            The forecast available at the bid deadline was off by <b>{gw(o.mae)}</b> per hour on average
            (<b>{pct(o.wape)}</b> of actual output), against average wind of {gw(o.mean_actual)}.
          </li>
          <li>
            Most of that is a <b>systematic over-forecast of {gw(o.bias)}</b>: wind came in below forecast on {short} of {a.daily.length} days.
            Correcting for this bias alone would cut the average error to <b>{gw(o.mae_debiased)}</b>.
          </li>
          <li>
            Plan around the <b>80% band</b>, not the point forecast: tested out-of-sample, actual wind landed inside it in{' '}
            <b>{pct(o.coverage)}</b> of hours. In 1 hour in 10, wind fell short of the forecast by more than <b>{gw(o.p90)}</b>.
          </li>
          {nearest && atDecision && (
            <li>
              Deciding a day ahead costs accuracy: at the {Math.round(o.horizon_mean_h)}h lead time of this auction the average error is{' '}
              {gw(atDecision.mae)}, versus {gw(nearest.mae)} for forecasts 0–4h before delivery.
            </li>
          )}
        </ul>
      </div>

      <div className="grid kpis">
        <Kpi label="Mean absolute error" value={gw(o.mae)} hint={`RMSE ${gw(o.rmse)} · ${o.n} hours`} />
        <Kpi label="Bias (forecast − actual)" value={signedGw(o.bias)} hint="Positive: forecast too high, so the desk ends up short" />
        <Kpi label="Error after bias correction" value={gw(o.mae_debiased)} hint="The weather-driven part of the error" />
        <Kpi label="80% band hit rate" value={pct(o.coverage)} hint="Share of hours with actual inside the band (target 80%)" />
        <Kpi label="P90 shortfall" value={gw(o.p90)} hint="Wind fell short by more than this in 10% of hours" />
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Daily bias at the bid deadline"
              sub="Average forecast − actual per delivery day. Orange = wind came in below forecast (desk short). Click a bar to open that day.">
          <Legend items={[{ label: 'Short (forecast too high)', color: 'var(--c-short)' }, { label: 'Long (forecast too low)', color: 'var(--c-long)' }]} />
          <div className="chart small" style={{ marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={a.daily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDayShort(dateIso(d))} {...axis} interval={2} />
                <YAxis tickFormatter={gwTick} {...axis} width={44} label={{ value: 'GW', angle: -90, position: 'insideLeft', offset: 10 }} />
                <ReferenceLine y={0} stroke="var(--text-3)" />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<DailyTooltip />} />
                <Bar dataKey="bias" radius={[4, 4, 4, 4]} cursor="pointer"
                     onClick={(d: { date?: string }) => d.date && onSelectDay(d.date)}>
                  {a.daily.map((d) => <Cell key={d.date} fill={d.bias > 0 ? 'var(--c-short)' : 'var(--c-long)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid two-col">
          <Card title="Error vs forecast lead time"
                sub="All forecast versions, grouped by hours between publish and delivery. Shaded: lead times at this auction's deadline.">
            <Legend items={[{ label: 'Mean absolute error', color: 'var(--c-forecast)' }, { label: 'Bias', color: 'var(--c-actual)' }]} />
            <div className="chart small" style={{ marginTop: 10 }}>
              <ResponsiveContainer>
                <LineChart data={a.by_horizon.map((b) => ({ ...b, mid: (b.from_h + b.to_h) / 2 }))} margin={{ top: 8, right: 12, left: 4, bottom: 12 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <ReferenceArea x1={o.horizon_min_h} x2={o.horizon_max_h} fill="var(--c-band)" />
                  <XAxis dataKey="mid" type="number" domain={[0, 48]} ticks={[0, 8, 16, 24, 32, 40, 48]} {...axis}
                         label={{ value: 'hours ahead', position: 'insideBottom', offset: -6 }} />
                  <YAxis tickFormatter={gwTick} {...axis} width={44} domain={[0, 'auto']} />
                  <Tooltip content={<HorizonTooltip />} />
                  <Line dataKey="mae" stroke="var(--c-forecast)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line dataKey="bias" stroke="var(--c-actual)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Error distribution" sub="Hourly forecast − actual at the bid deadline, in 0.5 GW bins.">
            <div className="chart small">
              <ResponsiveContainer>
                <BarChart data={a.histogram} margin={{ top: 8, right: 8, left: 4, bottom: 12 }} barCategoryGap={2}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="from" tickFormatter={(v) => (v / 1000).toString()} {...axis} interval={1} label={{ value: 'GW (forecast − actual), bin start', position: 'insideBottom', offset: -6 }} />
                  <YAxis {...axis} width={36} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<HistTooltip />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {a.histogram.map((h) => <Cell key={h.from} fill={h.from >= 0 ? 'var(--c-short)' : 'var(--c-long)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card title="Error by hour of day" sub="Mean absolute error of the bid-deadline forecast for each delivery hour (UK time).">
          <div className="chart small">
            <ResponsiveContainer>
              <BarChart data={a.by_hour} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`} {...axis} interval={2} />
                <YAxis tickFormatter={gwTick} {...axis} width={44} label={{ value: 'GW', angle: -90, position: 'insideLeft', offset: 10 }} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<HourTooltip />} />
                <Bar dataKey="mae" fill="var(--c-forecast)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Delivery day scorecard" sub="Click a row to see that day in the decision view.">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Delivery day</th><th>Forecast used</th><th>Forecast</th><th>Actual</th><th>Avg error</th><th>Bias</th><th>Worst short hour</th><th>In band</th></tr>
              </thead>
              <tbody>
                {a.daily.map((d) => (
                  <tr key={d.date} className="clickable" onClick={() => onSelectDay(d.date)}>
                    <td>{fmtDay(dateIso(d.date))}</td>
                    <td>{fmtDayShort(d.decision_publish_time)} {fmtTime(d.decision_publish_time)}</td>
                    <td>{gwh(d.forecast_gwh)}</td>
                    <td>{gwh(d.actual_gwh)}</td>
                    <td>{gw(d.mae)}</td>
                    <td>{signedGw(d.bias)}</td>
                    <td>{gw(Math.max(d.max_short, 0))}</td>
                    <td>{pct(d.coverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function DailyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return <TooltipBox title={fmtDay(dateIso(d.date))} rows={[
    ['Bias', signedGw(d.bias)], ['Avg error', gw(d.mae)], ['Forecast', gwh(d.forecast_gwh)], ['Actual', gwh(d.actual_gwh)],
  ]} />
}

function HorizonTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return <TooltipBox title={`${d.from_h}–${d.to_h}h ahead`} rows={[
    ['Avg error', gw(d.mae)], ['Bias', signedGw(d.bias)], ['RMSE', gw(d.rmse)], ['Samples', d.n],
  ]} />
}

function HistTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return <TooltipBox title={`${signedGw(d.from)} to ${signedGw(d.to)}`} rows={[['Hours', d.count]]} />
}

function HourTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return <TooltipBox title={`${String(d.hour).padStart(2, '0')}:00 UK`} rows={[
    ['Avg error', gw(d.mae)], ['Bias', signedGw(d.bias)], ['Worst short', mw(d.max_short)],
  ]} />
}
