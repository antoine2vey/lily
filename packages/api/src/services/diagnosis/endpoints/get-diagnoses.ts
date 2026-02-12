import type { SqlError } from '@effect/sql/SqlError'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { resolveImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { DiagnosisListResponse } from '@lily/shared/diagnosis'
import type { GCSService, GCSUploadError } from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

export interface GetDiagnosesParams {
  plantId: string
  page?: number
  limit?: number
}

export const getDiagnoses = (
  params: GetDiagnosesParams
): Effect.Effect<
  DiagnosisListResponse,
  SqlError | GCSUploadError,
  DiagnosisRepository | CurrentUser | GCSService
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser

    const result = yield* repo.findByPlantId({
      plantId: params.plantId,
      userId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })

    // Resolve any raw GCS keys to signed URLs (batch, parallel)
    const resolvedItems = yield* resolveImageUrls(result.items)

    return { ...result, items: resolvedItems }
  }).pipe(
    Effect.withSpan('DiagnosisService.getDiagnoses', {
      attributes: { 'plant.id': params.plantId },
    })
  )
