// Polyfills for React Native environment
// These must be imported before any other code that might use Node.js APIs

import { Buffer } from 'buffer'

// Make Buffer globally available
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer
}
