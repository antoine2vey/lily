import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../..')
const CONTEXTS = join(SRC, 'contexts')

const MAY_MINT_PERMITS = [
  'kernel/permit.ts',
  'services/plants/helpers/with-plant-access.ts',
  'services/care-plans/helpers/with-care-plan-auth.ts',
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
})
