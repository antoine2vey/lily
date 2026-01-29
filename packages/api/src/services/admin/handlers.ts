import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AdminService } from '@lily/api/services/admin/service'
import { withSqlErrorAsDefect } from '@lily/api/services/helpers/sql-error'
import { Effect, Layer } from 'effect'

export const AdminApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin', (handlers) =>
    Effect.gen(function* () {
      const adminService = yield* AdminService

      return handlers
        .handle('listUsers', ({ urlParams }) =>
          adminService.listUsers(urlParams).pipe(withSqlErrorAsDefect)
        )
        .handle('getUser', ({ path: { id } }) =>
          adminService.getUser(id).pipe(withSqlErrorAsDefect)
        )
        .handle('updateUser', ({ path: { id }, payload }) =>
          adminService.updateUser(id, payload).pipe(withSqlErrorAsDefect)
        )
        .handle('updateUserRole', ({ path: { id }, payload }) =>
          adminService.updateRole(id, payload.role).pipe(withSqlErrorAsDefect)
        )
        .handle('updateUserStatus', ({ path: { id }, payload }) =>
          adminService.updateStatus(id, payload.status).pipe(withSqlErrorAsDefect)
        )
        .handle('deleteUser', ({ path: { id } }) =>
          adminService.deleteUser(id).pipe(withSqlErrorAsDefect)
        )
    })
  ).pipe(
    Layer.provide(AdminService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(AdminAuthLive)
  )
