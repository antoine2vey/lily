import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import type {
  CreateDiagnosisData,
  IDiagnosisRepository,
} from '@lily/api/repositories/diagnosis.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { createDiagnosisTool } from '@lily/api/services/ai-chat/tools/create-diagnosis'
import type { ToolDeps } from '@lily/api/services/ai-chat/tools/index'
import { Effect, Layer, ManagedRuntime } from 'effect'

const testLayer = Layer.mergeAll(
  createMockDiagnosisRepository([]),
  createMockRagService()
)

const baseParams = {
  diseaseName: 'Root rot',
  severity: 'HIGH' as const,
  confidence: 85,
  symptoms: ['Yellow leaves', 'Mushy roots'],
  treatmentSteps: ['Remove affected roots', 'Repot in fresh soil'],
}

describe('createDiagnosisTool', () => {
  it('creates diagnosis with all fields including optional ones', async () => {
    const managedRuntime = ManagedRuntime.make(testLayer)
    const rt = await managedRuntime.runtime()
    const deps: ToolDeps = {
      runtime: rt,
      userId: 'user-1',
      plantId: 'plant-1',
      plantName: 'Monstera',
      imageKey: 'uploads/photo.jpg',
    }

    const diagTool = createDiagnosisTool(deps)
    const result = await diagTool.execute(
      {
        ...baseParams,
        preventionTips: ['Avoid overwatering', 'Ensure good drainage'],
      },
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    expect(result.diagnosisId).toBeDefined()
    expect(result.diagnosisId).toMatch(/^diagnosis-/)
    await managedRuntime.dispose()
  })

  it('creates diagnosis without optional fields', async () => {
    const managedRuntime = ManagedRuntime.make(testLayer)
    const rt = await managedRuntime.runtime()
    const deps: ToolDeps = {
      runtime: rt,
      userId: 'user-1',
      plantId: 'plant-1',
      plantName: 'Monstera',
    }

    const diagTool = createDiagnosisTool(deps)
    const result = await diagTool.execute(
      baseParams,
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    expect(result.diagnosisId).toBeDefined()
    expect(result.diagnosisId).toMatch(/^diagnosis-/)
    await managedRuntime.dispose()
  })

  it('stores correct plantId and userId from deps', async () => {
    const createCalls: CreateDiagnosisData[] = []
    const spyLayer = Layer.succeed(DiagnosisRepository, {
      create: (data: CreateDiagnosisData) => {
        createCalls.push(data)
        return Effect.succeed({
          id: 'diagnosis-spy',
          plantId: data.plantId,
          userId: data.userId,
          diseaseName: data.diseaseName,
          severity: data.severity,
          confidence: data.confidence,
          symptoms: data.symptoms,
          treatmentSteps: data.treatmentSteps,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      },
      findByPlantId: () => Effect.succeed({ items: [], total: 0 }),
      findById: () => Effect.succeed(null),
      linkChatMessage: () => Effect.void,
      markResolved: () => Effect.succeed(null),
    } as unknown as IDiagnosisRepository)

    const trackingLayer = Layer.mergeAll(spyLayer, createMockRagService())
    const managedRuntime = ManagedRuntime.make(trackingLayer)
    const rt = await managedRuntime.runtime()
    const deps: ToolDeps = {
      runtime: rt,
      userId: 'owner-42',
      plantId: 'plant-99',
      plantName: 'Pothos',
    }

    const diagTool = createDiagnosisTool(deps)
    await diagTool.execute(
      baseParams,
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({
      plantId: 'plant-99',
      userId: 'owner-42',
    })
    await managedRuntime.dispose()
  })
})
