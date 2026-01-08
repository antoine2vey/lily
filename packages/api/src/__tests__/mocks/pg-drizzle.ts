import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Layer } from 'effect'

export const createMockPgDrizzle = (): Layer.Layer<PgDrizzle.PgDrizzle> => {
  // Create a no-op mock - tests should mock at the repository/service level
  // This is only needed to satisfy type requirements when AiService is mocked
  return Layer.succeed(
    PgDrizzle.PgDrizzle,
    {} as unknown as PgDrizzle.PgDrizzle['Type']
  )
}
