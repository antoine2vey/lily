import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { DeferredCareType } from '@lily/shared/server'
import { describe, expect, expectTypeOf, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../..')
const CONTEXTS = join(SRC, 'contexts')

const MAY_MINT_PERMITS = [
  'kernel/permit.ts',
  'services/plants/helpers/with-plant-access.ts',
  'services/care-plans/helpers/with-care-plan-auth.ts',
]

const NOTIFICATION_REPOSITORY = 'repositories/notification.repository.ts'

// Delivery moves a row through its statuses and drops the ones it must not
// send. It never plans one.
const DELIVERY = [
  'services/notification-scheduler/',
  'services/helpers/schedule-notification.ts',
]

const CANOPY_STORE = 'contexts/canopy/store.ts'

const CANOPY_CODE = [
  'contexts/canopy/',
  'services/canopy/',
  'services/plants/endpoints/share-plant-with-canopy.ts',
  'services/plants/endpoints/unshare-plant.ts',
  'services/plants/endpoints/mute-plant.ts',
]

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : walk(path)
    }
    return path.endsWith('.ts') ? [path] : []
  })

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

const files = walk(SRC)
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

  it('receive permits minted by an access module only', () => {
    const minters = files
      .filter((file) =>
        (graph.get(file) ?? []).some(
          (imported) =>
            imported.target === join(SRC, 'kernel/permit.ts') &&
            /\bmintPermit\b/.test(imported.names)
        )
      )
      .map(name)

    expect(minters.filter((file) => !MAY_MINT_PERMITS.includes(file))).toEqual(
      []
    )
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

    expect(writers).toEqual(['contexts/care/store.ts'])
  })

  it('leave reminder rows, their locks and their planning to Reminders', () => {
    const ROWS =
      /\.(writeReminders|lockReminders|lockReminderPlants|findHoldersOfWaitingReminders)\(/
    const PLANNING = /\b(replan|replanPlants)\b/
    const reminders = join(CONTEXTS, 'reminders')
    const plans = (imported: Import & { readonly target: string }) =>
      imported.target === join(reminders, 'store.ts') ||
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

    expect(writers).toEqual([CANOPY_STORE])
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
      CANOPY_STORE,
      'repositories/plant.repository.ts',
      'repositories/room.repository.ts',
    ])
    expect(matching(SETS_OWNER)).toEqual([CANOPY_STORE])
  })

  it('lock a canopy row only in the Canopy store', () => {
    const LOCKS =
      /\.(from|innerJoin|leftJoin|rightJoin|fullJoin)\(\s*(schema\.)?canopies\b(?:(?!\n\s*\n|\byield\*|\bconst\b|\breturn\b)[\s\S])*?\.for\(|\bfrom\s+"?canopies"?\b[^`;]*?\bfor\s+(no\s+key\s+update|update|key\s+share|share)\b/i
    const lockers = files
      .filter((file) => LOCKS.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(lockers).toEqual([CANOPY_STORE])
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

  it('keep every write of the notifications table in its repository', () => {
    const WRITES =
      /\.(insert|update|delete)\(\s*(schema\.)?notifications\s*\)|(insert into|update|delete from)\s+"?notifications\b/i
    const writers = files
      .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
      .map(name)

    expect(writers).toEqual([NOTIFICATION_REPOSITORY])
  })

  it('let delivery alone move a notification by id or drop it', () => {
    const MOVES =
      /\b[nN]otifications?(Repo)?\s*\.(deleteByIds|deferUntil|retryLater|markManyAsSent|markManyAsFailed|claimPendingToSchedule|claimForDelivery|releaseUnclaimed|releaseUnclaimedOlderThan|failAbandonedDeliveries|setQueuedContent)\(/
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
