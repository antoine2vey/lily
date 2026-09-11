import type { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { RagService } from '@lily/api/services/rag/service'
import type { ToolSet } from 'ai'
import type { Runtime } from 'effect'

import { createDiagnosisTool } from './create-diagnosis'
import { proposeCarePlanTool } from './propose-care-plan'
import { searchPlantKnowledgeTool } from './search-plant-knowledge'

export type ToolContext = DiagnosisRepository | RagService | CarePlanRepository

export interface ToolDeps {
  readonly runtime: Runtime.Runtime<ToolContext>
  readonly userId: string
  readonly imageKey?: string | undefined
  // Present only when the conversation is anchored to a specific plant.
  readonly plantId?: string | undefined
  readonly plantName?: string | undefined
  // IANA timezone used to resolve relative due dates ("in 2 days") to the
  // user's local midnight. Defaults to UTC when unknown.
  readonly timezone?: string | undefined
}

/**
 * Build the toolset for a plant-anchored conversation.
 * Includes `searchPlantKnowledge` (RAG), `createDiagnosis` and
 * `proposeCarePlan`.
 */
export const buildPlantChatTools = (
  deps: ToolDeps & { plantId: string; plantName: string }
): ToolSet => ({
  createDiagnosis: createDiagnosisTool(deps),
  proposeCarePlan: proposeCarePlanTool(deps),
  searchPlantKnowledge: searchPlantKnowledgeTool(deps),
})

/**
 * Build the toolset for a free-form general conversation.
 * Includes `searchPlantKnowledge` (RAG); diagnosis and care-plan creation
 * require a plant binding so they are intentionally omitted.
 */
export const buildGeneralChatTools = (deps: ToolDeps): ToolSet => ({
  searchPlantKnowledge: searchPlantKnowledgeTool(deps),
})
