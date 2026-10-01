import { PgTypes } from '@effect/sql-pg'
import { Array, Effect, Option, Result } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const halfToNumber = (bits: number): number => {
  const sign = bits & 0x8000 ? -1 : 1
  const exponent = (bits >> 10) & 0x1f
  const fraction = bits & 0x3ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 0x400)
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN
  return sign * 2 ** (exponent - 15) * (1 + fraction / 0x400)
}

// pgvector's halfvec_send: int16 dim, int16 unused, then dim big-endian
// IEEE 754 binary16 values.
export const decodeHalfvec = (
  bytes: Uint8Array
): Result.Result<Array<number>, PgTypes.CodecError> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dim = bytes.byteLength < 4 ? 0 : view.getUint16(0)
  return dim > 0 && bytes.byteLength === 4 + 2 * dim
    ? Result.succeed(
        Array.makeBy(dim, (i) => halfToNumber(view.getUint16(4 + 2 * i)))
      )
    : Result.fail(
        new PgTypes.CodecError({
          message: `Malformed halfvec: ${bytes.byteLength} bytes for dim ${dim}`,
        })
      )
}

// Parameters never carry the halfvec OID: drizzle sends the '[...]' text form
// untyped and the server infers the column type.
const halfvecCodec: PgTypes.Codec<Array<number>> = {
  encode: () =>
    Result.fail(
      new PgTypes.CodecError({ message: 'halfvec parameters bind as text' })
    ),
  decode: decodeHalfvec,
}

// halfvec is an extension type, so its OID differs per database. A database
// without pgvector has no halfvec columns to decode.
export const registerHalfvec = (
  client: SqlClient.SqlClient,
  types: PgTypes.Registry
): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    const rows = yield* client<{
      readonly oid: number | null
    }>`select to_regtype('halfvec')::oid as oid`
    const oid = Option.flatMapNullishOr(Array.head(rows), (row) => row.oid)
    if (Option.isSome(oid)) types.register(oid.value, halfvecCodec)
  })
