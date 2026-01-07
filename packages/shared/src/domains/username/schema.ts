import { Schema } from 'effect'

// Username availability response
export const UsernameAvailability = Schema.Struct({
  available: Schema.Boolean,
  username: Schema.String,
})

// Type exports
export type UsernameAvailability = typeof UsernameAvailability.Type
