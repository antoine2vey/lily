import type { IDiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { ToolSet } from 'ai'

import { createDiagnosisTool } from './create-diagnosis'

export interface ToolDeps {
  readonly diagnosisRepo: IDiagnosisRepository
  readonly userId: string
  readonly plantId: string
  readonly imageKey?: string | undefined
}

export const buildPlantChatTools = (deps: ToolDeps): ToolSet => ({
  createDiagnosis: createDiagnosisTool(deps),
})
