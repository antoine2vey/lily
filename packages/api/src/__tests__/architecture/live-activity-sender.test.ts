import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
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

const SENDS = /\.sendLiveActivity\(/

describe('Live Activity pushes', () => {
  it('are sent only by src/services/live-activity/cards.ts', () => {
    const senders = walk(SRC)
      .filter((file) => SENDS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))

    expect(senders).toEqual(['services/live-activity/cards.ts'])
  })
})
