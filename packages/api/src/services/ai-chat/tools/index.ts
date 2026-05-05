import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { RagService } from '@lily/api/services/rag/service'
import type { ToolSet } from 'ai'
import type { Runtime } from 'effect'

import { createDiagnosisTool } from './create-diagnosis'
import { searchPlantKnowledgeTool } from './search-plant-knowledge'

export type ToolContext = DiagnosisRepository | RagService

export interface ToolDeps {
  readonly runtime: Runtime.Runtime<ToolContext>
  readonly userId: string
  readonly imageKey?: string | undefined
  // Present only when the conversation is anchored to a specific plant.
  readonly plantId?: string | undefined
  readonly plantName?: string | undefined
}

/**
 * Build the toolset for a plant-anchored conversation.
 * Includes both `searchPlantKnowledge` (RAG) and `createDiagnosis`.
 */
export const buildPlantChatTools = (
  deps: ToolDeps & { plantId: string; plantName: string }
): ToolSet => ({
  createDiagnosis: createDiagnosisTool(deps),
  searchPlantKnowledge: searchPlantKnowledgeTool(deps),
})

/**
 * Build the toolset for a free-form general conversation.
 * Includes `searchPlantKnowledge` (RAG); diagnosis creation requires
 * a plant binding so it is intentionally omitted.
 */
export const buildGeneralChatTools = (deps: ToolDeps): ToolSet => ({
  searchPlantKnowledge: searchPlantKnowledgeTool(deps),
})
