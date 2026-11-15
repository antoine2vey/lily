import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Array, Order, pipe, Schema, String } from 'effect'
import { describe, expect, it } from 'vitest'

// drizzle-kit migrate, which local databases use, runs only the files the
// journal lists, and only those whose `when` is later than the last one it
// applied. The production migrator reads the folder instead, so a file the
// journal misses still runs in production and never runs locally.
const DRIZZLE = resolve(import.meta.dirname, '../../drizzle')

const Journal = Schema.Struct({
  entries: Schema.Array(
    Schema.Struct({ when: Schema.Number, tag: Schema.String })
  ),
})

const journal = Schema.decodeUnknownSync(Journal)(
  JSON.parse(readFileSync(join(DRIZZLE, 'meta/_journal.json'), 'utf-8'))
)

describe('knowledge-db migration journal', () => {
  it('lists every migration file', () => {
    const files = pipe(
      readdirSync(DRIZZLE),
      Array.filter(String.endsWith('.sql')),
      Array.map(String.replace('.sql', '')),
      Array.sort(Order.String)
    )
    const tags = pipe(
      journal.entries,
      Array.map((entry) => entry.tag),
      Array.sort(Order.String)
    )
    expect(tags).toEqual(files)
  })

  it('gives each entry a later `when` than the one before', () => {
    const whens = Array.map(journal.entries, (entry) => entry.when)
    expect(whens).toEqual(Array.sort(Array.dedupe(whens), Order.Number))
  })
})
