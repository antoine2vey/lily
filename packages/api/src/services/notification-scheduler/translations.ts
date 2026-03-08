import type { LanguageCode } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'

const MAX_PLANT_NAMES_IN_BODY = 5

// Simple (non-care) notification translations
type SimpleTranslation = {
  readonly title: (params: SimpleNotificationParams) => string
  readonly body: (params: SimpleNotificationParams) => string
}

export type SimpleNotificationType =
  | 'new_follower'
  | 'nudge_to_water'
  | 'delegation_request'
  | 'delegation_accepted'
  | 'delegation_rejected'
  | 'delegation_canceled'
  | 'delegation_activated'
  | 'delegation_completed'

export type SimpleNotificationParams = {
  readonly senderName?: string
  readonly plantCount?: number
}

type SimpleTranslationMap = Record<SimpleNotificationType, SimpleTranslation>

const simpleTranslations: Record<LanguageCode, SimpleTranslationMap> = {
  en: {
    new_follower: {
      title: () => 'New follower',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} started following you`,
    },
    nudge_to_water: {
      title: () => 'Nudge from a friend',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'A friend')} is reminding you to check on your plants!`,
    },
    delegation_request: {
      title: () => 'Care request',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} wants you to care for their plants`,
    },
    delegation_accepted: {
      title: () => 'Request accepted',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} accepted your care delegation`,
    },
    delegation_rejected: {
      title: () => 'Request declined',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} declined your care delegation`,
    },
    delegation_canceled: {
      title: () => 'Delegation canceled',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} canceled the care delegation`,
    },
    delegation_activated: {
      title: () => 'Delegation started',
      body: (p) =>
        `Care delegation for ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plants has started`,
    },
    delegation_completed: {
      title: () => 'Delegation ended',
      body: (p) =>
        `Care delegation for ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plants has ended`,
    },
  },
  fr: {
    new_follower: {
      title: () => 'Nouveau follower',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a commencé à vous suivre`,
    },
    nudge_to_water: {
      title: () => "Rappel d'un ami",
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Un ami')} vous rappelle de vous occuper de vos plantes !`,
    },
    delegation_request: {
      title: () => 'Demande de garde',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} souhaite que vous gardiez ses plantes`,
    },
    delegation_accepted: {
      title: () => 'Demande acceptée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a accepté votre délégation de soins`,
    },
    delegation_rejected: {
      title: () => 'Demande refusée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a refusé votre délégation de soins`,
    },
    delegation_canceled: {
      title: () => 'Délégation annulée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a annulé la délégation de soins`,
    },
    delegation_activated: {
      title: () => 'Délégation commencée',
      body: (p) =>
        `La délégation de soins pour ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plantes a commencé`,
    },
    delegation_completed: {
      title: () => 'Délégation terminée',
      body: (p) =>
        `La délégation de soins pour ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plantes est terminée`,
    },
  },
}

export const buildSimpleContent = (
  type: SimpleNotificationType,
  params: SimpleNotificationParams,
  language: LanguageCode
): { title: string; body: string } => {
  const t = simpleTranslations[language][type]
  return {
    title: t.title(params),
    body: t.body(params),
  }
}

// Care reminder translations
type CareTranslations = {
  readonly singleTitle: (plantName: string) => string
  readonly singleBody: (plantName: string) => string
  readonly pluralTitle: (count: number) => string
  readonly andMore: (count: number) => string
}

type TranslationMap = {
  readonly watering_reminder: CareTranslations
  readonly fertilization_reminder: CareTranslations
  readonly overdue_reminder: CareTranslations
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
    overdue_reminder: {
      singleTitle: (name) => `Your ${name} is overdue for watering`,
      singleBody: (name) => `Your ${name} still needs watering — don't forget!`,
      pluralTitle: (count) => `${count} plants are overdue for watering`,
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
    overdue_reminder: {
      singleTitle: (name) => `Votre ${name} a besoin d'eau`,
      singleBody: (name) =>
        `Votre ${name} attend toujours d'être arrosé(e) — n'oubliez pas !`,
      pluralTitle: (count) => `${count} plantes sont en retard d'arrosage`,
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
    Match.when(
      'overdue_reminder',
      () => translations[language].overdue_reminder
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
