import { Schema, SchemaTransformation } from 'effect'

/**
 * A plant id from a request path, lowercased. Postgres matches a uuid in any
 * case and answers it in lowercase, so every lookup and every not-found error
 * downstream carries the same id the stored row does.
 */
export const PlantIdParam = Schema.String.pipe(
  Schema.decode(SchemaTransformation.toLowerCase())
).check(Schema.isGUID())
