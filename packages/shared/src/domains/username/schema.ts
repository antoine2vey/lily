import { Schema } from 'effect'

export const UsernameAvailability = Schema.Struct({
  available: Schema.Boolean,
  username: Schema.String,
})

export type UsernameAvailability = typeof UsernameAvailability.Type
export * from './rules'
