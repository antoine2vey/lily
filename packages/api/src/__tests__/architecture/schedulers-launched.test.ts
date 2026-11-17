import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../..')

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : walk(path)
    }
    return path.endsWith('.ts') ? [path] : []
  })

const SCHEDULER_EXPORT =
  /^export const (\w+) = create(?:Drainable)?Scheduler\(/gm

describe('schedulers', () => {
  it('are all launched by src/server.ts', () => {
    const server = readFileSync(join(SRC, 'server.ts'), 'utf8')
    const schedulers = walk(join(SRC, 'services')).flatMap((file) =>
      Array.from(
        readFileSync(file, 'utf8').matchAll(SCHEDULER_EXPORT),
        (match) => match[1]!
      )
    )

    expect(schedulers).toContain('startAuthCleanupScheduler')
    expect(
      schedulers.filter((name) => !new RegExp(`\\b${name}\\b`).test(server))
    ).toEqual([])
  })
})
