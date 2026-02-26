import { nowAsEpochMillis } from '@lily/shared'

export const generateMessageId = (role: 'user' | 'assistant'): string =>
  `${role}-${nowAsEpochMillis()}-${Math.random().toString(36).slice(2, 11)}`
