import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AdminService } from '@lily/api/services/admin/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RagService } from '@lily/api/services/rag/service'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { Effect, Layer } from 'effect'

export const AdminApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin', (handlers) =>
    Effect.gen(function* () {
      const adminService = yield* AdminService

      return handlers
        .handle('listUsers', ({ urlParams }) =>
          adminService.listUsers(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getUser', ({ path: { id } }) =>
          adminService.getUser(id).pipe(withInfraErrorsAsDefect)
        )
        .handle('updateUser', ({ path: { id }, payload }) =>
          adminService.updateUser(id, payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('updateUserRole', ({ path: { id }, payload }) =>
          adminService
            .updateRole(id, payload.role)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('updateUserStatus', ({ path: { id }, payload }) =>
          adminService
            .updateStatus(id, payload.status)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('deleteUser', ({ path: { id } }) =>
          adminService.deleteUser(id).pipe(withInfraErrorsAsDefect)
        )
        .handle('previewPrompt', ({ path: { messageId } }) =>
          adminService.previewPrompt(messageId).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(AdminService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(ChatRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(CareLogRepositoryLive),
    Layer.provide(RagService.Default),
    Layer.provide(ProcessedChunkRepositoryLive),
    Layer.provide(KnowledgeDrizzleLive),
    Layer.provide(AdminAuthLive)
  )
