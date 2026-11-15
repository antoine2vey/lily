import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Array, Option, pipe, String } from 'effect'
import { expect, it } from 'vitest'

const ios = join(import.meta.dirname, '../../ios')

// TFLite metadata appends labelmap.txt to the model as a stored zip entry.
const readLabelMap = (model: Buffer) => {
  const header = model.lastIndexOf('PK\x03\x04')
  const nameLength = model.readUInt16LE(header + 26)
  const start = header + 30 + nameLength + model.readUInt16LE(header + 28)
  expect(model.toString('utf8', header + 30, header + 30 + nameLength)).toBe(
    'labelmap.txt'
  )
  expect(model.readUInt16LE(header + 8)).toBe(0)
  return pipe(
    model.toString('utf8', start, start + model.readUInt32LE(header + 18)),
    String.trimEnd,
    String.split('\n')
  )
}

const readTargetClassIds = (swift: string) =>
  pipe(
    Option.fromNullishOr(
      /targetClassIds: Set<Int> = \[([^\]]*)\]/.exec(swift)?.[1]
    ),
    Option.getOrThrow,
    String.split(','),
    Array.map((id) => Number(String.trim(id)))
  )

it('accepts exactly the potted plant and vase classes of the bundled model', () => {
  const labels = readLabelMap(
    readFileSync(join(ios, 'efficientdet_lite0.tflite'))
  )
  const accepted = pipe(
    readTargetClassIds(readFileSync(join(ios, 'PlantDetector.swift'), 'utf8')),
    Array.map((id) =>
      pipe(
        Array.get(labels, id),
        Option.getOrElse(() => `no label at ${id}`)
      )
    ),
    Array.sort(String.Order)
  )

  expect(accepted).toEqual(['potted plant', 'vase'])
})
