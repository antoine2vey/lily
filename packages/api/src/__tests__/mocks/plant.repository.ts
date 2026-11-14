import type { MockMembership } from '@lily/api/__tests__/mocks/canopy.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import {
  ownerColumns,
  sameOwner,
  withCanopyOwner,
  withOwner,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import {
  type FindPhotosParams,
  type FindPlantsParams,
  type IPlantRepository,
  matchesCareFilter,
  PlantRepository,
  type PlantWithRoom,
  seeCareWithLastDays,
} from '@lily/api/repositories/plant.repository'
import type { plants } from '@lily/db/schema'
import { type Orientation, type PlantOwner, paginate } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'
import { Array, DateTime, Effect, Layer, Option, Order, pipe } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockRoom {
  id: string
  name: string
  icon: string
  luminosity: number | null
  orientation?: Orientation | null
  isOutdoor: boolean
}

export interface MockCaretakingPlant {
  plant: PlantRecord
  ownerName: string | null
}

interface MockPlantRepositoryData {
  plants: PlantRecord[]
  sharesPlantsArray?: boolean
  photos?: PlantPhoto[]
  rooms?: MockRoom[]
  caretakingPlants?: MockCaretakingPlant[]
  memberships?: MockMembership[]
  schedules?: CareScheduleRow[]
  /** Care timezone by owner id (user id or canopy id). Defaults to UTC. */
  timezones?: Readonly<Record<string, string>>
}

export const createMockPlantRepository = (
  data: MockPlantRepositoryData
): Layer.Layer<PlantRepository> => {
  // Shallow copy each plant so mutations don't leak between tests
  const plantsData: PlantRecord[] = data.sharesPlantsArray
    ? data.plants
    : Array.map(data.plants, (p) => ({ ...p }))
  // Keep a reference to the original array for health scheduler mutations
  const originalPlantsData = data.plants
  const photos = Option.getOrElse(
    Option.fromNullishOr(data.photos),
    () => [] as PlantPhoto[]
  )
  const rooms = Option.getOrElse(
    Option.fromNullishOr(data.rooms),
    () => [] as MockRoom[]
  )
  const caretakingPlants = Option.getOrElse(
    Option.fromNullishOr(data.caretakingPlants),
    () => [] as MockCaretakingPlant[]
  )
  const schedulesData = Option.getOrElse(
    Option.fromNullishOr(data.schedules),
    () => [] as CareScheduleRow[]
  )
  const memberships = Option.getOrElse(
    Option.fromNullishOr(data.memberships),
    () => [] as MockMembership[]
  )

  const canopyNameFor = (canopyId: string) =>
    pipe(
      Array.findFirst(memberships, (m) => m.canopyId === canopyId),
      Option.flatMap((m) => Option.fromNullishOr(m.canopyName)),
      Option.getOrElse(() => 'Canopy')
    )

  // The real care view over in-memory schedules, which hold no care log.
  const careOf = (p: PlantRecord) =>
    seeCareWithLastDays(p, {
      schedules: pipe(
        Array.filter(schedulesData, (s) => s.plantId === p.id),
        Array.map((s) => ({ ...s, lastCareLogDay: null }))
      ),
      careTimezone: data.timezones?.[p.canopyId ?? p.userId ?? ''] ?? 'UTC',
      now: DateTime.nowUnsafe(),
    })

  const toPlantWithRoom = (p: PlantRecord): PlantWithRoom => {
    if (p.canopyId === null) {
      return {
        ...withUserOwner(p),
        ...careOf(p),
        room: resolveRoom(p.roomId),
        ownership: 'owned' as const,
        ownerName: null,
      }
    }
    const plant = withCanopyOwner(p)
    return {
      ...plant,
      ...careOf(p),
      room: resolveRoom(p.roomId),
      ownership: 'canopy' as const,
      ownerName: null,
      canopy: { id: plant.owner.canopyId, name: canopyNameFor(p.canopyId) },
      createdBy: null,
    }
  }

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullishOr(roomId),
      Option.flatMap((id) => Array.findFirst(rooms, (r) => r.id === id)),
      Option.map((r) => ({
        ...r,
        orientation: Option.getOrNull(Option.fromNullishOr(r.orientation)),
      })),
      Option.getOrNull
    )

  const applyFilters = (
    items: PlantRecord[],
    params: FindPlantsParams
  ): PlantRecord[] => {
    let filtered = items

    // Mirrors the live repository: `dead` lists the cemetery, everything else
    // is living-only unless an admin caller passes `includeDead`.
    if (params.filter === 'dead') {
      filtered = Array.filter(filtered, (p) => p.diedAt !== null)
    } else if (!params.includeDead) {
      filtered = Array.filter(filtered, (p) => p.diedAt === null)
    }

    return filtered
  }

  const patchPlant = (
    id: string,
    owner: PlantOwner,
    patch: Partial<PlantRecord>
  ) => {
    const idxOption = Array.findFirstIndex(
      plantsData,
      (p) => p.id === id && sameOwner(withOwner(p).owner, owner)
    )
    if (Option.isNone(idxOption)) return Effect.succeed(null)
    const idx = idxOption.value
    const existing = plantsData[idx]
    if (!existing) return Effect.succeed(null)
    const updated: PlantRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    }
    plantsData[idx] = updated
    const origIdxOption = Array.findFirstIndex(
      originalPlantsData,
      (p) => p.id === id
    )
    if (Option.isSome(origIdxOption)) {
      const origPlant = originalPlantsData[origIdxOption.value]
      if (origPlant) {
        Object.assign(origPlant, patch)
      }
    }
    return Effect.succeed(withOwner(updated))
  }

  const repo: IPlantRepository = {
    findAll: (params: FindPlantsParams) => {
      const page = pipe(
        Option.fromNullishOr(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullishOr(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      let filtered = [...plantsData]

      if (params.userId) {
        filtered = Array.filter(filtered, (p) => p.userId === params.userId)
      }

      filtered = applyFilters(filtered, params)

      const ownedItems: PlantWithRoom[] = Array.map(filtered, toPlantWithRoom)

      // Add caretaking plants when requested
      const caretakingItems: PlantWithRoom[] =
        params.includeCaretaking &&
        Array.isReadonlyArrayNonEmpty(caretakingPlants)
          ? pipe(
              Array.map(caretakingPlants, (cp) => cp.plant),
              (plants) => applyFilters(plants, params),
              Array.map((p) => ({
                ...withUserOwner(p),
                ...careOf(p),
                room: resolveRoom(p.roomId),
                ownership: 'caretaking' as const,
                ownerName: pipe(
                  Array.findFirst(
                    caretakingPlants,
                    (cp) => cp.plant.id === p.id
                  ),
                  Option.map((cp) => cp.ownerName),
                  Option.getOrNull
                ),
              }))
            )
          : []

      const memberCanopyIds = pipe(
        memberships,
        Array.filter((m) => m.userId === params.userId),
        Array.map((m) => m.canopyId)
      )
      const canopyItems: PlantWithRoom[] = params.includeCanopy
        ? pipe(
            plantsData,
            Array.filter(
              (p) =>
                p.canopyId !== null &&
                Array.contains(memberCanopyIds, p.canopyId)
            ),
            (plants) => applyFilters(plants, params),
            Array.map(toPlantWithRoom)
          )
        : []

      const allItems = pipe(
        ownedItems,
        Array.appendAll(caretakingItems),
        Array.appendAll(canopyItems),
        Array.filter(matchesCareFilter(params.filter))
      )

      const sortOrder =
        params.sort === 'name'
          ? Order.mapInput(Order.String, (p: PlantWithRoom) => p.name)
          : Order.mapInput(Order.flip(Order.Number), (p: PlantWithRoom) =>
              p.dateAdded.getTime()
            )
      const sorted = Array.sort(allItems, sortOrder)

      const total = Array.length(sorted)
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))

      return Effect.succeed({
        items,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      })
    },

    findLivingByCanopy: (canopyId: string) =>
      Effect.succeed(
        pipe(
          Array.filter(
            plantsData,
            (p) => p.canopyId === canopyId && p.diedAt === null
          ),
          Array.map(toPlantWithRoom)
        )
      ),

    findByIds: (ids: readonly string[]) =>
      Effect.succeed(
        pipe(
          Array.filter(plantsData, (p) => Array.contains(ids, p.id)),
          Array.map(withOwner)
        )
      ),

    findByIdsForKeyShare: (ids: readonly string[]) =>
      Effect.succeed(
        pipe(
          Array.filter(plantsData, (p) => Array.contains(ids, p.id)),
          Array.map(withOwner)
        )
      ),

    findPersonalReminderPlantIds: (userId: string) =>
      Effect.succeed(
        pipe(
          Array.filter(plantsData, (p) => p.userId === userId),
          Array.map((p) => p.id)
        )
      ),

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plantsData, (p) => p.id === id),
          Option.map(toPlantWithRoom),
          Option.getOrNull
        )
      ),

    update: (id, owner, updateData) => patchPlant(id, owner, updateData),

    findPhotos: (params: FindPhotosParams) => {
      const page = pipe(
        Option.fromNullishOr(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullishOr(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      const filtered = Array.filter(photos, (p) => p.plantId === params.plantId)
      const total = Array.length(filtered)
      const items = pipe(filtered, Array.drop(offset), Array.take(limit))

      return Effect.succeed(paginate(items, total, page, limit))
    },

    addPhoto: (plantId: string, url: string) => {
      const newPhoto: PlantPhoto = {
        id: `photo-${crypto.randomUUID()}`,
        url,
        takenAt: new Date(),
        plantId,
      }
      return Effect.succeed(newPhoto)
    },

    addPhotos: (photosData) =>
      Effect.succeed(
        Array.map(photosData, (p) => ({
          id: `photo-${crypto.randomUUID()}`,
          url: p.url,
          takenAt: p.takenAt,
          plantId: p.plantId,
        }))
      ),

    deletePhoto: (photoId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(photos, (p) => p.id === photoId),
          Option.getOrNull
        )
      ),

    deletePhotoByPlantId: () => Effect.void,
  }

  return Layer.succeed(PlantRepository, repo)
}
