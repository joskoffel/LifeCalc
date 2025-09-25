'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// === Utility constants ===
const MS_PER_DAY = 24 * 3600 * 1000
const MS_PER_YEAR = 365.2425 * MS_PER_DAY // tropický rok

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

// ===== Types =====
export type LifeStats = {
  ageMs: number
  ageYears: number
  leftMs: number
  leftYears: number
  percent: number // 0..100
  leftParts: { days: number; hours: number; minutes: number; seconds: number }
  totalWeeks: number
  livedWeeks: number
}

// ===== Pure compute (testable) =====
export function computeLifeStats(dob: Date, now: Date, expectancyYears: number): LifeStats {
  const exp = clamp(expectancyYears || 82, 30, 120)
  const ageMs = now.getTime() - dob.getTime()
  const ageYears = ageMs / MS_PER_YEAR
  const leftYearsRaw = exp - ageYears
  const leftYears = Math.max(0, leftYearsRaw)
  const leftMsRaw = exp * MS_PER_YEAR - ageMs
  const leftMs = Math.max(0, leftMsRaw)

  const totalWeeks = Math.round(exp * 52)
  const livedWeeks = Math.min(totalWeeks, Math.max(0, Math.floor(ageYears * 52)))

  const days = Math.floor(leftMs / MS_PER_DAY)
  const hours = Math.floor((leftMs % MS_PER_DAY) / (3600 * 1000))
  const minutes = Math.floor((leftMs % (3600 * 1000)) / (60 * 1000))
  const seconds = Math.floor((leftMs % (60 * 1000)) / 1000)

  const percent = clamp((ageYears / exp) * 100, 0, 100)

  return {
    ageMs,
    ageYears,
    leftMs,
    leftYears,
    percent,
    leftParts: { days, hours, minutes, seconds },
    totalWeeks,
    livedWeeks,
  }
}

// ===== Lightweight self-tests (log to console) =====
function runSelfTests() {
  const results: Array<{ name: string; ok: boolean; details?: string }> = []
  const push = (name: string, ok: boolean, details?: string) => results.push({ name, ok, details })

  // T1 – basic sanity (20 years)
  {
    const dob = new Date('2000-01-01T00:00:00Z')
    const now = new Date('2020-01-01T00:00:00Z')
    const s = computeLifeStats(dob, now, 82)
    push('T1 age ≈ 20y', Math.round(s.ageYears) === 20, `got ~${s.ageYears.toFixed(2)}`)
    push('T1 left > 0', s.leftYears > 0)
    push('T1 weeks monotonic', s.livedWeeks <= s.totalWeeks)
  }

  // T2 – lived >= expectancy -> left=0, percent=100
  {
    const dob = new Date('1900-01-01T00:00:00Z')
    const now = new Date('2020-01-01T00:00:00Z')
    const s = computeLifeStats(dob, now, 100)
    push('T2 leftYears == 0', s.leftYears === 0)
    push('T2 percent == 100', Math.abs(s.percent - 100) < 1e-9)
    push('T2 livedWeeks == totalWeeks', s.livedWeeks === s.totalWeeks)
  }

  // T3 – newborn today
  {
    const now = new Date('2025-01-01T00:00:00Z')
    const dob = new Date('2025-01-01T00:00:00Z')
    const s = computeLifeStats(dob, now, 80)
    push('T3 ageYears ~ 0', s.ageYears < 1e-6)
    push('T3 livedWeeks ~ 0', s.livedWeeks === 0)
  }

  // T4 – percent bounds 0..100
  {
    const sMin = computeLifeStats(new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'), 80)
    push('T4 percent min 0', sMin.percent >= 0)
    const sMax = computeLifeStats(new Date('1900-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'), 50)
    push('T4 percent max 100', sMax.percent <= 100)
  }

  // T5 – leftMs never negative
  {
    const s = computeLifeStats(new Date('1900-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'), 60)
    push('T5 leftMs >= 0', s.leftMs >= 0)
  }

  const allOk = results.every(r => r.ok)
  // eslint-disable-next-line no-console
  console.info(`LifeClock self-tests ${allOk ? '✅' : '❌'}`)
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.info(` • ${r.ok ? 'PASS' : 'FAIL'} – ${r.name}${r.details ? ` (${r.details})` : ''}`)
  }
}

// ===== Component =====
export default function LifeClockApp() {
  // DOB string used by compute; derive from year/month/day
  const [dobStr, setDobStr] = useState<string>('')

  // UX-friendly DOB picker (Year / Month / Day)
  const [dobYear, setDobYear] = useState<number>(1999)
  const [dobMonth, setDobMonth] = useState<number>(1)
  const [dobDay, setDobDay] = useState<number>(1)
  const [expYears, setExpYears] = useState<number>(82)
  const years = useMemo(() => {
    const out: number[] = []
    const current = new Date().getFullYear()
    for (let y = current; y >= 1900; y--) out.push(y)
    return out
  }, [])
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

  // Keep dobStr in sync with individual Y/M/D selects
  useEffect(() => {
    const maxDay = daysInMonth(dobYear, dobMonth)
    const safeDay = Math.min(dobDay, maxDay)
    if (safeDay !== dobDay) setDobDay(safeDay)
    const mm = String(dobMonth).padStart(2, '0')
    const dd = String(safeDay).padStart(2, '0')
    const nextDob = `${dobYear}-${mm}-${dd}`
    if (nextDob !== dobStr) {
      setDobStr(nextDob)
    }
  }, [dobYear, dobMonth, dobDay, dobStr])

  // Hydrate from URL params (if available) and run self-tests once on mount
  useEffect(() => {
    const applyDobFromParam = (value: string) => {
      const parts = value.split('-')
      if (parts.length !== 3) return
      const [yearStr, monthStr, dayStr] = parts
      const year = Number(yearStr)
      const month = Number(monthStr)
      const day = Number(dayStr)
      if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return
      const currentYear = new Date().getFullYear()
      const safeYear = clamp(year, 1900, currentYear)
      const safeMonth = clamp(month, 1, 12)
      const safeDay = clamp(day, 1, daysInMonth(safeYear, safeMonth))
      const mm = String(safeMonth).padStart(2, '0')
      const dd = String(safeDay).padStart(2, '0')
      const nextDob = `${safeYear}-${mm}-${dd}`
      setDobYear(safeYear)
      setDobMonth(safeMonth)
      setDobDay(safeDay)
      setDobStr(nextDob)
      setHasInteractedWithDob(true)
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const dobParam = params.get('dob')
      if (dobParam) {
        applyDobFromParam(dobParam)
      }
      const expParam = params.get('exp')
      if (expParam) {
        const parsed = Number(expParam)
        if (!Number.isNaN(parsed)) {
          setExpYears(clamp(parsed, 30, 120))
        }
      }
    }

    runSelfTests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [hasInteractedWithDob, setHasInteractedWithDob] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [visibleWeeks, setVisibleWeeks] = useState(0)
  const visibleWeeksRef = useRef(0)
  const detailsSectionRef = useRef<HTMLDivElement | null>(null)
  const weeksSectionRef = useRef<HTMLDivElement | null>(null)
  const autoFocusTriggeredRef = useRef(false)

  useEffect(() => {
    visibleWeeksRef.current = visibleWeeks
  }, [visibleWeeks])

  useEffect(() => {
    if (showDetails) {
      autoFocusTriggeredRef.current = false
    }
  }, [dobStr, expYears, showDetails])

  const markDobInteraction = () => {
    setHasInteractedWithDob(true)
  }

  useEffect(() => {
    if (!showDetails || autoFocusTriggeredRef.current) return
    if (typeof window === 'undefined') return
    const el = detailsSectionRef.current
    if (!el) return
    const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
    if (!isSmallScreen) return

    autoFocusTriggeredRef.current = true
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth'
    el.scrollIntoView({ behavior, block: 'start' })
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true })
    }
  }, [showDetails, dobStr, expYears])

  useEffect(() => {
    if (!hasInteractedWithDob || !dobStr) return
    const timeout = window.setTimeout(() => setShowDetails(true), 200)
    return () => window.clearTimeout(timeout)
  }, [hasInteractedWithDob, dobStr])

  // Live time ticker
  const [now, setNow] = useState<Date>(() => new Date())
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const loop = () => {
      setNow(new Date())
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Derived stats
  const stats: LifeStats | null = useMemo(() => {
    if (!dobStr) return null
    const dobDate = new Date(dobStr)
    if (Number.isNaN(dobDate.getTime())) return null
    return computeLifeStats(dobDate, now, expYears)
  }, [dobStr, now, expYears])

  const totalWeeks = stats?.totalWeeks ?? 0
  const targetWeeks = stats ? clamp(stats.livedWeeks, 0, totalWeeks) : 0

  useEffect(() => {
    if (!showDetails) return
    visibleWeeksRef.current = 0
    setVisibleWeeks(0)
  }, [showDetails, dobStr, expYears])

  useEffect(() => {
    if (!showDetails) return
    const el = weeksSectionRef.current
    if (!el) return
    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
    el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
  }, [showDetails, dobStr, expYears])

  useEffect(() => {
    if (!showDetails || totalWeeks <= 0) return
    const target = targetWeeks
    const startValue = clamp(visibleWeeksRef.current, 0, totalWeeks)
    if (target === startValue) return

    const duration = Math.min(4000, Math.max(1200, totalWeeks * 6))
    let startTime: number | null = null
    let raf: number

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min(1, (timestamp - startTime) / duration)
      const interpolated = Math.round(startValue + (target - startValue) * progress)
      if (progress >= 1) {
        setVisibleWeeks(target)
      } else {
        setVisibleWeeks(interpolated)
      }
      if (progress < 1) {
        raf = requestAnimationFrame(step)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [showDetails, targetWeeks, totalWeeks])

  // Share URL (embeds dob & expectancy)
  const shareUrl = () => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams()
    if (dobStr) p.set('dob', dobStr)
    if (expYears) p.set('exp', String(expYears))
    const query = p.toString()
    const base = `${window.location.origin}${window.location.pathname}`
    const url = query ? `${base}?${query}` : base
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert('URL skopírované do schránky.')
      }).catch(() => {
        prompt('Skopíruj túto URL:', url)
      })
    } else {
      prompt('Skopíruj túto URL:', url)
    }
    if (window.history?.replaceState) {
      window.history.replaceState({}, '', url)
    }
  }

  // Formatting helpers
  const fmtInt = (n: number | undefined) =>
    typeof n === 'number' ? n.toLocaleString('sk-SK') : '—'
  const fmtPct = (n: number | undefined) =>
    typeof n === 'number' ? `${n.toFixed(2)}%` : '—'

  const progressWidth = showDetails && stats ? `${stats.percent}%` : '0%'
  const displayedLivedWeeks = showDetails ? clamp(visibleWeeks, 0, totalWeeks) : 0

  const reanimateWeeks = useCallback(() => {
    if (!showDetails || !stats) return
    const target = clamp(stats.livedWeeks, 0, stats.totalWeeks)
    setVisibleWeeks(0)
    visibleWeeksRef.current = 0
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        setVisibleWeeks(target)
      })
    } else {
      setVisibleWeeks(target)
    }
  }, [showDetails, stats])

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Life Clock – Koľko času Ti ostáva?</h1>
          <p className="text-slate-600 mt-2">Zadaj dátum narodenia a očakávanú dĺžku života. Appka v reálnom čase zobrazuje <strong>čas prežitý</strong>, <strong>čas zostávajúci</strong>, percentá a vizualizáciu <strong>týždňov života</strong>.</p>
        </header>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
          <div className="grid md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Dátum narodenia</label>
              <div className="grid grid-cols-3 gap-2">
                <select aria-label="Rok narodenia" className="rounded-xl border border-slate-200 px-3 py-2 hover:border-slate-300 transition-colors" value={dobYear} onChange={(e) => { markDobInteraction(); setDobYear(Number(e.target.value)); }}>
                  {years.map((y) => (<option key={y} value={y}>{y}</option>))}
                </select>
                <select aria-label="Mesiac" className="rounded-xl border border-slate-200 px-3 py-2 hover:border-slate-300 transition-colors" value={dobMonth} onChange={(e) => { markDobInteraction(); setDobMonth(Number(e.target.value)); }}>
                  {months.map((m) => (<option key={m} value={m}>{String(m).padStart(2,'0')}</option>))}
                </select>
                <select aria-label="Deň" className="rounded-xl border border-slate-200 px-3 py-2 hover:border-slate-300 transition-colors" value={dobDay} onChange={(e) => { markDobInteraction(); setDobDay(Number(e.target.value)); }}>
                  {Array.from({ length: daysInMonth(dobYear, dobMonth) }, (_, i) => i + 1).map((d) => (<option key={d} value={d}>{String(d).padStart(2,'0')}</option>))}
                </select>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                <span>Rýchly skok na rok:</span>
                {[2000, 1995, 1990, 1985, 1980, 1975].map((y) => (
                  <button key={y} type="button" className="rounded-lg px-2 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors" onClick={() => { markDobInteraction(); setDobYear(y); }}>{y}</button>
                ))}
                <button type="button" className="rounded-lg px-2 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors" onClick={() => { const y = new Date().getFullYear(); markDobInteraction(); setDobYear(y); setDobMonth(1); setDobDay(1); }}>Dnešný rok</button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Tip: vyber najprv rok, potom mesiac a deň; dátum ukladáme ako {dobStr || '—'}.</p>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">Očakávaná dĺžka života (roky)</label>
              <input
                type="number"
                min={30}
                max={120}
                step={0.1}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 hover:border-slate-300 transition-colors"
                value={expYears}
                onChange={(e) => setExpYears(clamp(Number(e.target.value), 30, 120))}
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">Rýchle predvoľby</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'EU muž ~76', v: 76 },
                  { label: 'EU žena ~82', v: 82 },
                  { label: 'Ambiciózne 85', v: 85 },
                  { label: 'Dlhšie 90', v: 90 },
                ].map((b) => (
                  <button
                    key={b.label}
                    className="rounded-xl px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors"
                    onClick={() => {
                      markDobInteraction()
                      if (b.v === expYears) {
                        reanimateWeeks()
                      } else {
                        setVisibleWeeks(0)
                        visibleWeeksRef.current = 0
                        setExpYears(b.v)
                      }
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">Zdieľať nastavenia</label>
              <button
                onClick={shareUrl}
                className="w-full rounded-xl px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
              >Kopírovať URL s nastaveniami</button>
            </div>
          </div>
        </section>

        {showDetails && (
          <div ref={detailsSectionRef} tabIndex={-1}>
            <section className="grid md:grid-cols-4 gap-4 mb-6 life-fade-section" style={{ animationDelay: '0ms' }}>
              <div className="bg-white rounded-2xl shadow p-5">
                <div className="text-sm text-slate-600">Vek</div>
                <div className="text-3xl font-bold tabular-nums">{stats ? stats.ageYears.toFixed(2) : '—'}</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-5">
                <div className="text-sm text-slate-600">Zostáva (roky)</div>
                <div className="text-3xl font-bold tabular-nums">{stats ? stats.leftYears.toFixed(2) : '—'}</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-5">
                <div className="text-sm text-slate-600">% prežité</div>
                <div className="text-3xl font-bold tabular-nums">{stats ? fmtPct(stats.percent) : '—'}</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-5">
                <div className="text-sm text-slate-600">Live odpočítavanie</div>
                <div className="text-xl font-semibold tabular-nums">
                  {stats
                    ? `${Math.floor(stats.leftYears)}r ${stats.leftParts.days % 365}d ${stats.leftParts.hours}h ${stats.leftParts.minutes}m ${stats.leftParts.seconds}s`
                    : '—'}
                </div>
                <div className="text-xs text-slate-500 mt-1">Roky • dni • hodiny • minúty • sekundy</div>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow p-6 mb-6 life-fade-section" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-600">Životný progres</div>
                <div className="text-sm font-medium">{stats ? `${stats.percent.toFixed(2)}% prežité` : '—'}</div>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-4 bg-emerald-600 transition-all duration-[2000ms] ease-out" style={{ width: progressWidth }} />
              </div>
            </section>

            {/* Týždne života (vizualizácia) */}
            <section
              ref={weeksSectionRef}
              className="bg-white rounded-2xl shadow p-6 mb-6 life-fade-section"
              style={{ animationDelay: '300ms' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-slate-600">Týždne života</div>
                  <div className="text-xs text-slate-500">Každý štvorček je 1 týždeň. 52 stĺpcov = 1 rok.</div>
                </div>
                <div className="text-sm font-medium">
                  {stats ? `${stats.livedWeeks.toLocaleString('sk-SK')} / ${stats.totalWeeks.toLocaleString('sk-SK')} týždňov` : '—'}
                </div>
              </div>

              <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(52, minmax(0,1fr))', gap: 2 }}>
                {stats && Array.from({ length: stats.totalWeeks }).map((_, i) => (
                  <div
                    key={i}
                    className={`life-week w-full rounded-[2px] ${i < displayedLivedWeeks ? 'life-week--filled' : 'life-week--empty'}`}
                    style={{ paddingTop: '100%' }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4 text-xs text-slate-600">
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-600" /> prežité</div>
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" /> zostáva</div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
