import {
  type StoredSchedule,
  seeLivingPlantCare,
} from '@lily/api/contexts/care'
import {
  type DelegatedTaskRow,
  type DelegationDetailRow,
  type DelegationListRow,
  type DelegationPlantRow,
  DelegationRepository,
  type DelegationRow,
  type IDelegationRepository,
} from '@lily/api/repositories/delegation.repository'
import { CareDays } from '@lily/shared'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'

interface MockUser {
  id: string
  name: string | null
  image: string | null
}

interface MockPlant {
  id: string
  name: string
  imageUrl: string | null
  schedules: Omit<StoredSchedule, 'dueDay'>[]
  health: string
}

interface MockDelegationPlantLink {
  delegationId: string
  plantId: string
}

export interface MockDelegationRepositoryData {
  delegations?: DelegationRow[] | undefined
  delegationPlants?: MockDelegationPlantLink[] | undefined
  users?: MockUser[] | undefined
  plants?: MockPlant[] | undefined
}

export const createMockDelegationRepository = (
  data: MockDelegationRepositoryData = {}
): Layer.Layer<DelegationRepository> => {
  const delegations: DelegationRow[] = data.delegations ?? []
  const dpLinks: MockDelegationPlantLink[] = data.delegationPlants ?? []
  const mockUsers: MockUser[] = data.users ?? []
  const mockPlants: MockPlant[] = data.plants ?? []

  const findUser = (id: string) =>
    pipe(
      Array.findFirst(mockUsers, (u) => u.id === id),
      Option.getOrNull
    )

  const findPlant = (id: string) =>
    pipe(
      Array.findFirst(mockPlants, (p) => p.id === id),
      // Status as the live repository reports it, on a UTC care day.
      Option.map((p) => ({
        ...p,
        schedules: seeLivingPlantCare(
          'HEALTHY',
          Array.map(p.schedules, (schedule) => ({
            ...schedule,
            dueDay: CareDays.of(
              DateTime.makeUnsafe(schedule.nextCareAt),
              'UTC'
            ),
          })),
          'UTC',
          DateTime.nowUnsafe()
        ).schedules,
      })),
      Option.getOrNull
    )

  const repo: IDelegationRepository = {
    findById: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(delegations, (d) => d.id === id),
          Option.map((d) => {
            const owner = findUser(d.ownerId)
            const caretaker = findUser(d.caretakerId)
            const plantLinks = Array.filter(
              dpLinks,
              (l) => l.delegationId === d.id
            )
            const plantRows: DelegationPlantRow[] = Array.getSomes(
              Array.map(plantLinks, (l) =>
                pipe(
                  Option.fromNullishOr(findPlant(l.plantId)),
                  Option.map((p) => ({
                    id: p.id,
                    name: p.name,
                    imageUrl: p.imageUrl,
                    schedules: p.schedules,
                    health: p.health,
                  }))
                )
              )
            )
            return {
              ...d,
              ownerName: owner?.name ?? null,
              ownerImage: owner?.image ?? null,
              caretakerName: caretaker?.name ?? null,
              caretakerImage: caretaker?.image ?? null,
              plants: plantRows,
            } as DelegationDetailRow
          }),
          Option.getOrNull
        )
      ),

    findByUser: (params) =>
      Effect.succeed(
        pipe(
          delegations,
          Array.filter((d) => {
            const matchesRole =
              params.role === 'both'
                ? d.ownerId === params.userId || d.caretakerId === params.userId
                : params.role === 'owner'
                  ? d.ownerId === params.userId
                  : d.caretakerId === params.userId
            const matchesStatus =
              !params.status ||
              params.status.length === 0 ||
              Array.contains(params.status, d.status)
            return matchesRole && matchesStatus
          }),
          (filtered) => {
            const offset = (params.page - 1) * params.limit
            const items: DelegationListRow[] = pipe(
              filtered,
              Array.drop(offset),
              Array.take(params.limit),
              Array.map((d) => {
                const owner = findUser(d.ownerId)
                const caretaker = findUser(d.caretakerId)
                const plantCount = Array.filter(
                  dpLinks,
                  (l) => l.delegationId === d.id
                ).length
                return {
                  id: d.id,
                  ownerId: d.ownerId,
                  ownerName: owner?.name ?? null,
                  ownerImage: owner?.image ?? null,
                  caretakerId: d.caretakerId,
                  caretakerName: caretaker?.name ?? null,
                  caretakerImage: caretaker?.image ?? null,
                  status: d.status,
                  startDate: d.startDate,
                  endDate: d.endDate,
                  plantCount,
                  createdAt: d.createdAt,
                }
              })
            )
            return { items, total: filtered.length }
          }
        )
      ),

    findActiveDelegationsForCaretaker: (caretakerId) =>
      Effect.succeed(
        pipe(
          delegations,
          Array.filter(
            (d) => d.caretakerId === caretakerId && d.status === 'active'
          ),
          Array.flatMap((d) => {
            const plantLinks = Array.filter(
              dpLinks,
              (l) => l.delegationId === d.id
            )
            const owner = findUser(d.ownerId)
            return Array.getSomes(
              Array.map(plantLinks, (l) =>
                pipe(
                  Option.fromNullishOr(findPlant(l.plantId)),
                  Option.map(
                    (p): DelegatedTaskRow => ({
                      delegationId: d.id,
                      plantId: p.id,
                      plantName: p.name,
                      plantImage: p.imageUrl,
                      ownerName: owner?.name ?? null,
                      ownerImage: owner?.image ?? null,
                      schedules: p.schedules,
                      health: p.health,
                    })
                  )
                )
              )
            )
          })
        )
      ),

    tends: (userId, plantId) =>
      Effect.succeed(
        pipe(
          dpLinks,
          Array.some((link) => {
            if (link.plantId !== plantId) return false
            return pipe(
              Array.findFirst(
                delegations,
                (d) =>
                  d.id === link.delegationId &&
                  d.caretakerId === userId &&
                  d.status === 'active'
              ),
              Option.isSome
            )
          })
        )
      ),

    hasOpenDelegationForPlant: (plantId) =>
      Effect.succeed(
        Array.some(
          dpLinks,
          (link) =>
            link.plantId === plantId &&
            Array.some(
              delegations,
              (d) =>
                d.id === link.delegationId &&
                Array.contains(['pending', 'accepted', 'active'], d.status)
            )
        )
      ),

    findActiveCaretakersForPlants: (plantIds) =>
      Effect.succeed(
        Array.flatMap(
          Array.filter(dpLinks, (link) =>
            Array.contains(plantIds, link.plantId)
          ),
          (link: (typeof dpLinks)[number]) =>
            Array.map(
              Array.filter(
                delegations,
                (d) => d.id === link.delegationId && d.status === 'active'
              ),
              (d) => ({ plantId: link.plantId, caretakerId: d.caretakerId })
            )
        )
      ),
  }

  return Layer.succeed(DelegationRepository, repo)
}
