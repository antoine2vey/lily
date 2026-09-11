import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import {
  type CreateDiagnosisData,
  DiagnosisRepository,
} from '@lily/api/repositories/diagnosis.repository'
import { CARE_PLAN_MAX_STEPS } from '@lily/shared'
import { tool } from 'ai'
import { Array, Effect, Option, pipe, Runtime } from 'effect'
import { z } from 'zod'

import { carePlanStepSchema, toCreateStepData } from './care-plan-step-schema'
import type { ToolDeps } from './index'

// Plant-only tool: caller is expected to provide plantId.
type PlantToolDeps = ToolDeps & { plantId: string }

export const createDiagnosisTool = (deps: PlantToolDeps) =>
  tool({
    description:
      'Create a structured plant diagnosis when you identify a disease, pest, or health issue. Use this when the user describes symptoms or shares a photo showing a problem. The treatment steps automatically become a proposed care plan the user can add to their tasks.',
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
        .array(carePlanStepSchema)
        .min(1)
        .max(CARE_PLAN_MAX_STEPS)
        .describe('Step-by-step treatment instructions, most urgent first'),
      preventionTips: z
        .array(z.string())
        .optional()
        .describe('Tips to prevent recurrence'),
    }),
    execute: async (params) =>
      Runtime.runPromise(deps.runtime)(
        Effect.gen(function* () {
          const repo = yield* DiagnosisRepository
          const carePlanRepo = yield* CarePlanRepository
          const timezone = pipe(
            Option.fromNullable(deps.timezone),
            Option.getOrElse(() => 'UTC')
          )

          const data: CreateDiagnosisData = {
            plantId: deps.plantId,
            userId: deps.userId,
            diseaseName: params.diseaseName,
            severity: params.severity,
            confidence: params.confidence,
            symptoms: params.symptoms,
            // The string column keeps the human-readable list; the structured
            // steps live on the care plan created below.
            treatmentSteps: Array.map(params.treatmentSteps, (s) => s.title),
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

          const plan = yield* carePlanRepo.create({
            plantId: deps.plantId,
            userId: deps.userId,
            title: params.diseaseName,
            source: 'ai',
            diagnosisId: diagnosis.id,
            steps: Array.map(params.treatmentSteps, (step) =>
              toCreateStepData(step, timezone)
            ),
          })

          return { diagnosisId: diagnosis.id, carePlanId: plan.id }
        })
      ),
  })
