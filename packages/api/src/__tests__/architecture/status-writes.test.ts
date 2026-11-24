import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as schema from '@lily/db/schema'
import * as knowledgeSchema from '@lily/knowledge-db/schema'
import { getTableColumns, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

const PACKAGES = resolve(import.meta.dirname, '../../../..')

const REGEX_MAY_FOLLOW =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|void|throw|new|delete|do|else|yield|await))\s*$/

// A `//` or a `/*` inside a string, a template or a regex is text, so the
// comments are found by reading the file token by token.
const withoutComments = (code: string): string => {
  const interpolations: Array<number> = []
  let kept = ''
  let depth = 0
  let at = 0
  const keepUntil = (end: number) => {
    kept += code.slice(at, end)
    at = end
  }
  const afterQuoted = (from: number, quote: string): number => {
    let inClass = false
    for (let i = from; i < code.length; i++) {
      const char = code.charAt(i)
      if (char === '\\') i++
      else if (char === '\n') return i
      else if (quote === '/' && char === '[') inClass = true
      else if (quote === '/' && char === ']') inClass = false
      else if (char === quote && !inClass) return i + 1
    }
    return code.length
  }
  const afterTemplateText = (from: number): number => {
    for (let i = from; i < code.length; i++) {
      const char = code.charAt(i)
      if (char === '\\') i++
      else if (char === '`') return i + 1
      else if (char === '$' && code.charAt(i + 1) === '{') {
        interpolations.push(depth)
        depth++
        return i + 2
      }
    }
    return code.length
  }
  while (at < code.length) {
    const char = code.charAt(at)
    const next = code.charAt(at + 1)
    if (char === '/' && next === '/') {
      const end = code.indexOf('\n', at)
      at = end === -1 ? code.length : end
    } else if (char === '/' && next === '*') {
      const end = code.indexOf('*/', at + 2)
      at = end === -1 ? code.length : end + 2
      kept += ' '
    } else if (char === "'" || char === '"') {
      keepUntil(afterQuoted(at + 1, char))
    } else if (char === '`') {
      keepUntil(afterTemplateText(at + 1))
    } else if (char === '/' && REGEX_MAY_FOLLOW.test(kept.slice(-12))) {
      keepUntil(afterQuoted(at + 1, '/'))
    } else if (char === '}' && interpolations.at(-1) === depth - 1) {
      interpolations.pop()
      depth--
      keepUntil(afterTemplateText(at + 1))
    } else {
      if (char === '{') depth++
      if (char === '}') depth--
      keepUntil(at + 1)
    }
  }
  return kept
}

interface Source {
  readonly file: string
  readonly code: string
}

const sourceOf = (file: string, text: string): Source => ({
  file,
  code: withoutComments(text),
})

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
  .map((file) => sourceOf(relative(PACKAGES, file), readFileSync(file, 'utf8')))

const CLOSER: Readonly<Record<string, string>> = {
  '(': ')',
  '{': '}',
  '[': ']',
}

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

// A name the schema does not export may be any table under another name.
const mayHoldStatus = (expression: string): boolean => {
  const name = expression.split('.').at(-1)
  return tables.find((table) => table.name === name)?.moves ?? true
}

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

const UPDATE = /\.update\(\s*[\w.]+(?:\[[^\]]*\])?\s*\)(?!\s*\.digest\()/g
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
 * Every write outside `kernel/transition.ts` that sets a status key, that
 * hides its columns behind a variable, a spread or a computed key on a table
 * with a status column, or that upserts one. Each has a reason no machine
 * fits it. A new one goes through the helper, or is added here with its
 * reason.
 *
 * The test reads text. It does not see a status set by a function that
 * builds the whole statement elsewhere, or an INSERT of a row in a later
 * state.
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
    file: 'api/src/contexts/canopy/store/write.ts',
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
    why: 'create writes what an authority says the subscription is: the store, through sync-store-state.ts, or a redeemed gift code, through redeem-gift-code.ts. It takes no lock. A store write that lands out of order stays until the nightly reconciliation reads the store again.',
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
    why: 'updateByUserId. An admin revokes a gift, whatever the row said.',
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
  /(?<![.\w])set\s+"?[\w.]+"?\s*=(?:(?!\bwhere\b)[^;])*?\b\w*status"?\s*=(?!=)|(?<![.\w])set\s+"?(?:\w+\.)*\w*status"?\s*=(?!=)/i

const INTERPOLATED_NAME = /\$\{\s*([\w.]+)\s*\}/g

const RENAMED = new RegExp(
  [
    /\b(?:transition|transitionDecided|transitionEach|transitionEachEither|writeAccount)\s+as\s+\w/,
    /\{[^{}]*\b(?:update|onConflictDoUpdate)\b[^{}]*\}\s*=(?![=>])/,
    /\[\s*['"`](?:update|set|onConflictDoUpdate)['"`]\s*\]/,
    /\.(?:update|set|onConflictDoUpdate)\s*\.\s*(?:bind|call|apply)\b/,
  ]
    .map((form) => form.source)
    .join('|')
)

const writesOf = (source: Source): ReadonlyArray<string> => [
  ...[
    ...updatesOf(source),
    ...upsertsOf(source),
    ...accountWritesOf(source),
  ].map(({ file, table, hides }) => `${file} | ${table} | ${hides}`),
  ...(SETS_A_STATUS_IN_SQL.test(source.code.replace(INTERPOLATED_NAME, '$1'))
    ? [`${source.file} | SQL text | a status set in a string`]
    : []),
  ...(RENAMED.test(source.code)
    ? [`${source.file} | a renamed write | whatever it sets`]
    : []),
]

const slot = (name: string) => ['$', '{', name, '}'].join('')

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
      'api/src/contexts/care/store/write.ts',
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
      'SQL text that sets an interpolated status column',
      ['sql`UPDATE ', slot('t'), ' SET ', slot('t.status'), ' = $1`'].join(''),
      ['SQL text | a status set in a string'],
    ],
    [
      'SQL text that sets an interpolated status column after another',
      [
        'sql`UPDATE ',
        slot('t'),
        ' SET ',
        slot('t.updatedAt'),
        ' = now(), ',
        slot('t.status'),
        " = 'sent'`",
      ].join(''),
      ['SQL text | a status set in a string'],
    ],
    [
      'a status key on the line of a string that holds //',
      "await fetch('https://lily.app'); db.update(careDelegations).set({ status: 'canceled' })",
      ['careDelegations | the key status'],
    ],
    [
      'a status key between two strings that hold /* and */',
      "const images = 'image/*'\ndb.update(careDelegations).set({ status: 'canceled' })\nconst any = '*/*'",
      ['careDelegations | the key status'],
    ],
    [
      'a status key after a regex that holds //',
      "const slashes = /[//]+/\ndb.update(careDelegations).set({ status: 'canceled' })",
      ['careDelegations | the key status'],
    ],
    [
      'a table picked by index',
      'db.update(tables[name]).set(values)',
      ['tables[name] | the variable values'],
    ],
    [
      'update pulled off the database under its own name',
      'const { update } = db',
      ['a renamed write | whatever it sets'],
    ],
    [
      'update pulled off the database with a default',
      'const { update = fallback, select } = db',
      ['a renamed write | whatever it sets'],
    ],
    [
      'update bound to the database',
      'const change = db.update.bind(db)',
      ['a renamed write | whatever it sets'],
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
    expect(writesOf(sourceOf('probe.ts', code))).toEqual(
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
    [
      'a write in a line comment',
      "// db.update(careDelegations).set({ status: 'canceled' })",
    ],
    [
      'a write in a block comment',
      "/* db.update(careDelegations).set({ status: 'canceled' }) */",
    ],
    ['a Ref', 'Ref.update(count, (n) => n + 1)'],
    ['a hash', "createHash('sha256').update(token).digest('hex')"],
    [
      'the helper',
      "transition(db, 'Invitation', id, { from: ['pending'], to: 'declined' })",
    ],
  ])('are not found in %s', (_, code) => {
    expect(writesOf(sourceOf('probe.ts', code))).toEqual([])
  })
})
