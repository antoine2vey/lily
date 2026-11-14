import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import type { CareEvent, LifeChange } from '@lily/api/contexts/care'
import { eventBusForwarder } from '@lily/api/events/care-forwarder'
import { CareDay, type PlantOwner } from '@lily/shared'
import type { AppEvent, EventBus } from '@lily/shared/server'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const owner: PlantOwner = { _tag: 'User', userId: 'alex' }

const forwarded = async (event: CareEvent) => {
  const publishedEvents: AppEvent[] = []
  await Effect.runPromise(
    Effect.flatMap(Effect.context<EventBus>(), (context) =>
      eventBusForwarder(context).handle(event)
    ).pipe(Effect.provide(createMockEventBus({ publishedEvents })))
  )
  return publishedEvents
}

const lifeChanged = (life: LifeChange, by: string | null): CareEvent => ({
  _tag: 'PlantLifeChanged',
  plantId: 'fern',
  owner,
  life,
  by,
})

const recorded = (
  by: string | null,
  answeredAttention: boolean
): CareEvent => ({
  _tag: 'CareRecorded',
  plantId: 'fern',
  owner,
  careLogId: 'log-1',
  careType: 'watering',
  day: CareDay.make('2026-11-12'),
  by,
  answeredAttention,
})

describe('eventBusForwarder', () => {
  it('tells the app a plant was created, by whom', async () => {
    expect(await forwarded(lifeChanged('Planted', 'lily'))).toEqual([
      { _tag: 'PlantCreated', userId: 'lily', plantId: 'fern' },
    ])
  })

  it.each(['Buried', 'Revived', 'Removed'] as const)(
    'tells the app the life of a plant changed when it is %s',
    async (life) => {
      expect(await forwarded(lifeChanged(life, 'lily'))).toEqual([
        { _tag: 'PlantLifecycleChanged', userId: 'lily', plantId: 'fern' },
      ])
    }
  )

  it.each(['Planted', 'Buried', 'Revived', 'Removed'] as const)(
    'tells the app nothing when no user made it %s',
    async (life) => {
      expect(await forwarded(lifeChanged(life, null))).toEqual([])
    }
  )

  it('tells the app a care was logged', async () => {
    expect(await forwarded(recorded('lily', false))).toEqual([
      {
        _tag: 'CareLogCreated',
        userId: 'lily',
        plantId: 'fern',
        careLogId: 'log-1',
        type: 'watering',
      },
    ])
  })

  it('adds that the care answered a plant needing attention', async () => {
    expect(await forwarded(recorded('lily', true))).toContainEqual({
      _tag: 'AttentionResponded',
      userId: 'lily',
      plantId: 'fern',
    })
  })

  it('tells the app nothing of a care a job recorded', async () => {
    expect(await forwarded(recorded(null, true))).toEqual([])
  })

  it('tells the app nothing of a schedule change', async () => {
    expect(
      await forwarded({
        _tag: 'ScheduleChanged',
        plantId: 'fern',
        careType: 'watering',
        dueDay: CareDay.make('2026-11-19'),
        reason: 'frequency',
      })
    ).toEqual([])
  })
})
