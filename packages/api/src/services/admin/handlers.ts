import type { Api } from '@lily/api/api'
import { createGiftCode } from '@lily/api/services/admin/endpoints/create-gift-code'
import { deleteGiftCode } from '@lily/api/services/admin/endpoints/delete-gift-code'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { getGiftCode } from '@lily/api/services/admin/endpoints/get-gift-code'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { getUserOverview } from '@lily/api/services/admin/endpoints/get-user-overview'
import { getUserPlants } from '@lily/api/services/admin/endpoints/get-user-plants'
import { giftSubscription } from '@lily/api/services/admin/endpoints/gift-subscription'
import { listGiftCodes } from '@lily/api/services/admin/endpoints/list-gift-codes'
import { listGiftHistory } from '@lily/api/services/admin/endpoints/list-gift-history'
import { listUserConversationMessages } from '@lily/api/services/admin/endpoints/list-user-conversation-messages'
import { listUserConversations } from '@lily/api/services/admin/endpoints/list-user-conversations'
import { listUsers } from '@lily/api/services/admin/endpoints/list-users'
import { previewPrompt } from '@lily/api/services/admin/endpoints/preview-prompt'
import { revokeGiftSubscription } from '@lily/api/services/admin/endpoints/revoke-gift-subscription'
import { triggerLiveActivityStart } from '@lily/api/services/admin/endpoints/trigger-live-activity-start'
import { updateGiftCode } from '@lily/api/services/admin/endpoints/update-gift-code'
import { updateRole } from '@lily/api/services/admin/endpoints/update-role'
import { updateStatus } from '@lily/api/services/admin/endpoints/update-status'
import { updateUser } from '@lily/api/services/admin/endpoints/update-user'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const AdminApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'admin', (handlers) =>
    handlers
      .handle('listUsers', ({ query: urlParams }) =>
        listUsers(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUser', ({ params: { id } }) =>
        getUser(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUserOverview', ({ params: { id } }) =>
        getUserOverview(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUserPlants', ({ params: { id }, query: urlParams }) =>
        getUserPlants(id, urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('listUserConversations', ({ params: { id }, query: urlParams }) =>
        listUserConversations(id, urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle(
        'listUserConversationMessages',
        ({ params: { id, conversationId }, query: urlParams }) =>
          listUserConversationMessages(id, conversationId, urlParams).pipe(
            withInfraErrorsAsDefect
          )
      )
      .handle('updateUser', ({ params: { id }, payload }) =>
        updateUser(id, payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUserRole', ({ params: { id }, payload }) =>
        updateRole(id, payload.role).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUserStatus', ({ params: { id }, payload }) =>
        updateStatus(id, payload.status).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteUser', ({ params: { id } }) =>
        deleteUser(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('giftSubscription', ({ params: { id }, payload }) =>
        giftSubscription(id, payload.duration).pipe(withInfraErrorsAsDefect)
      )
      .handle('listGiftHistory', ({ query: urlParams }) =>
        listGiftHistory(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('revokeGiftSubscription', ({ params: { id } }) =>
        revokeGiftSubscription(id).pipe(withInfraErrorsAsDefect)
      )
      .handle('previewPrompt', ({ params: { messageId } }) =>
        previewPrompt(messageId).pipe(withInfraErrorsAsDefect)
      )
      .handle('listGiftCodes', ({ query: urlParams }) =>
        listGiftCodes(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('createGiftCode', ({ payload }) =>
        createGiftCode(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('getGiftCode', ({ params: { codeId } }) =>
        getGiftCode(codeId).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateGiftCode', ({ params: { codeId }, payload }) =>
        updateGiftCode(codeId, payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteGiftCode', ({ params: { codeId } }) =>
        deleteGiftCode(codeId).pipe(withInfraErrorsAsDefect)
      )
      .handle('triggerLiveActivityStart', ({ params: { id } }) =>
        triggerLiveActivityStart(id).pipe(withInfraErrorsAsDefect)
      )
  )
