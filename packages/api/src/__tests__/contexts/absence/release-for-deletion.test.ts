import { mockDelegation1 } from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryAbsence } from '@lily/api/__tests__/mocks/absence'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { Absence } from '@lily/api/contexts/absence'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const DAY = 86_400_000

const owner = mockUser1
const caretaker = mockUser2
const stranger: User = {
  ...mockUser1,
  id: 'stranger',
  email: 'stranger@x.test',
}

const between = (
  id: string,
  ownerId: string,
  caretakerId: string,
  status: DelegationRow['status']
): DelegationRow => ({ ...mockDelegation1, id, ownerId, caretakerId, status })

const awayNow = {
  vacationStatus: 'active',
  vacationStart: new Date(Date.now() - 3 * DAY),
  vacationEnd: new Date(Date.now() + 4 * DAY),
} as const

const awayLater = {
  vacationStatus: 'scheduled',
  vacationStart: new Date(Date.now() + 3 * DAY),
  vacationEnd: new Date(Date.now() + 9 * DAY),
} as const

const released = async (
  userId: string,
  given: {
    readonly delegations?: ReadonlyArray<DelegationRow>
    readonly users?: ReadonlyArray<User>
  }
) => {
  const notifications: Notification[] = []
  const users = [...(given.users ?? [owner, caretaker, stranger])]
  const absence = createInMemoryAbsence(
    {
      delegations: Array.map(given.delegations ?? [], (row) => ({ ...row })),
      delegationPlants: Array.map(given.delegations ?? [], (row) => ({
        delegationId: row.id,
        plantId: `plant-of-${row.id}`,
      })),
      users,
    },
    { notifications }
  )
  await Effect.runPromise(
    Effect.flatMap(Absence, (service) =>
      service.releaseForDeletion(userId)
    ).pipe(transactInMemory, Effect.provide(absence.layer))
  )
  return {
    statuses: Array.map(absence.delegations, (row) => row.status),
    vacationOf: (id: string) =>
      pipe(
        Array.findFirst(users, (user) => user.id === id),
        Option.map((user) => user.vacationStatus),
        Option.getOrUndefined
      ),
    written: Array.map(absence.writes, (write) => write._tag),
    said: absence.events,
    told: notifications,
  }
}

describe('releasing what an account that is being deleted holds', () => {
  it('writes nothing and says nothing when the account holds nothing open', async () => {
    const after = await released(caretaker.id, {
      delegations: [
        between('over', owner.id, caretaker.id, 'completed'),
        between('called-off', caretaker.id, owner.id, 'canceled'),
        between('refused', owner.id, caretaker.id, 'rejected'),
      ],
    })

    expect(after).toMatchObject({
      statuses: ['completed', 'canceled', 'rejected'],
      written: [],
      said: [],
      told: [],
    })
  })

  it('writes nothing and says nothing for an account that does not exist', async () => {
    const after = await released('nobody', {
      delegations: [between('theirs', owner.id, caretaker.id, 'active')],
    })

    expect(after).toMatchObject({
      statuses: ['active'],
      written: [],
      said: [],
    })
  })

  it.each(['pending', 'accepted'] as const)(
    'cancels a delegation of the account that is %s, as owner or as caretaker, and says nothing',
    async (status) => {
      const after = await released(caretaker.id, {
        delegations: [
          between('tended', owner.id, caretaker.id, status),
          between('given', caretaker.id, owner.id, status),
          between('of-others', owner.id, stranger.id, status),
        ],
      })

      expect(after).toMatchObject({
        statuses: ['canceled', 'canceled', status],
        said: [],
        told: [],
      })
    }
  )

  it.each([
    ['the caretaker', caretaker.id],
    ['the owner', owner.id],
  ] as const)(
    'cancels a running delegation when %s is deleted, says it ended because the account was deleted, and tells nobody',
    async (_who, deleted) => {
      const after = await released(deleted, {
        delegations: [
          between('running', owner.id, caretaker.id, 'active'),
          between('of-others', stranger.id, 'someone-else', 'active'),
        ],
      })

      expect(after).toMatchObject({
        statuses: ['canceled', 'active'],
        said: [
          {
            _tag: 'DelegationEnded',
            delegationId: 'running',
            ownerId: owner.id,
            caretakerId: caretaker.id,
            plantIds: ['plant-of-running'],
            reason: 'accountDeleted',
          },
        ],
        told: [],
      })
    }
  )

  it('ends the running vacation of an account already marked for deletion, says so, and moves no due day', async () => {
    const leaving: User = {
      ...caretaker,
      ...awayNow,
      status: 'pending_deletion',
    }

    const after = await released(leaving.id, { users: [owner, leaving] })

    expect({
      vacation: after.vacationOf(leaving.id),
      written: after.written,
      said: Array.map(after.said, (fact) => fact._tag),
    }).toEqual({
      vacation: 'none',
      written: ['SetVacation', 'SweepMuted'],
      said: ['VacationEnded'],
    })
  })

  it('clears a vacation that had not started and says nothing', async () => {
    const leaving: User = { ...caretaker, ...awayLater }

    const after = await released(leaving.id, { users: [owner, leaving] })

    expect({
      vacation: after.vacationOf(leaving.id),
      written: after.written,
      said: after.said,
    }).toEqual({ vacation: 'none', written: ['SetVacation'], said: [] })
  })
})
