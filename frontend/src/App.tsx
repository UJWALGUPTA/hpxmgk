import { useEffect, useState } from 'react'
import { api, useAsync } from './api'
import { AccuracyView } from './components/AccuracyView'
import { DecisionView } from './components/DecisionView'
import { Methodology } from './components/Methodology'
import { ErrorState, Loading } from './components/ui'

type Tab = 'decision' | 'accuracy' | 'method'
const TABS: { id: Tab; label: string }[] = [
  { id: 'decision', label: 'Decision view' },
  { id: 'accuracy', label: 'Forecast accuracy' },
  { id: 'method', label: 'Methodology' },
]

// UI state lives in the URL hash so views are shareable (e.g. #accuracy?auction=n2ex-60).
function readHash() {
  const [tab, query] = window.location.hash.slice(1).split('?')
  const params = new URLSearchParams(query)
  return {
    tab: (TABS.some((t) => t.id === tab) ? tab : 'decision') as Tab,
    auction: params.get('auction'),
    day: params.get('day'),
  }
}

export default function App() {
  const meta = useAsync(api.meta, [])
  const initial = readHash()
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [auctionId, setAuctionId] = useState<string | null>(initial.auction)
  const [day, setDay] = useState<string | null>(initial.day)

  const m = meta.data
  const auction = m?.auctions.find((a) => a.id === auctionId) ?? m?.auctions.find((a) => a.id === m.default_auction)
  const activeDay = day && m?.delivery_days.includes(day) ? day : m?.delivery_days[13] // mid-January default

  useEffect(() => {
    if (!auction || !activeDay) return
    const params = new URLSearchParams({ auction: auction.id, day: activeDay })
    window.history.replaceState(null, '', `#${tab}?${params}`)
  }, [tab, auction, activeDay])

  const openDay = (d: string) => {
    setDay(d)
    setTab('decision')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/favicon.svg" width={28} height={28} alt="" />
            <div>WindDesk <small>GB day-ahead wind intelligence</small></div>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="page">
        {meta.error && <ErrorState message={meta.error} />}
        {!m && meta.loading && <Loading what="WindDesk" />}
        {m && auction && activeDay && (
          <>
            {tab !== 'method' && (
              <div className="controls" style={{ marginBottom: 12 }}>
                <div>
                  <div className="control-label">Day-ahead auction (gate closure on D-1)</div>
                  <div className="segmented" role="group" aria-label="Auction">
                    {m.auctions.map((a) => (
                      <button key={a.id} aria-pressed={a.id === auction.id} onClick={() => setAuctionId(a.id)} title={a.description}>
                        {a.name.replace(' Day-Ahead', '')}<span className="sub">{a.gate_closure}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === 'decision' && <DecisionView meta={m} auction={auction} day={activeDay} onDayChange={setDay} />}
            {tab === 'accuracy' && <AccuracyView auction={auction} onSelectDay={openDay} />}
            {tab === 'method' && <Methodology meta={m} />}
            <footer className="footer">
              <span>Data: Elexon BMRS (FUELHH, WINDFOR) · Pilot scope: purchase decisions in January 2026</span>
              <span>All times UK local</span>
            </footer>
          </>
        )}
      </main>
    </>
  )
}
