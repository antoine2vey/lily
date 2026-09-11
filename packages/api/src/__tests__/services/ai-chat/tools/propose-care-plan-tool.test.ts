import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { resolveDueDate } from '@lily/api/services/ai-chat/tools/care-plan-step-schema'
import { proposeCarePlanTool } from '@lily/api/services/ai-chat/tools/propose-care-plan'
import type { ToolExecutionOptions } from 'ai'
import { Array, DateTime, Effect, Layer, ManagedRuntime } from 'effect'
import { describe, expect, it } from 'vitest'

const stubToolOptions: ToolExecutionOptions = {
  toolCallId: 'test-call',
  messages: [],
}

const testLayer = Layer.mergeAll(
  createMockCarePlanRepository({
    plants: [{ id: 'plant-1', name: 'Monstera', imageUrl: null }],
  }),
  createMockDiagnosisRepository([]),
  createMockRagService()
)

describe('proposeCarePlanTool', () => {
  it('creates a proposed plan with ordered steps and resolved due dates', async () => {
    const managedRuntime = ManagedRuntime.make(testLayer)
    const rt = await managedRuntime.runtime()
    const planTool = proposeCarePlanTool({
      runtime: rt,
      userId: 'user-1',
      plantId: 'plant-1',
      plantName: 'Monstera',
      timezone: 'Europe/Paris',
    })

    const result = (await planTool.execute!(
      {
        title: 'Recover from overwatering',
        steps: [
          { title: 'Hold off watering', careType: 'watering', dueInDays: 5 },
          { title: 'Move away from the window', careType: 'none' },
        ],
      },
      stubToolOptions
    )) as { carePlanId: string; plantId: string }

    expect(result.carePlanId).toMatch(/^care-plan-/)
    expect(result.plantId).toBe('plant-1')

    const stored = await managedRuntime.runPromise(
      Effect.gen(function* () {
        const repo = yield* CarePlanRepository
        return yield* repo.findById(result.carePlanId, 'user-1')
      })
    )
    expect(stored?.status).toBe('proposed')
    expect(stored?.source).toBe('ai')
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

  it('rejects more than the maximum number of steps at the schema level', async () => {
    const managedRuntime = ManagedRuntime.make(testLayer)
    const planTool = proposeCarePlanTool({
      runtime: await managedRuntime.runtime(),
      userId: 'user-1',
      plantId: 'plant-1',
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
    const now = DateTime.unsafeMake('2024-06-10T15:30:00Z')
    const due = resolveDueDate(2, 'Europe/Paris', now)
    // Paris is UTC+2 in June: local midnight on June 12 is 22:00 UTC on June 11.
    expect(due?.toISOString()).toBe('2024-06-11T22:00:00.000Z')
  })

  it('returns undefined when no offset is given', () => {
    expect(resolveDueDate(undefined, 'UTC')).toBeUndefined()
  })
})
