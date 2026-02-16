import {
  type DelegatedTaskRow,
  type DelegationDetailRow,
  type DelegationListRow,
  type DelegationPlantRow,
  DelegationRepository,
  type DelegationRow,
  type IDelegationRepository,
} from '@lily/api/repositories/delegation.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

interface MockUser {
  id: string
  name: string | null
  image: string | null
}

interface MockPlant {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  nextFertilizationAt?: Date | null
  health: string
}

interface MockDelegationPlantLink {
  delegationId: string
  plantId: string
}

interface MockDelegationRepositoryData {
  delegations?: DelegationRow[]
  delegationPlants?: MockDelegationPlantLink[]
  users?: MockUser[]
  plants?: MockPlant[]
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
      Option.getOrNull
    )

  const repo: IDelegationRepository = {
    create: (createData) =>
      Effect.sync(() => {
        const row: DelegationRow = {
          id: `delegation-${delegations.length + 1}`,
          ownerId: createData.ownerId,
          caretakerId: createData.caretakerId,
          status: 'pending',
          message: createData.message ?? null,
          startDate: createData.startDate,
          endDate: createData.endDate,
          respondedAt: null,
          canceledAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        delegations.push(row)
        return row
      }),

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
            const plantRows: DelegationPlantRow[] = Array.filterMap(
              plantLinks,
              (l) =>
                pipe(
                  Option.fromNullable(findPlant(l.plantId)),
                  Option.map((p) => ({
                    id: p.id,
                    name: p.name,
                    imageUrl: p.imageUrl,
                    nextWateringAt: p.nextWateringAt,
                    health: p.health,
                  }))
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

    updateStatus: (id, status, timestamps) =>
      Effect.sync(() => {
        const idx = Array.findFirstIndex(delegations, (d) => d.id === id)
        Option.map(idx, (i) => {
          const d = delegations[i]!
          delegations[i] = {
            ...d,
            status,
            respondedAt: timestamps?.respondedAt ?? d.respondedAt,
            canceledAt: timestamps?.canceledAt ?? d.canceledAt,
            completedAt: timestamps?.completedAt ?? d.completedAt,
            updatedAt: new Date(),
          }
        })
      }),

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
            return Array.filterMap(plantLinks, (l) =>
              pipe(
                Option.fromNullable(findPlant(l.plantId)),
                Option.map(
                  (p): DelegatedTaskRow => ({
                    delegationId: d.id,
                    plantId: p.id,
                    plantName: p.name,
                    plantImage: p.imageUrl,
                    ownerName: owner?.name ?? null,
                    nextWateringAt: p.nextWateringAt,
                    nextFertilizationAt: p.nextFertilizationAt ?? null,
                    health: p.health,
                  })
                )
              )
            )
          })
        )
      ),

    findOverlappingDelegations: (params) =>
      Effect.succeed(
        pipe(
          dpLinks,
          Array.filter((l) => Array.contains(params.plantIds, l.plantId)),
          Array.filterMap((l) =>
            pipe(
              Array.findFirst(
                delegations,
                (d) =>
                  d.id === l.delegationId &&
                  Array.contains(['pending', 'accepted', 'active'], d.status) &&
                  d.startDate < params.endDate &&
                  d.endDate > params.startDate &&
                  (params.excludeDelegationId
                    ? d.id !== params.excludeDelegationId
                    : true)
              ),
              Option.map(() => l.plantId)
            )
          ),
          Array.dedupe
        )
      ),

    findAcceptedReadyToActivate: (now) =>
      Effect.succeed(
        Array.filter(
          delegations,
          (d) => d.status === 'accepted' && d.startDate <= now
        )
      ),

    findActiveReadyToComplete: (now) =>
      Effect.succeed(
        Array.filter(
          delegations,
          (d) => d.status === 'active' && d.endDate <= now
        )
      ),

    addPlants: (delegationId, plantIds) =>
      Effect.sync(() => {
        Array.forEach(plantIds, (plantId) => {
          dpLinks.push({ delegationId, plantId })
        })
      }),

    getPlantsByDelegation: (delegationId) =>
      Effect.succeed(
        Array.filterMap(
          Array.filter(dpLinks, (l) => l.delegationId === delegationId),
          (l) =>
            pipe(
              Option.fromNullable(findPlant(l.plantId)),
              Option.map((p) => ({
                id: p.id,
                name: p.name,
                imageUrl: p.imageUrl,
                nextWateringAt: p.nextWateringAt,
                health: p.health,
              }))
            )
        )
      ),
  }

  return Layer.succeed(DelegationRepository, repo)
}
