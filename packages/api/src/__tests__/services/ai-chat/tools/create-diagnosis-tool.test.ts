import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { chatPermit, createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { LifeState } from '@lily/api/contexts/care/domain/care-plant'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { createDiagnosisTool } from '@lily/api/services/ai-chat/tools/create-diagnosis'
import type { ToolExecutionOptions } from 'ai'
import { Array, Effect, Layer, ManagedRuntime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const stubToolOptions: ToolExecutionOptions<{}> = {
  toolCallId: 'test-call',
  messages: [],
  context: {},
}

const runtimeOver = (plant = createTestCarePlant('plant-1')) => {
  const plans = createCarePlanRows()
  return ManagedRuntime.make(
    Layer.mergeAll(
      createInMemoryCare([plant], { plans }).layer,
      plans.layer,
      createMockDiagnosisRepository([]),
      createMockRagService()
    )
  )
}

const diagnosesOf = (plantId: string) =>
  Effect.flatMap(DiagnosisRepository, (repo) =>
    repo.findByPlantId({ plantId, author: Option.none() })
  ).pipe(Effect.map(({ items }) => items))

const plansOf = (plantId: string) =>
  Effect.flatMap(CarePlanRepository, (repo) => repo.findByPlant(plantId))

const baseParams = {
  diseaseName: 'Root rot',
  severity: 'HIGH' as const,
  confidence: 85,
  symptoms: ['Yellow leaves', 'Mushy roots'],
  treatmentSteps: [
    { title: 'Remove affected roots', careType: 'none' as const },
    {
      title: 'Repot in fresh soil',
      careType: 'repotting' as const,
      dueInDays: 0,
    },
  ],
}

describe('createDiagnosisTool', () => {
  it('creates diagnosis with all fields including optional ones', async () => {
    const managedRuntime = runtimeOver()
    const diagTool = createDiagnosisTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
      imageKey: 'uploads/photo.jpg',
    })

    const result = (await diagTool.execute!(
      {
        ...baseParams,
        preventionTips: ['Avoid overwatering', 'Ensure good drainage'],
      },
      stubToolOptions
    )) as { diagnosisId: string; carePlanId: string }

    expect(await managedRuntime.runPromise(diagnosesOf('plant-1'))).toEqual([
      expect.objectContaining({
        id: result.diagnosisId,
        userId: 'user-1',
        preventionTips: ['Avoid overwatering', 'Ensure good drainage'],
        imageUrl: 'uploads/photo.jpg',
        treatmentSteps: ['Remove affected roots', 'Repot in fresh soil'],
      }),
    ])
    await managedRuntime.dispose()
  })

  it('creates diagnosis without optional fields', async () => {
    const managedRuntime = runtimeOver()
    const diagTool = createDiagnosisTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
    })

    const result = (await diagTool.execute!(baseParams, stubToolOptions)) as {
      diagnosisId: string
    }

    expect(result.diagnosisId).toMatch(/^diagnosis-/)
    await managedRuntime.dispose()
  })

  it('writes the treatment as a proposed plan linked to the diagnosis', async () => {
    const managedRuntime = runtimeOver()
    const diagTool = createDiagnosisTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
    })

    const result = (await diagTool.execute!(baseParams, stubToolOptions)) as {
      diagnosisId: string
      carePlanId: string
    }

    const [plan, ...others] = await managedRuntime.runPromise(
      plansOf('plant-1')
    )
    expect(others).toEqual([])
    expect(plan).toMatchObject({
      id: result.carePlanId,
      diagnosisId: result.diagnosisId,
      title: 'Root rot',
      status: 'proposed',
      source: 'ai',
      userId: 'user-1',
    })
    expect(
      Array.map(plan?.steps ?? [], ({ title, careType }) => [title, careType])
    ).toEqual([
      ['Remove affected roots', undefined],
      ['Repot in fresh soil', 'repotting'],
    ])
    await managedRuntime.dispose()
  })

  it('answers that the plant does not exist when it is dead, and writes neither a diagnosis nor a plan (a change: it used to write both)', async () => {
    const managedRuntime = runtimeOver(
      createTestCarePlant('plant-1', { life: LifeState.Dead() })
    )
    const diagTool = createDiagnosisTool({
      runtime: await managedRuntime.context(),
      userId: 'user-1',
      permit: chatPermit('plant-1'),
      plantName: 'Monstera',
    })

    await expect(
      diagTool.execute!(baseParams, stubToolOptions)
    ).rejects.toMatchObject({ _tag: 'PlantNotFoundError' })

    expect(await managedRuntime.runPromise(diagnosesOf('plant-1'))).toEqual([])
    expect(await managedRuntime.runPromise(plansOf('plant-1'))).toEqual([])
    await managedRuntime.dispose()
  })

  it('stores the plant of the permit and the user of the conversation', async () => {
    const managedRuntime = runtimeOver(createTestCarePlant('plant-99'))
    const diagTool = createDiagnosisTool({
      runtime: await managedRuntime.context(),
      userId: 'owner-42',
      permit: chatPermit('plant-99', 'owner-42'),
      plantName: 'Pothos',
    })

    await diagTool.execute!(baseParams, stubToolOptions)

    expect(await managedRuntime.runPromise(diagnosesOf('plant-99'))).toEqual([
      expect.objectContaining({
        plantId: 'plant-99',
        userId: 'owner-42',
        treatmentSteps: ['Remove affected roots', 'Repot in fresh soil'],
      }),
    ])
    await managedRuntime.dispose()
  })
})
