import {
  buildGroupedPlantAnniversaryContent,
  renderFromParams,
  type SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import {
  buildCareDigestContent,
  buildNotificationContent,
} from '@lily/api/services/notification-scheduler/translations/care'
import {
  buildLiveActivityCareTypeLabel,
  buildLiveActivityHeadline,
  buildLiveActivitySubheadline,
  buildLiveActivityTitle,
} from '@lily/api/services/notification-scheduler/translations/live-activity'
import { CARE_TYPES, type LanguageCode } from '@lily/shared'
import type { DeferredCareType } from '@lily/shared/server'
import { Array, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

const LANGUAGES = ['en', 'fr'] as const satisfies ReadonlyArray<LanguageCode>

// Params as a row stores them. Shapes written by older releases stay here
// unchanged: delivery must keep rendering what is already queued.
const STORED: ReadonlyArray<
  readonly [SimpleNotificationType, string, unknown]
> = [
  ['new_follower', 'named', { senderName: 'Ada' }],
  ['new_follower', 'unnamed', {}],
  ['nudge_to_water', 'named', { senderName: 'Ada' }],
  ['nudge_to_water', 'unnamed', {}],
  ['delegation_request', 'named', { senderName: 'Ada' }],
  ['delegation_accepted', 'named', { senderName: 'Ada' }],
  ['delegation_rejected', 'unnamed', {}],
  ['delegation_canceled', 'called off', { senderName: 'Ada' }],
  [
    'delegation_canceled',
    'unanswered',
    { senderName: 'Ada', unanswered: true },
  ],
  ['delegation_canceled', 'unanswered unnamed', { unanswered: true }],
  ['delegation_activated', 'one', { plantCount: 1 }],
  ['delegation_activated', 'three', { plantCount: 3 }],
  ['delegation_completed', 'zero', { plantCount: 0 }],
  ['canopy_member_joined', 'named', { senderName: 'Ada', canopyName: 'Home' }],
  ['canopy_member_joined', 'unnamed', { canopyName: 'Home' }],
  ['canopy_member_removed', 'removed', { canopyName: 'Home' }],
  ['canopy_member_left', 'named', { senderName: 'Ada', canopyName: 'Home' }],
  ['canopy_invitation', 'named', { senderName: 'Ada', canopyName: 'Home' }],
  [
    'daily_tip',
    'tip',
    { tipTitle: '🌿 Mist ferns', tipBody: 'Ferns love humidity.' },
  ],
  ['daily_tip', 'empty', {}],
  ['inactivity_nudge', 'one', { plantCount: 1 }],
  ['inactivity_nudge', 'four', { plantCount: 4 }],
  ['inactivity_nudge', 'no count', {}],
  ['photo_reminder', 'one day', { plantName: 'Fern', daysSincePhoto: 1 }],
  ['photo_reminder', '45 days', { plantName: 'Fern', daysSincePhoto: 45 }],
  ['photo_reminder', 'empty', {}],
  ['plant_parent_milestone', '100', { daysSinceJoin: 100 }],
  ['plant_parent_milestone', 'empty', {}],
  ['gift_subscription', 'en label', { giftDuration: '1 Month' }],
  ['gift_subscription', 'fr label', { giftDuration: '1 Mois' }],
  ['gift_subscription', 'empty', {}],
  ['resubscribe_nudge', 'one', { plantCount: 1 }],
  ['resubscribe_nudge', 'three', { plantCount: 3 }],
  ['streak_at_risk', 'with plant', { streakCount: 12, plantName: 'Monstera' }],
  ['streak_at_risk', 'no plant', { streakCount: 5 }],
  ['streak_milestone', '14', { streakCount: 14 }],
  [
    'weekly_recap',
    'all three',
    { tasksCompleted: 5, streakCount: 3, healthyCount: 2 },
  ],
  [
    'weekly_recap',
    'tasks and healthy',
    { tasksCompleted: 1, streakCount: 0, healthyCount: 1 },
  ],
  [
    'weekly_recap',
    'tasks only',
    { tasksCompleted: 5, streakCount: 0, healthyCount: 0 },
  ],
  [
    'weekly_recap',
    'streak only',
    { tasksCompleted: 0, streakCount: 3, healthyCount: 0 },
  ],
  [
    'weekly_recap',
    'healthy only',
    { tasksCompleted: 0, streakCount: 0, healthyCount: 2 },
  ],
  ['trial_ending', 'one day', { trialDaysLeft: 1 }],
  ['trial_ending', 'three days', { trialDaysLeft: 3 }],
  ['trial_ending', 'wrong type', { trialDaysLeft: 'three' }],
  [
    'approaching_limit',
    'en feature',
    { usageCount: 4, usageMax: 5, featureName: 'AI chats' },
  ],
  [
    'approaching_limit',
    'fr feature',
    { usageCount: 8, usageMax: 10, featureName: 'discussions IA' },
  ],
  [
    'plant_anniversary',
    'months as number',
    { plantName: 'Fern', anniversaryMonths: 1, dateAdded: 'Apr 3, 2025' },
  ],
  [
    'plant_anniversary',
    '14 months as number',
    { plantName: 'Fern', anniversaryMonths: 14, dateAdded: '3 avr. 2025' },
  ],
  [
    'plant_anniversary',
    'duration as text',
    { plantName: 'Fern', anniversaryDuration: '1 year', dateAdded: 'Apr 3' },
  ],
]

const rendered = (
  type: SimpleNotificationType,
  params: unknown,
  plantName: Option.Option<string>,
  language: LanguageCode
): string =>
  Result.match(renderFromParams(type, params, plantName, language), {
    onFailure: () => 'does not render',
    onSuccess: ({ title, body }) => `${title} | ${body}`,
  })

describe('notification content pin', () => {
  it('renders every stored shape of every topic in every language', () => {
    expect(
      Array.flatMap(STORED, ([type, label, params]) =>
        Array.map(
          LANGUAGES,
          (language) =>
            `${type} (${label}) ${language}: ${rendered(type, params, Option.none(), language)}`
        )
      )
    ).toMatchInlineSnapshot(`
      [
        "new_follower (named) en: 👋 New follower! | Ada started following your plant journey",
        "new_follower (named) fr: 👋 Nouvel abonné ! | Ada suit désormais ton jardin",
        "new_follower (unnamed) en: 👋 New follower! | Someone started following your plant journey",
        "new_follower (unnamed) fr: 👋 Nouvel abonné ! | Quelqu'un suit désormais ton jardin",
        "nudge_to_water (named) en: 💧 A friendly nudge | Ada thinks your plants could use a little love!",
        "nudge_to_water (named) fr: 💧 Le petit rappel d'un ami | Ada pense que tes plantes mériteraient un peu d'attention !",
        "nudge_to_water (unnamed) en: 💧 A friendly nudge | A friend thinks your plants could use a little love!",
        "nudge_to_water (unnamed) fr: 💧 Le petit rappel d'un ami | Un ami pense que tes plantes mériteraient un peu d'attention !",
        "delegation_request (named) en: 🤝 Plant-sitting request | Ada would love your help caring for their plants",
        "delegation_request (named) fr: 🤝 Demande de garde | Ada aimerait que tu gardes ses plantes",
        "delegation_accepted (named) en: ✅ Request accepted! | Ada is happy to look after your plants",
        "delegation_accepted (named) fr: ✅ Demande acceptée ! | Ada va s'occuper de tes plantes avec plaisir",
        "delegation_rejected (unnamed) en: 😔 Request declined | Someone can't plant-sit for you right now",
        "delegation_rejected (unnamed) fr: 😔 Demande refusée | Quelqu'un ne peut pas garder tes plantes pour le moment",
        "delegation_canceled (called off) en: 🚫 Plant-sitting canceled | Ada called off the plant-sitting",
        "delegation_canceled (called off) fr: 🚫 Garde annulée | Ada a annulé la garde des plantes",
        "delegation_canceled (unanswered) en: 🚫 Plant-sitting canceled | Ada didn't answer in time, so the plant-sitting request was canceled",
        "delegation_canceled (unanswered) fr: 🚫 Garde annulée | Ada n'a pas répondu à temps, la demande de garde a été annulée",
        "delegation_canceled (unanswered unnamed) en: 🚫 Plant-sitting canceled | Someone didn't answer in time, so the plant-sitting request was canceled",
        "delegation_canceled (unanswered unnamed) fr: 🚫 Garde annulée | Quelqu'un n'a pas répondu à temps, la demande de garde a été annulée",
        "delegation_activated (one) en: 🌱 Plant-sitting has begun | You're now caring for 1 plant. Thanks for helping out!",
        "delegation_activated (one) fr: 🌱 La garde commence | Tu prends soin de 1 plante. Merci de ton aide !",
        "delegation_activated (three) en: 🌱 Plant-sitting has begun | You're now caring for 3 plants. Thanks for helping out!",
        "delegation_activated (three) fr: 🌱 La garde commence | Tu prends soin de 3 plantes. Merci de ton aide !",
        "delegation_completed (zero) en: 🎉 Plant-sitting complete | Your care for 0 plants has wrapped up. Nicely done!",
        "delegation_completed (zero) fr: 🎉 Garde terminée | Ta garde de 0 plante est terminée. Bravo !",
        "canopy_member_joined (named) en: 🏡 New Canopy member | Ada joined Home",
        "canopy_member_joined (named) fr: 🏡 Nouveau membre dans la Canopy | Ada a rejoint Home",
        "canopy_member_joined (unnamed) en: 🏡 New Canopy member | Someone joined Home",
        "canopy_member_joined (unnamed) fr: 🏡 Nouveau membre dans la Canopy | Quelqu'un a rejoint Home",
        "canopy_member_removed (removed) en: 🏡 Canopy update | You're no longer a member of Home",
        "canopy_member_removed (removed) fr: 🏡 Du nouveau dans ta Canopy | Tu ne fais plus partie de Home",
        "canopy_member_left (named) en: 🏡 Canopy update | Ada left Home",
        "canopy_member_left (named) fr: 🏡 Du nouveau dans ta Canopy | Ada a quitté Home",
        "canopy_invitation (named) en: 🏡 Canopy invitation | Ada invited you to join Home",
        "canopy_invitation (named) fr: 🏡 Invitation dans une Canopy | Ada t'invite à rejoindre Home",
        "daily_tip (tip) en: 🌿 Mist ferns | Ferns love humidity.",
        "daily_tip (tip) fr: 🌿 Mist ferns | Ferns love humidity.",
        "daily_tip (empty) en: does not render",
        "daily_tip (empty) fr: does not render",
        "inactivity_nudge (one) en: 🌿 Your plants miss you! | It's been a while! Your plant would love a little attention.",
        "inactivity_nudge (one) fr: 🌿 Tes plantes t'attendent ! | Ça fait un moment ! Ta plante adorerait un peu d'attention.",
        "inactivity_nudge (four) en: 🌿 Your plants miss you! | It's been a while! Your 4 plants would love a little attention.",
        "inactivity_nudge (four) fr: 🌿 Tes plantes t'attendent ! | Ça fait un moment ! Tes 4 plantes adoreraient un peu d'attention.",
        "inactivity_nudge (no count) en: does not render",
        "inactivity_nudge (no count) fr: does not render",
        "photo_reminder (one day) en: 📸 Time for a growth update! | Your Fern hasn't had a photo in 1 day. Capture how far it's come!",
        "photo_reminder (one day) fr: 📸 Photo souvenir ? | Aucune photo de ta Fern depuis 1 jour. Immortalise ses progrès !",
        "photo_reminder (45 days) en: 📸 Time for a growth update! | Your Fern hasn't had a photo in 45 days. Capture how far it's come!",
        "photo_reminder (45 days) fr: 📸 Photo souvenir ? | Aucune photo de ta Fern depuis 45 jours. Immortalise ses progrès !",
        "photo_reminder (empty) en: does not render",
        "photo_reminder (empty) fr: does not render",
        "plant_parent_milestone (100) en: 🎂 100 days as a plant parent! | You joined Lily 100 days ago. Your plants are lucky to have you! 🌿",
        "plant_parent_milestone (100) fr: 🎂 100 jours en tant que parent de plantes ! | Tu as rejoint Lily il y a 100 jours. Tes plantes ont bien de la chance ! 🌿",
        "plant_parent_milestone (empty) en: does not render",
        "plant_parent_milestone (empty) fr: does not render",
        "gift_subscription (en label) en: 🎁 A gift for you! | You've been gifted Lily Premium for 1 Month. Enjoy every feature! 🌿",
        "gift_subscription (en label) fr: 🎁 Un cadeau pour toi ! | On t'a offert Lily Premium pour 1 Month. Profites-en pleinement ! 🌿",
        "gift_subscription (fr label) en: 🎁 A gift for you! | You've been gifted Lily Premium for 1 Mois. Enjoy every feature! 🌿",
        "gift_subscription (fr label) fr: 🎁 Un cadeau pour toi ! | On t'a offert Lily Premium pour 1 Mois. Profites-en pleinement ! 🌿",
        "gift_subscription (empty) en: does not render",
        "gift_subscription (empty) fr: does not render",
        "resubscribe_nudge (one) en: 🌱 Some plants need reminders | 1 plant isn't getting care alerts. Go Premium to cover your whole garden!",
        "resubscribe_nudge (one) fr: 🌱 Certaines plantes manquent de rappels | 1 plante ne reçoit pas de rappels. Passe à Premium pour couvrir tout ton jardin !",
        "resubscribe_nudge (three) en: 🌱 Some plants need reminders | 3 plants aren't getting care alerts. Go Premium to cover your whole garden!",
        "resubscribe_nudge (three) fr: 🌱 Certaines plantes manquent de rappels | 3 plantes ne reçoivent pas de rappels. Passe à Premium pour couvrir tout ton jardin !",
        "streak_at_risk (with plant) en: 🔥 Don't lose your 12-day streak! | Your Monstera still needs care today. Keep the streak alive!",
        "streak_at_risk (with plant) fr: 🔥 Ne perds pas ta série de 12 jours ! | Ta Monstera a encore besoin de soins aujourd'hui. Garde le rythme !",
        "streak_at_risk (no plant) en: 🔥 Don't lose your 5-day streak! | Your plants still need care today. Keep the streak alive!",
        "streak_at_risk (no plant) fr: 🔥 Ne perds pas ta série de 5 jours ! | Tes plantes ont encore besoin de soins aujourd'hui. Garde le rythme !",
        "streak_milestone (14) en: 🔥 14-day streak! | You've cared for your plants 14 days straight. That's real dedication! 🌟",
        "streak_milestone (14) fr: 🔥 Série de 14 jours ! | Tu prends soin de tes plantes depuis 14 jours d'affilée. Quelle dévotion ! 🌟",
        "weekly_recap (all three) en: 📊 Your weekly plant recap | What a week! 5 care tasks done, a 3-day streak going, and 2 plants thriving. 🌿",
        "weekly_recap (all three) fr: 📊 Ton récap hebdomadaire | Quelle semaine ! 3 jours de série, 5 soins et 2 plantes en pleine forme. 🌿",
        "weekly_recap (tasks and healthy) en: 📊 Your weekly plant recap | What a week! 1 care task done and 1 plant thriving. 🌿",
        "weekly_recap (tasks and healthy) fr: 📊 Ton récap hebdomadaire | Quelle semaine ! 1 soin et 1 plante en pleine forme. 🌿",
        "weekly_recap (tasks only) en: 📊 Your weekly plant recap | Nice week — 5 care tasks done. Your plants noticed. 🌿",
        "weekly_recap (tasks only) fr: 📊 Ton récap hebdomadaire | Belle semaine — 5 soins effectués. Tes plantes te remercient. 🌿",
        "weekly_recap (streak only) en: 📊 Your weekly plant recap | Your 3-day care streak is still going strong. 🌿",
        "weekly_recap (streak only) fr: 📊 Ton récap hebdomadaire | Ta série de soins de 3 jours continue. Bravo ! 🌿",
        "weekly_recap (healthy only) en: 📊 Your weekly plant recap | 2 plants thriving this week. Keep it up! 🌿",
        "weekly_recap (healthy only) fr: 📊 Ton récap hebdomadaire | 2 plantes en pleine forme cette semaine. Continue comme ça ! 🌿",
        "trial_ending (one day) en: ⏳ Your Premium trial is ending soon | Just 1 day left of your trial. Keep unlimited plants, AI advice, and care delegation!",
        "trial_ending (one day) fr: ⏳ Ton essai Premium se termine bientôt | Plus que 1 jour d'essai. Garde plantes illimitées, conseils IA et délégation !",
        "trial_ending (three days) en: ⏳ Your Premium trial is ending soon | Just 3 days left of your trial. Keep unlimited plants, AI advice, and care delegation!",
        "trial_ending (three days) fr: ⏳ Ton essai Premium se termine bientôt | Plus que 3 jours d'essai. Garde plantes illimitées, conseils IA et délégation !",
        "trial_ending (wrong type) en: does not render",
        "trial_ending (wrong type) fr: does not render",
        "approaching_limit (en feature) en: 📈 You're close to your limit | You've used 4/5 AI chats this month. Go Premium for unlimited access!",
        "approaching_limit (en feature) fr: 📈 Tu approches de ta limite | Tu as utilisé 4/5 AI chats ce mois-ci. Passe à Premium pour un accès illimité !",
        "approaching_limit (fr feature) en: 📈 You're close to your limit | You've used 8/10 discussions IA this month. Go Premium for unlimited access!",
        "approaching_limit (fr feature) fr: 📈 Tu approches de ta limite | Tu as utilisé 8/10 discussions IA ce mois-ci. Passe à Premium pour un accès illimité !",
        "plant_anniversary (months as number) en: 🎂 Happy 1 month together! | You've been caring for your Fern since Apr 3, 2025. Here's to many more! 🌿",
        "plant_anniversary (months as number) fr: 🎂 Joyeux 1 mois ensemble ! | Tu prends soin de ta Fern depuis le Apr 3, 2025. Encore plein d'autres à venir ! 🌿",
        "plant_anniversary (14 months as number) en: 🎂 Happy 1 year together! | You've been caring for your Fern since 3 avr. 2025. Here's to many more! 🌿",
        "plant_anniversary (14 months as number) fr: 🎂 Joyeux 1 an ensemble ! | Tu prends soin de ta Fern depuis le 3 avr. 2025. Encore plein d'autres à venir ! 🌿",
        "plant_anniversary (duration as text) en: 🎂 Happy 1 year together! | You've been caring for your Fern since Apr 3. Here's to many more! 🌿",
        "plant_anniversary (duration as text) fr: 🎂 Joyeux 1 year ensemble ! | Tu prends soin de ta Fern depuis le Apr 3. Encore plein d'autres à venir ! 🌿",
      ]
    `)
  })

  it('names the plant by its current name', () => {
    expect(
      Array.map(LANGUAGES, (language) =>
        rendered(
          'photo_reminder',
          { plantName: 'Fern', daysSincePhoto: 30 },
          Option.some('Ferdinand'),
          language
        )
      )
    ).toMatchInlineSnapshot(`
      [
        "📸 Time for a growth update! | Your Ferdinand hasn't had a photo in 30 days. Capture how far it's come!",
        "📸 Photo souvenir ? | Aucune photo de ta Ferdinand depuis 30 jours. Immortalise ses progrès !",
      ]
    `)
  })

  const CARE_TOPICS: ReadonlyArray<DeferredCareType> = [
    'watering_reminder',
    'fertilization_reminder',
    'misting_reminder',
    'repotting_reminder',
    'overdue_reminder',
  ]
  const SEVEN = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  it('renders care reminders, digests and grouped anniversaries', () => {
    expect(
      Array.flatMap(LANGUAGES, (language) => [
        ...Array.flatMap(CARE_TOPICS, (type) =>
          Array.map([['Fern'], ['Fern', 'Ivy'], SEVEN], (names) => {
            const { title, body } = buildNotificationContent(
              type,
              names,
              language
            )
            return `${type} ${names.length} ${language}: ${title} | ${body}`
          })
        ),
        ...Array.map(
          [
            Array.make({
              plantName: 'Fern',
              careTypes: Array.make(
                'misting_reminder' as const,
                'watering_reminder' as const,
                'repotting_reminder' as const,
                'fertilization_reminder' as const
              ),
            }),
            Array.make(
              {
                plantName: 'Fern',
                careTypes: Array.make('overdue_reminder' as const),
              },
              {
                plantName: 'Ivy',
                careTypes: Array.make('misting_reminder' as const),
              }
            ),
          ],
          (items) => {
            const { title, body } = buildCareDigestContent(items, language)
            return `digest ${items.length} ${language}: ${title} | ${body}`
          }
        ),
        ...Array.map([['Fern', 'Ivy'], SEVEN], (names) => {
          const { title, body } = buildGroupedPlantAnniversaryContent(
            names,
            language
          )
          return `anniversaries ${names.length} ${language}: ${title} | ${body}`
        }),
      ])
    ).toMatchInlineSnapshot(`
      [
        "watering_reminder 1 en: 💧 Your Fern is thirsty | Time to give your Fern a drink today.",
        "watering_reminder 2 en: 💧 2 plants are thirsty | Fern, Ivy",
        "watering_reminder 7 en: 💧 7 plants are thirsty | A, B, C, D, E and 2 more",
        "fertilization_reminder 1 en: 🌿 Feed your Fern today | Your Fern is ready for a little fertilizer.",
        "fertilization_reminder 2 en: 🌿 2 plants are hungry | Fern, Ivy",
        "fertilization_reminder 7 en: 🌿 7 plants are hungry | A, B, C, D, E and 2 more",
        "misting_reminder 1 en: 🌫️ Your Fern loves a misting | Give your Fern a refreshing mist today.",
        "misting_reminder 2 en: 🌫️ 2 plants want a misting | Fern, Ivy",
        "misting_reminder 7 en: 🌫️ 7 plants want a misting | A, B, C, D, E and 2 more",
        "repotting_reminder 1 en: 🪴 Your Fern needs more room | Your Fern is ready for a bigger pot.",
        "repotting_reminder 2 en: 🪴 2 plants are ready to repot | Fern, Ivy",
        "repotting_reminder 7 en: 🪴 7 plants are ready to repot | A, B, C, D, E and 2 more",
        "overdue_reminder 1 en: ⚠️ Your Fern needs you | Your Fern is overdue for care — don't forget!",
        "overdue_reminder 2 en: ⚠️ 2 plants need your attention | Fern, Ivy",
        "overdue_reminder 7 en: ⚠️ 7 plants need your attention | A, B, C, D, E and 2 more",
        "digest 1 en: 🌱 Your Fern needs care today | Watering, fertilizing, misting, repotting are due today.",
        "digest 2 en: 🌱 2 plants need care today | Fern (overdue), Ivy (misting)",
        "anniversaries 2 en: 🎂 2 plant anniversaries today! | Celebrating Fern, Ivy. Here's to many more! 🌿",
        "anniversaries 7 en: 🎂 7 plant anniversaries today! | Celebrating A, B, C, D, E and 2 more. Here's to many more! 🌿",
        "watering_reminder 1 fr: 💧 Ta Fern a soif | Offre un peu d'eau à ta Fern aujourd'hui.",
        "watering_reminder 2 fr: 💧 2 plantes ont soif | Fern, Ivy",
        "watering_reminder 7 fr: 💧 7 plantes ont soif | A, B, C, D, E et 2 de plus",
        "fertilization_reminder 1 fr: 🌿 Nourris ta Fern aujourd'hui | Ta Fern a besoin d'un peu d'engrais.",
        "fertilization_reminder 2 fr: 🌿 2 plantes ont faim | Fern, Ivy",
        "fertilization_reminder 7 fr: 🌿 7 plantes ont faim | A, B, C, D, E et 2 de plus",
        "misting_reminder 1 fr: 🌫️ Ta Fern adore la brume | Offre une brumisation à ta Fern aujourd'hui.",
        "misting_reminder 2 fr: 🌫️ 2 plantes réclament une brumisation | Fern, Ivy",
        "misting_reminder 7 fr: 🌫️ 7 plantes réclament une brumisation | A, B, C, D, E et 2 de plus",
        "repotting_reminder 1 fr: 🪴 Ta Fern a besoin de place | Ta Fern a besoin d'un pot plus grand.",
        "repotting_reminder 2 fr: 🪴 2 plantes sont à rempoter | Fern, Ivy",
        "repotting_reminder 7 fr: 🪴 7 plantes sont à rempoter | A, B, C, D, E et 2 de plus",
        "overdue_reminder 1 fr: ⚠️ Ta Fern te réclame | Ta Fern est en retard de soins — n'oublie pas !",
        "overdue_reminder 2 fr: ⚠️ 2 plantes réclament ton attention | Fern, Ivy",
        "overdue_reminder 7 fr: ⚠️ 7 plantes réclament ton attention | A, B, C, D, E et 2 de plus",
        "digest 1 fr: 🌱 Ta Fern a besoin de soins | Arrosage, fertilisation, brumisation, rempotage sont prévus aujourd'hui.",
        "digest 2 fr: 🌱 2 plantes ont besoin de soins aujourd'hui | Fern (en retard), Ivy (brumisation)",
        "anniversaries 2 fr: 🎂 2 anniversaires de plantes aujourd'hui ! | On célèbre Fern, Ivy. Encore plein d'autres à venir ! 🌿",
        "anniversaries 7 fr: 🎂 7 anniversaires de plantes aujourd'hui ! | On célèbre A, B, C, D, E et 2 de plus. Encore plein d'autres à venir ! 🌿",
      ]
    `)
  })

  it('renders the Live Activity labels', () => {
    expect(
      Array.map(LANGUAGES, (language) => ({
        headlines: Array.map([1, 3], (n) =>
          buildLiveActivityHeadline(n, language)
        ),
        titles: Array.map([0, 1, 5, 6, -1], (seed) =>
          buildLiveActivityTitle(language, seed)
        ),
        careTypes: Array.map(CARE_TYPES, (careType) =>
          buildLiveActivityCareTypeLabel(careType, language)
        ),
        subheadline: buildLiveActivitySubheadline(
          Array.map(CARE_TYPES, (careType, count) => ({
            careType,
            count: count + 1,
          })),
          language
        ),
        empty: buildLiveActivitySubheadline([], language),
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "careTypes": [
            "Water",
            "Fertilize",
            "Mist",
            "Repot",
          ],
          "empty": undefined,
          "headlines": [
            "1 plant needs care today",
            "3 plants need care today",
          ],
          "subheadline": "1 to water · 2 to fertilize · 3 to mist · 4 to repot",
          "titles": [
            "Quick care today",
            "A little plant love",
            "Your plants need you",
            "Quick care today",
            "A little plant love",
          ],
        },
        {
          "careTypes": [
            "Arroser",
            "Fertiliser",
            "Brumiser",
            "Rempoter",
          ],
          "empty": undefined,
          "headlines": [
            "1 plante a besoin de soins aujourd'hui",
            "3 plantes ont besoin de soins aujourd'hui",
          ],
          "subheadline": "1 à arroser · 2 à fertiliser · 3 à brumiser · 4 à rempoter",
          "titles": [
            "Petit soin du jour",
            "Un peu d'amour vert",
            "Tes plantes t'attendent",
            "Petit soin du jour",
            "Un peu d'amour vert",
          ],
        },
      ]
    `)
  })
})
