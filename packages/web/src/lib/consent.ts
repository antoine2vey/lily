import { Option } from 'effect'
import { useSyncExternalStore } from 'react'

export type Choice = 'granted' | 'denied'

export interface Consent {
  readonly choice: Option.Option<Choice>
  readonly asking: boolean
}

const KEY = 'analytics-consent'
// The CNIL recommends asking again after about six months, for a refusal as for a consent.
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

const parseStored = (
  raw: string | null,
  now: number
): Option.Option<Choice> => {
  const [choice, at] = (raw ?? '').split(':')
  const age = now - Number(at)
  return (choice === 'granted' || choice === 'denied') &&
    age >= 0 &&
    age < MAX_AGE_MS
    ? Option.some(choice)
    : Option.none()
}

const stored = (): Option.Option<Choice> => {
  try {
    return parseStored(localStorage.getItem(KEY), Date.now())
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
    localStorage.setItem(KEY, `${choice}:${Date.now()}`)
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

export const useConsent = (): Consent =>
  useSyncExternalStore(subscribe, snapshot, () => PRERENDERED)
