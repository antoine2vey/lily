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

// English addresses the user as "you" and names plants possessively
// ("your Monstera"). The singular is for exactly 1 only.
const plural = (n: number, singular: string, plural: string): string =>
  n === 1 ? singular : plural

const sender = (senderName: string | undefined): string =>
  Option.getOrElse(Option.fromNullishOr(senderName), () => 'Someone')

const together = (months: number): string => {
  const years = Math.floor(months / MONTHS_PER_YEAR)
  return years > 0
    ? `${years} ${plural(years, 'year', 'years')}`
    : `${months} ${plural(months, 'month', 'months')}`
}

const ADDED_ON = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const anniversary = (
  plantName: string,
  duration: string,
  since: string
): NotificationContent => ({
  title: `🎂 Happy ${duration} together!`,
  body: `You've been caring for your ${plantName} since ${since}. Here's to many more! 🌿`,
})

const FEATURE: Record<UsageField, string> = {
  aiChats: 'AI chats',
  cardScans: 'card scans',
  plantIdentifies: 'plant identifications',
}

const approachingLimit = (
  used: number,
  max: number,
  feature: string
): NotificationContent => ({
  title: "📈 You're close to your limit",
  body: `You've used ${used}/${max} ${feature} this month. Go Premium for unlimited access!`,
})

const GIFT_DURATION: Record<GiftDuration, string> = {
  '7d': 'for 7 days',
  '1m': 'for 1 month',
  '1y': 'for 1 year',
  infinite: 'forever',
}

const gift = (duration: string): NotificationContent => ({
  title: '🎁 A gift for you!',
  body: `You've been gifted Lily Premium ${duration}. Enjoy every feature! 🌿`,
})

const weeklyRecap = (
  tasks: number,
  streak: number,
  healthy: number
): string => {
  const clauses = Array.getSomes([
    recapClause(
      tasks > 0,
      `${tasks} care ${plural(tasks, 'task', 'tasks')} done`
    ),
    recapClause(streak > 0, `a ${streak}-day streak going`),
    recapClause(
      healthy > 0,
      `${healthy} ${plural(healthy, 'plant', 'plants')} thriving`
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
            `Nice week — ${tasks} care ${plural(tasks, 'task', 'tasks')} done. Your plants noticed. 🌿`
        ),
        Match.when(
          { streak: (s) => s > 0 },
          () => `Your ${streak}-day care streak is still going strong. 🌿`
        ),
        Match.orElse(
          () =>
            `${healthy} ${plural(healthy, 'plant', 'plants')} thriving this week. Keep it up! 🌿`
        )
      )
    )
  )
}

export const en: Language = {
  topics: {
    new_follower: ({ senderName }) => ({
      title: '👋 New follower!',
      body: `${sender(senderName)} started following your plant journey`,
    }),
    nudge_to_water: ({ senderName }) => ({
      title: '💧 A friendly nudge',
      body: `${Option.getOrElse(Option.fromNullishOr(senderName), () => 'A friend')} thinks your plants could use a little love!`,
    }),
    delegation_request: ({ senderName }) => ({
      title: '🤝 Plant-sitting request',
      body: `${sender(senderName)} would love your help caring for their plants`,
    }),
    delegation_accepted: ({ senderName }) => ({
      title: '✅ Request accepted!',
      body: `${sender(senderName)} is happy to look after your plants`,
    }),
    delegation_rejected: ({ senderName }) => ({
      title: '😔 Request declined',
      body: `${sender(senderName)} can't plant-sit for you right now`,
    }),
    delegation_canceled: ({ senderName, unanswered }) => ({
      title: '🚫 Plant-sitting canceled',
      body: unanswered
        ? `${sender(senderName)} didn't answer in time, so the plant-sitting request was canceled`
        : `${sender(senderName)} called off the plant-sitting`,
    }),
    delegation_activated: ({ plantCount }) => ({
      title: '🌱 Plant-sitting has begun',
      body: `You're now caring for ${plantCount} ${plural(plantCount, 'plant', 'plants')}. Thanks for helping out!`,
    }),
    delegation_completed: ({ plantCount }) => ({
      title: '🎉 Plant-sitting complete',
      body: `Your care for ${plantCount} ${plural(plantCount, 'plant', 'plants')} has wrapped up. Nicely done!`,
    }),
    canopy_member_joined: ({ senderName, canopyName }) => ({
      title: '🏡 New Canopy member',
      body: `${sender(senderName)} joined ${canopyName}`,
    }),
    canopy_member_removed: ({ canopyName }) => ({
      title: '🏡 Canopy update',
      body: `You're no longer a member of ${canopyName}`,
    }),
    canopy_member_left: ({ senderName, canopyName }) => ({
      title: '🏡 Canopy update',
      body: `${sender(senderName)} left ${canopyName}`,
    }),
    canopy_invitation: ({ senderName, canopyName }) => ({
      title: '🏡 Canopy invitation',
      body: `${sender(senderName)} invited you to join ${canopyName}`,
    }),
    daily_tip: ({ tipTitle, tipBody }) => ({ title: tipTitle, body: tipBody }),
    inactivity_nudge: ({ plantCount }) => ({
      title: '🌿 Your plants miss you!',
      body:
        plantCount === 1
          ? "It's been a while! Your plant would love a little attention."
          : `It's been a while! Your ${plantCount} plants would love a little attention.`,
    }),
    photo_reminder: ({ plantName, daysSincePhoto }) => ({
      title: '📸 Time for a growth update!',
      body: `Your ${plantName} hasn't had a photo in ${daysSincePhoto} ${plural(daysSincePhoto, 'day', 'days')}. Capture how far it's come!`,
    }),
    plant_parent_milestone: ({ daysSinceJoin }) => ({
      title: `🎂 ${daysSinceJoin} days as a plant parent!`,
      body: `You joined Lily ${daysSinceJoin} days ago. Your plants are lucky to have you! 🌿`,
    }),
    gift_subscription: ({ duration }) => gift(GIFT_DURATION[duration]),
    resubscribe_nudge: ({ plantCount }) => ({
      title: '🌱 Some plants need reminders',
      body: `${plantCount} ${plural(plantCount, "plant isn't", "plants aren't")} getting care alerts. Go Premium to cover your whole garden!`,
    }),
    streak_at_risk: ({ streakCount, plantName }) => ({
      title: `🔥 Don't lose your ${streakCount}-day streak!`,
      body: Option.match(Option.fromNullishOr(plantName), {
        onNone: () =>
          'Your plants still need care today. Keep the streak alive!',
        onSome: (name) =>
          `Your ${name} still needs care today. Keep the streak alive!`,
      }),
    }),
    streak_milestone: ({ streakCount }) => ({
      title: `🔥 ${streakCount}-day streak!`,
      body: `You've cared for your plants ${streakCount} days straight. That's real dedication! 🌟`,
    }),
    weekly_recap: ({ tasksCompleted, streakCount, healthyCount }) => ({
      title: '📊 Your weekly plant recap',
      body: weeklyRecap(tasksCompleted, streakCount, healthyCount),
    }),
    trial_ending: ({ trialDaysLeft }) => ({
      title: '⏳ Your Premium trial is ending soon',
      body: `Just ${trialDaysLeft} ${plural(trialDaysLeft, 'day', 'days')} left of your trial. Keep unlimited plants, AI advice, and care delegation!`,
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
    gift_subscription: ({ giftDuration }) => gift(`for ${giftDuration}`),
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
    title: `🎂 ${plantNames.length} plant anniversaries today!`,
    body: `Celebrating ${listNames(plantNames, (n) => `and ${n} more`)}. Here's to many more! 🌿`,
  }),
}
