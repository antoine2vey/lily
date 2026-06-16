import type { CareType, LanguageCode } from '@lily/shared'
import type { DeferredCareType } from '@lily/shared/server'
import { Array, Match, Option, pipe } from 'effect'

const MAX_PLANT_NAMES_IN_BODY = 5

// Pluralization is language-specific. English uses the singular form only for
// exactly 1; French treats both 0 and 1 as singular ("0 plante", "1 plante").
// Centralizing this keeps every count-bearing notification grammatical across
// the full range of values it can actually receive.
const enPlural = (n: number, singular: string, plural: string): string =>
  n === 1 ? singular : plural

const frPlural = (n: number, singular: string, plural: string): string =>
  n <= 1 ? singular : plural

// Keep a recap clause only when its count is non-zero. Without this guard a 0
// reaches the reader as "a 0-day streak" or "0 plants thriving" — technically
// correct, emotionally wrong. We'd rather drop the clause than report a zero.
const recapClause = (keep: boolean, text: string): Option.Option<string> =>
  keep ? Option.some(text) : Option.none()

// Natural-language list join, only ever called with 2+ clauses. English takes
// an Oxford comma ("a, b, and c"); French omits it ("a, b et c"). Recaps carry
// at most three stats, so 2 and 3 are the only lengths we handle.
const joinClauses = (
  parts: ReadonlyArray<string>,
  conjunction: string,
  oxford: boolean
): string =>
  Match.value(parts.length).pipe(
    Match.when(3, () => {
      const last = Option.getOrElse(Array.last(parts), () => '')
      const head = Array.join(Array.dropRight(parts, 1), ', ')
      return `${head}${oxford ? ',' : ''} ${conjunction} ${last}`
    }),
    Match.orElse(() => Array.join(parts, ` ${conjunction} `))
  )

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

// Voice rules:
// - English addresses the user as "you" and names plants possessively
//   ("your Monstera"). Where a plant name can be absent, the fallback is the
//   bare noun ("plant") so the possessive stays in the template.
// - French uses tutoiement throughout (tu / ton / ta / tes) and names plants
//   as "ta <name>" — never vouvoiement.
const simpleTranslations: Record<LanguageCode, SimpleTranslationMap> = {
  en: {
    new_follower: {
      title: () => '👋 New follower!',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} started following your plant journey`,
    },
    nudge_to_water: {
      title: () => '💧 A friendly nudge',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'A friend')} thinks your plants could use a little love!`,
    },
    delegation_request: {
      title: () => '🤝 Plant-sitting request',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} would love your help caring for their plants`,
    },
    delegation_accepted: {
      title: () => '✅ Request accepted!',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} is happy to look after your plants`,
    },
    delegation_rejected: {
      title: () => '😔 Request declined',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} can't plant-sit for you right now`,
    },
    delegation_canceled: {
      title: () => '🚫 Plant-sitting canceled',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')} called off the plant-sitting`,
    },
    delegation_activated: {
      title: () => '🌱 Plant-sitting has begun',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `You're now caring for ${count} ${enPlural(count, 'plant', 'plants')}. Thanks for helping out!`
      },
    },
    delegation_completed: {
      title: () => '🎉 Plant-sitting complete',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `Your care for ${count} ${enPlural(count, 'plant', 'plants')} has wrapped up. Nicely done!`
      },
    },
    inactivity_nudge: {
      title: () => '🌿 Your plants miss you!',
      body: (p) =>
        Option.match(Option.fromNullable(p.plantCount), {
          onNone: () =>
            "It's been a while! Your plants would love a little attention.",
          onSome: (count) =>
            pipe(
              Match.value(count),
              Match.when(
                1,
                () =>
                  "It's been a while! Your plant would love a little attention."
              ),
              Match.orElse(
                () =>
                  `It's been a while! Your ${count} plants would love a little attention.`
              )
            ),
        }),
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
          () => 'plant'
        )
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSincePhoto),
          () => 30
        )
        return `Your ${name} hasn't had a photo in ${days} ${enPlural(days, 'day', 'days')}. Capture how far it's come!`
      },
    },
    plant_parent_milestone: {
      title: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `🎂 ${days} days as a plant parent!`
      },
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSinceJoin),
          () => 30
        )
        return `You joined Lily ${days} days ago. Your plants are lucky to have you! 🌿`
      },
    },
    gift_subscription: {
      title: () => '🎁 A gift for you!',
      body: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.giftDuration),
          () => 'a special period'
        )
        return `You've been gifted Lily Premium for ${duration}. Enjoy every feature! 🌿`
      },
    },
    resubscribe_nudge: {
      title: () => '🌱 Some plants need reminders',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `${count} ${enPlural(count, "plant isn't", "plants aren't")} getting care alerts. Go Premium to cover your whole garden!`
      },
    },
    streak_at_risk: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 Don't lose your ${streak}-day streak!`
      },
      body: (p) =>
        Option.match(Option.fromNullable(p.plantName), {
          onNone: () =>
            'Your plants still need care today. Keep the streak alive!',
          onSome: (name) =>
            `Your ${name} still needs care today. Keep the streak alive!`,
        }),
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
        return `You've cared for your plants ${streak} days straight. That's real dedication! 🌟`
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
        const clauses = Array.getSomes([
          recapClause(
            tasks > 0,
            `${tasks} care ${enPlural(tasks, 'task', 'tasks')} done`
          ),
          recapClause(streak > 0, `a ${streak}-day streak going`),
          recapClause(
            healthy > 0,
            `${healthy} ${enPlural(healthy, 'plant', 'plants')} thriving`
          ),
        ])
        // Two or more wins → a celebratory recap. A single win → a warmer,
        // tailored line, since "What a week!" oversells one lonely stat.
        return Match.value(clauses).pipe(
          Match.when(
            (c) => c.length >= 2,
            (c) => `What a week! ${joinClauses(c, 'and', true)}. 🌿`
          ),
          Match.orElse(() =>
            Match.value({ tasks, streak }).pipe(
              Match.when(
                { tasks: (t) => t > 0 },
                () =>
                  `Nice week — ${tasks} care ${enPlural(tasks, 'task', 'tasks')} done. Your plants noticed. 🌿`
              ),
              Match.when(
                { streak: (s) => s > 0 },
                () => `Your ${streak}-day care streak is still going strong. 🌿`
              ),
              Match.orElse(
                () =>
                  `${healthy} ${enPlural(healthy, 'plant', 'plants')} thriving this week. Keep it up! 🌿`
              )
            )
          )
        )
      },
    },
    trial_ending: {
      title: () => '⏳ Your Premium trial is ending soon',
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.trialDaysLeft),
          () => 3
        )
        return `Just ${days} ${enPlural(days, 'day', 'days')} left of your trial. Keep unlimited plants, AI advice, and care delegation!`
      },
    },
    approaching_limit: {
      title: () => "📈 You're close to your limit",
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
        return `You've used ${used}/${max} ${feature} this month. Go Premium for unlimited access!`
      },
    },
    plant_anniversary: {
      title: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.anniversaryDuration),
          () => 'some time'
        )
        return `🎂 Happy ${duration} together!`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'plant'
        )
        const date = Option.getOrElse(
          Option.fromNullable(p.dateAdded),
          () => 'a while ago'
        )
        return `You've been caring for your ${name} since ${date}. Here's to many more! 🌿`
      },
    },
  },
  fr: {
    new_follower: {
      title: () => '👋 Nouvel abonné !',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} suit désormais ton jardin`,
    },
    nudge_to_water: {
      title: () => "💧 Le petit rappel d'un ami",
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => 'Un ami')} pense que tes plantes mériteraient un peu d'attention !`,
    },
    delegation_request: {
      title: () => '🤝 Demande de garde',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} aimerait que tu gardes ses plantes`,
    },
    delegation_accepted: {
      title: () => '✅ Demande acceptée !',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} va s'occuper de tes plantes avec plaisir`,
    },
    delegation_rejected: {
      title: () => '😔 Demande refusée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} ne peut pas garder tes plantes pour le moment`,
    },
    delegation_canceled: {
      title: () => '🚫 Garde annulée',
      body: (p) =>
        `${Option.getOrElse(Option.fromNullable(p.senderName), () => "Quelqu'un")} a annulé la garde des plantes`,
    },
    delegation_activated: {
      title: () => '🌱 La garde commence',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `Tu prends soin de ${count} ${frPlural(count, 'plante', 'plantes')}. Merci de ton aide !`
      },
    },
    delegation_completed: {
      title: () => '🎉 Garde terminée',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `Ta garde de ${count} ${frPlural(count, 'plante', 'plantes')} est terminée. Bravo !`
      },
    },
    inactivity_nudge: {
      title: () => "🌿 Tes plantes t'attendent !",
      body: (p) =>
        Option.match(Option.fromNullable(p.plantCount), {
          onNone: () =>
            "Ça fait un moment ! Tes plantes adoreraient un peu d'attention.",
          onSome: (count) =>
            pipe(
              Match.value(count),
              Match.when(
                1,
                () =>
                  "Ça fait un moment ! Ta plante adorerait un peu d'attention."
              ),
              Match.orElse(
                () =>
                  `Ça fait un moment ! Tes ${count} plantes adoreraient un peu d'attention.`
              )
            ),
        }),
    },
    daily_tip: {
      title: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipTitle),
          () => '🌱 Le savais-tu ?'
        ),
      body: (p) =>
        Option.getOrElse(
          Option.fromNullable(p.tipBody),
          () =>
            "Les plantes en pots de terre cuite sèchent plus vite que celles en plastique. Vérifie l'humidité du sol !"
        ),
    },
    photo_reminder: {
      title: () => '📸 Photo souvenir ?',
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'plante'
        )
        const days = Option.getOrElse(
          Option.fromNullable(p.daysSincePhoto),
          () => 30
        )
        return `Aucune photo de ta ${name} depuis ${days} ${frPlural(days, 'jour', 'jours')}. Immortalise ses progrès !`
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
        return `Tu as rejoint Lily il y a ${days} jours. Tes plantes ont bien de la chance ! 🌿`
      },
    },
    gift_subscription: {
      title: () => '🎁 Un cadeau pour toi !',
      body: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.giftDuration),
          () => 'une période spéciale'
        )
        return `On t'a offert Lily Premium pour ${duration}. Profites-en pleinement ! 🌿`
      },
    },
    resubscribe_nudge: {
      title: () => '🌱 Certaines plantes manquent de rappels',
      body: (p) => {
        const count = Option.getOrElse(
          Option.fromNullable(p.plantCount),
          () => 0
        )
        return `${count} ${frPlural(count, 'plante ne reçoit', 'plantes ne reçoivent')} pas de rappels. Passe à Premium pour couvrir tout ton jardin !`
      },
    },
    streak_at_risk: {
      title: (p) => {
        const streak = Option.getOrElse(
          Option.fromNullable(p.streakCount),
          () => 0
        )
        return `🔥 Ne perds pas ta série de ${streak} jours !`
      },
      body: (p) =>
        Option.match(Option.fromNullable(p.plantName), {
          onNone: () =>
            "Tes plantes ont encore besoin de soins aujourd'hui. Garde le rythme !",
          onSome: (name) =>
            `Ta ${name} a encore besoin de soins aujourd'hui. Garde le rythme !`,
        }),
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
        return `Tu prends soin de tes plantes depuis ${streak} jours d'affilée. Quelle dévotion ! 🌟`
      },
    },
    weekly_recap: {
      title: () => '📊 Ton récap hebdomadaire',
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
        const clauses = Array.getSomes([
          recapClause(
            streak > 0,
            `${streak} ${frPlural(streak, 'jour', 'jours')} de série`
          ),
          recapClause(
            tasks > 0,
            `${tasks} ${frPlural(tasks, 'soin', 'soins')}`
          ),
          recapClause(
            healthy > 0,
            `${healthy} ${frPlural(healthy, 'plante en pleine forme', 'plantes en pleine forme')}`
          ),
        ])
        // Deux victoires ou plus → un récap enthousiaste. Une seule → une phrase
        // plus chaleureuse, car "Quelle semaine !" en fait trop pour un seul chiffre.
        return Match.value(clauses).pipe(
          Match.when(
            (c) => c.length >= 2,
            (c) => `Quelle semaine ! ${joinClauses(c, 'et', false)}. 🌿`
          ),
          Match.orElse(() =>
            Match.value({ tasks, streak }).pipe(
              Match.when(
                { tasks: (t) => t > 0 },
                () =>
                  `Belle semaine — ${tasks} ${frPlural(tasks, 'soin', 'soins')} ${frPlural(tasks, 'effectué', 'effectués')}. Tes plantes te remercient. 🌿`
              ),
              Match.when(
                { streak: (s) => s > 0 },
                () =>
                  `Ta série de soins de ${streak} ${frPlural(streak, 'jour', 'jours')} continue. Bravo ! 🌿`
              ),
              Match.orElse(
                () =>
                  `${healthy} ${frPlural(healthy, 'plante en pleine forme', 'plantes en pleine forme')} cette semaine. Continue comme ça ! 🌿`
              )
            )
          )
        )
      },
    },
    trial_ending: {
      title: () => '⏳ Ton essai Premium se termine bientôt',
      body: (p) => {
        const days = Option.getOrElse(
          Option.fromNullable(p.trialDaysLeft),
          () => 3
        )
        return `Plus que ${days} ${frPlural(days, 'jour', 'jours')} d'essai. Garde plantes illimitées, conseils IA et délégation !`
      },
    },
    approaching_limit: {
      title: () => '📈 Tu approches de ta limite',
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
        return `Tu as utilisé ${used}/${max} ${feature} ce mois-ci. Passe à Premium pour un accès illimité !`
      },
    },
    plant_anniversary: {
      title: (p) => {
        const duration = Option.getOrElse(
          Option.fromNullable(p.anniversaryDuration),
          () => 'un moment'
        )
        return `🎂 Joyeux ${duration} ensemble !`
      },
      body: (p) => {
        const name = Option.getOrElse(
          Option.fromNullable(p.plantName),
          () => 'plante'
        )
        const date = Option.getOrElse(
          Option.fromNullable(p.dateAdded),
          () => 'un moment'
        )
        return `Tu prends soin de ta ${name} depuis le ${date}. Encore plein d'autres à venir ! 🌿`
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
      body: `Celebrating ${names}. Here's to many more! 🌿`,
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
      body: `On célèbre ${names}. Encore plein d'autres à venir ! 🌿`,
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

// English names plants possessively ("your Monstera"); French uses tutoiement
// and "ta <name>". Plural titles carry no possessive (the body lists names).
const translations: Record<LanguageCode, TranslationMap> = {
  en: {
    watering_reminder: {
      singleTitle: (name) => `💧 Your ${name} is thirsty`,
      singleBody: (name) => `Time to give your ${name} a drink today.`,
      pluralTitle: (count) => `💧 ${count} plants are thirsty`,
      andMore: (count) => `and ${count} more`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Feed your ${name} today`,
      singleBody: (name) => `Your ${name} is ready for a little fertilizer.`,
      pluralTitle: (count) => `🌿 ${count} plants are hungry`,
      andMore: (count) => `and ${count} more`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Your ${name} loves a misting`,
      singleBody: (name) => `Give your ${name} a refreshing mist today.`,
      pluralTitle: (count) => `🌫️ ${count} plants want a misting`,
      andMore: (count) => `and ${count} more`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Your ${name} needs more room`,
      singleBody: (name) => `Your ${name} is ready for a bigger pot.`,
      pluralTitle: (count) => `🪴 ${count} plants are ready to repot`,
      andMore: (count) => `and ${count} more`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Your ${name} needs you`,
      singleBody: (name) => `Your ${name} is overdue for care — don't forget!`,
      pluralTitle: (count) => `⚠️ ${count} plants need your attention`,
      andMore: (count) => `and ${count} more`,
    },
  },
  fr: {
    watering_reminder: {
      singleTitle: (name) => `💧 Ta ${name} a soif`,
      singleBody: (name) => `Offre un peu d'eau à ta ${name} aujourd'hui.`,
      pluralTitle: (count) => `💧 ${count} plantes ont soif`,
      andMore: (count) => `et ${count} de plus`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Nourris ta ${name} aujourd'hui`,
      singleBody: (name) => `Ta ${name} a besoin d'un peu d'engrais.`,
      pluralTitle: (count) => `🌿 ${count} plantes ont faim`,
      andMore: (count) => `et ${count} de plus`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Ta ${name} adore la brume`,
      singleBody: (name) => `Offre une brumisation à ta ${name} aujourd'hui.`,
      pluralTitle: (count) => `🌫️ ${count} plantes réclament une brumisation`,
      andMore: (count) => `et ${count} de plus`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Ta ${name} a besoin de place`,
      singleBody: (name) => `Ta ${name} a besoin d'un pot plus grand.`,
      pluralTitle: (count) => `🪴 ${count} plantes sont à rempoter`,
      andMore: (count) => `et ${count} de plus`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Ta ${name} te réclame`,
      singleBody: (name) =>
        `Ta ${name} est en retard de soins — n'oublie pas !`,
      pluralTitle: (count) => `⚠️ ${count} plantes réclament ton attention`,
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

// ============================================================================
// Live Activity translations
//
// The Live Activity widget is a pure render layer — it has no access to
// i18next. We pre-render `headline` and `subheadline` here and ship them in
// the ContentState.
// ============================================================================

type LiveActivityCareLabels = Record<CareType, (count: number) => string>

const liveActivityLabels: Record<LanguageCode, LiveActivityCareLabels> = {
  en: {
    watering: (n) => `${n} to water`,
    fertilization: (n) => `${n} to fertilize`,
    misting: (n) => `${n} to mist`,
    repotting: (n) => `${n} to repot`,
  },
  fr: {
    watering: (n) => `${n} à arroser`,
    fertilization: (n) => `${n} à fertiliser`,
    misting: (n) => `${n} à brumiser`,
    repotting: (n) => `${n} à rempoter`,
  },
}

const liveActivityHeadline: Record<
  LanguageCode,
  (totalPlants: number) => string
> = {
  en: (n) =>
    n === 1 ? '1 plant needs care today' : `${n} plants need care today`,
  fr: (n) =>
    n === 1
      ? "1 plante a besoin de soins aujourd'hui"
      : `${n} plantes ont besoin de soins aujourd'hui`,
}

export const buildLiveActivityHeadline = (
  totalPlants: number,
  language: LanguageCode
): string => liveActivityHeadline[language](totalPlants)

// Pool of punchy generic titles for the bold first line of the lock-screen
// activity. The muted headline below carries the precise count, so these stay
// human-warm rather than functional. Callers pass a day-stable `seed` (see
// buildContentState) so the title rotates day to day without flickering
// between mid-day activity updates.
const liveActivityTitles: Record<
  LanguageCode,
  Array.NonEmptyReadonlyArray<string>
> = {
  en: Array.make(
    'Quick care today',
    'A little plant love',
    'Tend your jungle',
    'Your green to-do',
    'Plant care time',
    'Your plants need you'
  ),
  fr: Array.make(
    'Petit soin du jour',
    "Un peu d'amour vert",
    'Ton moment jardinage',
    "C'est l'heure des soins",
    'Chouchoute tes plantes',
    "Tes plantes t'attendent"
  ),
}

// `seed` picks a title deterministically — pass a day-stable value so the
// lock-screen title rotates daily but never changes mid-update. Defaults to
// the first entry when no seed is supplied.
export const buildLiveActivityTitle = (
  language: LanguageCode,
  seed = 0
): string => {
  const titles = liveActivityTitles[language]
  const index = Math.abs(seed) % titles.length
  return Option.getOrElse(Array.get(titles, index), () =>
    Array.headNonEmpty(titles)
  )
}

// Short verb shown under each care-type badge in the hero row.
const liveActivityCareTypeLabel: Record<
  LanguageCode,
  Record<CareType, string>
> = {
  en: {
    watering: 'Water',
    fertilization: 'Fertilize',
    misting: 'Mist',
    repotting: 'Repot',
  },
  fr: {
    watering: 'Arroser',
    fertilization: 'Fertiliser',
    misting: 'Brumiser',
    repotting: 'Rempoter',
  },
}

export const buildLiveActivityCareTypeLabel = (
  careType: CareType,
  language: LanguageCode
): string => liveActivityCareTypeLabel[language][careType]

export const buildLiveActivitySubheadline = (
  groups: readonly { careType: CareType; count: number }[],
  language: LanguageCode
): string | undefined => {
  if (Array.isEmptyReadonlyArray(groups)) return undefined
  const labels = liveActivityLabels[language]
  return Array.join(
    Array.map(groups, (g) => labels[g.careType](g.count)),
    ' · '
  )
}

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
