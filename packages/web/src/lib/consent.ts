import { DateTime, Option } from 'effect'
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

// Runs before the first paint so a stored choice hides the prerendered banner. It is the only parser of the stored value.
export const CONSENT_SCRIPT = `(function(){try{var v=(localStorage.getItem('${KEY}')||'').split(':'),a=Date.now()-Number(v[1]);if((v[0]==='granted'||v[0]==='denied')&&a>=0&&a<${MAX_AGE_MS})document.documentElement.dataset.consent=v[0]}catch(e){}})()`

const stored = (): Option.Option<Choice> =>
  Option.filter(
    Option.fromNullishOr(document.documentElement.dataset.consent),
    isChoice
  )

const PRERENDERED: Consent = { choice: Option.none(), asking: true }

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
