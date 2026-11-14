import type { CarePlans } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { RagService } from '@lily/api/services/rag/service'
import type { ToolSet } from 'ai'
import type { Context } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import { createDiagnosisTool } from './create-diagnosis'
import { proposeCarePlanTool } from './propose-care-plan'
import { searchPlantKnowledgeTool } from './search-plant-knowledge'

export type ToolContext =
  | DiagnosisRepository
  | RagService
  | CarePlans
  | SqlClient.SqlClient
  | Outbox

export interface ToolDeps {
  readonly runtime: Context.Context<ToolContext>
  readonly userId: string
  readonly imageKey?: string | undefined
  // Present only when the conversation is anchored to a specific plant.
  readonly permit?: PlantPermit<'chat'> | undefined
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
  deps: ToolDeps & { permit: PlantPermit<'chat'>; plantName: string }
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
