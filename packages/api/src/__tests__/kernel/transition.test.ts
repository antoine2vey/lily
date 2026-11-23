import {
  RULES as DELEGATION_RULES,
  type Rule as DelegationRule,
  type Status,
} from '@lily/api/contexts/absence/domain/delegation'
import {
  RULES as PLAN_RULES,
  type Rule as PlanRule,
  type PlanStatus,
} from '@lily/api/contexts/care/domain/plan'
import {
  IllegalTransitionDefect,
  isLegal,
  Transition,
  transition,
  transitionDecided,
  transitionEach,
  transitionEachEither,
} from '@lily/api/kernel/transition'
import { notifications } from '@lily/db/schema'
import { eq, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { Array, Cause, Effect, Exit, Record, String } from 'effect'
import { describe, expect, it } from 'vitest'

const answering = (rows: ReadonlyArray<ReadonlyArray<unknown>>) => {
  const statements: Array<{
    readonly sql: string
    readonly params: ReadonlyArray<unknown>
  }> = []
  const db = drizzle((sql, params) => {
    statements.push({ sql, params })
    return Promise.resolve({ rows: [...rows] })
  })
  return { db, statements }
}

const defectOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined

const NO_ROW: ReadonlyArray<ReadonlyArray<unknown>> = []

describe('transition', () => {
  it('writes the id, the states it moves from and the state it moves to in one statement', async () => {
    const { db, statements } = answering(NO_ROW)

    await Effect.runPromise(
      transition(db, 'Delegation', 'd1', {
        from: ['pending', 'accepted'],
        to: 'canceled',
        also: { canceledAt: new Date(0) },
      })
    )

    expect(statements).toHaveLength(1)
    expect(statements[0]?.sql).toMatch(
      /^update "care_delegations" set "status" = \$1, "canceled_at" = \$2, "updated_at" = \$3 where \("care_delegations"\."id" = \$4 and "care_delegations"\."status" in \(\$5, \$6\)\) returning /
    )
    expect(statements[0]?.params.slice(3)).toEqual([
      'd1',
      'pending',
      'accepted',
    ])
    expect(statements[0]?.params[0]).toBe('canceled')
  })

  it('says LostRace when no row moved', async () => {
    const { db } = answering(NO_ROW)

    const result = await Effect.runPromise(
      transition(db, 'Invitation', 'i1', { from: ['pending'], to: 'declined' })
    )

    expect(result).toEqual(Transition.LostRace())
  })

  it('says Moved when a row moved', async () => {
    const { db } = answering([[]])

    const result = await Effect.runPromise(
      transition(db, 'IngestJob', 'j1', {
        from: ['pending'],
        to: 'in_progress',
      })
    )

    expect(result._tag).toBe('Moved')
  })

  it('writes its own state over a status smuggled in with the stamps', async () => {
    const { db, statements } = answering(NO_ROW)
    const stamps = { lastError: 'boom', status: 'sent' as const }

    await Effect.runPromise(
      transition(db, 'Notification', 'n1', {
        from: ['queued'],
        to: 'failed',
        also: stamps,
      })
    )

    expect(statements[0]?.sql).toMatch(
      /^update "notifications" set "status" = \$1, "last_error" = \$2 where /
    )
    expect(statements[0]?.params).toEqual(['failed', 'boom', 'n1', 'queued'])
  })

  it('keeps the states it moves from when the caller narrows with an OR', async () => {
    const { db, statements } = answering(NO_ROW)

    await Effect.runPromise(
      transitionEach(db, 'Notification', {
        from: ['queued'],
        to: 'pending',
        where: or(
          eq(notifications.userId, 'u1'),
          eq(notifications.userId, 'u2')
        ),
      })
    )

    expect(statements[0]?.sql).toContain(
      'where "notifications"."status" in ($2) and (("notifications"."user_id" = $3 or "notifications"."user_id" = $4)) returning'
    )
  })

  it('picks one of two states for each row inside the one statement that moves them', async () => {
    const { db, statements } = answering(NO_ROW)

    await Effect.runPromise(
      transitionEachEither(db, 'Notification', {
        from: ['queued'],
        when: sql`${notifications.retryCount} < ${2}`,
        to: 'pending',
        otherwise: 'failed',
        where: eq(notifications.userId, 'u1'),
      })
    )

    expect(statements).toHaveLength(1)
    expect(statements[0]?.sql).toMatch(
      /^update "notifications" set "status" = CASE WHEN "notifications"\."retry_count" < \$1 THEN \$2::notification_status ELSE \$3::notification_status END where "notifications"\."status" in \(\$4\) and \("notifications"\."user_id" = \$5\) returning /
    )
    expect(statements[0]?.params).toEqual([
      2,
      'pending',
      'failed',
      'queued',
      'u1',
    ])
  })

  it('moves a vacation through the account write, on the row of one user', async () => {
    const { db, statements } = answering(NO_ROW)

    await Effect.runPromise(
      transition(db, 'Vacation', 'u1', { from: ['scheduled'], to: 'active' })
    )

    expect(statements[0]?.sql).toMatch(
      /^update "users" set "vacation_status" = \$1 where \("users"\."id" = \$2 and \("users"\."vacation_status" in \(\$3\)\)\) returning /
    )
  })

  it('does not compile for a move the machine does not have', () => {
    const { db } = answering(NO_ROW)

    const refused = () => [
      // @ts-expect-error a sent notification is never queued again
      transition(db, 'Notification', 'n1', { from: ['sent'], to: 'queued' }),
      transition(db, 'Delegation', 'd1', {
        from: ['pending', 'accepted'],
        // @ts-expect-error an accepted delegation cannot be rejected
        to: 'rejected',
      }),
      transition(db, 'Plan', 'p1', {
        from: ['proposed'],
        to: 'accepted',
        // @ts-expect-error the helper writes the status, the stamps cannot
        also: { status: 'completed' },
      }),
      transitionEachEither(db, 'Notification', {
        from: ['queued'],
        when: sql`true`,
        to: 'sent',
        // @ts-expect-error a queued notification cannot go back to queued
        otherwise: 'queued',
        where: undefined,
      }),
      // @ts-expect-error a vacation moves one account at a time
      transitionEach(db, 'Vacation', {
        from: ['active'],
        to: 'none',
        where: eq(notifications.userId, 'u1'),
      }),
    ]

    expect(refused).toBeTypeOf('function')
  })
})

describe('transitionDecided', () => {
  it('dies on a pair the machine does not have, before any statement', async () => {
    const { db, statements } = answering(NO_ROW)

    const exit = await Effect.runPromiseExit(
      transitionDecided(db, 'Plan', 'p1', { from: 'dismissed', to: 'accepted' })
    )

    expect(defectOf(exit)).toEqual(
      new IllegalTransitionDefect({
        machine: 'Plan',
        from: 'dismissed',
        to: 'accepted',
      })
    )
    expect(statements).toEqual([])
  })

  it('has every move the delegation rules can decide', () => {
    const rules: Record<
      string,
      Record<Status, DelegationRule>
    > = DELEGATION_RULES
    const decided = Array.flatMap(Record.values(rules), (byStatus) =>
      Array.flatMap(Record.toEntries(byStatus), ([from, rule]) =>
        rule._tag === 'Move'
          ? [
              {
                from: String.uncapitalize(from),
                to: String.uncapitalize(rule.to),
              },
            ]
          : []
      )
    )

    expect(decided.length).toBeGreaterThan(0)
    expect(
      Array.filter(decided, ({ from, to }) => !isLegal('Delegation', from, to))
    ).toEqual([])
  })

  it('has every move the plan rules can decide', () => {
    const rules: Record<string, Record<PlanStatus, PlanRule>> = PLAN_RULES
    const decided = Array.flatMap(Record.values(rules), (byStatus) =>
      Array.flatMap(Record.toEntries(byStatus), ([from, rule]) =>
        rule._tag === 'Become' ? [{ from, to: rule.status }] : []
      )
    )

    expect(decided.length).toBeGreaterThan(0)
    expect(
      Array.filter(decided, ({ from, to }) => !isLegal('Plan', from, to))
    ).toEqual([])
    expect(isLegal('Plan', 'accepted', 'completed')).toBe(true)
    expect(isLegal('Plan', 'completed', 'accepted')).toBe(true)
  })
})
