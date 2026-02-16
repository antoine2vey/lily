# Task 03 — Delegation Repository

[x] DONE

## Context

Depends on: Task 01 (DB schema), Task 02 (shared types).
Creates the data access layer for all delegation operations.

## Files to create

- `packages/api/src/repositories/delegation.repository.ts` — DelegationRepository interface + Live implementation
- `packages/api/src/__tests__/mocks/delegation.repository.ts` — mock for testing
- `packages/api/src/__tests__/fixtures/delegations.ts` — fixture data

## Files to modify

None.

## Implementation

### Interface

```typescript
export interface IDelegationRepository {
  // CRUD
  readonly create: (data: CreateDelegationData) => Effect.Effect<DelegationRow, SqlError>
  readonly findById: (id: string) => Effect.Effect<DelegationDetailRow | null, SqlError>
  readonly updateStatus: (
    id: string,
    status: string,
    timestamps?: { respondedAt?: Date; canceledAt?: Date; completedAt?: Date }
  ) => Effect.Effect<void, SqlError>

  // Queries
  readonly findByUser: (params: {
    userId: string
    role: 'owner' | 'caretaker' | 'both'
    status?: string[]
    page: number
    limit: number
  }) => Effect.Effect<{ items: DelegationListRow[]; total: number }, SqlError>

  readonly findActiveDelegationsForCaretaker: (
    caretakerId: string
  ) => Effect.Effect<DelegatedTaskRow[], SqlError>

  // Overlap detection
  readonly findOverlappingDelegations: (params: {
    plantIds: string[]
    startDate: Date
    endDate: Date
    excludeDelegationId?: string
  }) => Effect.Effect<string[], SqlError> // returns plant IDs that overlap

  // Bulk status transitions (for scheduler)
  readonly findAcceptedReadyToActivate: (
    now: Date
  ) => Effect.Effect<DelegationRow[], SqlError>

  readonly findActiveReadyToComplete: (
    now: Date
  ) => Effect.Effect<DelegationRow[], SqlError>

  // Plants for delegation
  readonly addPlants: (
    delegationId: string,
    plantIds: string[]
  ) => Effect.Effect<void, SqlError>

  readonly getPlantsByDelegation: (
    delegationId: string
  ) => Effect.Effect<DelegationPlantRow[], SqlError>
}
```

### Row types

```typescript
interface CreateDelegationData {
  ownerId: string
  caretakerId: string
  startDate: Date
  endDate: Date
  message?: string
}

interface DelegationRow {
  id: string
  ownerId: string
  caretakerId: string
  status: string
  message: string | null
  startDate: Date
  endDate: Date
  respondedAt: Date | null
  canceledAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface DelegationDetailRow extends DelegationRow {
  ownerName: string | null
  ownerImage: string | null
  caretakerName: string | null
  caretakerImage: string | null
  plants: DelegationPlantRow[]
}

interface DelegationListRow {
  id: string
  ownerId: string
  ownerName: string | null
  ownerImage: string | null
  caretakerId: string
  caretakerName: string | null
  caretakerImage: string | null
  status: string
  startDate: Date
  endDate: Date
  plantCount: number
  createdAt: Date
}

interface DelegatedTaskRow {
  delegationId: string
  plantId: string
  plantName: string
  plantImage: string | null
  ownerName: string | null
  nextWateringAt: Date | null
  nextFertilizationAt: Date | null
  health: string
}

interface DelegationPlantRow {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  health: string
}
```

### Context.Tag

```typescript
export class DelegationRepository extends Context.Tag('DelegationRepository')<
  DelegationRepository,
  IDelegationRepository
>() {}
```

### Live Implementation key queries

**Overlap detection**:
```sql
SELECT DISTINCT dp.plant_id
FROM delegation_plants dp
JOIN care_delegations cd ON dp.delegation_id = cd.id
WHERE dp.plant_id = ANY(:plantIds)
  AND cd.status IN ('pending', 'accepted', 'active')
  AND cd.start_date < :endDate
  AND cd.end_date > :startDate
  AND (:excludeDelegationId IS NULL OR cd.id != :excludeDelegationId)
```

**Scheduler queries**:
```sql
-- Ready to activate: accepted + startDate <= now
SELECT * FROM care_delegations
WHERE status = 'accepted' AND start_date <= :now

-- Ready to complete: active + endDate <= now
SELECT * FROM care_delegations
WHERE status = 'active' AND end_date <= :now
```

**Delegated tasks for caretaker**:
```sql
SELECT
  cd.id AS delegation_id,
  p.id AS plant_id, p.name AS plant_name, p.image_url AS plant_image,
  u.name AS owner_name,
  p.next_watering_at, p.next_fertilization_at, p.health
FROM care_delegations cd
JOIN delegation_plants dp ON cd.id = dp.delegation_id
JOIN plants p ON dp.plant_id = p.id
JOIN users u ON cd.owner_id = u.id
WHERE cd.caretaker_id = :caretakerId
  AND cd.status = 'active'
ORDER BY p.next_watering_at ASC NULLS LAST
```

## Reference

- Copy repository pattern from `packages/api/src/repositories/plant.repository.ts`
- Copy mock pattern from `packages/api/src/__tests__/mocks/plant.repository.ts`

## Tests

No standalone repo tests — tested via endpoint tests.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
```

## Commit

```
feat(delegation): add DelegationRepository with CRUD, overlap detection, and scheduler queries
```
