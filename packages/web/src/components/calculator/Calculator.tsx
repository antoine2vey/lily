import { Array, Option, pipe } from 'effect'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { fmt, plural, useI18n } from '@/i18n'
import { type CalculatorMessages, calculatorMessages } from '@/i18n/calculator'
import {
  type CalculatorFactors,
  type CalculatorInput,
  calculate,
  citiesFor,
  cityById,
  defaultInput,
  LIGHT_LEVELS,
  type LuminosityLevel,
  MONTHS,
  type Month,
  type Orientation,
  plantById,
  plantsFor,
  TEMP_MAX_C,
  TEMP_MIN_C,
} from '@/lib/watering-calculator'

type Direction = 'up' | 'down' | 'flat'

const percentOf = (factor: number): number => Math.round((factor - 1) * 100)

const directionOf = (pct: number): Direction =>
  pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'

const MINUS = '−'

const signed = (n: number): string =>
  n > 0 ? `+${n}` : n < 0 ? `${MINUS}${-n}` : '0'

const temperature = (t: CalculatorMessages, celsius: number): string =>
  fmt(t.form.temperatureValue, {
    c: signed(celsius).replace('+', ''),
    f: signed(Math.round((celsius * 9) / 5 + 32)).replace('+', ''),
  })

// The 3x3 compass grid, read row by row. null is the "not sure" centre.
const COMPASS: ReadonlyArray<Orientation | null> = [
  'NW',
  'N',
  'NE',
  'W',
  null,
  'E',
  'SW',
  'S',
  'SE',
]

const FACTORS: ReadonlyArray<keyof CalculatorFactors> = [
  'seasonLight',
  'window',
  'roomFit',
  'dryAir',
]

const currentMonth = (fallback: Month): Month =>
  pipe(
    Array.get(MONTHS, new Date().getMonth()),
    Option.getOrElse(() => fallback)
  )

const control =
  'w-full rounded-xl bg-bg px-3 py-2.5 text-base text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark'

const chip =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-ink-2 ring-1 ring-line transition-colors has-checked:bg-primary has-checked:text-on-primary has-checked:ring-primary has-focus-visible:ring-2 has-focus-visible:ring-primary-dark hover:bg-chip'

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function Calculator() {
  const { locale } = useI18n()
  const t = calculatorMessages[locale]
  const id = useId()
  const [input, setInput] = useState<CalculatorInput>(() =>
    defaultInput(locale)
  )
  useEffect(() => setInput((i) => ({ ...i, month: currentMonth(i.month) })), [])
  const set = <K extends keyof CalculatorInput>(
    key: K,
    value: CalculatorInput[K]
  ) => setInput((i) => ({ ...i, [key]: value }))

  const cities = citiesFor(locale)
  const result = calculate(input)
  const plantName = plantById(input.plantId).translations[locale].name
  const cityName = cityById(input.cityId).names[locale]
  const monthName = t.form.months[input.month - 1] ?? ''
  const f = t.result.factors
  const sentence: Record<keyof CalculatorFactors, (pct: number) => string> = {
    seasonLight: (pct) =>
      fmt(f.seasonLight[directionOf(pct)], {
        month: monthName,
        city: cityName,
      }),
    window: (pct) =>
      input.orientation === null ? f.window.unset : f.window[directionOf(pct)],
    roomFit: (pct) => f.roomFit[directionOf(pct)],
    dryAir: (pct) =>
      fmt(pct > 0 ? f.dryAir.up : f.dryAir.flat, {
        temp: temperature(t, input.outdoorTempC),
        rh: Math.round(result.indoorHumidity),
      }),
  }
  const percent = (pct: number) => fmt(t.result.percent, { value: signed(pct) })

  return (
    <div className="grid gap-x-10 gap-y-8 rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-8 md:grid-cols-2">
      <section
        aria-labelledby={`${id}-result`}
        className="rounded-2xl bg-tint p-5 sm:p-6 md:col-start-2 md:row-start-1 md:self-start"
      >
        <h2
          id={`${id}-result`}
          className="text-sm font-semibold tracking-wide text-ink-2 uppercase"
        >
          {t.result.label}
        </h2>
        <div aria-live="polite" aria-atomic="true">
          <p
            id="calc-days"
            className="mt-2 text-4xl font-bold tracking-tight text-ink sm:text-5xl"
          >
            {plural(locale, result.days, t.result.every)}
          </p>
          <p className="mt-3 text-ink-2">
            {fmt(plural(locale, result.baseDays, t.result.base), {
              plant: plantName,
            })}
          </p>
          <p className="mt-1 font-semibold text-ink">
            {fmt(t.result.total, {
              value: percent(percentOf(result.demand)),
            })}
          </p>
          {result.dimRoom && (
            <div
              id="calc-dim"
              className="mt-4 rounded-xl bg-surface p-4 ring-1 ring-coral"
            >
              <p className="font-semibold text-ink">
                {fmt(t.result.dimTitle, { plant: plantName })}
              </p>
              <p className="mt-1 text-sm text-ink-2">{t.result.dimBody}</p>
            </div>
          )}
        </div>
        <ul className="mt-5 space-y-4 border-t border-line pt-5">
          {Array.map(FACTORS, (key) => {
            const pct = percentOf(result.factors[key])
            return (
              <li key={key}>
                <p className="flex items-baseline justify-between gap-3 font-semibold text-ink">
                  <span>{f[key].name}</span>
                  <span className="tabular-nums">{percent(pct)}</span>
                </p>
                <p className="mt-1 text-sm text-ink-2">{sentence[key](pct)}</p>
              </li>
            )
          })}
        </ul>
        <p className="mt-5 text-xs text-muted">{t.result.capNote}</p>
      </section>

      <form
        aria-label={t.form.label}
        className="space-y-6 md:col-start-1 md:row-start-1"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field label={t.form.plant} htmlFor="calc-plant">
          <select
            id="calc-plant"
            className={control}
            value={input.plantId}
            onChange={(e) => set('plantId', e.target.value)}
          >
            {Array.map(plantsFor(locale), (p) => (
              <option key={p.scientificName} value={p.scientificName}>
                {p.translations[locale].name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-semibold text-ink">
            {t.form.light}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.map(LIGHT_LEVELS, (level: LuminosityLevel) => (
              <label key={level} className={chip}>
                <input
                  type="radio"
                  name="light"
                  value={level}
                  className="sr-only"
                  checked={input.light === level}
                  onChange={() => set('light', level)}
                />
                {t.form.lightLevels[level - 1]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset aria-describedby={`${id}-window-hint`}>
          <legend className="mb-2 font-semibold text-ink">
            {t.form.window}
          </legend>
          <div className="grid w-44 grid-cols-3 gap-2">
            {Array.map(COMPASS, (o) => (
              <label key={o ?? 'none'} className={chip}>
                <input
                  type="radio"
                  name="window"
                  value={o ?? ''}
                  className="sr-only"
                  checked={input.orientation === o}
                  onChange={() => set('orientation', o)}
                />
                <span aria-hidden="true">
                  {o === null ? '?' : t.form.orientationShort[o]}
                </span>
                <span className="sr-only">
                  {o === null ? t.form.notSure : t.form.orientations[o]}
                </span>
              </label>
            ))}
          </div>
          <p id={`${id}-window-hint`} className="mt-2 text-sm text-muted">
            {t.form.windowHint}
          </p>
        </fieldset>

        <Field label={t.form.city} hint={t.form.cityHint} htmlFor="calc-city">
          <select
            id="calc-city"
            className={control}
            value={input.cityId}
            onChange={(e) =>
              pipe(
                Array.findFirst(cities, (c) => c.id === e.target.value),
                Option.map((c) => set('cityId', c.id))
              )
            }
          >
            {Array.map(cities, (c) => (
              <option key={c.id} value={c.id}>
                {c.names[locale]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t.form.month} htmlFor="calc-month">
          <select
            id="calc-month"
            className={control}
            value={input.month}
            onChange={(e) =>
              pipe(
                Array.findFirst(MONTHS, (m) => m === Number(e.target.value)),
                Option.map((m) => set('month', m))
              )
            }
          >
            {Array.map(MONTHS, (m) => (
              <option key={m} value={m}>
                {t.form.months[m - 1]}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="calc-temp" className="font-semibold text-ink">
              {t.form.temperature}
            </label>
            <output
              htmlFor="calc-temp"
              className="font-semibold whitespace-nowrap tabular-nums text-ink-2"
            >
              {temperature(t, input.outdoorTempC)}
            </output>
          </div>
          <input
            id="calc-temp"
            type="range"
            min={TEMP_MIN_C}
            max={TEMP_MAX_C}
            step={1}
            value={input.outdoorTempC}
            onChange={(e) => set('outdoorTempC', Number(e.target.value))}
            className="w-full accent-primary-dark"
          />
        </div>
      </form>
    </div>
  )
}
