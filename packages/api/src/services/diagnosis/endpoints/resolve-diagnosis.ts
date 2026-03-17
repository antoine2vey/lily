import type { SqlError } from '@effect/sql/SqlError'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { resolveImageUrl } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { Diagnosis } from '@lily/shared/diagnosis'
import { DiagnosisNotFoundError } from '@lily/shared/errors/diagnosis'
import type { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import { Effect } from 'effect'

export const resolveDiagnosis = (
  diagnosisId: string
): Effect.Effect<
  Diagnosis,
  DiagnosisNotFoundError | SqlError | GCSUploadError,
  DiagnosisRepository | CurrentUser | GCSService
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser

    const result = yield* repo.markResolved(diagnosisId, userId)

    if (!result) {
      return yield* new DiagnosisNotFoundError({ diagnosisId })
    }

    // Resolve raw GCS key to signed URL
    const resolvedUrl = yield* resolveImageUrl(result.imageUrl)
    return { ...result, imageUrl: resolvedUrl }
  }).pipe(
    Effect.withSpan('DiagnosisService.resolveDiagnosis', {
      attributes: { 'diagnosis.id': diagnosisId },
    })
  )
