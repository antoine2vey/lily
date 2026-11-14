import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { RecordOutcome, Refusal } from '@lily/api/contexts/care'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { CareDay, CareDays } from '@lily/shared'
import { Array, DateTime, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { mockPlants, type TestPlant } from '../../fixtures/plants'
import { createMockCanopyRepository } from '../../mocks/canopy.repository'
import { createMockDelegationRepository } from '../../mocks/delegation.repository'
import { createMockPlantRepository } from '../../mocks/plant.repository'
import { createMockCurrentUser } from '../../mocks/session'

type DelegationMockData = NonNullable<
  Parameters<typeof createMockDelegationRepository>[0]
>

const schedulesFromPlants = (plants: TestPlant[]): CareScheduleRow[] =>
  Array.flatMap(plants, (p) =>
    Array.map(p.scheduleSpecs, (s) => ({
      id: `schedule-${p.id}-${s.careType}`,
      plantId: p.id,
      careType: s.careType,
      frequencyDays: s.frequencyDays,
      lastCareAt: s.lastCareAt,
      nextCareAt: s.nextCareAt,
      dueDay: CareDays.of(DateTime.makeUnsafe(s.nextCareAt), 'UTC'),
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  )

const plant1 = mockPlants[0]!
const plant2 = mockPlants[1]!
const plant3 = mockPlants[2]! // belongs to user-2

const recorded = (plantId: string) =>
  RecordOutcome.Recorded({
    plantId,
    careLogId: `care-${plantId}`,
    careType: 'watering',
    day: CareDay.make('2026-11-12'),
    dueDay: Option.none(),
  })

const setup = (
  overrides: {
    plants?: TestPlant[]
    delegations?: DelegationMockData['delegations']
    delegationPlants?: DelegationMockData['delegationPlants']
    rooms?: { id: string; name: string; icon: string }[]
    outcomeOf?: (plantId: string) => RecordOutcome
  } = {}
) => {
  const plants = overrides.plants ?? [plant1, plant2, plant3]
  const care = createStubCare(overrides.outcomeOf ?? recorded)
  return {
    care,
    layer: Layer.mergeAll(
      createMockPlantRepository({
        plants,
        schedules: schedulesFromPlants(plants),
        rooms: overrides.rooms as never,
      }),
      createMockDelegationRepository({
        delegations: overrides.delegations,
        delegationPlants: overrides.delegationPlants,
      }),
      createMockCanopyRepository(),
      createMockCurrentUser({ id: 'user-1' }),
      care.layer
    ),
  }
}

const careFor = (
  plantIds: ReadonlyArray<string>,
  test: ReturnType<typeof setup>
) =>
  Effect.runPromise(
    careMultiplePlants({ plantIds, careType: 'watering' }).pipe(
      Effect.provide(test.layer)
    )
  )

describe('careMultiplePlants', () => {
  it('returns nothing for no plants', async () => {
    expect(await careFor([], setup())).toEqual([])
  })

  it('records one care for today on every plant the caller may care for', async () => {
    const test = setup()

    const result = await careFor(['plant-1', 'plant-2'], test)

    expect(
      Array.map(result, (r) => [r.plantId, r.success, r.plant?.id])
    ).toEqual([
      ['plant-1', true, 'plant-1'],
      ['plant-2', true, 'plant-2'],
    ])
    expect(test.care.commands).toHaveLength(1)
    expect(test.care.commands[0]).toMatchObject({
      careType: 'watering',
      on: { _tag: 'Today' },
      planStep: { _tag: 'Auto' },
    })
    expect(
      Array.map(test.care.commands[0]?.permits ?? [], (permit) => [
        permit.plantId,
        permit.action,
        permit.actor,
      ])
    ).toEqual([
      ['plant-1', 'care', { _tag: 'User', userId: 'user-1' }],
      ['plant-2', 'care', { _tag: 'User', userId: 'user-1' }],
    ])
  })

  it('answers success: false for a plant of someone else and asks no care for it', async () => {
    const test = setup()

    const result = await careFor(['plant-1', 'plant-3'], test)

    expect(Array.map(result, (r) => [r.plantId, r.success])).toEqual([
      ['plant-1', true],
      ['plant-3', false],
    ])
    expect(
      Array.map(test.care.commands[0]?.permits ?? [], (p) => p.plantId)
    ).toEqual(['plant-1'])
  })

  it('answers success: false for a plant that does not exist', async () => {
    const result = await careFor(['plant-nonexistent'], setup())

    expect(result).toEqual([{ plantId: 'plant-nonexistent', success: false }])
  })

  it('answers success: false for a plant Care skipped', async () => {
    const test = setup({
      outcomeOf: (plantId) =>
        plantId === 'plant-2'
          ? RecordOutcome.Skipped({
              plantId,
              reason: Refusal.AlreadyCared({
                plantId,
                careType: 'watering',
                day: CareDay.make('2026-11-12'),
              }),
            })
          : recorded(plantId),
    })

    const result = await careFor(['plant-1', 'plant-2'], test)

    expect(Array.map(result, (r) => [r.plantId, r.success])).toEqual([
      ['plant-1', true],
      ['plant-2', false],
    ])
  })

  it('cares for a plant delegated to the caller', async () => {
    const test = setup({
      delegations: [
        {
          id: 'delegation-1',
          ownerId: 'user-2',
          caretakerId: 'user-1',
          status: 'active' as const,
          message: null,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2025-12-31'),
          respondedAt: new Date(),
          canceledAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      delegationPlants: [{ delegationId: 'delegation-1', plantId: 'plant-3' }],
    })

    const result = await careFor(['plant-3'], test)

    expect(Array.map(result, (r) => [r.plantId, r.success])).toEqual([
      ['plant-3', true],
    ])
  })

  it('returns the plant with its room', async () => {
    const plantWithRoom: TestPlant = {
      ...plant1,
      id: 'plant-room',
      roomId: 'room-1',
    }
    const test = setup({
      plants: [plantWithRoom],
      rooms: [{ id: 'room-1', name: 'Living Room', icon: 'sofa' }],
    })

    const result = await careFor(['plant-room'], test)

    expect(result[0]?.plant?.room?.name).toBe('Living Room')
  })
})
