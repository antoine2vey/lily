import { Api } from '@lily/api/api'
import { Array, Option, pipe, type Schema, SchemaAST } from 'effect'
import { HttpApi } from 'effect/http-api'
import { describe, expect, it } from 'vitest'

const resolve = <A>(key: string, schema: Schema.Top) =>
  Option.fromNullishOr(SchemaAST.resolveAt<A>(key)(schema.ast))

const multipartEndpoints = (() => {
  let collected: ReadonlyArray<{
    readonly name: string
    readonly errors: ReadonlyArray<Schema.Top>
  }> = []
  HttpApi.reflect(Api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint }) => {
      const isMultipart = Array.some(
        Array.fromIterable(endpoint.payload.values()),
        ({ encoding }) => encoding._tag === 'Multipart'
      )
      if (isMultipart) {
        collected = Array.append(collected, {
          name: `${group.identifier}.${endpoint.identifier}`,
          errors: Array.fromIterable(endpoint.error),
        })
      }
    },
  })
  return collected
})()

describe('upload endpoints', () => {
  it('finds the upload endpoints', () => {
    expect(multipartEndpoints.length).toBeGreaterThanOrEqual(8)
  })

  it.each(multipartEndpoints.map((e) => [e.name, e.errors] as const))(
    '%s answers a non-image upload with a 400 InvalidImageError',
    (_name, errors) => {
      const invalidImage = Array.findFirst(errors, (schema) =>
        pipe(
          resolve<string>('identifier', schema),
          Option.contains('InvalidImageError')
        )
      )

      expect(
        Option.flatMap(invalidImage, (schema) =>
          resolve<number>('httpApiStatus', schema)
        )
      ).toEqual(Option.some(400))
    }
  )
})
