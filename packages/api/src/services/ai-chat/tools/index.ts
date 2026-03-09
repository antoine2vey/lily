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
  readonly plantId: string
  readonly imageKey?: string | undefined
  readonly plantName: string
}

export const buildPlantChatTools = (deps: ToolDeps): ToolSet => ({
  createDiagnosis: createDiagnosisTool(deps),
  searchPlantKnowledge: searchPlantKnowledgeTool(deps),
})
