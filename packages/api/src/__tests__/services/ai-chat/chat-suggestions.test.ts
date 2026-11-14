import {
  type PlantSituation,
  suggestionsFor,
} from '@lily/api/services/ai-chat/chat-suggestions'
import { CareDay, type CareStatus, type CareType } from '@lily/shared'
import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

const today = CareDay.make('2026-11-14')

const situation = (
  overrides: Partial<PlantSituation> = {}
): PlantSituation => ({
  name: 'Fern',
  health: 'HEALTHY',
  addedOn: CareDay.make('2026-01-01'),
  today,
  petToxicityRating: 0,
  schedules: [],
  hasOpenPlanStep: false,
  ...overrides,
})

const overdue = (careType: CareType, daysLate: number) => ({
  careType,
  status: { _tag: 'Overdue', daysLate } satisfies CareStatus,
})

const upcoming = (careType: CareType, inDays: number) => ({
  careType,
  status: { _tag: 'Upcoming', inDays } satisfies CareStatus,
})

const dueToday = (careType: CareType) => ({
  careType,
  status: { _tag: 'DueToday' } satisfies CareStatus,
})

const FILLERS = ['care', 'propagate', 'common-problems', 'when-to-repot']

const idsFor = (overrides: Partial<PlantSituation>) =>
  Array.map(suggestionsFor(situation(overrides), 'en'), (s) => s.id)

describe('suggestionsFor', () => {
  it.each<[string, Partial<PlantSituation>, ReadonlyArray<string>]>([
    ['a plant nothing fires for gets the four fillers', {}, FILLERS],
    [
      'a sick plant, without the common problems filler',
      { health: 'SICK' },
      ['condition-sick', 'care', 'propagate', 'when-to-repot'],
    ],
    [
      'a recovering plant, without the common problems filler',
      { health: 'RECOVERING' },
      ['condition-recovering', 'care', 'propagate', 'when-to-repot'],
    ],
    ['a thriving plant', { health: 'THRIVING' }, FILLERS],
    ['a plant that needs attention', { health: 'NEEDS_ATTENTION' }, FILLERS],
    [
      'an overdue watering',
      { schedules: [overdue('watering', 3)] },
      ['overdue-watering', 'care', 'propagate', 'common-problems'],
    ],
    [
      'a watering due today is not overdue',
      { schedules: [dueToday('watering')] },
      FILLERS,
    ],
    [
      'a watering due tomorrow is not overdue',
      { schedules: [upcoming('watering', 1)] },
      FILLERS,
    ],
    [
      'two overdue cares at most, the most overdue first',
      {
        schedules: [
          overdue('watering', 2),
          overdue('misting', 5),
          overdue('fertilization', 1),
        ],
      },
      ['overdue-misting', 'overdue-watering', 'care', 'propagate'],
    ],
    [
      'two cares as late as each other, in care type order',
      { schedules: [overdue('misting', 2), overdue('watering', 2)] },
      ['overdue-watering', 'overdue-misting', 'care', 'propagate'],
    ],
    [
      'one chip per care type',
      { schedules: [overdue('watering', 1), overdue('watering', 4)] },
      ['overdue-watering', 'care', 'propagate', 'common-problems'],
    ],
    [
      'an open step in a care plan',
      { hasOpenPlanStep: true },
      ['care-plan-next', 'care', 'propagate', 'common-problems'],
    ],
    [
      'added 14 care days ago',
      { addedOn: CareDay.make('2026-10-31') },
      ['settle-in', 'care', 'propagate', 'common-problems'],
    ],
    [
      'added 15 care days ago',
      { addedOn: CareDay.make('2026-10-30') },
      FILLERS,
    ],
    [
      'a pet toxicity of 51',
      { petToxicityRating: 51 },
      ['pet-toxicity', 'care', 'propagate', 'common-problems'],
    ],
    ['a pet toxicity of 50', { petToxicityRating: 50 }, FILLERS],
    [
      'a repotting due in 30 care days',
      { schedules: [upcoming('repotting', 30)] },
      ['repot-soon', 'care', 'propagate', 'common-problems'],
    ],
    [
      'a repotting due today',
      { schedules: [dueToday('repotting')] },
      ['repot-soon', 'care', 'propagate', 'common-problems'],
    ],
    [
      'a repotting due in 31 care days',
      { schedules: [upcoming('repotting', 31)] },
      FILLERS,
    ],
    [
      'an overdue repotting is an overdue care, not a repotting due soon',
      { schedules: [overdue('repotting', 3)] },
      ['overdue-repotting', 'care', 'propagate', 'common-problems'],
    ],
    [
      'the rules in priority order',
      {
        petToxicityRating: 100,
        addedOn: today,
        hasOpenPlanStep: true,
        schedules: [upcoming('repotting', 3)],
      },
      ['care-plan-next', 'settle-in', 'pet-toxicity', 'repot-soon'],
    ],
    [
      'at most four, the highest in priority',
      {
        health: 'SICK',
        petToxicityRating: 100,
        addedOn: today,
        hasOpenPlanStep: true,
        schedules: [overdue('watering', 3), overdue('misting', 1)],
      },
      [
        'condition-sick',
        'overdue-watering',
        'overdue-misting',
        'care-plan-next',
      ],
    ],
  ])('%s', (_, overrides, expected) => {
    expect(idsFor(overrides)).toEqual(expected)
  })

  it.each<[string, CareType, number, 'en' | 'fr', string]>([
    [
      'one day in English',
      'watering',
      1,
      'en',
      'Fern is 1 day late on watering. What should I do?',
    ],
    [
      'several days in English',
      'fertilization',
      3,
      'en',
      'Fern is 3 days late on fertilizing. What should I do?',
    ],
    [
      'one day in French',
      'watering',
      1,
      'fr',
      "Fern a 1 jour de retard pour l'arrosage. Que dois-je faire ?",
    ],
    [
      'several days in French',
      'misting',
      3,
      'fr',
      'Fern a 3 jours de retard pour la vaporisation. Que dois-je faire ?',
    ],
  ])(
    'words an overdue care for %s',
    (_, careType, daysLate, language, text) => {
      expect(
        suggestionsFor(
          situation({ schedules: [overdue(careType, daysLate)] }),
          language
        )[0]
      ).toEqual({ id: `overdue-${careType}`, text })
    }
  )

  it('names the plant in French in every rule and filler', () => {
    const everyRule = situation({
      health: 'RECOVERING',
      hasOpenPlanStep: true,
      addedOn: today,
      petToxicityRating: 100,
      schedules: [upcoming('repotting', 3)],
    })
    const texts = (overrides: Partial<PlantSituation>) =>
      Array.map(
        suggestionsFor({ ...everyRule, ...overrides }, 'fr'),
        (s) => s.text
      )

    expect(texts({})).toEqual([
      'Comment aider Fern à se rétablir ?',
      'Quelle est la prochaine étape de mon plan de soins pour Fern ?',
      "Comment aider Fern à s'acclimater ?",
      'Est-ce que Fern est toxique pour mes animaux ?',
    ])
    expect(texts({ health: 'SICK', hasOpenPlanStep: false })).toEqual([
      "Qu'est-ce qui ne va pas avec Fern ?",
      "Comment aider Fern à s'acclimater ?",
      'Est-ce que Fern est toxique pour mes animaux ?',
      'Est-il temps de rempoter Fern ?',
    ])
    expect(suggestionsFor(situation(), 'fr')).toEqual([
      { id: 'care', text: 'Comment entretenir Fern ?' },
      { id: 'propagate', text: 'Comment bouturer Fern ?' },
      {
        id: 'common-problems',
        text: 'Quels sont les problèmes courants de Fern ?',
      },
      { id: 'when-to-repot', text: 'Quand rempoter Fern ?' },
    ])
  })
})
