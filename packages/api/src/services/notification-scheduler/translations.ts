import type { LanguageCode } from '@lily/shared'
import type { DeferredCareType } from '@lily/shared/server'
import { Array, Match, Option, pipe } from 'effect'

const MAX_PLANT_NAMES_IN_BODY = 5

// Simple (non-care) notification translations
type SimpleTranslation = {
  readonly title: (params: InternalNotificationParams) => string
  readonly body: (params: InternalNotificationParams) => string
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
  | 'streak_at_risk'
  | 'streak_milestone'
  | 'weekly_recap'
  | 'trial_ending'
  | 'approaching_limit'
  | 'plant_anniversary'

// Per-notification-type params for compile-time safety.
// Required fields per type prevent callers from omitting needed data.
export type NotificationParamsMap = {
  readonly new_follower: { readonly senderName?: string }
  readonly nudge_to_water: { readonly senderName?: string }
  readonly delegation_request: { readonly senderName?: string }
  readonly delegation_accepted: { readonly senderName?: string }
  readonly delegation_rejected: { readonly senderName?: string }
  readonly delegation_canceled: { readonly senderName?: string }
  readonly delegation_activated: { readonly plantCount?: number }
  readonly delegation_completed: { readonly plantCount?: number }
  readonly daily_tip: { readonly tipTitle?: string; readonly tipBody?: string }
  readonly inactivity_nudge: { readonly plantCount?: number }
  readonly photo_reminder: {
    readonly plantName?: string
    readonly daysSincePhoto?: number
  }
  readonly plant_parent_milestone: { readonly daysSinceJoin?: number }
  readonly gift_subscription: { readonly giftDuration?: string }
  readonly resubscribe_nudge: { readonly plantCount?: number }
  readonly streak_at_risk: {
    readonly streakCount: number
    readonly plantName?: string
  }
  readonly streak_milestone: { readonly streakCount: number }
  readonly weekly_recap: {
    readonly tasksCompleted: number
    readonly streakCount: number
    readonly healthyCount: number
  }
  readonly trial_ending: { readonly trialDaysLeft: number }
  readonly approaching_limit: {
    readonly usageCount: number
    readonly usageMax: number
    readonly featureName: string
  }
  readonly plant_anniversary: {
    readonly plantName: string
    readonly anniversaryDuration: string
    readonly dateAdded: string
  }
}

// Internal flat params type used by translation functions.
// All fields optional because each translation only reads its own subset.
type InternalNotificationParams = {
  readonly senderName?: string
  readonly plantCount?: number
  readonly plantName?: string
  readonly daysSinceJoin?: number
  readonly daysSincePhoto?: number
  readonly tipTitle?: string
  readonly tipBody?: string
  readonly giftDuration?: string
  readonly streakCount?: number
  readonly tasksCompleted?: number
  readonly healthyCount?: number
  readonly trialDaysLeft?: number
  readonly usageCount?: number
  readonly usageMax?: number
  readonly featureName?: string
  readonly anniversaryDuration?: string
  readonly dateAdded?: string
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
    streak_at_risk: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 Your ${streak}-day streak ends tonight!`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Your plants'
        )
        return `${name} still needs care. Don't break your streak!`
      },
    },
    streak_milestone: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 ${streak}-day streak!`
      },
      body: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `You've cared for your plants every day for ${streak} days. That's dedication!`
      },
    },
    weekly_recap: {
      title: () => '📊 Your weekly plant recap',
      body: (p) => {
        const tasks = Option.getOrElse(
          Option.fromNullable(p.tasksCompleted),
          () => 0
        )
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        const healthy = Option.getOrElse(
          Option.fromNullable(p.healthyCount),
          () => 0
        )
        return `This week: ${tasks} care tasks, ${streak}-day streak, ${healthy} thriving plants.`
      },
    },
    trial_ending: {
      title: () => '⏳ Your Premium trial is ending soon',
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.trialDaysLeft),
          () => 3
        )
        return `Your trial ends in ${days} ${days === 1 ? 'day' : 'days'}. Keep unlimited plants, AI advice, and care delegation!`
      },
    },
    approaching_limit: {
      title: () => "📈 You're approaching your limit",
      body: (p) => {
        const used = Option.getOrElse(
          Option.fromNullable(p.usageCount),
          () => 0
        )
        const max = Option.getOrElse(Option.fromNullable(p.usageMax), () => 0)
        const feature = Option.getOrElse(
          Option.fromNullable(p.featureName),
          () => 'resources'
        )
        return `You've used ${used}/${max} ${feature}. Upgrade to Premium for unlimited access!`
      },
    },
    plant_anniversary: {
      title: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.anniversaryDuration),
          () => 'some time'
        )
        return `🎂 Happy ${duration}!`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Your plant'
        )
        const date = Option.getOrElse(
          Option.fromNullable(p.dateAdded),
          () => 'a while ago'
        )
        return `You've been caring for ${name} since ${date}. Keep it up!`
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
    streak_at_risk: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 Votre série de ${streak} jours se termine ce soir !`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Vos plantes'
        )
        return `${name} a encore besoin de soins. Ne brisez pas votre série !`
      },
    },
    streak_milestone: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 Série de ${streak} jours !`
      },
      body: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `Vous prenez soin de vos plantes chaque jour depuis ${streak} jours. Quelle dévotion !`
      },
    },
    weekly_recap: {
      title: () => '📊 Votre récap hebdomadaire',
      body: (p) => {
        const tasks = Option.getOrElse(
          Option.fromNullable(p.tasksCompleted),
          () => 0
        )
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        const healthy = Option.getOrElse(
          Option.fromNullable(p.healthyCount),
          () => 0
        )
        return `Cette semaine : ${tasks} soins, série de ${streak} jours, ${healthy} plantes en forme.`
      },
    },
    trial_ending: {
      title: () => '⏳ Votre essai Premium se termine bientôt',
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.trialDaysLeft),
          () => 3
        )
        return `Votre essai se termine dans ${days} ${days === 1 ? 'jour' : 'jours'}. Gardez plantes illimitées, conseils IA et délégation !`
      },
    },
    approaching_limit: {
      title: () => '📈 Vous approchez de votre limite',
      body: (p) => {
        const used = Option.getOrElse(
          Option.fromNullable(p.usageCount),
          () => 0
        )
        const max = Option.getOrElse(Option.fromNullable(p.usageMax), () => 0)
        const feature = Option.getOrElse(
          Option.fromNullable(p.featureName),
          () => 'ressources'
        )
        return `Vous avez utilisé ${used}/${max} ${feature}. Passez à Premium pour un accès illimité !`
      },
    },
    plant_anniversary: {
      title: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.anniversaryDuration),
          () => 'un moment'
        )
        return `🎂 Joyeux ${duration} !`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'Votre plante'
        )
        const date = Option.getOrElse(
          Option.fromNullable(p.dateAdded),
          () => 'un moment'
        )
        return `Vous prenez soin de ${name} depuis le ${date}. Continuez comme ça !`
      },
    },
  },
}

export const buildSimpleContent = <T extends SimpleNotificationType>(
  type: T,
  params: NotificationParamsMap[T],
  language: LanguageCode
): { title: string; body: string } => {
  const t = simpleTranslations[language][type]
  return {
    title: t.title(params as InternalNotificationParams),
    body: t.body(params as InternalNotificationParams),
  }
}

// Grouped plant anniversary content — used when a user has multiple plant
// anniversaries landing in the same notification poll. Collapses N plants
// into a single push instead of spamming one-per-plant.
type GroupedAnniversaryTranslation = (plantNames: readonly string[]) => {
  title: string
  body: string
}

const joinGroupedPlantNames = (
  plantNames: readonly string[],
  andMore: (remaining: number) => string
): string => {
  const count = plantNames.length
  const visible = Array.take(plantNames, MAX_PLANT_NAMES_IN_BODY)
  const remaining = count - MAX_PLANT_NAMES_IN_BODY
  return remaining > 0
    ? `${Array.join(visible, ', ')} ${andMore(remaining)}`
    : Array.join(visible, ', ')
}

const groupedPlantAnniversary: Record<
  LanguageCode,
  GroupedAnniversaryTranslation
> = {
  en: (plantNames) => {
    const count = plantNames.length
    const names = joinGroupedPlantNames(
      plantNames,
      (remaining) => `and ${remaining} more`
    )
    return {
      title: `🎂 ${count} plant anniversaries today!`,
      body: `You've been caring for ${names}. Keep it up!`,
    }
  },
  fr: (plantNames) => {
    const count = plantNames.length
    const names = joinGroupedPlantNames(
      plantNames,
      (remaining) => `et ${remaining} de plus`
    )
    return {
      title: `🎂 ${count} anniversaires de plantes aujourd'hui !`,
      body: `Vous prenez soin de ${names}. Continuez comme ça !`,
    }
  },
}

export const buildGroupedPlantAnniversaryContent = (
  plantNames: readonly string[],
  language: LanguageCode
): { title: string; body: string } =>
  groupedPlantAnniversary[language](plantNames)

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
