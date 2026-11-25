import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import { GCSDeleteError } from '@lily/api/services/file/gcs-errors'
import { InvalidImageError } from '@lily/api/services/file/image-upload'
import { AuthError, PaginatedResponse, PaginationParams } from '@lily/shared'
import {
  AdminGiftEvent,
  AdminGiftSubscriptionRequest,
  AdminGiftSubscriptionResponse,
  AdminLiveActivityTriggerResponse,
  AdminRevokeGiftResponse,
  AdminRoleChangeRequest,
  AdminStatusChangeRequest,
  AdminUser,
  AdminUserListParams,
  AdminUserOverview,
  AdminUserUpdateRequest,
  GiftCode,
  GiftCodeCreateRequest,
  GiftCodeUpdateRequest,
  GiftCodeWithRedemptions,
  PromptPreviewResponse,
} from '@lily/shared/admin'
import {
  ChatConversationListResponse,
  ChatHistoryListResponse,
  ConversationNotFoundError,
} from '@lily/shared/ai-chat'
import {
  CannotModifySelfError,
  ChatMessageNotFoundError,
  ForbiddenError,
  StorePayerProtectedError,
} from '@lily/shared/errors/admin'
import {
  GiftCodeDuplicateError,
  GiftCodeExpiryInPastError,
  GiftCodeMaxUsagesTooLowError,
  GiftCodeNotFoundError,
} from '@lily/shared/errors/gift-code'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { PlantsListResponse } from '@lily/shared/plant'
import { Schema, SchemaTransformation } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Lowercased like `PlantIdParam`. Postgres matches a uuid in any case, but the
// self checks and the per-user advisory key compare the id as text.
const userIdParam = Schema.String.pipe(
  Schema.decode(SchemaTransformation.toLowerCase())
).check(Schema.isGUID())

const messageIdParam = Schema.String.check(Schema.isGUID())

const codeIdParam = Schema.String.check(Schema.isGUID())

const conversationIdParam = Schema.String.check(Schema.isGUID())

export const AdminApi = HttpApiGroup.make('admin')
  .add(
    HttpApiEndpoint.get('listUsers', '/users', {
      query: AdminUserListParams,
      success: PaginatedResponse(AdminUser),
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get('getUser', '/users/:id', {
      params: { id: userIdParam },
      success: AdminUser,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.put('updateUser', '/users/:id', {
      params: { id: userIdParam },
      payload: AdminUserUpdateRequest,
      success: AdminUser,
      error: [
        UserNotFoundError,
        CannotModifySelfError,
        ForbiddenError,
        AuthError,
        InvalidImageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.put('updateUserRole', '/users/:id/role', {
      params: { id: userIdParam },
      payload: AdminRoleChangeRequest,
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.put('updateUserStatus', '/users/:id/status', {
      params: { id: userIdParam },
      payload: AdminStatusChangeRequest,
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteUser', '/users/:id', {
      params: { id: userIdParam },
      success: AdminUser,
      error: [
        UserNotFoundError,
        CannotModifySelfError,
        ForbiddenError,
        GCSDeleteError.pipe(HttpApiSchema.status(500)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('giftSubscription', '/users/:id/gift-subscription', {
      params: { id: userIdParam },
      payload: AdminGiftSubscriptionRequest,
      success: AdminGiftSubscriptionResponse,
      error: [
        UserNotFoundError,
        CannotModifySelfError,
        StorePayerProtectedError,
        ForbiddenError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('listGiftHistory', '/gift-history', {
      query: PaginationParams,
      success: PaginatedResponse(AdminGiftEvent),
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.post('revokeGiftSubscription', '/users/:id/revoke-gift', {
      params: { id: userIdParam },
      success: AdminRevokeGiftResponse,
      error: [
        UserNotFoundError,
        CannotModifySelfError,
        StorePayerProtectedError,
        ForbiddenError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('previewPrompt', '/prompt-preview/:messageId', {
      params: { messageId: messageIdParam },
      success: PromptPreviewResponse,
      error: [ChatMessageNotFoundError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.get('listGiftCodes', '/gift-codes', {
      query: PaginationParams,
      success: PaginatedResponse(GiftCode),
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.post('createGiftCode', '/gift-codes', {
      payload: GiftCodeCreateRequest,
      success: GiftCode,
      error: [
        GiftCodeDuplicateError,
        GiftCodeExpiryInPastError,
        ForbiddenError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('getGiftCode', '/gift-codes/:codeId', {
      params: { codeId: codeIdParam },
      success: GiftCodeWithRedemptions,
      error: [GiftCodeNotFoundError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.put('updateGiftCode', '/gift-codes/:codeId', {
      params: { codeId: codeIdParam },
      payload: GiftCodeUpdateRequest,
      success: GiftCode,
      error: [
        GiftCodeNotFoundError,
        GiftCodeDuplicateError,
        GiftCodeMaxUsagesTooLowError,
        GiftCodeExpiryInPastError,
        ForbiddenError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteGiftCode', '/gift-codes/:codeId', {
      params: { codeId: codeIdParam },
      success: GiftCode,
      error: [GiftCodeNotFoundError, ForbiddenError],
    })
  )
  .add(
    // POST /admin/users/:id/live-activity/trigger-start - Force a fresh
    // push-to-start for the user's active start tokens. Returns per-token
    // outcomes so an operator can see APNs handoff status without waiting
    // for a real care notification.
    HttpApiEndpoint.post(
      'triggerLiveActivityStart',
      '/users/:id/live-activity/trigger-start',
      {
        params: { id: userIdParam },
        success: AdminLiveActivityTriggerResponse,
        error: [UserNotFoundError, ForbiddenError],
      }
    )
  )
  .add(
    HttpApiEndpoint.get('getUserOverview', '/users/:id/overview', {
      params: { id: userIdParam },
      success: AdminUserOverview,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.get('getUserPlants', '/users/:id/plants', {
      params: { id: userIdParam },
      query: PaginationParams,
      success: PlantsListResponse,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    HttpApiEndpoint.get('listUserConversations', '/users/:id/conversations', {
      params: { id: userIdParam },
      query: PaginationParams,
      success: ChatConversationListResponse,
      error: ForbiddenError,
    })
  )
  .add(
    HttpApiEndpoint.get(
      'listUserConversationMessages',
      '/users/:id/conversations/:conversationId/messages',
      {
        params: { id: userIdParam, conversationId: conversationIdParam },
        query: PaginationParams,
        success: ChatHistoryListResponse,
        error: [
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          ForbiddenError,
        ],
      }
    )
  )
  .prefix('/admin')
  .middleware(AdminAuth)
