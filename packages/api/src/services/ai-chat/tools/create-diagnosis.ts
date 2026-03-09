import {
  type CreateDiagnosisData,
  DiagnosisRepository,
} from '@lily/api/repositories/diagnosis.repository'
import { tool } from 'ai'
import { Effect, Option, Runtime } from 'effect'
import { z } from 'zod'

import type { ToolDeps } from './index'

export const createDiagnosisTool = (deps: ToolDeps) =>
  tool({
    description:
      'Create a structured plant diagnosis when you identify a disease, pest, or health issue. Use this when the user describes symptoms or shares a photo showing a problem.',
    inputSchema: z.object({
      diseaseName: z
        .string()
        .describe('Name of the identified disease, pest, or condition'),
      severity: z
        .enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'])
        .describe(
          'Severity level: LOW (cosmetic), MODERATE (needs attention), HIGH (urgent treatment needed), CRITICAL (plant at risk of dying)'
        ),
      confidence: z
        .number()
        .min(0)
        .max(100)
        .describe('Confidence in the diagnosis (0-100)'),
      symptoms: z.array(z.string()).describe('List of observed symptoms'),
      treatmentSteps: z
        .array(z.string())
        .describe('Step-by-step treatment instructions'),
      preventionTips: z
        .array(z.string())
        .optional()
        .describe('Tips to prevent recurrence'),
    }),
    execute: async (params) =>
      Runtime.runPromise(deps.runtime)(
        Effect.gen(function* () {
          const repo = yield* DiagnosisRepository

          const data: CreateDiagnosisData = {
            plantId: deps.plantId,
            userId: deps.userId,
            diseaseName: params.diseaseName,
            severity: params.severity,
            confidence: params.confidence,
            symptoms: params.symptoms,
            treatmentSteps: params.treatmentSteps,
            ...Option.match(Option.fromNullable(params.preventionTips), {
              onNone: () => ({}),
              onSome: (tips) => ({ preventionTips: tips }),
            }),
            ...Option.match(Option.fromNullable(deps.imageKey), {
              onNone: () => ({}),
              onSome: (key) => ({ imageKey: key }),
            }),
          }

          const diagnosis = yield* repo.create(data)

          return { diagnosisId: diagnosis.id }
        })
      ),
  })
