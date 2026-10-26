// Formatting helpers. All times are shown in UK local time, the market's clock.

const TZ = 'Europe/London'

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts })
const hhmm = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
const dayLong = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const dayShort = fmt({ day: 'numeric', month: 'short' })

export const fmtTime = (iso: string) => hhmm.format(new Date(iso))
export const fmtDay = (iso: string) => dayLong.format(new Date(iso))
export const fmtDayShort = (iso: string) => dayShort.format(new Date(iso))
export const fmtDayTime = (iso: string) => `${fmtDay(iso)} ${fmtTime(iso)}`

/** A plain YYYY-MM-DD delivery date, anchored at UK noon so it never shifts a day. */
export const dateIso = (d: string) => `${d}T12:00:00Z`

export const mw = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : `${v.toLocaleString('en-GB', { maximumFractionDigits: digits })} MW`
export const gw = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v / 1000).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })} GW`
export const gwh = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })} GWh`
export const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`
export const signedGw = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${gw(Math.abs(v))}`
export const hours = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}h`)
