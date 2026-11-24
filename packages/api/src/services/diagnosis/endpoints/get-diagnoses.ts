import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { resolveImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { SeenDiagnosisList } from '@lily/api/services/diagnosis/api'
import type { GCSService } from '@lily/api/services/file/gcs'
import type { GCSUploadError } from '@lily/api/services/file/gcs-errors'
import {
  authorScope,
  type KnowledgeView,
} from '@lily/api/services/plants/helpers/plant-access'
import { seenByCaller } from '@lily/api/services/plants/helpers/seen'
import { Effect } from 'effect'
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
  SeenDiagnosisList,
  SqlError | GCSUploadError,
  DiagnosisRepository | GCSService | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository

    const result = yield* repo.findByPlantId({
      plantId: params.plantId,
      author: authorScope(params.view),
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })

    const resolvedItems = yield* resolveImageUrls(
      yield* Effect.forEach(result.items, seenByCaller)
    )

    return { ...result, items: resolvedItems }
  }).pipe(
    Effect.withSpan('DiagnosisService.getDiagnoses', {
      attributes: { 'plant.id': params.plantId },
    })
  )
