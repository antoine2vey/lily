# Task 02 — Shared Delegation Types

[x] DONE

## Context

Depends on: Task 01 (DB schema for type alignment).
Creates shared schemas and error types for care delegation.

## Files to create

- `packages/shared/src/domains/delegation/schema.ts` — Delegation domain schemas
- `packages/shared/src/domains/delegation/errors.ts` — Delegation domain errors

## Files to modify

- `packages/shared/src/index.ts` — add exports for delegation domain

## Implementation

### Schema (`schema.ts`)

```typescript
import { Schema } from 'effect'
import { PaginatedResponse } from '@lily/shared'

// Delegation status literal
export const DelegationStatus = Schema.Literal(
  'pending',
  'accepted',
  'rejected',
  'active',
  'completed',
  'canceled'
)
export type DelegationStatus = typeof DelegationStatus.Type

// Plant summary within a delegation
export const DelegationPlantSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  nextWateringAt: Schema.NullOr(Schema.Date),
  health: Schema.String,
})
export type DelegationPlantSummary = typeof DelegationPlantSummary.Type

// Full delegation detail
export const Delegation = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  ownerName: Schema.NullOr(Schema.String),
  ownerImage: Schema.NullOr(Schema.String),
  caretakerId: Schema.String,
  caretakerName: Schema.NullOr(Schema.String),
  caretakerImage: Schema.NullOr(Schema.String),
  status: DelegationStatus,
  message: Schema.NullOr(Schema.String),
  startDate: Schema.Date,
  endDate: Schema.Date,
  plants: Schema.Array(DelegationPlantSummary),
  respondedAt: Schema.NullOr(Schema.Date),
  canceledAt: Schema.NullOr(Schema.Date),
  completedAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})
export type Delegation = typeof Delegation.Type

// Delegation list item (lighter than full detail)
export const DelegationListItem = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  ownerName: Schema.NullOr(Schema.String),
  ownerImage: Schema.NullOr(Schema.String),
  caretakerId: Schema.String,
  caretakerName: Schema.NullOr(Schema.String),
  caretakerImage: Schema.NullOr(Schema.String),
  status: DelegationStatus,
  startDate: Schema.Date,
  endDate: Schema.Date,
  plantCount: Schema.Number,
  createdAt: Schema.Date,
})
export type DelegationListItem = typeof DelegationListItem.Type

// Create delegation request
export const CreateDelegationRequest = Schema.Struct({
  caretakerId: Schema.String,
  plantIds: Schema.Array(Schema.String),
  startDate: Schema.String, // ISO string
  endDate: Schema.String,   // ISO string
  message: Schema.optional(Schema.String),
})
export type CreateDelegationRequest = typeof CreateDelegationRequest.Type

// Respond to delegation request
export const RespondDelegationRequest = Schema.Struct({
  accept: Schema.Boolean,
})
export type RespondDelegationRequest = typeof RespondDelegationRequest.Type

// Delegated care task (what the caretaker sees)
export const DelegatedCareTask = Schema.Struct({
  delegationId: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImage: Schema.NullOr(Schema.String),
  ownerName: Schema.NullOr(Schema.String),
  nextWateringAt: Schema.NullOr(Schema.Date),
  nextFertilizationAt: Schema.NullOr(Schema.Date),
  health: Schema.String,
})
export type DelegatedCareTask = typeof DelegatedCareTask.Type

// Paginated responses
export const DelegationListResponse = PaginatedResponse(DelegationListItem)
export type DelegationListResponse = typeof DelegationListResponse.Type
```

### Errors (`errors.ts`)

```typescript
import { Schema } from 'effect'
import { HttpApiSchema } from '@effect/platform'

export class DelegationNotFoundError extends Schema.TaggedError<DelegationNotFoundError>()(
  'DelegationNotFoundError',
  {
    delegationId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class DelegationNotAuthorizedError extends Schema.TaggedError<DelegationNotAuthorizedError>()(
  'DelegationNotAuthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You are not authorized to perform this action',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class DelegationInvalidStatusError extends Schema.TaggedError<DelegationInvalidStatusError>()(
  'DelegationInvalidStatusError',
  {
    currentStatus: Schema.String,
    expectedStatus: Schema.String,
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Delegation is not in the correct status for this action',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class DelegationOverlapError extends Schema.TaggedError<DelegationOverlapError>()(
  'DelegationOverlapError',
  {
    plantIds: Schema.Array(Schema.String),
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Some plants already have an active or accepted delegation for this period',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class DelegationDateError extends Schema.TaggedError<DelegationDateError>()(
  'DelegationDateError',
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class CannotDelegateSelfError extends Schema.TaggedError<CannotDelegateSelfError>()(
  'CannotDelegateSelfError',
  {},
  HttpApiSchema.annotations({ status: 400 })
) {}
```

### Export in `index.ts`

Add to `packages/shared/src/index.ts`:
```typescript
export * from './domains/delegation/schema'
export * from './domains/delegation/errors'
```

## Reference

- Copy schema pattern from `packages/shared/src/domains/plant/schema.ts`
- Copy error pattern from `packages/shared/src/domains/subscriptions/errors.ts`

## Tests

No unit tests — verified by typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/shared && bun run typecheck
```

## Commit

```
feat(delegation): add shared delegation schemas and error types
```
