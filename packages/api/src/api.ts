import { HttpApi } from '@effect/platform'
import { PlantsApi } from '@lily/api/services/plants/api'
import { UsersApi } from '@lily/api/services/user/api'

// Create API that includes both Plants and Users
export const Api = HttpApi.make('Api')
  .add(PlantsApi)
  .add(UsersApi)
  .prefix('/api')

export type Api = typeof Api
