import type { Locale } from '@/i18n'
import { type CalculatorMessages, en } from './en'
import { fr } from './fr'

export type { CalculatorMessages }

export const calculatorMessages: Record<Locale, CalculatorMessages> = {
  en,
  fr,
}
