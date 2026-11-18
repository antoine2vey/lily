import * as PgDrizzle from '@lily/db/effect-drizzle'
import { Layer } from 'effect'

// Create a no-op mock - tests should mock at the repository/service level
// This is only needed to satisfy type requirements when AiService is mocked
export const createMockPgDrizzle: Layer.Layer<PgDrizzle.PgDrizzle> =
  Layer.succeed(
    PgDrizzle.PgDrizzle,
    {} as unknown as PgDrizzle.PgDrizzle['Service']
  )
