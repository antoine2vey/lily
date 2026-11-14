import {
  CARE_TYPES,
  type CareDay,
  CareDays,
  type CareStatus,
  type CareType,
  type LanguageCode,
  type PlantHealthStatus,
} from '@lily/shared'
import type { ChatSuggestion } from '@lily/shared/ai-chat'
import { Array, Match, Order, pipe } from 'effect'

export const MAX_CHAT_SUGGESTIONS = 4
const MAX_OVERDUE_SUGGESTIONS = 2
const SETTLING_IN_DAYS = 14
const REPOT_SOON_DAYS = 30
const PET_SAFE_UP_TO = 50

export interface PlantSituation {
  readonly name: string
  readonly health: PlantHealthStatus
  readonly addedOn: CareDay
  readonly today: CareDay
  readonly petToxicityRating: number
  readonly schedules: ReadonlyArray<{
    readonly careType: CareType
    readonly status: CareStatus
  }>
  readonly hasOpenPlanStep: boolean
}

type Subject = 'care' | 'propagation' | 'problems' | 'repotting'

type Texts = Record<LanguageCode, string>

interface FiredSuggestion {
  readonly id: string
  readonly covers: ReadonlyArray<Subject>
  readonly text: Texts
}

type SuggestionRule = (
  situation: PlantSituation
) => ReadonlyArray<FiredSuggestion>

const conditionRule: SuggestionRule = ({ name, health }) =>
  pipe(
    Match.value(health),
    Match.when('SICK', () => [
      {
        id: 'condition-sick',
        covers: ['problems'] as const,
        text: {
          en: `What's wrong with ${name}?`,
          fr: `Qu'est-ce qui ne va pas avec ${name} ?`,
        },
      },
    ]),
    Match.when('RECOVERING', () => [
      {
        id: 'condition-recovering',
        covers: ['problems'] as const,
        text: {
          en: `How do I help ${name} recover?`,
          fr: `Comment aider ${name} à se rétablir ?`,
        },
      },
    ]),
    Match.orElse(() => [])
  )

const CARE_WORDS: Record<CareType, Texts> = {
  watering: { en: 'watering', fr: "l'arrosage" },
  fertilization: { en: 'fertilizing', fr: "l'engrais" },
  misting: { en: 'misting', fr: 'la vaporisation' },
  repotting: { en: 'repotting', fr: 'le rempotage' },
}

const days = (n: number): Texts => ({
  en: n === 1 ? '1 day' : `${n} days`,
  fr: n === 1 ? '1 jour' : `${n} jours`,
})

interface OverdueCare {
  readonly careType: CareType
  readonly daysLate: number
}

const mostOverdueFirst: Order.Order<OverdueCare> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (care) => care.daysLate),
  Order.mapInput(Order.Number, (care) => CARE_TYPES.indexOf(care.careType))
)

const overdueRule: SuggestionRule = ({ name, schedules }) =>
  pipe(
    schedules,
    Array.flatMap(({ careType, status }) =>
      status._tag === 'Overdue' ? [{ careType, daysLate: status.daysLate }] : []
    ),
    Array.sort(mostOverdueFirst),
    Array.dedupeWith((a, b) => a.careType === b.careType),
    Array.take(MAX_OVERDUE_SUGGESTIONS),
    Array.map(({ careType, daysLate }) => ({
      id: `overdue-${careType}`,
      covers: careType === 'repotting' ? (['repotting'] as const) : [],
      text: {
        en: `${name} is ${days(daysLate).en} late on ${CARE_WORDS[careType].en}. What should I do?`,
        fr: `${name} a ${days(daysLate).fr} de retard pour ${CARE_WORDS[careType].fr}. Que dois-je faire ?`,
      },
    }))
  )

const carePlanRule: SuggestionRule = ({ name, hasOpenPlanStep }) =>
  hasOpenPlanStep
    ? [
        {
          id: 'care-plan-next',
          covers: [],
          text: {
            en: `What's next in my care plan for ${name}?`,
            fr: `Quelle est la prochaine étape de mon plan de soins pour ${name} ?`,
          },
        },
      ]
    : []

const settleInRule: SuggestionRule = ({ name, addedOn, today }) =>
  CareDays.daysBetween(addedOn, today) <= SETTLING_IN_DAYS
    ? [
        {
          id: 'settle-in',
          covers: [],
          text: {
            en: `How do I help ${name} settle in?`,
            fr: `Comment aider ${name} à s'acclimater ?`,
          },
        },
      ]
    : []

const petToxicityRule: SuggestionRule = ({ name, petToxicityRating }) =>
  petToxicityRating > PET_SAFE_UP_TO
    ? [
        {
          id: 'pet-toxicity',
          covers: [],
          text: {
            en: `Is ${name} dangerous for my pets?`,
            fr: `Est-ce que ${name} est toxique pour mes animaux ?`,
          },
        },
      ]
    : []

const isRepotDueSoon = (status: CareStatus): boolean =>
  pipe(
    Match.value(status),
    Match.tagsExhaustive({
      Upcoming: ({ inDays }) => inDays <= REPOT_SOON_DAYS,
      DueToday: () => true,
      Overdue: () => false,
    })
  )

const repotSoonRule: SuggestionRule = ({ name, schedules }) =>
  Array.some(
    schedules,
    ({ careType, status }) => careType === 'repotting' && isRepotDueSoon(status)
  )
    ? [
        {
          id: 'repot-soon',
          covers: ['repotting'],
          text: {
            en: `Is it time to repot ${name}?`,
            fr: `Est-il temps de rempoter ${name} ?`,
          },
        },
      ]
    : []

const RULES_BY_PRIORITY: ReadonlyArray<SuggestionRule> = [
  conditionRule,
  overdueRule,
  carePlanRule,
  settleInRule,
  petToxicityRule,
  repotSoonRule,
]

interface Filler {
  readonly id: string
  readonly subject: Subject
  readonly text: Record<LanguageCode, (name: string) => string>
}

const FILLERS: ReadonlyArray<Filler> = [
  {
    id: 'care',
    subject: 'care',
    text: {
      en: (name) => `How do I care for ${name}?`,
      fr: (name) => `Comment entretenir ${name} ?`,
    },
  },
  {
    id: 'propagate',
    subject: 'propagation',
    text: {
      en: (name) => `How do I propagate ${name}?`,
      fr: (name) => `Comment bouturer ${name} ?`,
    },
  },
  {
    id: 'common-problems',
    subject: 'problems',
    text: {
      en: (name) => `What are common problems with ${name}?`,
      fr: (name) => `Quels sont les problèmes courants de ${name} ?`,
    },
  },
  {
    id: 'when-to-repot',
    subject: 'repotting',
    text: {
      en: (name) => `When should I repot ${name}?`,
      fr: (name) => `Quand rempoter ${name} ?`,
    },
  },
]

export const suggestionsFor = (
  situation: PlantSituation,
  language: LanguageCode
): ReadonlyArray<ChatSuggestion> => {
  const fired = pipe(
    RULES_BY_PRIORITY,
    Array.flatMap((rule) => rule(situation)),
    Array.take(MAX_CHAT_SUGGESTIONS)
  )
  const covered = Array.flatMap(fired, (suggestion) => suggestion.covers)
  const fillers = pipe(
    FILLERS,
    Array.filter((filler) => !Array.contains(covered, filler.subject)),
    Array.take(MAX_CHAT_SUGGESTIONS - fired.length),
    Array.map(
      (filler): ChatSuggestion => ({
        id: filler.id,
        text: filler.text[language](situation.name),
      })
    )
  )
  return [
    ...Array.map(
      fired,
      (suggestion): ChatSuggestion => ({
        id: suggestion.id,
        text: suggestion.text[language],
      })
    ),
    ...fillers,
  ]
}
