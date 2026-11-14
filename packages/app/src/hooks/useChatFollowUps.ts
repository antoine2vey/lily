import type { LanguageCode } from '@lily/shared'
import { runApiEffect } from '@/utils/client'

export const requestChatFollowUps = (language: LanguageCode) =>
  runApiEffect('aiChat', 'requestChatFollowUps', { payload: { language } })
