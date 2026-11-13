import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { chatPermit, createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { CarePlans } from '@lily/api/contexts/care'
import {
  type CarePlant,
  LifeState,
} from '@lily/api/contexts/care/domain/care-plant'
import { systemPermit } from '@lily/api/kernel/permit'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CarePlanNotFoundError } from '@lily/shared/errors/care-plan'
import { Cause, DateTime, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const world = (buried: ReadonlyArray<CarePlant> = []) => {
  const plans = createCarePlanRows()
  const care = createInMemoryCare(
    [createTestCarePlant('plant-1'), createTestCarePlant('plant-2'), ...buried],
    { plans }
  )
  return { care, layer: Layer.merge(care.layer, plans.layer) }
}

const rescue = { title: 'Rescue', source: 'ai' as const, steps: [] }

const proposeOn = (plantId: string) =>
  Effect.flatMap(CarePlans, (carePlans) =>
    carePlans.propose({ permit: chatPermit(plantId), ...rescue })
  )

const planNamed = (planId: string) =>
  Effect.flatMap(CarePlanRepository, (repo) => repo.findById(planId))

describe('CarePlans', () => {
  it('dies on a proposal by a job, since a plan needs a user as its author', async () => {
    const { care, layer } = world()

    const exit = await Effect.runPromiseExit(
      Effect.flatMap(CarePlans, (carePlans) =>
        carePlans.propose({
          permit: systemPermit('plant-1', 'chat', 'digest'),
          ...rescue,
        })
      ).pipe(Effect.provide(layer))
    )

    expect(
      Exit.isFailure(exit) && Cause.hasDies(exit.cause)
        ? Cause.squash(exit.cause)
        : exit
    ).toMatchObject({
      _tag: 'ProposalByAJobDefect',
      plantId: 'plant-1',
      job: 'digest',
    })
    expect(care.writes).toEqual([])
  })

  it('links a plan to the chat message that proposed it', async () => {
    const { layer } = world()

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const carePlans = yield* CarePlans
        const { planId } = yield* proposeOn('plant-1')
        yield* carePlans.linkToMessage({ planId, chatMessageId: 'message-1' })
        return yield* planNamed(planId)
      }).pipe(Effect.provide(layer))
    )

    expect(plan?.chatMessageId).toBe('message-1')
  })

  it('leaves a plan that is gone alone when its message is linked', async () => {
    const { care, layer } = world()

    await Effect.runPromise(
      Effect.flatMap(CarePlans, (carePlans) =>
        carePlans.linkToMessage({ planId: 'gone', chatMessageId: 'message-1' })
      ).pipe(Effect.provide(layer))
    )

    expect(care.writes).toEqual([])
  })

  it('refuses to link a diagnosis to a plan of another plant', async () => {
    const { layer } = world()

    const linked = await Effect.runPromise(
      Effect.gen(function* () {
        const carePlans = yield* CarePlans
        const { planId } = yield* proposeOn('plant-1')
        const refused = yield* Effect.flip(
          carePlans.linkToDiagnosis({
            permit: chatPermit('plant-2'),
            planId,
            diagnosisId: 'diagnosis-1',
          })
        )
        return { refused, plan: yield* planNamed(planId) }
      }).pipe(Effect.provide(layer))
    )

    expect(linked.refused).toBeInstanceOf(CarePlanNotFoundError)
    expect(linked.plan?.diagnosisId).toBeUndefined()
  })

  it('refuses to link a diagnosis to a plan of a dead plant', async () => {
    const { care, layer } = world([
      createTestCarePlant('buried', {
        life: LifeState.Dead(),
        plans: [
          {
            id: 'plan-of-the-buried',
            status: 'proposed',
            createdAt: DateTime.makeUnsafe('2026-11-01T00:00:00Z'),
            steps: [],
          },
        ],
      }),
    ])

    const refused = await Effect.runPromise(
      Effect.flatMap(CarePlans, (carePlans) =>
        Effect.flip(
          carePlans.linkToDiagnosis({
            permit: chatPermit('buried'),
            planId: 'plan-of-the-buried',
            diagnosisId: 'diagnosis-1',
          })
        )
      ).pipe(Effect.provide(layer))
    )

    expect(refused).toBeInstanceOf(CarePlanNotFoundError)
    expect(care.writes).toEqual([])
  })
})
