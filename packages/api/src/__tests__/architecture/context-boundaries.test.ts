import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type {
  ReminderStore,
  ReminderWrites,
} from '@lily/api/contexts/reminders/store/rows'
import type { Transaction } from '@lily/api/kernel/transact'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { DeferredCareType } from '@lily/shared/server'
import type { Effect } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../..')
const CONTEXTS = join(SRC, 'contexts')

// The writers of every row but a reminder: what produces a notification,
// what the user does in the inbox, and how delivery moves a row.
const NOTIFICATION_REPOSITORIES = [
  'repositories/notification-delivery.repository.ts',
  'repositories/notification-inbox.repository.ts',
  'repositories/notification.repository.ts',
]

// The rows of a reminder type, and the locks a replan takes.
const REMINDER_STORE_ROWS = 'contexts/reminders/store/rows.ts'

// Delivery moves a row through its statuses and drops the ones it must not
// send. It never plans one.
const DELIVERY = [
  'services/notification-scheduler/',
  'services/helpers/schedule-notification.ts',
]

const CANOPY_STORE_WRITES = 'contexts/canopy/store/write.ts'

const CANOPY_STORE_LOCKS = 'contexts/canopy/store/lock.ts'

const CARE_STORE_WRITES = 'contexts/care/store/write.ts'

const OWNER_LOCK = 'services/plants/helpers/owner-lock.ts'

const SEEN = 'services/plants/helpers/seen.ts'

const PLANT_LIFE_ENDPOINTS = [
  'services/plants/endpoints/create-plant.ts',
  'services/plants/endpoints/mark-plant-dead.ts',
  'services/plants/endpoints/revive-plant.ts',
  'services/plants/endpoints/delete-plant.ts',
]

const CANOPY_CODE = [
  'contexts/canopy/',
  'services/canopy/',
  'services/plants/endpoints/share-plant-with-canopy.ts',
  'services/plants/endpoints/unshare-plant.ts',
  'services/plants/endpoints/mute-plant.ts',
]

const ABSENCE_STORE = 'contexts/absence/store.ts'

const ABSENCE_CODE = [
  'contexts/absence/',
  'services/delegation/',
  'services/delegation-scheduler/',
  'services/vacation/',
  'services/vacation-scheduler/',
]

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : walk(path)
    }
    return /\.[cm]?tsx?$/.test(path) ? [path] : []
  })

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/.*$/gm, '')

interface Import {
  readonly specifier: string
  readonly names: string
  readonly erased: boolean
}

const IMPORT =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g

const importsOf = (file: string): ReadonlyArray<Import> =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => ({
    specifier: match[4] ?? '',
    names: match[3] ?? '',
    erased: match[2] !== undefined,
  }))

const asFile = (base: string): string | null =>
  [`${base}.ts`, join(base, 'index.ts')].find((path) => existsSync(path)) ??
  null

const resolveImport = (from: string, specifier: string): string | null => {
  if (specifier.startsWith('@lily/api/')) {
    return asFile(join(SRC, specifier.slice('@lily/api/'.length)))
  }
  return specifier.startsWith('.')
    ? asFile(resolve(dirname(from), specifier))
    : null
}

/** An `as` cast or an angle-bracket cast to one of `types`, a regex alternation. */
const castsTo = (types: string): ReadonlyArray<RegExp> => [
  new RegExp(
    `\\bas\\s+(?:unknown\\s+as\\s+)?(?:(?:readonly\\s+)?[\\w.$]+\\s*[<|&]\\s*)*(?:readonly\\s+)?(${types})\\b`,
    'g'
  ),
  new RegExp(
    `(?<=(?:^|[(,=:?![{;&|]|\\breturn|\\byield|\\bawait|=>)\\s*)<\\s*(?:(?:readonly\\s+)?[\\w.$]+\\s*[<|&]\\s*)*(?:readonly\\s+)?(${types})\\b`,
    'gm'
  ),
]

const files = walk(SRC)

const PACKAGES = resolve(SRC, '../..')
const serverCode = ['api/src', 'db/src', 'db/scripts', 'shared/src', 'mcp/src']
  .flatMap((root) => walk(join(PACKAGES, root)))
  .filter((file) => !/\.test\.[cm]?tsx?$/.test(file))

const name = (file: string) => relative(SRC, file)
const contextOf = (file: string): string | null =>
  file.startsWith(`${CONTEXTS}/`)
    ? (relative(CONTEXTS, file).split('/')[0] ?? null)
    : null

const graph = new Map(
  files.map((file) => [
    file,
    importsOf(file).flatMap((imported) => {
      const target = resolveImport(file, imported.specifier)
      return target === null ? [] : [{ ...imported, target }]
    }),
  ])
)

const KERNEL_LOCKS = 'kernel/locks.ts'

// knowledge-db is another database, and its one lock is a SKIP LOCKED claim
// written as SQL text.
const INGEST_JOBS = 'repositories/ingest-job.repository.ts'

const codeOf = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

const takersOf = (kind: string) =>
  files
    .filter((file) =>
      new RegExp(`\\b(lockRows|lockRowsNamed|rowsToLock)\\(\\s*'${kind}'`).test(
        codeOf(file)
      )
    )
    .map(name)

describe('locks', () => {
  it('are written in the kernel, so each one climbs the ladder', () => {
    const WAITS =
      /(?<!Symbol)\.for\(\s*(?!'update',\s*\{\s*skipLocked:\s*true\s*\}\s*\))|\bfor\s+(no\s+key\s+)?update\b(?!\s+skip\s+locked)|\bfor\s+(key\s+)?share\b|\bpg_(try_)?advisory/i
    const SKIPS = /\bfor\s+update\s+skip\s+locked\b/i
    const sources = files.map((file) => ({ file, code: codeOf(file) }))

    expect(
      sources
        .filter(({ code }) => WAITS.test(code))
        .map(({ file }) => name(file))
    ).toEqual([KERNEL_LOCKS])
    expect(
      sources
        .filter(({ code }) => SKIPS.test(code))
        .map(({ file }) => name(file))
    ).toEqual([INGEST_JOBS])
  })

  it('leave every update of an account row to the kernel', () => {
    const BARE =
      /\.update\(\s*(\w+\s*\.\s*)?users\s*\)|\bupdate\s+(only\s+)?"?users"?(?![\w"])/i
    const RENAMED = /\busers\s+as\s+\w|\busers\s*:\s*\w+\s*[,}]\s*=/
    const sources = files.map((file) => ({ file, code: codeOf(file) }))

    expect(
      sources
        .filter(({ code }) => BARE.test(code))
        .map(({ file }) => name(file))
    ).toEqual([KERNEL_LOCKS])
    expect(
      sources
        .filter(({ code }) => RENAMED.test(code))
        .map(({ file }) => name(file))
    ).toEqual([])
  })

  it('leave the reminder key of a plant to the Reminders store', () => {
    const takers = files
      .filter((file) =>
        (graph.get(file) ?? []).some(
          (imported) =>
            imported.target === join(SRC, KERNEL_LOCKS) &&
            /\blockReminderPlants\b/.test(imported.names)
        )
      )
      .map(name)

    expect(takers).toEqual([REMINDER_STORE_ROWS])
  })
})

describe('bounded contexts', () => {
  it('are imported through their index only', () => {
    const deepImports = files.flatMap((file) =>
      (graph.get(file) ?? [])
        .filter(({ target }) => {
          const context = contextOf(target)
          return (
            context !== null &&
            context !== contextOf(file) &&
            target !== join(CONTEXTS, context, 'index.ts')
          )
        })
        .map(({ specifier }) => `${name(file)} imports ${specifier}`)
    )

    expect(deepImports).toEqual([])
  })

  // A module the context needs at load time must not need the context back:
  // depending on which side loads first, the other reads an import that is
  // not initialised yet.
  it('are not imported by a module they load', () => {
    const loadedBy = (root: string): ReadonlySet<string> => {
      const seen = new Set<string>()
      const visit = (file: string) => {
        if (seen.has(file)) return
        seen.add(file)
        for (const imported of graph.get(file) ?? []) {
          if (!imported.erased) visit(imported.target)
        }
      }
      visit(root)
      return seen
    }

    const cycles = readdirSync(CONTEXTS).flatMap((context) => {
      const index = join(CONTEXTS, context, 'index.ts')
      return [...loadedBy(index)]
        .filter((file) => contextOf(file) !== context)
        .filter((file) =>
          (graph.get(file) ?? []).some(
            (imported) => !imported.erased && imported.target === index
          )
        )
        .map((file) => `contexts/${context} loads ${name(file)}`)
    })

    expect(cycles).toEqual([])
  })

  it('receive permits, owner proofs and seen rows built only where their check runs', () => {
    const CASTS = castsTo('PlantPermit|RecordPermit|PlanPermit|OwnerHeld|Seen')
    const builders = new Set(
      files.flatMap((file) =>
        CASTS.flatMap((cast) =>
          [...readFileSync(file, 'utf8').matchAll(cast)].map(
            (match) => `${match[1]} in ${name(file)}`
          )
        )
      )
    )

    expect(
      [...builders].sort(),
      'Get a permit through withPlantAuth, withPlantPermit, withRecordPermit or withCarePlanAuth, an OwnerHeld through withOwnerLock and a Seen row through seenByCaller. Building one anywhere else skips the role check, the lock or the redaction.'
    ).toEqual([
      `OwnerHeld in ${OWNER_LOCK}`,
      'PlanPermit in services/care-plans/helpers/with-care-plan-auth.ts',
      'PlantPermit in services/plants/helpers/with-plant-access.ts',
      `Seen in ${SEEN}`,
    ])
  })

  it('cast nothing to never', () => {
    const casters = files
      .filter((file) => /\bas\s+never\b/.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(
      casters,
      '`as never` fits any parameter, a permit or a Seen row included, so tsc stops checking it.'
    ).toEqual([])
  })

  it('brand a row Seen only in seen.ts', () => {
    const BRANDS =
      /\bbrand\(\s*['"`]Seen['"`]|\bBrand\s*<\s*['"`]Seen['"`]|\bnominal\s*<\s*Seen\b/
    const branders = files
      .filter((file) => name(file) !== SEEN)
      .filter((file) => BRANDS.test(readFileSync(file, 'utf8')))
      .map(name)
    const SCHEMAS = ['services/care-plans/api.ts', 'services/diagnosis/api.ts']
    const namesOf = (imported: Import): ReadonlyArray<string> => {
      const named = /^\{([^}]*)\}$/.exec(imported.names.trim())?.[1]
      return named === undefined
        ? ['*']
        : named
            .split(',')
            .map((part) => part.trim().replace(/^type\s+/, ''))
            .map((part) => part.split(/\s+as\s+/)[0] ?? '')
            .filter((part) => part !== '')
    }
    const mayImport = (file: string, imported: string) =>
      imported === 'seenByCaller' ||
      imported === 'Seen' ||
      (imported === 'seen' && SCHEMAS.includes(name(file)))
    const importers = files.flatMap((file) =>
      (graph.get(file) ?? [])
        .filter((imported) => imported.target === join(SRC, SEEN))
        .flatMap(namesOf)
        .filter((imported) => !mayImport(file, imported))
        .map((imported) => `${imported} in ${name(file)}`)
    )
    const LOADS = /\b(?:import|require)\(\s*['"`][^'"`]*\/seen(?:\.ts)?['"`]/
    const loaders = files
      .filter((file) => LOADS.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(
      branders,
      'A Seen row comes from seenByCaller. A brand made elsewhere skips the redaction.'
    ).toEqual([])
    expect(
      [...importers, ...loaders],
      'Decoding through `seen` makes a Seen row with nothing redacted, so only the success schemas import it. Elsewhere import seenByCaller or the type Seen by name.'
    ).toEqual([])
  })

  it('reach nothing in the tests', () => {
    const reachers = serverCode
      .filter((file) =>
        withoutComments(readFileSync(file, 'utf8')).includes('__tests__')
      )
      .map((file) => relative(PACKAGES, file))

    expect(
      reachers,
      'The test mocks build permits with no role check, so production code must not import or require them.'
    ).toEqual([])
  })

  it('take a permit and never read the current user', () => {
    const readers = files
      .filter((file) => contextOf(file) !== null)
      .filter((file) =>
        (graph.get(file) ?? []).some(
          (imported) =>
            imported.target === join(SRC, 'services/auth/middleware.types.ts')
        )
      )
      .map(name)

    expect(readers).toEqual([])
  })

  it('leave care logs and care schedules to the Care store', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?(careLogs|plantCareSchedules)\s*\)|(insert into|update|delete from)\s+"?(care_logs|plant_care_schedules)\b/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([CARE_STORE_WRITES])
  })

  it('leave care plans and their steps to the Care store', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?(carePlans|carePlanSteps)\s*\)|(insert into|update|delete from)\s+"?(care_plans|care_plan_steps)\b/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([CARE_STORE_WRITES])
  })

  it('leave the creation, the death, the revival and the removal of a plant to the Care store', () => {
    const WRITES =
      /\.(insert|delete)\(\s*(schema\.)?plants\s*\)|\.set\(\s*\{[^}]*\bdiedAt\b|(insert into|delete from)\s+"?plants\b|\bset\s+"?died_at"?\s*=/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([CARE_STORE_WRITES])
  })

  it('let the plant life endpoints tell Reminders and the app nothing themselves', () => {
    const tellers = PLANT_LIFE_ENDPOINTS.filter((endpoint) =>
      (graph.get(join(SRC, endpoint)) ?? []).some(
        (imported) =>
          contextOf(imported.target) === 'reminders' ||
          imported.target === join(SRC, 'events/index.ts')
      )
    )

    expect(
      PLANT_LIFE_ENDPOINTS.filter((endpoint) => !graph.has(join(SRC, endpoint)))
    ).toEqual([])
    expect(tellers).toEqual([])
  })

  it('leave reminder rows, their locks and their planning to Reminders', () => {
    const ROWS =
      /\.(writeReminders|lockReminders|lockReminderPlants|findHoldersOfWaitingReminders|findAccountsForKeyShare|findPlantsForKeyShare|hasOverdueReminderOn|findPlantIdsOfWaitingReminders)\(/
    const PLANNING = /\b(replan|replanPlants)\b/
    const reminders = join(CONTEXTS, 'reminders')
    const plans = (imported: Import & { readonly target: string }) =>
      imported.target.startsWith(join(reminders, 'store', '/')) ||
      imported.target === join(reminders, 'replan.ts') ||
      (imported.target === join(reminders, 'index.ts') &&
        PLANNING.test(imported.names))
    const outsiders = files
      .filter((file) => contextOf(file) !== 'reminders')
      .filter(
        (file) =>
          ROWS.test(readFileSync(file, 'utf8')) ||
          (graph.get(file) ?? []).some(plans)
      )
      .map(name)

    expect(outsiders).toEqual([])
  })

  it('leave canopies, members, links, invitations and mutes to the Canopy store', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?(canopies|canopyMembers|canopyInvites|canopyDirectInvites|canopyPlantMutes)\s*\)|(insert into|update|delete from)\s+"?(canopies|canopy_members|canopy_invites|canopy_direct_invites|canopy_plant_mutes)\b/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([CANOPY_STORE_WRITES])
  })

  it("change a plant's or a room's owner only in the Canopy store", () => {
    const OWNER_COLUMNS = /\bownerColumns\(/
    const SETS_OWNER =
      /\.update\(\s*(schema\.)?(plants|rooms)\s*\)\s*\.set\(\s*\{[^}]*\b(userId|canopyId)\b|\bupdate\s+"?(plants|rooms)"?\s+set\b[^;`]*\b(user_id|canopy_id)\b/i
    const matching = (pattern: RegExp) =>
      files
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map(name)
        .sort()

    expect(matching(OWNER_COLUMNS)).toEqual([
      CANOPY_STORE_WRITES,
      CARE_STORE_WRITES,
      'repositories/room.repository.ts',
    ])
    expect(matching(SETS_OWNER)).toEqual([CANOPY_STORE_WRITES])
  })

  it('lock a canopy row only in the Canopy store', () => {
    expect(takersOf('Canopy')).toEqual([CANOPY_STORE_LOCKS])
  })

  it('hear about Canopy changes through its topic', () => {
    const canopyCode = files.filter((file) =>
      CANOPY_CODE.some((path) => name(file).startsWith(path))
    )
    const askers = canopyCode
      .filter((file) =>
        (graph.get(file) ?? []).some(
          (imported) => contextOf(imported.target) === 'reminders'
        )
      )
      .map(name)

    expect(
      CANOPY_CODE.filter(
        (path) => !canopyCode.some((file) => name(file).startsWith(path))
      )
    ).toEqual([])
    expect(askers).toEqual([])
  })

  it('leave delegations and their plants to the Absence store', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?(careDelegations|delegationPlants)\s*\)|(insert into|update|delete from)\s+"?(care_delegations|delegation_plants)\b/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)
      .sort()

    expect(writers).toEqual([ABSENCE_STORE])
  })

  it('lock a delegation row only in the Absence store', () => {
    expect(takersOf('Delegation')).toEqual([ABSENCE_STORE])
  })

  it('give a vacation column a value only in the Absence store', () => {
    const SETS_A_COLUMN =
      /\bvacation(Status|Start|End)\??\s*:(?!\s*((schema\.)?users\.|VacationStatus\b|Date\b))|\bset\b[^;`]*\bvacation_(status|start|end)\b/i
    const writers = files
      .filter((file) => SETS_A_COLUMN.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([ABSENCE_STORE])
  })

  it('hear about Absence changes through its topic', () => {
    const absenceCode = files.filter((file) =>
      ABSENCE_CODE.some((path) => name(file).startsWith(path))
    )
    const askers = absenceCode
      .filter((file) =>
        (graph.get(file) ?? []).some(
          (imported) => contextOf(imported.target) === 'reminders'
        )
      )
      .map(name)

    expect(
      ABSENCE_CODE.filter(
        (path) => !absenceCode.some((file) => name(file).startsWith(path))
      )
    ).toEqual([])
    expect(askers).toEqual([])
  })

  it('keep Absence loadable without Canopy or Reminders', () => {
    const seen = new Set<string>()
    const visit = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const imported of graph.get(file) ?? []) visit(imported.target)
    }
    visit(join(CONTEXTS, 'absence', 'index.ts'))

    expect(
      [...seen]
        .filter((file) =>
          ['canopy', 'reminders'].includes(contextOf(file) ?? '')
        )
        .map(name)
    ).toEqual([])
  })

  it('keep Care loadable without Canopy, Absence or Reminders', () => {
    const seen = new Set<string>()
    const visit = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const imported of graph.get(file) ?? []) visit(imported.target)
    }
    visit(join(CONTEXTS, 'care', 'index.ts'))

    expect(
      [...seen]
        .filter((file) =>
          ['canopy', 'absence', 'reminders'].includes(contextOf(file) ?? '')
        )
        .map(name)
    ).toEqual([])
  })

  it('write reminder rows in the Reminders store and every other notification in the repository', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?notifications\s*\)|(insert into|update|delete from)\s+("?notifications\b|\$\{\s*(schema\.)?notifications\s*\})/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)
      .sort()

    expect(writers).toEqual([REMINDER_STORE_ROWS, ...NOTIFICATION_REPOSITORIES])
  })

  it('let the Reminders store insert reminder rows only', () => {
    type Inserted = ReminderWrites['inserts'][number]['type']

    expectTypeOf<Exclude<Inserted, DeferredCareType>>().toBeNever()
  })

  it('run every reminder lock and write inside a transaction', () => {
    type Store = ReminderStore['Service']
    type Needs<K extends keyof Store> = Store[K] extends (
      ...args: never
    ) => Effect.Effect<unknown, unknown, infer R>
      ? R
      : never

    expectTypeOf<Transaction>().toExtend<Needs<'lockReminderPlants'>>()
    expectTypeOf<Transaction>().toExtend<
      Needs<'findHoldersOfWaitingReminders'>
    >()
    expectTypeOf<Transaction>().toExtend<Needs<'findAccountsForKeyShare'>>()
    expectTypeOf<Transaction>().toExtend<Needs<'findPlantsForKeyShare'>>()
    expectTypeOf<Transaction>().toExtend<Needs<'lockReminders'>>()
    expectTypeOf<Transaction>().toExtend<Needs<'writeReminders'>>()
    expectTypeOf<Transaction>().toExtend<Needs<'hasOverdueReminderOn'>>()
  })

  it('let delivery alone move a notification by id or drop it', () => {
    const MOVES =
      /\.(deleteByIds|deferUntil|retryLater|markManyAsSent|markManyAsFailed|claimPendingToSchedule|claimForDelivery|releaseUnclaimed|releaseUnclaimedOlderThan|failAbandonedDeliveries|setQueuedContent)\(/
    const movers = files
      .filter((file) => MOVES.test(readFileSync(file, 'utf8')))
      .map(name)
      .filter((file) => !DELIVERY.some((allowed) => file.startsWith(allowed)))

    expect(movers).toEqual([])
  })

  it('cannot create or bulk-delete a reminder through the repository', () => {
    type Repository = NotificationRepository['Service']
    type Created = Parameters<Repository['create']>[0]['type']
    type Deleted = Parameters<
      Repository['deletePendingByUserIdAndTypes']
    >[1][number]

    expectTypeOf<Extract<Created, DeferredCareType>>().toBeNever()
    expectTypeOf<Extract<Deleted, DeferredCareType>>().toBeNever()
  })
})

// The kernel runs an after-commit effect with the services of the fiber
// that registered it, minus the transaction's own. Only these two files read
// a whole context: transact.ts strips it, services.ts picks from it.
const TRANSACT = 'kernel/transact.ts'
const SERVICES_OF = 'kernel/services.ts'
const CAPTURES_CONTEXT = /\bEffect\.context\b/

describe('captured contexts', () => {
  it('never reach an after-commit effect', () => {
    const capturers = files
      .filter((file) => name(file) !== TRANSACT)
      .filter((file) => /\.afterCommit\b/.test(codeOf(file)))
      .filter((file) => CAPTURES_CONTEXT.test(codeOf(file)))
      .map(name)

    expect(
      capturers,
      'Effect.context returns the whole fiber context. Captured inside a transaction it holds the connection the commit gives back to the pool, and an effect provided with it overrides what afterCommit strips. Pass the effect to afterCommit with its requirements instead.'
    ).toEqual([])
  })

  it('are taken in contexts and the kernel only through servicesOf', () => {
    const capturers = files
      .filter((file) => /^(contexts|kernel)\//.test(name(file)))
      .filter((file) => name(file) !== TRANSACT && name(file) !== SERVICES_OF)
      .filter((file) => CAPTURES_CONTEXT.test(codeOf(file)))
      .map(name)

    expect(
      capturers,
      'A context built in a layer holds the scope of the layer, and one built in a command holds its transaction. servicesOf keeps only the services it names.'
    ).toEqual([])
  })
})

const MINT = 'shared/src/services/file/stored-ref-mint.ts'
const storedRefWriters = serverCode.filter(
  (file) => relative(PACKAGES, file) !== MINT
)

describe('stored-object references', () => {
  const MADE_ELSEWHERE =
    'A StoredObjectRef comes from mintStoredRef, which only the upload path, readClientImage, readIssuedAvatar and the storedRef() column read call. A cast, a brand or a load of the mint anywhere else lets a client string reach a stored-object column.'

  it('are minted only where the server reads or writes an object', () => {
    const MINT_SITES = [
      'shared/src/services/file/gcs.ts',
      'api/src/services/helpers/client-image.ts',
      'db/src/schema/stored-ref.ts',
      'db/scripts/seed-demo-data.ts',
      'db/scripts/seed-reviewer.ts',
    ]
    const NAMES_THE_MINT = /\bmintStoredRef\b/
    const LOADS_THE_MINT =
      /\bimport\s*\*\s*as\s+[\w$]+\s+from\s*['"`][^'"`]*stored-ref-mint|\bexport\s*\*[^;'"`]*from\s*['"`][^'"`]*stored-ref-mint|\b(?:import|require)\s*\(\s*['"`][^'"`]*stored-ref-mint/
    const minters = storedRefWriters
      .filter((file) => !MINT_SITES.includes(relative(PACKAGES, file)))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return NAMES_THE_MINT.test(source) || LOADS_THE_MINT.test(source)
      })
      .map((file) => relative(PACKAGES, file))

    const IMPORT_STATEMENT = /^\s*import\b[\s\S]*?\bfrom\s*['"][^'"]+['"]/gm
    const usesTheMint = (site: string) =>
      NAMES_THE_MINT.test(
        withoutComments(readFileSync(join(PACKAGES, site), 'utf8')).replace(
          IMPORT_STATEMENT,
          ''
        )
      )
    expect(
      MINT_SITES.filter(
        (site) => !existsSync(join(PACKAGES, site)) || !usesTheMint(site)
      ),
      'A listed site that no longer calls mintStoredRef keeps an exemption it does not use. Drop it from MINT_SITES.'
    ).toEqual([])
    expect(minters, MADE_ELSEWHERE).toEqual([])
  })

  it('are cast to nowhere in the packages that write them', () => {
    const casters = storedRefWriters.filter((file) =>
      castsTo('StoredObjectRef').some((cast) =>
        cast.test(readFileSync(file, 'utf8'))
      )
    )

    expect(
      casters.map((file) => relative(PACKAGES, file)),
      MADE_ELSEWHERE
    ).toEqual([])
  })

  it('are branded only in the mint', () => {
    const BRANDS =
      /\bbrand\(\s*['"`]StoredObjectRef['"`]|\bBrand(?:ed)?\s*<[^>]*['"`]StoredObjectRef['"`]|\b(?:nominal|make|check|refined)\s*<\s*StoredObjectRef\b/
    const branders = storedRefWriters
      .filter((file) => BRANDS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(PACKAGES, file))

    expect(branders, MADE_ELSEWHERE).toEqual([])
  })
})
