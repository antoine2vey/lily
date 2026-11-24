import { expectWritten, RowsNotWrittenDefect } from '@lily/api/kernel/written'
import { plants } from '@lily/db/schema'
import { defectOf } from '@lily/shared/testing'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

const bury = { _tag: 'BuryPlant', plantId: 'fern' } as const

describe('expectWritten', () => {
  it('passes when the write returned as many rows as it names', async () => {
    const exit = await Effect.runPromiseExit(
      expectWritten(plants, bury)([{ id: 'fern' }])
    )

    expect(exit).toEqual(Exit.void)
  })

  it('dies naming the table, the write and both counts otherwise', async () => {
    const exit = await Effect.runPromiseExit(
      expectWritten(plants, bury, 2)([{ id: 'fern' }])
    )

    expect(defectOf(exit)).toEqual(
      new RowsNotWrittenDefect({
        table: 'plants',
        write: bury,
        expected: 2,
        written: 1,
      })
    )
    expect(String(defectOf(exit))).toBe(
      'RowsNotWrittenDefect: BuryPlant wrote 1 of 2 rows of plants'
    )
  })
})
