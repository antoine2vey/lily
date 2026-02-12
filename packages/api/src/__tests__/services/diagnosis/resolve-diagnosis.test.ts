import { mockDiagnoses } from '@lily/api/__tests__/fixtures/diagnoses'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { resolveDiagnosis } from '@lily/api/services/diagnosis/endpoints/resolve-diagnosis'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('resolveDiagnosis', () => {
  const createTestLayer = (userId = 'user-1') =>
    Layer.mergeAll(
      createMockDiagnosisRepository(mockDiagnoses),
      createMockCurrentUser({ id: userId }),
      createMockGCSService()
    )

  it('should mark an active diagnosis as resolved', async () => {
    const result = await Effect.runPromise(
      resolveDiagnosis('diagnosis-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.id).toBe('diagnosis-1')
    expect(result.status).toBe('RESOLVED')
    expect(result.resolvedAt).toBeDefined()
  })

  it('should fail with DiagnosisNotFoundError for non-existent diagnosis', async () => {
    const result = await Effect.runPromiseExit(
      resolveDiagnosis('non-existent').pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when user does not own the diagnosis', async () => {
    // diagnosis-4 belongs to user-2
    const result = await Effect.runPromiseExit(
      resolveDiagnosis('diagnosis-4').pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return the full diagnosis data after resolving', async () => {
    const result = await Effect.runPromise(
      resolveDiagnosis('diagnosis-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.diseaseName).toBe('Powdery Mildew')
    expect(result.severity).toBe('MODERATE')
    expect(result.confidence).toBe(85)
    expect(result.symptoms).toEqual([
      'White powder on leaves',
      'Yellowing edges',
    ])
    expect(result.treatmentSteps).toEqual([
      'Remove affected leaves',
      'Apply neem oil solution',
      'Improve air circulation',
    ])
  })
})
