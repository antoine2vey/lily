import {
  joinClauses,
  type Language,
  listNames,
  MONTHS_PER_YEAR,
  type NotificationContent,
  recapClause,
} from '@lily/api/services/notification-scheduler/translations/catalog'
import type { UsageField } from '@lily/shared'
import type { GiftDuration } from '@lily/shared/admin'
import { Array, Match, Option } from 'effect'

// French uses tutoiement throughout (tu / ton / ta / tes) and names plants as
// "ta <name>", never vouvoiement. 0 and 1 are both singular ("0 plante").
const plural = (n: number, singular: string, plural: string): string =>
  n <= 1 ? singular : plural

const sender = (senderName: string | undefined): string =>
  Option.getOrElse(Option.fromNullishOr(senderName), () => "Quelqu'un")

const together = (months: number): string => {
  const years = Math.floor(months / MONTHS_PER_YEAR)
  return years > 0 ? `${years} ${plural(years, 'an', 'ans')}` : `${months} mois`
}

const ADDED_ON = new Intl.DateTimeFormat('fr', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const anniversary = (
  plantName: string,
  duration: string,
  since: string
): NotificationContent => ({
  title: `🎂 Joyeux ${duration} ensemble !`,
  body: `Tu prends soin de ta ${plantName} depuis le ${since}. Encore plein d'autres à venir ! 🌿`,
})

const FEATURE: Record<UsageField, string> = {
  aiChats: 'discussions IA',
  cardScans: 'scans de cartes',
  plantIdentifies: 'identifications de plantes',
}

const approachingLimit = (
  used: number,
  max: number,
  feature: string
): NotificationContent => ({
  title: '📈 Tu approches de ta limite',
  body: `Tu as utilisé ${used}/${max} ${feature} ce mois-ci. Passe à Premium pour un accès illimité !`,
})

const GIFT_DURATION: Record<GiftDuration, string> = {
  '7d': 'pour 7 jours',
  '1m': 'pour 1 mois',
  '1y': 'pour 1 an',
  infinite: 'pour toujours',
}

const gift = (duration: string): NotificationContent => ({
  title: '🎁 Un cadeau pour toi !',
  body: `On t'a offert Lily Premium ${duration}. Profites-en pleinement ! 🌿`,
})

const healthyPlants = (n: number): string =>
  `${n} ${plural(n, 'plante en pleine forme', 'plantes en pleine forme')}`

const weeklyRecap = (
  tasks: number,
  streak: number,
  healthy: number
): string => {
  const clauses = Array.getSomes([
    recapClause(
      streak > 0,
      `${streak} ${plural(streak, 'jour', 'jours')} de série`
    ),
    recapClause(tasks > 0, `${tasks} ${plural(tasks, 'soin', 'soins')}`),
    recapClause(healthy > 0, healthyPlants(healthy)),
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
            `Belle semaine — ${tasks} ${plural(tasks, 'soin', 'soins')} ${plural(tasks, 'effectué', 'effectués')}. Tes plantes te remercient. 🌿`
        ),
        Match.when(
          { streak: (s) => s > 0 },
          () =>
            `Ta série de soins de ${streak} ${plural(streak, 'jour', 'jours')} continue. Bravo ! 🌿`
        ),
        Match.orElse(
          () =>
            `${healthyPlants(healthy)} cette semaine. Continue comme ça ! 🌿`
        )
      )
    )
  )
}

export const fr: Language = {
  topics: {
    new_follower: ({ senderName }) => ({
      title: '👋 Nouvel abonné !',
      body: `${sender(senderName)} suit désormais ton jardin`,
    }),
    nudge_to_water: ({ senderName }) => ({
      title: "💧 Le petit rappel d'un ami",
      body: `${Option.getOrElse(Option.fromNullishOr(senderName), () => 'Un ami')} pense que tes plantes mériteraient un peu d'attention !`,
    }),
    delegation_request: ({ senderName }) => ({
      title: '🤝 Demande de garde',
      body: `${sender(senderName)} aimerait que tu gardes ses plantes`,
    }),
    delegation_accepted: ({ senderName }) => ({
      title: '✅ Demande acceptée !',
      body: `${sender(senderName)} va s'occuper de tes plantes avec plaisir`,
    }),
    delegation_rejected: ({ senderName }) => ({
      title: '😔 Demande refusée',
      body: `${sender(senderName)} ne peut pas garder tes plantes pour le moment`,
    }),
    delegation_canceled: ({ senderName, unanswered }) => ({
      title: '🚫 Garde annulée',
      body: unanswered
        ? `${sender(senderName)} n'a pas répondu à temps, la demande de garde a été annulée`
        : `${sender(senderName)} a annulé la garde des plantes`,
    }),
    delegation_activated: ({ plantCount }) => ({
      title: '🌱 La garde commence',
      body: `Tu prends soin de ${plantCount} ${plural(plantCount, 'plante', 'plantes')}. Merci de ton aide !`,
    }),
    delegation_completed: ({ plantCount }) => ({
      title: '🎉 Garde terminée',
      body: `Ta garde de ${plantCount} ${plural(plantCount, 'plante', 'plantes')} est terminée. Bravo !`,
    }),
    canopy_member_joined: ({ senderName, canopyName }) => ({
      title: '🏡 Nouveau membre dans la Canopy',
      body: `${sender(senderName)} a rejoint ${canopyName}`,
    }),
    canopy_member_removed: ({ canopyName }) => ({
      title: '🏡 Du nouveau dans ta Canopy',
      body: `Tu ne fais plus partie de ${canopyName}`,
    }),
    canopy_member_left: ({ senderName, canopyName }) => ({
      title: '🏡 Du nouveau dans ta Canopy',
      body: `${sender(senderName)} a quitté ${canopyName}`,
    }),
    canopy_invitation: ({ senderName, canopyName }) => ({
      title: '🏡 Invitation dans une Canopy',
      body: `${sender(senderName)} t'invite à rejoindre ${canopyName}`,
    }),
    daily_tip: ({ tipTitle, tipBody }) => ({ title: tipTitle, body: tipBody }),
    inactivity_nudge: ({ plantCount }) => ({
      title: "🌿 Tes plantes t'attendent !",
      body:
        plantCount === 1
          ? "Ça fait un moment ! Ta plante adorerait un peu d'attention."
          : `Ça fait un moment ! Tes ${plantCount} plantes adoreraient un peu d'attention.`,
    }),
    photo_reminder: ({ plantName, daysSincePhoto }) => ({
      title: '📸 Photo souvenir ?',
      body: `Aucune photo de ta ${plantName} depuis ${daysSincePhoto} ${plural(daysSincePhoto, 'jour', 'jours')}. Immortalise ses progrès !`,
    }),
    plant_parent_milestone: ({ daysSinceJoin }) => ({
      title: `🎂 ${daysSinceJoin} jours en tant que parent de plantes !`,
      body: `Tu as rejoint Lily il y a ${daysSinceJoin} jours. Tes plantes ont bien de la chance ! 🌿`,
    }),
    gift_subscription: ({ duration }) => gift(GIFT_DURATION[duration]),
    resubscribe_nudge: ({ plantCount }) => ({
      title: '🌱 Certaines plantes manquent de rappels',
      body: `${plantCount} ${plural(plantCount, 'plante ne reçoit', 'plantes ne reçoivent')} pas de rappels. Passe à Premium pour couvrir tout ton jardin !`,
    }),
    streak_at_risk: ({ streakCount, plantName }) => ({
      title: `🔥 Ne perds pas ta série de ${streakCount} jours !`,
      body: Option.match(Option.fromNullishOr(plantName), {
        onNone: () =>
          "Tes plantes ont encore besoin de soins aujourd'hui. Garde le rythme !",
        onSome: (name) =>
          `Ta ${name} a encore besoin de soins aujourd'hui. Garde le rythme !`,
      }),
    }),
    streak_milestone: ({ streakCount }) => ({
      title: `🔥 Série de ${streakCount} jours !`,
      body: `Tu prends soin de tes plantes depuis ${streakCount} jours d'affilée. Quelle dévotion ! 🌟`,
    }),
    weekly_recap: ({ tasksCompleted, streakCount, healthyCount }) => ({
      title: '📊 Ton récap hebdomadaire',
      body: weeklyRecap(tasksCompleted, streakCount, healthyCount),
    }),
    trial_ending: ({ trialDaysLeft }) => ({
      title: '⏳ Ton essai Premium se termine bientôt',
      body: `Plus que ${trialDaysLeft} ${plural(trialDaysLeft, 'jour', 'jours')} d'essai. Garde plantes illimitées, conseils IA et délégation !`,
    }),
    approaching_limit: ({ usageCount, usageMax, feature }) =>
      approachingLimit(usageCount, usageMax, FEATURE[feature]),
    plant_anniversary: ({ plantName, anniversaryMonths, plantAddedAt }) =>
      anniversary(
        plantName,
        together(anniversaryMonths),
        ADDED_ON.format(plantAddedAt)
      ),
  },
  legacy: {
    approaching_limit: ({ usageCount, usageMax, featureName }) =>
      approachingLimit(usageCount, usageMax, featureName),
    gift_subscription: ({ giftDuration }) => gift(`pour ${giftDuration}`),
    plant_anniversary: (params) =>
      anniversary(
        params.plantName,
        'anniversaryMonths' in params
          ? together(params.anniversaryMonths)
          : params.anniversaryDuration,
        params.dateAdded
      ),
  },
  anniversaries: (plantNames) => ({
    title: `🎂 ${plantNames.length} anniversaires de plantes aujourd'hui !`,
    body: `On célèbre ${listNames(plantNames, (n) => `et ${n} de plus`)}. Encore plein d'autres à venir ! 🌿`,
  }),
}
