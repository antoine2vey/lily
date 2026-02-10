import type { LanguageCode } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'

const MAX_PLANT_NAMES_IN_BODY = 5

type CareTranslations = {
  readonly singleTitle: (plantName: string) => string
  readonly singleBody: (plantName: string) => string
  readonly pluralTitle: (count: number) => string
  readonly andMore: (count: number) => string
}

type TranslationMap = {
  readonly watering_reminder: CareTranslations
  readonly fertilization_reminder: CareTranslations
}

const translations: Record<LanguageCode, TranslationMap> = {
  en: {
    watering_reminder: {
      singleTitle: (name) => `Time to water your ${name}`,
      singleBody: (name) => `Your ${name} needs watering today.`,
      pluralTitle: (count) => `${count} plants need watering`,
      andMore: (count) => `and ${count} more`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `Time to fertilize your ${name}`,
      singleBody: (name) => `Your ${name} needs fertilizing today.`,
      pluralTitle: (count) => `${count} plants need fertilizing`,
      andMore: (count) => `and ${count} more`,
    },
  },
  fr: {
    watering_reminder: {
      singleTitle: (name) => `Il est temps d'arroser votre ${name}`,
      singleBody: (name) =>
        `Votre ${name} a besoin d'être arrosé(e) aujourd'hui.`,
      pluralTitle: (count) => `${count} plantes ont besoin d'arrosage`,
      andMore: (count) => `et ${count} de plus`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `Il est temps de fertiliser votre ${name}`,
      singleBody: (name) =>
        `Votre ${name} a besoin d'être fertilisé(e) aujourd'hui.`,
      pluralTitle: (count) => `${count} plantes ont besoin de fertilisant`,
      andMore: (count) => `et ${count} de plus`,
    },
  },
}

const getCareTranslations = (
  language: LanguageCode,
  type: string
): CareTranslations =>
  pipe(
    Match.value(type),
    Match.when(
      'watering_reminder',
      () => translations[language].watering_reminder
    ),
    Match.when(
      'fertilization_reminder',
      () => translations[language].fertilization_reminder
    ),
    Match.orElse(() => translations[language].watering_reminder)
  )

export const buildSinglePlantContent = (
  type: string,
  plantName: string,
  language: LanguageCode
): { title: string; body: string } =>
  buildNotificationContent(type, [plantName], language)

export const buildNotificationContent = (
  type: string,
  plantNames: readonly string[],
  language: LanguageCode
): { title: string; body: string } => {
  const t = getCareTranslations(language, type)
  const count = plantNames.length

  if (count === 1) {
    return Option.match(Array.head(plantNames), {
      onNone: () => ({ title: t.pluralTitle(1), body: '' }),
      onSome: (name) => ({
        title: t.singleTitle(name),
        body: t.singleBody(name),
      }),
    })
  }

  const title = t.pluralTitle(count)
  const visibleNames = Array.take(plantNames, MAX_PLANT_NAMES_IN_BODY)
  const remaining = count - MAX_PLANT_NAMES_IN_BODY

  const body =
    remaining > 0
      ? `${Array.join(visibleNames, ', ')} ${t.andMore(remaining)}`
      : Array.join(visibleNames, ', ')

  return { title, body }
}
