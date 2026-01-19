import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AdminService } from '@lily/api/services/admin/service'
import { Effect, Layer } from 'effect'

export const AdminApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin', (handlers) =>
    Effect.gen(function* () {
      const adminService = yield* AdminService

      return handlers
        .handle('listUsers', ({ urlParams }) =>
          adminService.listUsers(urlParams)
        )
        .handle('getUser', ({ path: { id } }) => adminService.getUser(id))
        .handle('updateUser', ({ path: { id }, payload }) =>
          adminService.updateUser(id, payload)
        )
        .handle('updateUserRole', ({ path: { id }, payload }) =>
          adminService.updateRole(id, payload.role)
        )
        .handle('updateUserStatus', ({ path: { id }, payload }) =>
          adminService.updateStatus(id, payload.status)
        )
        .handle('deleteUser', ({ path: { id } }) => adminService.deleteUser(id))
    })
  ).pipe(
    Layer.provide(AdminService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(AdminAuthLive)
  )
