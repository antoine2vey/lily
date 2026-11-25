import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { CHAT_MODEL, FAST_MODEL } from '@lily/api/services/ai/models'
import {
  buildGeneralSystemPrompt,
  buildPlantSystemPrompt,
  formatCareHistoryText,
  formatCarePlansText,
} from '@lily/api/services/ai-chat/build-system-prompt'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import { actorDayTimezone } from '@lily/api/services/plants/helpers/care-context'
import type { PlantView } from '@lily/api/services/plants/helpers/with-plant-access'
import { daysSince, type ZoneName } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, DateTime, Effect } from 'effect'

const CARE_HISTORY_IN_PROMPT = 10

export type ChatModel = typeof CHAT_MODEL | typeof FAST_MODEL

/** What the model is told and which model answers the next turn. */
export interface ChatContext {
  readonly systemPrompt: string
  readonly model: ChatModel
}

export interface PlantChatContext extends ChatContext {
  readonly daysSinceAdded: number
  readonly careHistory: ReadonlyArray<CareLog>
  /** The zone the viewer's care days are counted in. */
  readonly timezone: ZoneName
}

export interface ChatTurn {
  /** The turn carries a photo, which only the vision model reads. */
  readonly withImage: boolean
}

const modelFor = (turn: ChatTurn): ChatModel =>
  turn.withImage ? CHAT_MODEL : FAST_MODEL

/**
 * The context of the next turn of a chat about `plant`, as its viewer sees
 * it. The chat stream and the admin prompt preview both build it here, so
 * the preview shows the prompt the model gets.
 */
export const plantChatContext = ({ plant, view }: PlantView, turn: ChatTurn) =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository
    const carePlanRepo = yield* CarePlanRepository

    const schedules = yield* scheduleRepo.findByPlant(plant.id)
    const { items: careHistory } = yield* careLogRepo.findByPlantId({
      plantId: plant.id,
      limit: CARE_HISTORY_IN_PROMPT,
    })
    const daysSinceAdded = daysSince(plant.dateAdded)

    const carePlans = Array.filter(
      yield* carePlanRepo.findByPlant(plant.id),
      seesCarePlan(view)
    )
    const timezone = yield* actorDayTimezone(plant.owner, view.viewerId)

    const systemPrompt = buildPlantSystemPrompt({
      plant: { ...plant, schedules },
      daysSinceAdded,
      careHistoryText: formatCareHistoryText(careHistory),
      carePlansText: formatCarePlansText(carePlans, timezone),
      timezone,
      now: yield* DateTime.now,
    })

    return {
      systemPrompt,
      model: modelFor(turn),
      daysSinceAdded,
      careHistory,
      timezone,
    } satisfies PlantChatContext
  })

export const generalChatContext = (turn: ChatTurn): ChatContext => ({
  systemPrompt: buildGeneralSystemPrompt(),
  model: modelFor(turn),
})
