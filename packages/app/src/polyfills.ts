// Polyfills for React Native environment
// These must be imported before any other code that might use Node.js APIs

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
