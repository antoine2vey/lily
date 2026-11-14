import { CarePlans } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import {
  type CreateDiagnosisData,
  DiagnosisRepository,
} from '@lily/api/repositories/diagnosis.repository'
import { CARE_PLAN_MAX_STEPS } from '@lily/shared'
import { type Tool, tool } from 'ai'
import { Array, Effect, Option, pipe } from 'effect'
import { z } from 'zod'

import { carePlanStepSchema, toProposedStep } from './care-plan-step-schema'
import type { ToolDeps } from './index'

type PlantToolDeps = ToolDeps & { permit: PlantPermit<'chat'> }

export const createDiagnosisTool = (deps: PlantToolDeps): Tool =>
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
      Effect.runPromiseWith(deps.runtime)(
        Effect.gen(function* () {
          const repo = yield* DiagnosisRepository
          const carePlans = yield* CarePlans
          const { permit } = deps
          const timezone = pipe(
            Option.fromNullishOr(deps.timezone),
            Option.getOrElse(() => 'UTC')
          )

          const data: CreateDiagnosisData = {
            plantId: permit.plantId,
            userId: deps.userId,
            diseaseName: params.diseaseName,
            severity: params.severity,
            confidence: params.confidence,
            symptoms: params.symptoms,
            // The string column keeps the human-readable list; the structured
            // steps live on the care plan created below.
            treatmentSteps: Array.map(params.treatmentSteps, (s) => s.title),
            ...Option.match(Option.fromNullishOr(params.preventionTips), {
              onNone: () => ({}),
              onSome: (tips) => ({ preventionTips: tips }),
            }),
            ...Option.match(Option.fromNullishOr(deps.imageKey), {
              onNone: () => ({}),
              onSome: (key) => ({ imageKey: key }),
            }),
          }

          return yield* transact(
            Effect.gen(function* () {
              const { planId } = yield* carePlans.propose({
                permit,
                title: params.diseaseName,
                source: 'ai',
                steps: Array.map(params.treatmentSteps, (step) =>
                  toProposedStep(step, timezone)
                ),
              })
              const diagnosis = yield* repo.create(data)
              yield* carePlans.linkToDiagnosis({
                permit,
                planId,
                diagnosisId: diagnosis.id,
              })
              return { diagnosisId: diagnosis.id, carePlanId: planId }
            })
          )
        })
      ),
  })
