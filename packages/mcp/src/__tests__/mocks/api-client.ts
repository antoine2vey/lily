import { ApiClient, type IApiClient } from '@lily/mcp/api-client'
import { Effect, Layer } from 'effect'

const emptyPaginated = {
  items: [],
  hasMore: false,
  total: 0,
  page: 1,
  limit: 100,
}

export const createMockApiClient = (
  overrides: Partial<IApiClient> = {}
): Layer.Layer<ApiClient> => {
  const defaults: IApiClient = {
    sendMagicLink: () => Effect.succeed({ message: 'sent' }),
    issueServiceToken: () => Effect.die(new Error('Not mocked')),
    listPlants: () => Effect.succeed(emptyPaginated),
    getPlant: () => Effect.die(new Error('Not mocked')),
    getCareLogs: () => Effect.succeed(emptyPaginated),
    carePlant: () => Effect.die(new Error('Not mocked')),
    getCareTasks: () =>
      Effect.succeed({
        overdue: [],
        today: [],
        upcoming: [],
        completedToday: 0,
      }),
    queryKnowledge: () => Effect.succeed({ answer: '', sources: [] }),
    refreshToken: () => Effect.die(new Error('Not mocked')),
  }
  return Layer.succeed(ApiClient, { ...defaults, ...overrides })
}
