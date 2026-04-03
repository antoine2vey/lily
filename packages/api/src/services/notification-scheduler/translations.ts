import type { LanguageCode } from '@lily/shared'
import type { DeferredCareType } from '@lily/shared/server'
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
  | 'daily_tip'
  | 'inactivity_nudge'
  | 'photo_reminder'
  | 'plant_parent_milestone'
  | 'gift_subscription'
  | 'resubscribe_nudge'

export type SimpleNotificationParams = {
  readonly senderName?: string
  readonly plantCount?: number
  readonly plantName?: string
  readonly daysSinceJoin?: number
  readonly daysSincePhoto?: number
  readonly tipTitle?: string
  readonly tipBody?: string
  readonly giftDuration?: string
}

type SimpleTranslationMap = Record<SimpleNotificationType, SimpleTranslation>

const simpleTranslations: Record<LanguageCode, SimpleTranslationMap> = {
  en: {
    new_follower: {
      title: () => '👋 New follower',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} started following you`,
    },
    nudge_to_water: {
      title: () => '💧 Nudge from a friend',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'A friend')} is reminding you to check on your plants!`,
    },
    delegation_request: {
      title: () => '🤝 Care request',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} wants you to care for their plants`,
    },
    delegation_accepted: {
      title: () => '✅ Request accepted',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} accepted your care delegation`,
    },
    delegation_rejected: {
      title: () => '😔 Request declined',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} declined your care delegation`,
    },
    delegation_canceled: {
      title: () => '🚫 Delegation canceled',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} canceled the care delegation`,
    },
    delegation_activated: {
      title: () => '🌱 Delegation started',
      body: (p) =>
        `Care delegation for ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plants has started`,
    },
    delegation_completed: {
      title: () => '🎉 Delegation ended',
      body: (p) =>
        `Care delegation for ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plants has ended`,
    },
    inactivity_nudge: {
      title: () => '🌿 Your plants miss you!',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return pipe(
          Match.value(count > 0),
          Match.when(
            true,
            () =>
              `It's been a while since you checked in. Your ${count} plants are waiting for some love!`
          ),
          Match.orElse(
            () =>
              "It's been a while since you checked in. Your plants are waiting for some love!"
          )
        )
      },
    },
    daily_tip: {
      title: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipTitle),
          () => '🌱 Did you know?'
        ),
      body: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipBody),
          () =>
            'Plants in terracotta pots dry out faster than those in plastic. Check your soil moisture!'
        ),
    },
    photo_reminder: {
      title: () => '📸 Time for a growth update!',
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Your plant'
        )
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSincePhoto),
          () => 30
        )
        return `${name} hasn't been photographed in ${days} days. Capture its progress!`
      },
    },
    plant_parent_milestone: {
      title: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `🎂 ${days} Days as a Plant Parent!`
      },
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `You joined Lily ${days} days ago. Your plants are lucky to have you!`
      },
    },
    gift_subscription: {
      title: () => '🎁 You received a gift!',
      body: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.giftDuration),
          () => 'a special period'
        )
        return `You've been gifted premium access for ${duration}. Enjoy!`
      },
    },
    resubscribe_nudge: {
      title: () => '🌱 Some of your plants need care reminders',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `${count} plants aren't receiving care alerts. Upgrade to Premium to cover your entire garden!`
      },
    },
  },
  fr: {
    new_follower: {
      title: () => '👋 Nouveau follower',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a commencé à vous suivre`,
    },
    nudge_to_water: {
      title: () => "💧 Rappel d'un ami",
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Un ami')} vous rappelle de vous occuper de vos plantes !`,
    },
    delegation_request: {
      title: () => '🤝 Demande de garde',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} souhaite que vous gardiez ses plantes`,
    },
    delegation_accepted: {
      title: () => '✅ Demande acceptée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a accepté votre délégation de soins`,
    },
    delegation_rejected: {
      title: () => '😔 Demande refusée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a refusé votre délégation de soins`,
    },
    delegation_canceled: {
      title: () => '🚫 Délégation annulée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a annulé la délégation de soins`,
    },
    delegation_activated: {
      title: () => '🌱 Délégation commencée',
      body: (p) =>
        `La délégation de soins pour ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plantes a commencé`,
    },
    delegation_completed: {
      title: () => '🎉 Délégation terminée',
      body: (p) =>
        `La délégation de soins pour ${Option.getOrElse(Option.fromNullable(p.plantCount), () => 0)} plantes est terminée`,
    },
    inactivity_nudge: {
      title: () => '🌿 Vos plantes vous attendent !',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return pipe(
          Match.value(count > 0),
          Match.when(
            true,
            () =>
              `Cela fait un moment que vous n'avez pas pris de leurs nouvelles. Vos ${count} plantes attendent un peu d'amour !`
          ),
          Match.orElse(
            () =>
              "Cela fait un moment que vous n'avez pas pris de leurs nouvelles. Vos plantes attendent un peu d'amour !"
          )
        )
      },
    },
    daily_tip: {
      title: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipTitle),
          () => '🌱 Le saviez-vous ?'
        ),
      body: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipBody),
          () =>
            "Les plantes en pots de terre cuite sèchent plus vite que celles en plastique. Vérifiez l'humidité du sol !"
        ),
    },
    photo_reminder: {
      title: () => '📸 Suivi de croissance !',
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Votre plante'
        )
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSincePhoto),
          () => 30
        )
        return `${name} n'a pas été photographiée depuis ${days} jours. Capturez ses progrès !`
      },
    },
    plant_parent_milestone: {
      title: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `🎂 ${days} jours en tant que parent de plantes !`
      },
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `Vous avez rejoint Lily il y a ${days} jours. Vos plantes ont de la chance de vous avoir !`
      },
    },
    gift_subscription: {
      title: () => '🎁 Vous avez reçu un cadeau !',
      body: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.giftDuration),
          () => 'une période spéciale'
        )
        return `On vous a offert un accès premium pour ${duration}. Profitez-en !`
      },
    },
    resubscribe_nudge: {
      title: () => '🌱 Certaines plantes manquent de rappels de soins',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `${count} plantes ne reçoivent pas de rappels. Passez à Premium pour couvrir tout votre jardin !`
      },
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

type TranslationMap = Record<DeferredCareType, CareTranslations>

const translations: Record<LanguageCode, TranslationMap> = {
  en: {
    watering_reminder: {
      singleTitle: (name) => `💧 Time to water your ${name}`,
      singleBody: (name) => `Your ${name} needs watering today.`,
      pluralTitle: (count) => `💧 ${count} plants need watering`,
      andMore: (count) => `and ${count} more`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Time to fertilize your ${name}`,
      singleBody: (name) => `Your ${name} needs fertilizing today.`,
      pluralTitle: (count) => `🌿 ${count} plants need fertilizing`,
      andMore: (count) => `and ${count} more`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Time to mist your ${name}`,
      singleBody: (name) => `Your ${name} needs misting today.`,
      pluralTitle: (count) => `🌫️ ${count} plants need misting`,
      andMore: (count) => `and ${count} more`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Time to repot your ${name}`,
      singleBody: (name) => `Your ${name} is ready for repotting.`,
      pluralTitle: (count) => `🪴 ${count} plants need repotting`,
      andMore: (count) => `and ${count} more`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Your ${name} needs attention`,
      singleBody: (name) => `Your ${name} is overdue for care — don't forget!`,
      pluralTitle: (count) => `⚠️ ${count} plants need attention`,
      andMore: (count) => `and ${count} more`,
    },
  },
  fr: {
    watering_reminder: {
      singleTitle: (name) => `💧 Il est temps d'arroser votre ${name}`,
      singleBody: (name) =>
        `Votre ${name} a besoin d'être arrosé(e) aujourd'hui.`,
      pluralTitle: (count) => `💧 ${count} plantes ont besoin d'arrosage`,
      andMore: (count) => `et ${count} de plus`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Il est temps de fertiliser votre ${name}`,
      singleBody: (name) =>
        `Votre ${name} a besoin d'être fertilisé(e) aujourd'hui.`,
      pluralTitle: (count) => `🌿 ${count} plantes ont besoin de fertilisant`,
      andMore: (count) => `et ${count} de plus`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Il est temps de brumiser votre ${name}`,
      singleBody: (name) =>
        `Votre ${name} a besoin d'être brumisé(e) aujourd'hui.`,
      pluralTitle: (count) => `🌫️ ${count} plantes ont besoin de brumisation`,
      andMore: (count) => `et ${count} de plus`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Il est temps de rempoter votre ${name}`,
      singleBody: (name) => `Votre ${name} est prêt(e) pour le rempotage.`,
      pluralTitle: (count) => `🪴 ${count} plantes ont besoin de rempotage`,
      andMore: (count) => `et ${count} de plus`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Votre ${name} a besoin d'attention`,
      singleBody: (name) =>
        `Votre ${name} est en retard de soins — n'oubliez pas !`,
      pluralTitle: (count) => `⚠️ ${count} plantes ont besoin d'attention`,
      andMore: (count) => `et ${count} de plus`,
    },
  },
}

const getCareTranslations = (
  language: LanguageCode,
  type: DeferredCareType
): CareTranslations => translations[language][type]

export const buildSinglePlantContent = (
  type: DeferredCareType,
  plantName: string,
  language: LanguageCode
): { title: string; body: string } =>
  buildNotificationContent(type, [plantName], language)

export const buildNotificationContent = (
  type: DeferredCareType,
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
