import { DateTime, Option, pipe } from 'effect'
import { useSyncExternalStore } from 'react'

export type Choice = 'granted' | 'denied'

export interface Consent {
  readonly choice: Option.Option<Choice>
  readonly asking: boolean
}

const KEY = 'analytics-consent'
// The CNIL recommends asking again after about six months, for a refusal as for a consent.
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

const isChoice = (s: string): s is Choice => s === 'granted' || s === 'denied'

const now = () => DateTime.toEpochMillis(DateTime.nowUnsafe())

// Native `split` in place of Effect's `String` module only: see the Effect rule in packages/web/CLAUDE.md.
const parseStored = (raw: string | null): Option.Option<Choice> =>
  pipe(
    Option.fromNullishOr(raw),
    Option.map((value) => value.split(':')),
    Option.filter(([, at]) => {
      const age = now() - Number(at)
      return age >= 0 && age < MAX_AGE_MS
    }),
    Option.flatMap(([choice]) => Option.fromNullishOr(choice)),
    Option.filter(isChoice)
  )

const stored = (): Option.Option<Choice> => {
  try {
    return parseStored(localStorage.getItem(KEY))
  } catch {
    return Option.none()
  }
}

const PRERENDERED: Consent = { choice: Option.none(), asking: false }

let current: Consent | undefined
const listeners = new Set<() => void>()

const snapshot = (): Consent => {
  if (current === undefined) {
    const choice = stored()
    current = { choice, asking: Option.isNone(choice) }
  }
  return current
}

const set = (next: Consent) => {
  current = next
  for (const listener of listeners) listener()
}

export const decide = (choice: Choice) => {
  try {
    localStorage.setItem(KEY, `${choice}:${now()}`)
  } catch {
    // Storage is blocked: the choice holds for this page and the next page asks again.
  }
  set({ choice: Option.some(choice), asking: false })
}

export const askAgain = () => set({ ...snapshot(), asking: true })

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// React hydrates with the prerendered state, so anything that must act on the stored choice from the first moment subscribes here.
export const onChoice = (
  listener: (choice: Option.Option<Choice>) => void
): (() => void) => {
  const notify = () => listener(snapshot().choice)
  notify()
  return subscribe(notify)
}

export const useConsent = (): Consent =>
  useSyncExternalStore(subscribe, snapshot, () => PRERENDERED)
