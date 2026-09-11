import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CARE_PLAN_MAX_STEPS } from '@lily/shared'
import { tool } from 'ai'
import { Array, Effect, Option, pipe, Runtime } from 'effect'
import { z } from 'zod'

import { carePlanStepSchema, toCreateStepData } from './care-plan-step-schema'
import type { ToolDeps } from './index'

// Plant-only tool: caller is expected to provide plantId.
type PlantToolDeps = ToolDeps & { plantId: string }

export const proposeCarePlanTool = (deps: PlantToolDeps) =>
  tool({
    description:
      'Propose a concrete, actionable care plan (an ordered checklist of steps) for this plant when your advice involves specific things the user should do. The user sees the steps in a card and can add them to their tasks. Do NOT use it for general education or when the user only asked a factual question.',
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .describe(
          'Short plan title in the user\'s language, e.g. "Recover from overwatering"'
        ),
      steps: z
        .array(carePlanStepSchema)
        .min(1)
        .max(CARE_PLAN_MAX_STEPS)
        .describe('Ordered steps, most urgent first'),
    }),
    execute: async (params) =>
      Runtime.runPromise(deps.runtime)(
        Effect.gen(function* () {
          const repo = yield* CarePlanRepository
          const timezone = pipe(
            Option.fromNullable(deps.timezone),
            Option.getOrElse(() => 'UTC')
          )

          const plan = yield* repo.create({
            plantId: deps.plantId,
            userId: deps.userId,
            title: params.title,
            source: 'ai',
            steps: Array.map(params.steps, (step) =>
              toCreateStepData(step, timezone)
            ),
          })

          return { carePlanId: plan.id, plantId: plan.plantId }
        })
      ),
  })
