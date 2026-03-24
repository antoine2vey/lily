import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { giftSubscription } from '@lily/api/services/admin/endpoints/gift-subscription'
import { listGiftHistory } from '@lily/api/services/admin/endpoints/list-gift-history'
import { listUsers } from '@lily/api/services/admin/endpoints/list-users'
import { previewPrompt } from '@lily/api/services/admin/endpoints/preview-prompt'
import { revokeGiftSubscription } from '@lily/api/services/admin/endpoints/revoke-gift-subscription'
import { updateRole } from '@lily/api/services/admin/endpoints/update-role'
import { updateStatus } from '@lily/api/services/admin/endpoints/update-status'
import { updateUser } from '@lily/api/services/admin/endpoints/update-user'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const AdminApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin', (handlers) =>
    handlers
      .handle('listUsers', ({ urlParams }) =>
        listUsers(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUser', ({ path: { id } }) =>
        getUser(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUser', ({ path: { id }, payload }) =>
        updateUser(id, payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUserRole', ({ path: { id }, payload }) =>
        updateRole(id, payload.role).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUserStatus', ({ path: { id }, payload }) =>
        updateStatus(id, payload.status).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteUser', ({ path: { id } }) =>
        deleteUser(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('giftSubscription', ({ path: { id }, payload }) =>
        giftSubscription(id, payload.duration).pipe(withInfraErrorsAsDefect)
      )
      .handle('listGiftHistory', ({ urlParams }) =>
        listGiftHistory(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('revokeGiftSubscription', ({ path: { id } }) =>
        revokeGiftSubscription(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('previewPrompt', ({ path: { messageId } }) =>
        previewPrompt(messageId).pipe(withInfraErrorsAsDefect)
      )
  )
