// Polyfills for React Native environment
// These must be imported before any other code that might use Node.js APIs

declare const global: typeof globalThis & { Buffer: typeof Buffer }

// Intl.PluralRules polyfill for ICU MessageFormat pluralization
// This must be imported before i18n initialization
import '@formatjs/intl-pluralrules/polyfill-force'
import '@formatjs/intl-pluralrules/locale-data/en'
import '@formatjs/intl-pluralrules/locale-data/fr'

import { Buffer } from 'buffer'

// Make Buffer globally available
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer
}

// Streaming polyfills for AI SDK
// structuredClone is needed for AI SDK's useChat
if (typeof structuredClone === 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny: polyfill for structuredClone
  ;(global as any).structuredClone = (obj: unknown) =>
    JSON.parse(JSON.stringify(obj))
}
