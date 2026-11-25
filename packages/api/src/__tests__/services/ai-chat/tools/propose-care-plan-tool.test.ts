import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { chatPermit, createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { LifeState } from '@lily/api/contexts/care/domain/care-plant'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { resolveDueDate } from '@lily/api/services/ai-chat/tools/care-plan-step-schema'
import { proposeCarePlanTool } from '@lily/api/services/ai-chat/tools/propose-care-plan'
import { CareDays, ZoneName } from '@lily/shared'
import type { ToolExecutionOptions } from 'ai'
import { Array, DateTime, Effect, Layer, ManagedRuntime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const stubToolOptions: ToolExecutionOptions<{}> = {
  toolCallId: 'test-call',
  messages: [],
  context: {},
}

const runtimeOver = (plant = createTestCarePlant('plant-1')) => {
  const plans = createCarePlanRows({
    plants: [{ id: 'plant-1', name: 'Monstera', imageUrl: null }],
  })
  return ManagedRuntime.make(
    Layer.mergeAll(
      createInMemoryCare([plant], { plans }).layer,
      plans.layer,
      createMockDiagnosisRepository([]),
      createMockRagService()
    )
  )
}

const overwatered = {
  title: 'Recover from overwatering',
  steps: [
    { title: 'Hold off watering', careType: 'watering', dueInDays: 5 },
    { title: 'Move away from the window', careType: 'none' },
  ],
}

describe('proposeCarePlanTool', () => {
  it('creates a proposed plan with ordered steps and resolved due dates', async () => {
    const managedRuntime = runtimeOver()
    const planTool = proposeCarePlanTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
      timezone: ZoneName.make('Europe/Paris'),
    })

    const result = (await planTool.execute!(overwatered, stubToolOptions)) as {
      carePlanId: string
      plantId: string
    }

    expect(result.plantId).toBe('plant-1')

    const stored = await managedRuntime.runPromise(
      Effect.gen(function* () {
        const repo = yield* CarePlanRepository
        return yield* repo.findById(result.carePlanId)
      })
    )
    expect(stored?.status).toBe('proposed')
    expect(stored?.source).toBe('ai')
    expect(stored?.userId).toBe('user-1')
    expect(Array.map(stored?.steps ?? [], (s) => s.title)).toEqual([
      'Hold off watering',
      'Move away from the window',
    ])
    expect(stored?.steps[0]?.careType).toBe('watering')
    expect(stored?.steps[0]?.dueDate).toBeInstanceOf(Date)
    // "none" is the model-facing sentinel; it is stored as no care type.
    expect(stored?.steps[1]?.careType).toBeUndefined()
    expect(stored?.steps[1]?.dueDate).toBeUndefined()
    await managedRuntime.dispose()
  })

  it('answers that the plant does not exist when it is dead, and writes no plan (a change: it used to write one)', async () => {
    const managedRuntime = runtimeOver(
      createTestCarePlant('plant-1', { life: LifeState.Dead() })
    )
    const planTool = proposeCarePlanTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
    })

    await expect(
      planTool.execute!(overwatered, stubToolOptions)
    ).rejects.toMatchObject({ _tag: 'PlantNotFoundError' })

    expect(
      await managedRuntime.runPromise(
        Effect.flatMap(CarePlanRepository, (repo) =>
          repo.findByPlant('plant-1')
        )
      )
    ).toEqual([])
    await managedRuntime.dispose()
  })

  it('rejects more than the maximum number of steps at the schema level', async () => {
    const managedRuntime = runtimeOver()
    const planTool = proposeCarePlanTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
    })
    const schema = planTool.inputSchema as {
      safeParse: (v: unknown) => { success: boolean }
    }
    const tooMany = Array.makeBy(9, (i) => ({
      title: `Step ${i}`,
      careType: 'none',
    }))
    expect(schema.safeParse({ title: 'x', steps: tooMany }).success).toBe(false)
    expect(
      schema.safeParse({ title: 'x', steps: tooMany.slice(0, 8) }).success
    ).toBe(true)
    // A step without an explicit careType decision is rejected.
    expect(
      schema.safeParse({ title: 'x', steps: [{ title: 'Isolate' }] }).success
    ).toBe(false)
    await managedRuntime.dispose()
  })
})

describe('resolveDueDate', () => {
  it('lands on the local midnight of the target day', () => {
    const now = DateTime.makeUnsafe('2024-06-10T15:30:00Z')
    const due = resolveDueDate(2, 'Europe/Paris', now)
    // Paris is UTC+2 in June: local midnight on June 12 is 22:00 UTC on June 11.
    expect(due?.toISOString()).toBe('2024-06-11T22:00:00.000Z')
  })

  it.each([
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: 'clocks go back on 2026-10-25',
      now: '2026-10-24T10:00:00.000Z',
      dueInDays: 2,
      dueDay: '2026-10-26',
      dueAt: '2026-10-25T23:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: 'clocks go forward on 2026-03-29',
      now: '2026-03-28T10:00:00.000Z',
      dueInDays: 2,
      dueDay: '2026-03-30',
      dueAt: '2026-03-29T22:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Australia/Sydney'),
      clock: 'clocks go back on 2026-04-05',
      now: '2026-04-04T01:00:00.000Z',
      dueInDays: 2,
      dueDay: '2026-04-06',
      dueAt: '2026-04-05T14:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Australia/Sydney'),
      clock: 'clocks go forward on 2026-10-04',
      now: '2026-10-03T01:00:00.000Z',
      dueInDays: 14,
      dueDay: '2026-10-17',
      dueAt: '2026-10-16T13:00:00.000Z',
    },
    {
      timezone: ZoneName.make('America/Santiago'),
      clock: 'the due day starts at 01:00 on 2026-09-06',
      now: '2026-09-04T16:00:00.000Z',
      dueInDays: 2,
      dueDay: '2026-09-06',
      dueAt: '2026-09-06T04:00:00.000Z',
    },
  ])(
    'starts the due day in $timezone when $clock',
    ({ timezone, now, dueInDays, dueDay, dueAt }) => {
      const due = resolveDueDate(dueInDays, timezone, DateTime.makeUnsafe(now))

      expect(due?.toISOString()).toBe(dueAt)
      expect(
        Option.map(Option.fromNullishOr(due), (date) =>
          CareDays.of(DateTime.makeUnsafe(date), timezone)
        )
      ).toEqual(Option.some(dueDay))
    }
  )

  it('returns undefined when no offset is given', () => {
    expect(resolveDueDate(undefined, 'UTC')).toBeUndefined()
  })
})
