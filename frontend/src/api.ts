import { useEffect, useState } from 'react'
import type { Accuracy, DayView, Meta } from './types'

// Same-origin by default (Vite proxy in dev, FastAPI/Vercel routing in prod).
const BASE = import.meta.env.VITE_API_BASE ?? ''

async function getJson<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.json() as Promise<T>
}

export const api = {
  meta: () => getJson<Meta>('/api/meta'),
  day: (date: string, auction: string) => getJson<DayView>(`/api/day/${date}`, { auction }),
  accuracy: (auction: string) => getJson<Accuracy>('/api/accuracy', { auction }),
}

export interface Async<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Minimal fetch hook: re-runs when `deps` change and ignores stale responses. */
export function useAsync<T>(fn: (() => Promise<T>) | null, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: !!fn })
  useEffect(() => {
    if (!fn) return
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
