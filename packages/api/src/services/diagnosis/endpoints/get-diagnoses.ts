import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { resolveImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import {
  asSeenBy,
  authorScope,
  type KnowledgeView,
} from '@lily/api/services/plants/helpers/plant-access'
import type { DiagnosisListResponse } from '@lily/shared/diagnosis'
import type { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface GetDiagnosesParams {
  plantId: string
  view: KnowledgeView
  page?: number
  limit?: number
}

export const getDiagnoses = (
  params: GetDiagnosesParams
): Effect.Effect<
  DiagnosisListResponse,
  SqlError | GCSUploadError,
  DiagnosisRepository | GCSService
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository

    const result = yield* repo.findByPlantId({
      plantId: params.plantId,
      author: authorScope(params.view),
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })

    // Resolve any raw GCS keys to signed URLs (batch, parallel)
    const resolvedItems = yield* resolveImageUrls(
      Array.map(result.items, asSeenBy(params.view.viewerId))
    )

    return { ...result, items: resolvedItems }
  }).pipe(
    Effect.withSpan('DiagnosisService.getDiagnoses', {
      attributes: { 'plant.id': params.plantId },
    })
  )
