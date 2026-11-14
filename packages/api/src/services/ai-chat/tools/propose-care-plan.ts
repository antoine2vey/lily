import { CarePlans } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { CARE_PLAN_MAX_STEPS } from '@lily/shared'
import { type Tool, tool } from 'ai'
import { Array, Effect, Option, pipe } from 'effect'
import { z } from 'zod'

import { carePlanStepSchema, toProposedStep } from './care-plan-step-schema'
import type { ToolDeps } from './index'

type PlantToolDeps = ToolDeps & { permit: PlantPermit<'chat'> }

export const proposeCarePlanTool = (deps: PlantToolDeps): Tool =>
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
      Effect.runPromiseWith(deps.runtime)(
        Effect.gen(function* () {
          const carePlans = yield* CarePlans
          const timezone = pipe(
            Option.fromNullishOr(deps.timezone),
            Option.getOrElse(() => 'UTC')
          )

          const { planId } = yield* carePlans.propose({
            permit: deps.permit,
            title: params.title,
            source: 'ai',
            steps: Array.map(params.steps, (step) =>
              toProposedStep(step, timezone)
            ),
          })

          return { carePlanId: planId, plantId: deps.permit.plantId }
        })
      ),
  })
