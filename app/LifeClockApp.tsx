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

type Step = 'year' | 'month' | 'day' | 'prep' | 'visual'

export default function LifeClockApp() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark', isDarkMode)
    return () => {
      root.classList.remove('dark')
    }
  }, [isDarkMode])

  const [dobYear, setDobYear] = useState<number>(1999)
  const [dobMonth, setDobMonth] = useState<number>(1)
  const [dobDay, setDobDay] = useState<number>(1)
  const [dobStr, setDobStr] = useState<string>('')
  const [expYears, setExpYears] = useState<number>(82)

  const years = useMemo(() => {
    const out: number[] = []
    const current = new Date().getFullYear()
    for (let y = current; y >= 1900; y--) out.push(y)
    return out
  }, [])
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

  useEffect(() => {
    const maxDay = daysInMonth(dobYear, dobMonth)
    const safeDay = Math.min(dobDay, maxDay)
    if (safeDay !== dobDay) {
      setDobDay(safeDay)
      return
    }
    const mm = String(dobMonth).padStart(2, '0')
    const dd = String(safeDay).padStart(2, '0')
    const nextDob = `${dobYear}-${mm}-${dd}`
    setDobStr(prev => (prev === nextDob ? prev : nextDob))
  }, [dobYear, dobMonth, dobDay])

  useEffect(() => {
    runSelfTests()
  }, [])

  const [currentStep, setCurrentStep] = useState<Step>('year')
  const [isLeaving, setIsLeaving] = useState(false)
  const [nextStep, setNextStep] = useState<Step | null>(null)
  const [enterPhase, setEnterPhase] = useState(false)

  const goToStep = useCallback((step: Step) => {
    if (step === currentStep || isLeaving) return
    setNextStep(step)
    setIsLeaving(true)
  }, [currentStep, isLeaving])

  useEffect(() => {
    if (!isLeaving) return
    const timer = window.setTimeout(() => {
      if (nextStep) {
        setCurrentStep(nextStep)
        setNextStep(null)
      }
      setIsLeaving(false)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [isLeaving, nextStep])

  useEffect(() => {
    if (isLeaving) return
    const timer = window.setTimeout(() => setEnterPhase(false), 40)
    setEnterPhase(true)
    return () => window.clearTimeout(timer)
  }, [currentStep, isLeaving])

  const [prepPhase, setPrepPhase] = useState<'hidden' | 'in' | 'out'>('hidden')
  useEffect(() => {
    if (currentStep !== 'prep') {
      setPrepPhase('hidden')
      return
    }
    setPrepPhase('in')
    const fadeOutTimer = window.setTimeout(() => setPrepPhase('out'), 2200)
    const proceedTimer = window.setTimeout(() => {
      goToStep('visual')
    }, 4400)
    return () => {
      window.clearTimeout(fadeOutTimer)
      window.clearTimeout(proceedTimer)
    }
  }, [currentStep, goToStep])

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

  const stats: LifeStats | null = useMemo(() => {
    if (!dobStr) return null
    const dobDate = new Date(dobStr)
    if (Number.isNaN(dobDate.getTime())) return null
    return computeLifeStats(dobDate, now, expYears)
  }, [dobStr, now, expYears])

  const isVisualStep = currentStep === 'visual'
  const showDetails = isVisualStep && !!stats

  const [gridPhase, setGridPhase] = useState<'hidden' | 'revealing' | 'ready'>('hidden')
  useEffect(() => {
    if (!showDetails) {
      setGridPhase('hidden')
      return
    }
    setGridPhase('revealing')
    const timer = window.setTimeout(() => setGridPhase('ready'), 1400)
    return () => window.clearTimeout(timer)
  }, [showDetails])

  const [visibleWeeks, setVisibleWeeks] = useState(0)
  const visibleWeeksRef = useRef(0)
  const hasStats = Boolean(stats)
  const totalWeeks = stats?.totalWeeks ?? 0
  const livedWeeks = stats?.livedWeeks ?? 0

  useEffect(() => {
    visibleWeeksRef.current = visibleWeeks
  }, [visibleWeeks])

  useEffect(() => {
    if (!showDetails || !hasStats) {
      setVisibleWeeks(0)
      return
    }
    visibleWeeksRef.current = 0
    setVisibleWeeks(0)
  }, [showDetails, hasStats, totalWeeks, livedWeeks])

  useEffect(() => {
    if (!showDetails || !hasStats || gridPhase !== 'ready') return
    const target = clamp(livedWeeks, 0, totalWeeks)
    if (totalWeeks <= 0 || target <= 0) {
      setVisibleWeeks(target)
      return
    }

    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

    if (prefersReducedMotion) {
      setVisibleWeeks(target)
      return
    }

    let startTime: number | null = null
    let raf: number
    const duration = Math.min(4800, Math.max(1800, target * 14))

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min(1, (timestamp - startTime) / duration)
      const interpolated = Math.round(target * progress)
      setVisibleWeeks(interpolated)
      if (progress < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setVisibleWeeks(target)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [showDetails, hasStats, gridPhase, totalWeeks, livedWeeks])

  const displayedLivedWeeks = showDetails ? Math.min(visibleWeeks, totalWeeks) : 0
  const progressWidth = showDetails && stats ? `${stats.percent}%` : '0%'

  const fmtInt = (n: number | undefined) => (typeof n === 'number' ? n.toLocaleString('sk-SK') : '—')
  const fmtPct = (n: number | undefined) => (typeof n === 'number' ? `${n.toFixed(2)}%` : '—')

  const toggleDarkMode = () => setIsDarkMode(v => !v)

  const stepCardBase = isVisualStep
    ? 'w-full max-w-5xl rounded-[32px] bg-white/75 px-6 py-8 shadow-2xl backdrop-blur-xl dark:bg-slate-900/60 sm:px-10 sm:py-10'
    : 'w-full max-w-xl rounded-[32px] bg-white/75 p-8 shadow-2xl backdrop-blur-xl dark:bg-slate-900/60 sm:p-10'

  const stepCardState = isLeaving
    ? 'opacity-0 translate-y-12 pointer-events-none'
    : enterPhase
      ? 'opacity-0 translate-y-4'
      : 'opacity-100 translate-y-0'

  const introState = isVisualStep
    ? 'pointer-events-none opacity-0 -translate-y-4'
    : 'opacity-100 translate-y-0'

  const renderStep = (step: Step) => {
    const formattedDob = dobStr ? new Date(dobStr).toLocaleDateString('sk-SK') : '—'
    switch (step) {
      case 'year':
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.45em] text-emerald-600 dark:text-emerald-300/90">Krok 1</span>
            <h2 className="text-3xl font-semibold sm:text-4xl">Zadaj rok narodenia</h2>
            <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
              Začni rokom, aby sme vedeli, kde na časovej osi života sa nachádzaš.
            </p>
            <select
              value={dobYear}
              onChange={(e) => setDobYear(Number(e.target.value))}
              className="w-52 rounded-2xl border border-emerald-300/40 bg-white/80 px-4 py-3 text-lg font-semibold shadow-inner transition-all duration-500 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none dark:border-emerald-400/30 dark:bg-slate-900/70"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => goToStep('month')}
              className="rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition-all duration-500 hover:bg-emerald-400 hover:shadow-xl"
            >
              Pokračovať
            </button>
          </div>
        )
      case 'month':
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.45em] text-emerald-600 dark:text-emerald-300/90">Krok 2</span>
            <h2 className="text-3xl font-semibold sm:text-4xl">Vyber mesiac</h2>
            <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
              Mesiac narodenia doladí presnosť výpočtu každého zeleného bodu.
            </p>
            <select
              value={dobMonth}
              onChange={(e) => setDobMonth(Number(e.target.value))}
              className="w-52 rounded-2xl border border-emerald-300/40 bg-white/80 px-4 py-3 text-lg font-semibold shadow-inner transition-all duration-500 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none dark:border-emerald-400/30 dark:bg-slate-900/70"
            >
              {months.map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={() => goToStep('year')}
                className="rounded-full border border-emerald-400/60 px-6 py-2 text-sm font-semibold text-emerald-600 transition-all duration-500 hover:border-emerald-500 hover:text-emerald-500 dark:border-emerald-300/60 dark:text-emerald-200"
              >
                Späť
              </button>
              <button
                type="button"
                onClick={() => goToStep('day')}
                className="rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition-all duration-500 hover:bg-emerald-400 hover:shadow-xl"
              >
                Pokračovať
              </button>
            </div>
          </div>
        )
      case 'day':
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.45em] text-emerald-600 dark:text-emerald-300/90">Krok 3</span>
            <h2 className="text-3xl font-semibold sm:text-4xl">A teraz deň</h2>
            <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
              {`Dátum zatiaľ: ${formattedDob}`}
            </p>
            <select
              value={dobDay}
              onChange={(e) => setDobDay(Number(e.target.value))}
              className="w-52 rounded-2xl border border-emerald-300/40 bg-white/80 px-4 py-3 text-lg font-semibold shadow-inner transition-all duration-500 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none dark:border-emerald-400/30 dark:bg-slate-900/70"
            >
              {Array.from({ length: daysInMonth(dobYear, dobMonth) }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
              ))}
            </select>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={() => goToStep('month')}
                className="rounded-full border border-emerald-400/60 px-6 py-2 text-sm font-semibold text-emerald-600 transition-all duration-500 hover:border-emerald-500 hover:text-emerald-500 dark:border-emerald-300/60 dark:text-emerald-200"
              >
                Späť
              </button>
              <button
                type="button"
                onClick={() => goToStep('prep')}
                className="rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition-all duration-500 hover:bg-emerald-400 hover:shadow-xl"
              >
                Spustiť vizualizáciu
              </button>
            </div>
          </div>
        )
      case 'prep':
        return (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 text-center">
            <span
              className={`text-4xl font-semibold uppercase tracking-[0.65em] text-emerald-600 transition-opacity duration-[2200ms] ease-out dark:text-emerald-300 ${prepPhase === 'in' ? 'opacity-100' : 'opacity-0'}`}
            >
              Priprav sa
            </span>
            <p
              className={`text-sm text-slate-600 transition-opacity duration-[2200ms] ease-out dark:text-slate-300 ${prepPhase === 'out' ? 'opacity-0' : 'opacity-100'}`}
            >
              Zelené bodky sa prebúdzajú a plnia jeden týždeň po druhom.
            </p>
          </div>
        )
      case 'visual':
        return (
          <div className="flex w-full flex-col items-center gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.6em] text-emerald-500 dark:text-emerald-300/80">Život na jednej obrazovke</span>
              <h2 className="text-3xl font-semibold sm:text-4xl">Tvoje zelené týždne</h2>
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                {dobStr ? `Narodený ${formattedDob} • očakávanie ${expYears.toFixed(0)} rokov` : 'Zadaj dátum a sleduj vizualizáciu života.'}
              </p>
              <button
                type="button"
                onClick={() => goToStep('year')}
                className="text-sm font-semibold text-emerald-600 transition-colors duration-500 hover:text-emerald-500 dark:text-emerald-300"
              >
                Zmeniť dátum
              </button>
            </div>

            <div className={`flex w-full flex-col items-center gap-8 transition-all duration-700 ease-out ${showDetails ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2'}`}>
              <div className="flex w-full max-w-4xl flex-col items-center gap-5">
                <div className="h-3 w-full overflow-hidden rounded-full bg-emerald-100/50 dark:bg-emerald-500/20">
                  <div className="h-3 rounded-full bg-emerald-500 transition-all duration-[1600ms] ease-out dark:bg-emerald-400" style={{ width: progressWidth }} />
                </div>
                <div
                  className={`life-grid-wrapper w-full rounded-[24px] border border-emerald-500/15 bg-white/60 p-4 shadow-inner backdrop-blur-sm transition-all duration-700 ease-out dark:border-emerald-400/20 dark:bg-slate-900/50 ${gridPhase !== 'hidden' ? 'life-grid--revealing' : ''} ${gridPhase === 'ready' ? 'life-grid--ready' : ''}`}
                  style={{ minHeight: '320px' }}
                >
                  <div className="life-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(52, minmax(0,1fr))', gap: 2 }}>
                    {stats && Array.from({ length: stats.totalWeeks }).map((_, i) => (
                      <div
                        key={i}
                        className={`life-week w-full rounded-[4px] ${gridPhase !== 'hidden' ? 'life-week--slot-visible' : ''} ${i < displayedLivedWeeks ? 'life-week--filled' : 'life-week--empty'}`}
                        style={{ paddingTop: '45%' }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Každý slot = 1 týždeň života</p>
              </div>

              <div className={`w-full max-w-4xl transition-all duration-700 ease-out ${showDetails ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
                <div className="flex flex-col gap-6 rounded-[28px] border border-emerald-500/15 bg-white/70 p-6 shadow-2xl backdrop-blur-xl dark:border-emerald-400/15 dark:bg-slate-900/60 sm:p-8">
                  <div className="flex flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Očakávaná dĺžka života:
                      {' '}
                      <span className="font-semibold text-emerald-600 dark:text-emerald-300">{expYears.toFixed(0)} rokov</span>
                    </label>
                    <input
                      type="range"
                      min={30}
                      max={120}
                      step={1}
                      value={expYears}
                      onChange={(e) => setExpYears(clamp(Number(e.target.value), 30, 120))}
                      className="h-2 w-full max-w-sm cursor-pointer appearance-none rounded-full bg-emerald-200/60 accent-emerald-500 dark:bg-emerald-500/30"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl bg-emerald-500/10 p-4 shadow-inner dark:bg-emerald-500/15">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">Vek</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums">
                        {stats ? `${stats.ageYears.toFixed(2)} r` : '—'}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-4 shadow-inner dark:bg-emerald-500/15">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">Zostáva</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums">
                        {stats ? `${stats.leftYears.toFixed(2)} r` : '—'}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-4 shadow-inner dark:bg-emerald-500/15">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">% prežité</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums">
                        {stats ? fmtPct(stats.percent) : '—'}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-4 shadow-inner dark:bg-emerald-500/15">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">Live odpočítavanie</div>
                      <div className="mt-2 text-base font-semibold tabular-nums">
                        {stats
                          ? `${Math.floor(stats.leftYears)}r ${stats.leftParts.days % 365}d ${stats.leftParts.hours}h ${stats.leftParts.minutes}m ${stats.leftParts.seconds}s`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>
                      Prežité týždne:{' '}
                      <strong>{stats ? fmtInt(stats.livedWeeks) : '—'} / {stats ? fmtInt(stats.totalWeeks) : '—'}</strong>
                    </p>
                    <p>
                      Zelené bodky reprezentujú každý týždeň života. Sleduj, ako sa plnia – pomaly, vytrvalo a na jednom mieste.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-100 text-slate-900 transition-colors duration-[1200ms] ease-out ${isDarkMode ? 'dark' : ''} dark:bg-slate-950 dark:text-slate-100`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.2),_transparent_60%)]" />
      <div className="absolute top-6 right-6 z-20">
        <button
          type="button"
          onClick={toggleDarkMode}
          className="rounded-full border border-emerald-500/40 bg-white/70 px-5 py-2 text-sm font-semibold text-emerald-600 shadow-lg transition-all duration-500 hover:border-emerald-500 hover:bg-white hover:text-emerald-500 dark:border-emerald-300/50 dark:bg-slate-900/70 dark:text-emerald-200"
        >
          {isDarkMode ? 'Svetlý režim' : 'Tmavý režim'}
        </button>
      </div>

      <div className={`relative z-10 flex w-full max-w-6xl flex-col items-center justify-center px-6 py-16 text-center ${isVisualStep ? 'gap-6' : 'gap-8'}`}>
        <div className={`flex flex-col items-center gap-4 transition-all duration-700 ease-out ${introState}`}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Life Clock</h1>
          <p className="max-w-xl text-sm text-slate-600 transition-opacity duration-[1200ms] ease-out dark:text-slate-300">
            Jeden dátum, jedna obrazovka a tiché plnenie zelených bodiek. Sleduj svoj život bez scrollovania, pomaly a sústredene.
          </p>
        </div>

        <div className={`${stepCardBase} transition-all duration-[900ms] ease-out ${stepCardState}`}>
          {renderStep(currentStep)}
        </div>
      </div>
    </div>
  )
}
