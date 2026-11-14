import type { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import type { PlantSituation } from '@lily/api/services/ai-chat/chat-suggestions'
import type { FollowUpBasis } from '@lily/api/services/ai-chat/follow-up-set'
import { loadPlantSituation } from '@lily/api/services/ai-chat/plant-situation'
import {
  authorScope,
  type KnowledgeView,
} from '@lily/api/services/plants/helpers/plant-access'
import { type CareDay, CareDays } from '@lily/shared'
import type { DiagnosisSeverity } from '@lily/shared/diagnosis'
import { Array, DateTime, Effect, Match, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const LATEST_DIAGNOSES = 3

export interface RecentDiagnosis {
  readonly id: string
  readonly diseaseName: string
  readonly severity: DiagnosisSeverity
  readonly diagnosedOn: CareDay
}

export interface PlantState {
  readonly situation: PlantSituation
  readonly latestDiagnoses: ReadonlyArray<RecentDiagnosis>
}

export const loadPlantState = (
  plant: PlantWithRoom,
  view: KnowledgeView
): Effect.Effect<
  PlantState,
  SqlError,
  CarePlanRepository | DiagnosisRepository
> =>
  Effect.gen(function* () {
    const diagnosisRepo = yield* DiagnosisRepository
    const [situation, diagnoses] = yield* Effect.all(
      [
        loadPlantSituation(plant, view),
        diagnosisRepo.findByPlantId({
          plantId: plant.id,
          author: authorScope(view),
          limit: LATEST_DIAGNOSES,
        }),
      ],
      { concurrency: 'unbounded' }
    )
    return {
      situation,
      latestDiagnoses: Array.map(diagnoses.items, (diagnosis) => ({
        id: diagnosis.id,
        diseaseName: diagnosis.diseaseName,
        severity: diagnosis.severity,
        diagnosedOn: CareDays.of(
          DateTime.fromDateUnsafe(diagnosis.createdAt),
          plant.careTimezone
        ),
      })),
    }
  })

export interface Fact {
  readonly id: string
  readonly statement: string
  readonly basis: Exclude<FollowUpBasis, { readonly kind: 'none' }>
}

export const factsOf = ({
  situation,
  latestDiagnoses,
}: PlantState): ReadonlyArray<Fact> => [
  ...Array.flatMap(situation.schedules, ({ careType, status }): Fact[] =>
    status._tag === 'Overdue'
      ? [
          {
            id: `late:${careType}`,
            statement: `${careType} is ${status.daysLate} day(s) late`,
            basis: { kind: 'late', careType },
          },
        ]
      : []
  ),
  ...(situation.health === 'SICK' || situation.health === 'RECOVERING'
    ? [
        {
          id: 'health',
          statement: `health status is ${situation.health}`,
          basis: { kind: 'health' as const, status: situation.health },
        },
      ]
    : []),
  ...Array.map(
    latestDiagnoses,
    (diagnosis, index): Fact => ({
      id: `diagnosis:${index}`,
      statement: `diagnosed with ${diagnosis.diseaseName} (${diagnosis.severity}) on ${diagnosis.diagnosedOn}`,
      basis: { kind: 'diagnosis', diagnosisId: diagnosis.id },
    })
  ),
  ...(situation.hasOpenPlanStep
    ? [
        {
          id: 'carePlan',
          statement: 'an accepted care plan has steps still to do',
          basis: { kind: 'carePlan' as const },
        },
      ]
    : []),
]

export const basisHolds =
  ({ situation, latestDiagnoses }: PlantState) =>
  (basis: FollowUpBasis): boolean =>
    pipe(
      Match.value(basis),
      Match.discriminatorsExhaustive('kind')({
        none: () => true,
        late: ({ careType }) =>
          Array.some(
            situation.schedules,
            (schedule) =>
              schedule.careType === careType &&
              schedule.status._tag === 'Overdue'
          ),
        health: ({ status }) => situation.health === status,
        diagnosis: ({ diagnosisId }) =>
          Array.some(latestDiagnoses, ({ id }) => id === diagnosisId),
        carePlan: () => situation.hasOpenPlanStep,
      })
    )
