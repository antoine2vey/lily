import {
  buildGroupedPlantAnniversaryContent,
  buildSimpleContent,
  type ParamsOf,
  renderFromParams,
  type SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import {
  buildCareDigestContent,
  buildNotificationContent,
  type CareDigestItem,
  pickDominantCareTopic,
} from '@lily/api/services/notification-scheduler/translations/care'
import type { LanguageCode } from '@lily/shared'
import type { GiftDuration } from '@lily/shared/admin'
import { failureOf } from '@lily/shared/testing'
import { Array, Option, Record, Result, Struct } from 'effect'
import { describe, expect, it } from 'vitest'

describe('buildSimpleContent — new notification translations', () => {
  describe('streak_at_risk', () => {
    it('en: includes streak count and plant name', () => {
      const { title, body } = buildSimpleContent(
        'streak_at_risk',
        { streakCount: 12, plantName: 'Monstera' },
        'en'
      )
      expect(title).toContain('12')
      expect(body).toContain('Monstera')
    })

    it('en: works without plant name', () => {
      const { title, body } = buildSimpleContent(
        'streak_at_risk',
        { streakCount: 5 },
        'en'
      )
      expect(title).toContain('5')
      expect(body).toBeDefined()
    })

    it('fr: includes streak count and plant name', () => {
      const { title, body } = buildSimpleContent(
        'streak_at_risk',
        { streakCount: 12, plantName: 'Monstera' },
        'fr'
      )
      expect(title).toContain('12')
      expect(title).toContain('série')
      expect(body).toContain('Monstera')
    })
  })

  describe('streak_milestone', () => {
    it('en: includes streak count', () => {
      const { title, body } = buildSimpleContent(
        'streak_milestone',
        { streakCount: 30 },
        'en'
      )
      expect(title).toContain('30')
      expect(body).toContain('30')
      expect(body).toContain('dedication')
    })

    it('fr: includes streak count in French', () => {
      const { title, body } = buildSimpleContent(
        'streak_milestone',
        { streakCount: 30 },
        'fr'
      )
      expect(title).toContain('30')
      expect(body).toContain('30')
      expect(body).toContain('dévotion')
    })
  })

  describe('weekly_recap', () => {
    it('en: includes all stats', () => {
      const { title, body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 5, healthyCount: 3 },
        'en'
      )
      expect(title).toContain('weekly')
      expect(body).toContain('8')
      expect(body).toContain('5')
      expect(body).toContain('3')
    })

    it('fr: includes all stats in French', () => {
      const { title, body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 5, healthyCount: 3 },
        'fr'
      )
      expect(title).toContain('récap')
      expect(body).toContain('8')
      expect(body).toContain('5')
      expect(body).toContain('3')
    })

    it('en: drops the streak clause when streak is 0', () => {
      const { body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 0, healthyCount: 3 },
        'en'
      )
      expect(body).not.toContain('0-day')
      expect(body).toContain('8 care tasks done')
      expect(body).toContain('3 plants thriving')
    })

    it('en: drops the plant clause when no plants are healthy', () => {
      const { body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 5, healthyCount: 0 },
        'en'
      )
      expect(body).not.toContain('0 plants')
      expect(body).toContain('8 care tasks done')
      expect(body).toContain('5-day streak')
    })

    it('en: warm single-stat line when only tasks are non-zero', () => {
      const { body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 0, healthyCount: 0 },
        'en'
      )
      expect(body).not.toContain('What a week!')
      expect(body).not.toContain('0')
      expect(body).toContain('8 care tasks done')
    })

    it('en: warm single-stat line when only a streak is non-zero', () => {
      const { body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 0, streakCount: 5, healthyCount: 0 },
        'en'
      )
      expect(body).toContain('5-day care streak')
      expect(body).not.toContain('0')
    })

    it('fr: drops zero clauses and never reports a 0', () => {
      const { body } = buildSimpleContent(
        'weekly_recap',
        { tasksCompleted: 8, streakCount: 0, healthyCount: 3 },
        'fr'
      )
      expect(body).not.toContain('0')
      expect(body).toContain('8')
      expect(body).toContain('3')
    })
  })

  describe('trial_ending', () => {
    it('en: singular day', () => {
      const { title, body } = buildSimpleContent(
        'trial_ending',
        { trialDaysLeft: 1 },
        'en'
      )
      expect(title).toContain('Premium')
      expect(body).toContain('1 day')
      expect(body).not.toContain('1 days')
    })

    it('en: plural days', () => {
      const { body } = buildSimpleContent(
        'trial_ending',
        { trialDaysLeft: 3 },
        'en'
      )
      expect(body).toContain('3 days')
    })

    it('fr: singular jour', () => {
      const { body } = buildSimpleContent(
        'trial_ending',
        { trialDaysLeft: 1 },
        'fr'
      )
      expect(body).toContain('1 jour')
      expect(body).not.toContain('1 jours')
    })

    it('fr: plural jours', () => {
      const { body } = buildSimpleContent(
        'trial_ending',
        { trialDaysLeft: 3 },
        'fr'
      )
      expect(body).toContain('3 jours')
    })
  })

  describe('approaching_limit', () => {
    it.each([
      { feature: 'aiChats', en: 'AI chats', fr: 'discussions IA' },
      { feature: 'cardScans', en: 'card scans', fr: 'scans de cartes' },
      {
        feature: 'plantIdentifies',
        en: 'plant identifications',
        fr: 'identifications de plantes',
      },
    ] as const)(
      'names $feature in the language of the push',
      ({ feature, en, fr }) => {
        const body = (language: LanguageCode) =>
          buildSimpleContent(
            'approaching_limit',
            { usageCount: 8, usageMax: 10, feature },
            language
          ).body
        expect(body('en')).toBe(
          `You've used 8/10 ${en} this month. Go Premium for unlimited access!`
        )
        expect(body('fr')).toBe(
          `Tu as utilisé 8/10 ${fr} ce mois-ci. Passe à Premium pour un accès illimité !`
        )
      }
    )
  })

  describe('gift_subscription', () => {
    const body = (duration: GiftDuration, language: LanguageCode) =>
      buildSimpleContent('gift_subscription', { duration }, language).body

    it('names the gifted duration in the language of the push', () => {
      expect(body('1m', 'en')).toBe(
        "You've been gifted Lily Premium for 1 month. Enjoy every feature! 🌿"
      )
      expect(body('1m', 'fr')).toBe(
        "On t'a offert Lily Premium pour 1 mois. Profites-en pleinement ! 🌿"
      )
    })

    it('says a lifetime gift lasts forever', () => {
      expect(body('infinite', 'en')).toBe(
        "You've been gifted Lily Premium forever. Enjoy every feature! 🌿"
      )
      expect(body('infinite', 'fr')).toBe(
        "On t'a offert Lily Premium pour toujours. Profites-en pleinement ! 🌿"
      )
    })
  })

  describe('plant_anniversary', () => {
    // Noon UTC is Oct 3 in every zone the tests run in.
    const ADDED_AT = new Date('2025-10-03T12:00:00Z')

    it('en: includes plant name, duration, and date', () => {
      const { title, body } = buildSimpleContent(
        'plant_anniversary',
        { plantName: 'Ficus', anniversaryMonths: 6, plantAddedAt: ADDED_AT },
        'en'
      )
      expect(title).toBe('🎂 Happy 6 months together!')
      expect(body).toBe(
        "You've been caring for your Ficus since Oct 3, 2025. Here's to many more! 🌿"
      )
    })

    it('fr: includes plant name, duration, and date in French', () => {
      const { title, body } = buildSimpleContent(
        'plant_anniversary',
        { plantName: 'Ficus', anniversaryMonths: 6, plantAddedAt: ADDED_AT },
        'fr'
      )
      expect(title).toBe('🎂 Joyeux 6 mois ensemble !')
      expect(body).toBe(
        "Tu prends soin de ta Ficus depuis le 3 oct. 2025. Encore plein d'autres à venir ! 🌿"
      )
    })

    it.each([
      { months: 1, en: '1 month', fr: '1 mois' },
      { months: 3, en: '3 months', fr: '3 mois' },
      { months: 12, en: '1 year', fr: '1 an' },
      { months: 24, en: '2 years', fr: '2 ans' },
    ])('writes $months months as "$en" and "$fr"', ({ months, en, fr }) => {
      const title = (language: LanguageCode) =>
        buildSimpleContent(
          'plant_anniversary',
          {
            plantName: 'Ficus',
            anniversaryMonths: months,
            plantAddedAt: ADDED_AT,
          },
          language
        ).title
      expect(title('en')).toBe(`🎂 Happy ${en} together!`)
      expect(title('fr')).toBe(`🎂 Joyeux ${fr} ensemble !`)
    })
  })
})

describe('buildGroupedPlantAnniversaryContent', () => {
  it('en: includes plant count and every name when short', () => {
    const { title, body } = buildGroupedPlantAnniversaryContent(
      ['Monstera', 'Pothos', 'Fern'],
      'en'
    )
    expect(title).toBe('🎂 3 plant anniversaries today!')
    expect(body).toContain('Monstera')
    expect(body).toContain('Pothos')
    expect(body).toContain('Fern')
  })

  it('en: truncates after 5 plant names with "and N more"', () => {
    const { title, body } = buildGroupedPlantAnniversaryContent(
      ['Monstera', 'Pothos', 'Fern', 'Cactus', 'Aloe', 'Ivy', 'Palm'],
      'en'
    )
    expect(title).toBe('🎂 7 plant anniversaries today!')
    expect(body).toContain('and 2 more')
  })

  it('fr: uses French grouped title', () => {
    const { title, body } = buildGroupedPlantAnniversaryContent(
      ['Monstera', 'Pothos'],
      'fr'
    )
    expect(title).toBe("🎂 2 anniversaires de plantes aujourd'hui !")
    expect(body).toContain('Monstera')
    expect(body).toContain('Pothos')
  })

  it('fr: truncates with French "et N de plus" suffix', () => {
    const { title, body } = buildGroupedPlantAnniversaryContent(
      ['Monstera', 'Pothos', 'Fern', 'Cactus', 'Aloe', 'Ivy'],
      'fr'
    )
    expect(title).toBe("🎂 6 anniversaires de plantes aujourd'hui !")
    expect(body).toContain('et 1 de plus')
  })
})

describe('buildCareDigestContent', () => {
  const item = (
    plantName: string,
    ...careTypes: Array.NonEmptyArray<CareDigestItem['careTypes'][number]>
  ): CareDigestItem => ({ plantName, careTypes })

  it('delegates to the per-type copy when only one care type is present', () => {
    const items = Array.make(
      item('Monstera', 'watering_reminder'),
      item('Pothos', 'watering_reminder')
    )
    expect(buildCareDigestContent(items, 'en')).toEqual(
      buildNotificationContent(
        'watering_reminder',
        ['Monstera', 'Pothos'],
        'en'
      )
    )
  })

  it('en: single plant with several types lists the labels as a sentence', () => {
    const result = buildCareDigestContent(
      Array.make(item('Monstera', 'misting_reminder', 'watering_reminder')),
      'en'
    )
    expect(result.title).toBe('🌱 Your Monstera needs care today')
    // Priority order, not input order.
    expect(result.body).toBe('Watering and misting are due today.')
  })

  it('en: three labels take an Oxford comma', () => {
    const result = buildCareDigestContent(
      Array.make(
        item(
          'Monstera',
          'repotting_reminder',
          'watering_reminder',
          'fertilization_reminder'
        )
      ),
      'en'
    )
    expect(result.body).toBe(
      'Watering, fertilizing, and repotting are due today.'
    )
  })

  it('fr: single plant with several types', () => {
    const result = buildCareDigestContent(
      Array.make(item('Monstera', 'misting_reminder', 'watering_reminder')),
      'fr'
    )
    expect(result.title).toBe('🌱 Ta Monstera a besoin de soins')
    expect(result.body).toBe("Arrosage et brumisation sont prévus aujourd'hui.")
  })

  it('en: several plants with mixed types, truncated after five', () => {
    const items = Array.make(
      item('A', 'watering_reminder', 'misting_reminder'),
      item('B', 'fertilization_reminder'),
      item('C', 'fertilization_reminder'),
      item('D', 'fertilization_reminder'),
      item('E', 'fertilization_reminder'),
      item('F', 'fertilization_reminder'),
      item('G', 'fertilization_reminder')
    )
    const result = buildCareDigestContent(items, 'en')
    expect(result.title).toBe('🌱 7 plants need care today')
    expect(result.body).toBe(
      'A (watering, misting), B (fertilizing), C (fertilizing), D (fertilizing), E (fertilizing) and 2 more'
    )
  })

  it('fr: several plants with mixed types, truncated after five', () => {
    const items = Array.make(
      item('A', 'overdue_reminder', 'watering_reminder'),
      item('B', 'misting_reminder'),
      item('C', 'misting_reminder'),
      item('D', 'misting_reminder'),
      item('E', 'misting_reminder'),
      item('F', 'misting_reminder')
    )
    const result = buildCareDigestContent(items, 'fr')
    expect(result.title).toBe("🌱 6 plantes ont besoin de soins aujourd'hui")
    expect(result.body).toBe(
      'A (en retard, arrosage), B (brumisation), C (brumisation), D (brumisation), E (brumisation) et 1 de plus'
    )
  })

  it('dedupes repeated types within a plant', () => {
    const result = buildCareDigestContent(
      Array.make(
        item(
          'Monstera',
          'watering_reminder',
          'watering_reminder',
          'misting_reminder'
        )
      ),
      'en'
    )
    expect(result.body).toBe('Watering and misting are due today.')
  })
})

describe('pickDominantCareTopic', () => {
  it('prefers overdue over everything else', () => {
    expect(
      pickDominantCareTopic([
        'misting_reminder',
        'overdue_reminder',
        'watering_reminder',
      ])
    ).toBe('overdue_reminder')
  })

  it('prefers watering over misting', () => {
    expect(
      pickDominantCareTopic(['misting_reminder', 'watering_reminder'])
    ).toBe('watering_reminder')
  })
})

const SAMPLE_PARAMS: { [K in SimpleNotificationType]: ParamsOf<K> } = {
  new_follower: { senderName: 'Ada' },
  nudge_to_water: { senderName: 'Ada' },
  delegation_request: { senderName: 'Ada' },
  delegation_accepted: { senderName: 'Ada' },
  delegation_rejected: { senderName: 'Ada' },
  delegation_canceled: { senderName: 'Ada' },
  delegation_activated: { plantCount: 3 },
  delegation_completed: { plantCount: 3 },
  canopy_member_joined: { senderName: 'Ada', canopyName: 'Home' },
  canopy_member_removed: { canopyName: 'Home' },
  canopy_member_left: { senderName: 'Ada', canopyName: 'Home' },
  canopy_invitation: { senderName: 'Ada', canopyName: 'Home' },
  daily_tip: { tipTitle: 'Mist ferns', tipBody: 'Ferns love humidity.' },
  inactivity_nudge: { plantCount: 3 },
  photo_reminder: { plantName: 'Fern', daysSincePhoto: 30 },
  plant_parent_milestone: { daysSinceJoin: 100 },
  gift_subscription: { duration: '1m' },
  resubscribe_nudge: { plantCount: 3 },
  streak_at_risk: { streakCount: 12, plantName: 'Monstera' },
  streak_milestone: { streakCount: 14 },
  weekly_recap: { tasksCompleted: 5, streakCount: 3, healthyCount: 2 },
  trial_ending: { trialDaysLeft: 3 },
  approaching_limit: { usageCount: 4, usageMax: 5, feature: 'cardScans' },
  plant_anniversary: {
    plantName: 'Fern',
    anniversaryMonths: 12,
    plantAddedAt: new Date('2025-04-03T12:00:00Z'),
  },
}

const stored = (params: unknown): unknown => JSON.parse(JSON.stringify(params))

const TEXT_IN_RECORDING_LANGUAGE: ReadonlyArray<SimpleNotificationType> = [
  'daily_tip',
]

describe('renderFromParams', () => {
  for (const [type, params] of Record.toEntries(SAMPLE_PARAMS)) {
    it(`${type}: stored params render the record-time text in en and fr`, () => {
      const rendered = Array.map(['en', 'fr'] as const, (lang) =>
        renderFromParams(type, stored(params), Option.none(), lang)
      )
      expect(rendered).toEqual(
        Array.map(['en', 'fr'] as const, (lang) =>
          Result.succeed(buildSimpleContent(type, params as never, lang))
        )
      )
      expect(Array.contains(TEXT_IN_RECORDING_LANGUAGE, type)).toBe(
        JSON.stringify(rendered[0]) === JSON.stringify(rendered[1])
      )
    })
  }

  it('renders the language asked for, not the one the params were built in', () => {
    expect(
      renderFromParams(
        'streak_at_risk',
        stored(SAMPLE_PARAMS.streak_at_risk),
        Option.none(),
        'fr'
      )
    ).toEqual(
      Result.succeed({
        title: '🔥 Ne perds pas ta série de 12 jours !',
        body: "Ta Monstera a encore besoin de soins aujourd'hui. Garde le rythme !",
      })
    )
  })

  it('still renders an anniversary row queued with the duration as text', () => {
    expect(
      Result.map(
        renderFromParams(
          'plant_anniversary',
          {
            plantName: 'Fern',
            anniversaryDuration: '1 year',
            dateAdded: 'Apr 3, 2025',
          },
          Option.none(),
          'en'
        ),
        (content) => content.title
      )
    ).toEqual(Result.succeed('🎂 Happy 1 year together!'))
  })

  it('names the plant by its current name over the one stored', () => {
    expect(
      renderFromParams(
        'photo_reminder',
        stored(SAMPLE_PARAMS.photo_reminder),
        Option.some('Ferdinand'),
        'en'
      )
    ).toEqual(
      Result.succeed({
        title: '📸 Time for a growth update!',
        body: "Your Ferdinand hasn't had a photo in 30 days. Capture how far it's come!",
      })
    )
  })

  const CANCELED = {
    en: {
      title: '🚫 Plant-sitting canceled',
      calledOff: 'Ada called off the plant-sitting',
      unanswered:
        "Ada didn't answer in time, so the plant-sitting request was canceled",
      unansweredByNobodyNamed:
        "Someone didn't answer in time, so the plant-sitting request was canceled",
    },
    fr: {
      title: '🚫 Garde annulée',
      calledOff: 'Ada a annulé la garde des plantes',
      unanswered:
        "Ada n'a pas répondu à temps, la demande de garde a été annulée",
      unansweredByNobodyNamed:
        "Quelqu'un n'a pas répondu à temps, la demande de garde a été annulée",
    },
  } satisfies {
    readonly [L in LanguageCode]: {
      readonly title: string
      readonly calledOff: string
      readonly unanswered: string
      readonly unansweredByNobodyNamed: string
    }
  }

  it.each(Struct.keys(CANCELED))(
    '%s: a canceled plant-sitting says whether it was called off or never answered',
    (language) => {
      const rendered = Array.map(
        [
          { senderName: 'Ada' },
          { senderName: 'Ada', unanswered: true },
          { unanswered: true },
        ],
        (params) =>
          renderFromParams(
            'delegation_canceled',
            stored(params),
            Option.none(),
            language
          )
      )

      const { title, calledOff, unanswered, unansweredByNobodyNamed } =
        CANCELED[language]
      expect(rendered).toEqual(
        Array.map([calledOff, unanswered, unansweredByNobodyNamed], (body) =>
          Result.succeed({ title, body })
        )
      )
    }
  )

  it('fails on params that do not match the topic', () => {
    expect(
      failureOf(
        renderFromParams(
          'trial_ending',
          { trialDaysLeft: 'three' },
          Option.none(),
          'en'
        )
      )._tag
    ).toBe('SchemaError')
  })
})
