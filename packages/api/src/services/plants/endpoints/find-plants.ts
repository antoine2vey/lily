import { type PrismaError, PrismaService } from '@lily/db'
import type { PlantsListResponse } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
}): Effect.Effect<PlantsListResponse, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService
    const page = params.page ?? 1
    const limit = params.limit ?? 10
    const offset = (page - 1) * limit

    // Get total count
    const total = yield* prisma.plant.count()

    // Get plants with pagination
    const plants = yield* prisma.plant.findMany({
      select: plantSelector,
      skip: offset,
      take: limit,
      orderBy: params.sort === 'name' ? { name: 'asc' } : { dateAdded: 'desc' },
    })

    return {
      plants,
      total,
      page,
      limit,
    }
  })
