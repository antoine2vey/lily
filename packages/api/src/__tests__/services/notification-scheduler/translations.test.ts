import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
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
    it('en: includes usage count, max, and feature name', () => {
      const { title, body } = buildSimpleContent(
        'approaching_limit',
        { usageCount: 4, usageMax: 5, featureName: 'plants' },
        'en'
      )
      expect(title).toContain('limit')
      expect(body).toContain('4/5')
      expect(body).toContain('plants')
      expect(body).toContain('Premium')
    })

    it('fr: includes usage and French feature name', () => {
      const { title, body } = buildSimpleContent(
        'approaching_limit',
        { usageCount: 8, usageMax: 10, featureName: 'discussions IA' },
        'fr'
      )
      expect(title).toContain('limite')
      expect(body).toContain('8/10')
      expect(body).toContain('discussions IA')
      expect(body).toContain('Premium')
    })
  })

  describe('plant_anniversary', () => {
    it('en: includes plant name, duration, and date', () => {
      const { title, body } = buildSimpleContent(
        'plant_anniversary',
        {
          plantName: 'Ficus',
          anniversaryDuration: '6 months',
          dateAdded: 'Oct 3, 2025',
        },
        'en'
      )
      expect(title).toContain('6 months')
      expect(body).toContain('Ficus')
      expect(body).toContain('Oct 3, 2025')
    })

    it('fr: includes plant name, duration, and date in French', () => {
      const { title, body } = buildSimpleContent(
        'plant_anniversary',
        {
          plantName: 'Ficus',
          anniversaryDuration: '6 mois',
          dateAdded: '3 oct. 2025',
        },
        'fr'
      )
      expect(title).toContain('6 mois')
      expect(body).toContain('Ficus')
      expect(body).toContain('3 oct. 2025')
    })
  })

  describe('all 6 types produce non-empty title and body for both languages', () => {
    const types = [
      {
        type: 'streak_at_risk' as const,
        params: { streakCount: 7, plantName: 'Rose' },
      },
      { type: 'streak_milestone' as const, params: { streakCount: 14 } },
      {
        type: 'weekly_recap' as const,
        params: { tasksCompleted: 5, streakCount: 3, healthyCount: 2 },
      },
      { type: 'trial_ending' as const, params: { trialDaysLeft: 3 } },
      {
        type: 'approaching_limit' as const,
        params: { usageCount: 4, usageMax: 5, featureName: 'plants' },
      },
      {
        type: 'plant_anniversary' as const,
        params: {
          plantName: 'Fern',
          anniversaryDuration: '1 year',
          dateAdded: 'Apr 3, 2025',
        },
      },
    ] as const

    for (const { type, params } of types) {
      for (const lang of ['en', 'fr'] as const) {
        it(`${type} (${lang}): non-empty title and body`, () => {
          const { title, body } = buildSimpleContent(type, params, lang)
          expect(title.length).toBeGreaterThan(0)
          expect(body.length).toBeGreaterThan(0)
        })
      }
    }
  })
})
