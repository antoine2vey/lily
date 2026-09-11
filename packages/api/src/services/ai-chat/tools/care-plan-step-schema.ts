import { CARE_TYPES, startOfDay } from '@lily/shared'
import { DateTime, Duration, Option, pipe } from 'effect'
import { z } from 'zod'

/**
 * Step shape shared by `proposeCarePlan` and the structured treatment steps of
 * `createDiagnosis`. Kept minimal on purpose: the model only needs to know
 * what to do, whether it is one of the four schedule-backed care actions, and
 * roughly when.
 */
export const carePlanStepSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe(
      'Short imperative instruction, e.g. "Repot into fresh, well-draining soil"'
    ),
  description: z
    .string()
    .optional()
    .describe('One or two sentences of extra detail, only if useful'),
  // Required with an explicit "none" so the model has to decide, instead of
  // eagerly filling an optional field. Anything that is not literally one of
  // the four schedule-backed actions must be "none": a wrong tag moves a real
  // watering/misting/repotting date when the plan is accepted.
  careType: z
    .enum([...CARE_TYPES, 'none'])
    .describe(
      'Use "none" for almost every step. Only use "watering" when the step is literally watering the soil, "fertilization" when it is feeding/fertilizing, "misting" when it is misting foliage for humidity, "repotting" when it is moving the plant into a new pot/soil. Isolating the plant, washing or wiping leaves, applying insecticide or neem oil, pruning, moving it to another spot, monitoring, checking, waiting are all "none".'
    ),
  dueInDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe(
      'Days from today when the step should be done. 0 = today, 1 = tomorrow. OMIT it when the step has no specific timing (e.g. "monitor", "keep isolated"); do not default everything to 0'
    ),
})

export type CarePlanStepInput = z.infer<typeof carePlanStepSchema>

/**
 * Resolves a relative day offset to the user's local midnight of that day,
 * so a step "due in 2 days" lands on the same calendar day the care tasks
 * bucket it under.
 */
export const resolveDueDate = (
  dueInDays: number | undefined,
  timezone: string,
  now: DateTime.Utc = DateTime.unsafeNow()
): Date | undefined =>
  pipe(
    Option.fromNullable(dueInDays),
    Option.map((days) =>
      DateTime.toDateUtc(
        DateTime.addDuration(startOfDay(now, timezone), Duration.days(days))
      )
    ),
    Option.getOrUndefined
  )

export const toCreateStepData = (
  step: CarePlanStepInput,
  timezone: string,
  now?: DateTime.Utc
) => ({
  title: step.title,
  description: step.description,
  careType: step.careType === 'none' ? undefined : step.careType,
  dueDate: resolveDueDate(step.dueInDays, timezone, now),
})
