import type { SqlError } from '@effect/sql/SqlError'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { Diagnosis } from '@lily/shared/diagnosis'
import { DiagnosisNotFoundError } from '@lily/shared/errors/diagnosis'
import { Effect } from 'effect'

export const resolveDiagnosis = (
  diagnosisId: string
): Effect.Effect<
  Diagnosis,
  DiagnosisNotFoundError | SqlError,
  DiagnosisRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser

    const result = yield* repo.markResolved(diagnosisId, userId)

    if (!result) {
      return yield* Effect.fail(new DiagnosisNotFoundError({ diagnosisId }))
    }

    return result
  }).pipe(
    Effect.withSpan('DiagnosisService.resolveDiagnosis', {
      attributes: { 'diagnosis.id': diagnosisId },
    })
  )
