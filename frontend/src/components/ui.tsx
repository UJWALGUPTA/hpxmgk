import type { ReactNode } from 'react'

export function Card({ title, sub, actions, children }: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Kpi({ label, value, hint, hindsight }: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  hindsight?: boolean
}) {
  return (
    <div className={`card kpi${hindsight ? ' hindsight' : ''}`}>
      <div className="label">
        {label}
        {hindsight && <span className="tag">hindsight</span>}
      </div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'line' | 'area' | 'dash' }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i
            className={`swatch${i.kind === 'area' ? ' area' : ''}`}
            style={i.kind === 'dash'
              ? { background: `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` }
              : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function TooltipBox({ title, rows }: { title: ReactNode; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="tooltip">
      <div className="t-head">{title}</div>
      {rows.map(([k, v], i) => (
        <div className="t-row" key={i}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return <div className="state">Loading {what}…</div>
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state error">Couldn’t load data: {message}</div>
}
