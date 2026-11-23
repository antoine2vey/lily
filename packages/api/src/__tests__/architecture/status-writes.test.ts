import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as schema from '@lily/db/schema'
import * as knowledgeSchema from '@lily/knowledge-db/schema'
import { getTableColumns, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

const PACKAGES = resolve(import.meta.dirname, '../../../..')

const ROOTS = [
  'api/src',
  'db/src',
  'db/scripts',
  'knowledge-db/src',
  'knowledge-db/scripts',
  'mcp/src',
]

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : walk(path)
    }
    return path.endsWith('.ts') ? [path] : []
  })

const sources = ROOTS.map((root) => join(PACKAGES, root))
  .filter(existsSync)
  .flatMap(walk)
  .map((file) => ({
    file: relative(PACKAGES, file),
    code: readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''),
  }))

type Source = (typeof sources)[number]

const CLOSER: Readonly<Record<string, string>> = {
  '(': ')',
  '{': '}',
  '[': ']',
}

/** The text between the bracket at `open` and the bracket that closes it. */
const enclosed = (code: string, open: number): string => {
  const stack: Array<string> = []
  for (let at = open; at < code.length; at++) {
    const char = code.charAt(at)
    const closer = CLOSER[char]
    if (closer !== undefined) stack.push(closer)
    else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) return code.slice(open + 1, at)
    }
  }
  return code.slice(open + 1)
}

const squeezed = (text: string) => text.replace(/\s+/g, ' ').trim()

const IS_STATUS = /status$/i

const tables = Object.entries({ ...schema, ...knowledgeSchema }).flatMap(
  ([name, table]) =>
    is(table, PgTable)
      ? [
          {
            name,
            moves: Object.keys(getTableColumns(table)).some((column) =>
              IS_STATUS.test(column)
            ),
          },
        ]
      : []
)

/**
 * Whether a row of the table an expression names can hold a status. A name
 * the schema does not export may be any table under another name, so it can.
 */
const mayHoldStatus = (expression: string): boolean => {
  const name = expression.split('.').at(-1)
  return tables.find((table) => table.name === name)?.moves ?? true
}

/** `text` with everything inside a nested bracket blanked. */
const atTopLevel = (text: string): string => {
  const stack: Array<string> = []
  return [...text]
    .map((char) => {
      if (char === stack.at(-1)) {
        stack.pop()
        return stack.length === 0 ? char : ' '
      }
      const nested = stack.length > 0
      const closer = CLOSER[char]
      if (closer !== undefined) stack.push(closer)
      return nested ? ' ' : char
    })
    .join('')
}

const STATUS_KEY =
  /(?<=(?:^|[{,])\s*)['"]?(\w*[sS]tatus)['"]?\??\s*(?=[:,}]|$)/g
const SPREAD = /(?<=(?:^|[{,])\s*)\.\.\.\s*([\w.]*)/g
const COMPUTED_KEY = /(?<=(?:^|[{,])\s*)\[/

/**
 * What stops a reader of `values`, the argument of a `.set(`, from seeing
 * that no status column is in it: a status key, or a part whose keys are
 * written somewhere else.
 */
const hiddenIn = (table: string, values: string): ReadonlyArray<string> => {
  const literal = values.trim()
  const opaque = mayHoldStatus(table)
  if (!literal.startsWith('{')) {
    return opaque ? [`the variable ${squeezed(literal)}`] : []
  }
  const top = atTopLevel(enclosed(literal, 0))
  return [
    ...[...top.matchAll(STATUS_KEY)].map((match) => `the key ${match[1]}`),
    ...(opaque
      ? [
          ...[...top.matchAll(SPREAD)].map(
            (match) => `the spread ${match[1] || 'of an expression'}`
          ),
          ...(COMPUTED_KEY.test(top) ? ['a computed key'] : []),
        ]
      : []),
  ]
}

interface Write {
  readonly file: string
  readonly table: string
  readonly hides: string
}

const UPDATE = /\.update\(\s*[\w.]+\s*\)(?!\s*\.digest\()/g
const UPSERT = /\.onConflictDoUpdate\(/g

const updatesOf = ({ file, code }: Source): ReadonlyArray<Write> =>
  [...code.matchAll(UPDATE)].flatMap((match) => {
    const table = squeezed(enclosed(code, match.index + '.update'.length))
    const after = code.slice(match.index + match[0].length)
    const set = /^\s*\.set\(/.exec(after)
    const hides =
      set === null
        ? ['a statement finished somewhere else']
        : hiddenIn(table, enclosed(after, set[0].length - 1))
    return hides.map((hidden) => ({ file, table, hides: hidden }))
  })

const upsertsOf = ({ file, code }: Source): ReadonlyArray<Write> =>
  [...code.matchAll(UPSERT)].flatMap((match) => {
    const inserts = [...code.slice(0, match.index).matchAll(/\.insert\(/g)]
    const insert = inserts.at(-1)
    const table =
      insert === undefined
        ? 'an unknown table'
        : squeezed(enclosed(code, insert.index + '.insert'.length))
    const call = enclosed(code, match.index + match[0].length - 1)
    const config = call.trim().startsWith('{')
      ? enclosed(call, call.indexOf('{'))
      : ''
    const set = /\bset\s*:\s*/.exec(atTopLevel(config))
    const hides =
      set === null
        ? ['a config written somewhere else']
        : hiddenIn(
            table,
            config.charAt(set.index + set[0].length) === '{'
              ? `{${enclosed(config, set.index + set[0].length)}}`
              : (/^[\w.]+/.exec(config.slice(set.index + set[0].length))?.[0] ??
                  '')
          )
    return hides.map((hidden) => ({
      file,
      table: `${table}, on conflict`,
      hides: hidden,
    }))
  })

/**
 * Every write of a row that puts a status in it, or that hides its columns,
 * outside `transition`. Each has a reason no machine fits it. A new one
 * goes through `kernel/transition.ts`, or is added here with its reason.
 */
const ALLOWED: ReadonlyArray<Write & { readonly why: string }> = [
  {
    file: 'api/src/kernel/transition.ts',
    table: 'table',
    hides: 'the variable valuesOf(name, statement)',
    why: 'The helper. It puts `to` over whatever the stamps hold.',
  },
  {
    file: 'api/src/kernel/locks.ts',
    table: 'users',
    hides: 'the variable values',
    why: 'writeAccount, the one statement that updates an account row. The writes below that name it are its callers that set a status.',
  },
  {
    file: 'api/src/repositories/user.repository.ts',
    table: 'writeAccount',
    hides: 'the key status',
    why: 'softDelete. An account deletion holds the user key, and pending_deletion is where it goes from any state.',
  },
  {
    file: 'api/src/repositories/user.repository.ts',
    table: 'writeAccount',
    hides: 'the key status',
    why: 'updateStatus. An admin sets the state of an account whatever it was.',
  },
  {
    file: 'api/src/repositories/user.repository.ts',
    table: 'writeAccount',
    hides: 'the spread data',
    why: 'update. Its data holds a status only when the admin edit of an account puts one there.',
  },
  {
    file: 'api/src/contexts/canopy/store.ts',
    table: 'canopyDirectInvites, on conflict',
    hides: 'the variable opened',
    why: 'OpenInvitation reopens the invitation of a pair from any resolved state. The command holds that row FOR UPDATE under the canopy lock.',
  },
  {
    file: 'api/src/repositories/activity-push-token.repository.ts',
    table: 'activityPushTokens, on conflict',
    hides: 'the key status',
    why: 'upsertStartToken. A device that registers again replaces its row and is live, whatever the row said.',
  },
  {
    file: 'api/src/repositories/activity-push-token.repository.ts',
    table: 'activityPushTokens, on conflict',
    hides: 'the key status',
    why: 'createActivity. A device that starts an activity replaces its one update row.',
  },
  {
    file: 'api/src/repositories/subscription.repository.ts',
    table: 'userSubscriptions, on conflict',
    hides: 'the key status',
    why: 'create mirrors what the store says of the subscription. The store is the authority, so its last word wins.',
  },
  {
    file: 'api/src/repositories/subscription.repository.ts',
    table: 'userSubscriptions, on conflict',
    hides: 'the spread compact',
    why: 'The same statement.',
  },
  {
    file: 'api/src/repositories/subscription.repository.ts',
    table: 'userSubscriptions',
    hides: 'the variable updateData',
    why: 'updateFromWebhook mirrors the store. sync-store-state.ts serializes the webhooks of one user.',
  },
  {
    file: 'api/src/repositories/subscription.repository.ts',
    table: 'userSubscriptions',
    hides: 'the variable updateData',
    why: 'updateByUserId, for an admin gift or its revocation.',
  },
  {
    file: 'api/src/repositories/blog-post.repository.ts',
    table: 'blogPosts',
    hides: 'the variable data',
    why: 'updateReview takes a score and a feedback, typed as exactly those two.',
  },
  {
    file: 'db/scripts/seed-reviewer.ts',
    table: 'users',
    hides: 'the key status',
    why: 'A seed script run by hand puts the reviewer account back to active.',
  },
]

const KERNEL = ['api/src/kernel/locks.ts', 'api/src/kernel/transition.ts']

const accountWritesOf = ({ file, code }: Source): ReadonlyArray<Write> =>
  KERNEL.includes(file)
    ? []
    : [...code.matchAll(/\bwriteAccount\(/g)].flatMap((match) => {
        const args = enclosed(code, match.index + match[0].length - 1)
        const values = /\{[\s\S]*/.exec(args)?.[0] ?? ''
        return hiddenIn('users', `{${enclosed(values, 0)}}`).map((hides) => ({
          file,
          table: 'writeAccount',
          hides,
        }))
      })

const SETS_A_STATUS_IN_SQL =
  /(?<![.\w])set\s+"?[\w.]+"?\s*=(?:(?!\bwhere\b)[^;])*?\b\w*status"?\s*=(?!=)|(?<![.\w])set\s+"?\w*status"?\s*=(?!=)/i

const RENAMED =
  /\b(transition|transitionDecided|transitionEach|writeAccount)\s+as\s+\w|\b(update|set|onConflictDoUpdate)\s*:\s*\w+\s*[,}]\s*=|\[\s*['"`](update|set|onConflictDoUpdate)['"`]\s*\]/

const writesOf = (source: Source): ReadonlyArray<string> => [
  ...[
    ...updatesOf(source),
    ...upsertsOf(source),
    ...accountWritesOf(source),
  ].map(({ file, table, hides }) => `${file} | ${table} | ${hides}`),
  ...(SETS_A_STATUS_IN_SQL.test(source.code)
    ? [`${source.file} | SQL text | a status set in a string`]
    : []),
  ...(RENAMED.test(source.code)
    ? [`${source.file} | a renamed write | whatever it sets`]
    : []),
]

describe('status writes', () => {
  it('go through transition, or are named here with a reason', () => {
    expect(sources.flatMap(writesOf).sort()).toEqual(
      ALLOWED.map(
        ({ file, table, hides }) => `${file} | ${table} | ${hides}`
      ).sort()
    )
  })

  it('take a pair picked at run time only where a tested rule table picks it', () => {
    expect(
      sources
        .filter(
          ({ file, code }) =>
            !KERNEL.includes(file) && /\btransitionDecided\b/.test(code)
        )
        .map(({ file }) => file)
    ).toEqual([
      'api/src/contexts/absence/store.ts',
      'api/src/contexts/care/store.ts',
    ])
  })

  it.each([
    [
      'a status key',
      "db.update(careDelegations).set({ status: 'canceled' }).where(byId)",
      ['careDelegations | the key status'],
    ],
    [
      'a shorthand status under a schema prefix',
      'db.update(schema.notifications).set({ sentAt, status })',
      ['schema.notifications | the key status'],
    ],
    [
      'a status under another name',
      "db.update(users).set({ vacationStatus: 'none' })",
      ['users | the key vacationStatus'],
    ],
    [
      'a variable on a table that has a status',
      'db.update(blogPosts).set(values)',
      ['blogPosts | the variable values'],
    ],
    [
      'a spread on a table that has a status',
      'db.update(carePlans).set({ ...stamps, acceptedAt })',
      ['carePlans | the spread stamps'],
    ],
    [
      'a conditional spread on a table that has a status',
      'db.update(carePlans).set({ ...(done && { status }) })',
      ['carePlans | the spread of an expression'],
    ],
    [
      'a computed key on a table that has a status',
      "db.update(carePlans).set({ [column]: 'accepted' })",
      ['carePlans | a computed key'],
    ],
    [
      'a table imported under another name',
      "import { careDelegations as rows } from '@lily/db/schema'\ndb.update(rows).set(values)",
      ['rows | the variable values'],
    ],
    [
      'an update finished in another statement',
      'const moving = db.update(careDelegations)\nmoving.set(values)',
      ['careDelegations | a statement finished somewhere else'],
    ],
    [
      'an upsert that sets a status',
      "db.insert(notifications).values(row).onConflictDoUpdate({ target: notifications.id, set: { status: 'pending' } })",
      ['notifications, on conflict | the key status'],
    ],
    [
      'an account write that sets a vacation status',
      "writeAccount(db, userId, { vacationStatus: 'none' }, (write) => write.returning())",
      ['writeAccount | the key vacationStatus'],
    ],
    [
      'SQL text that sets a status',
      "sql`UPDATE notifications SET status = 'sent' WHERE id = $1`",
      ['SQL text | a status set in a string'],
    ],
    [
      'SQL text that sets a status after another column',
      'sql`UPDATE users SET updated_at = now(), vacation_status = $1`',
      ['SQL text | a status set in a string'],
    ],
    [
      'an upsert in SQL text that sets a status',
      'sql`ON CONFLICT (id) DO UPDATE SET "status" = excluded.status`',
      ['SQL text | a status set in a string'],
    ],
    [
      'the helper imported under another name',
      "import { transitionDecided as move } from '@lily/api/kernel/transition'",
      ['a renamed write | whatever it sets'],
    ],
    [
      'update pulled off the database under another name',
      'const { update: change } = db',
      ['a renamed write | whatever it sets'],
    ],
    [
      'update reached through a string key',
      "db['update'](careDelegations)",
      ['a renamed write | whatever it sets'],
    ],
  ])('are found when written as %s', (_, code, found) => {
    expect(writesOf({ file: 'probe.ts', code })).toEqual(
      found.map((write) => `probe.ts | ${write}`)
    )
  })

  it.each([
    [
      'a column that is not a status',
      'db.update(notifications).set({ isRead: true })',
    ],
    [
      'a status read in a condition',
      "db.update(notifications).set({ isRead: true }).where(eq(notifications.status, 'sent'))",
    ],
    [
      'a variable on a table with no status',
      'db.update(giftCodes).set(values)',
    ],
    [
      'SQL text that reads a status',
      "sql`UPDATE notifications n SET scheduled_at = v.scheduled_at FROM v WHERE n.status = 'pending'`",
    ],
    ['a Ref', 'Ref.update(count, (n) => n + 1)'],
    ['a hash', "createHash('sha256').update(token).digest('hex')"],
    [
      'the helper',
      "transition(db, 'Invitation', id, { from: ['pending'], to: 'declined' })",
    ],
  ])('are not found in %s', (_, code) => {
    expect(writesOf({ file: 'probe.ts', code })).toEqual([])
  })
})
