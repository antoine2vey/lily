import type { SqlError } from '@effect/sql/SqlError'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { DiagnosisListResponse } from '@lily/shared/diagnosis'
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
  SqlError,
  DiagnosisRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser

    return yield* repo.findByPlantId({
      plantId: params.plantId,
      userId,
      ...(params.page !== undefined ? { page: params.page } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    })
  }).pipe(
    Effect.withSpan('DiagnosisService.getDiagnoses', {
      attributes: { 'plant.id': params.plantId },
    })
  )
