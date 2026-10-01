import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import { PaginatedResponse, PaginationParams } from '@lily/shared'
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
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Path parameter for user ID
const userIdParam = Schema.String.check(Schema.isGUID())

// Path parameter for message ID (prompt preview)
const messageIdParam = Schema.String.check(Schema.isGUID())

// Path parameter for gift code ID
const codeIdParam = Schema.String.check(Schema.isGUID())

// Path parameter for chat conversation ID
const conversationIdParam = Schema.String.check(Schema.isGUID())

// Define the Admin API group
export const AdminApi = HttpApiGroup.make('admin')
  .add(
    // GET /admin/users - List all users (paginated with filters)
    HttpApiEndpoint.get('listUsers', '/users', {
      query: AdminUserListParams,
      success: PaginatedResponse(AdminUser),
      error: ForbiddenError,
    })
  )
  .add(
    // GET /admin/users/:id - Get user by ID
    HttpApiEndpoint.get('getUser', '/users/:id', {
      params: { id: userIdParam },
      success: AdminUser,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    // PUT /admin/users/:id - Update user
    HttpApiEndpoint.put('updateUser', '/users/:id', {
      params: { id: userIdParam },
      payload: AdminUserUpdateRequest,
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    // PUT /admin/users/:id/role - Change user role
    HttpApiEndpoint.put('updateUserRole', '/users/:id/role', {
      params: { id: userIdParam },
      payload: AdminRoleChangeRequest,
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    // PUT /admin/users/:id/status - Change user status
    HttpApiEndpoint.put('updateUserStatus', '/users/:id/status', {
      params: { id: userIdParam },
      payload: AdminStatusChangeRequest,
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    // DELETE /admin/users/:id - Delete user
    HttpApiEndpoint.delete('deleteUser', '/users/:id', {
      params: { id: userIdParam },
      success: AdminUser,
      error: [UserNotFoundError, CannotModifySelfError, ForbiddenError],
    })
  )
  .add(
    // POST /admin/users/:id/gift-subscription - Gift a paid subscription
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
    // GET /admin/gift-history - List gift subscription events
    HttpApiEndpoint.get('listGiftHistory', '/gift-history', {
      query: PaginationParams,
      success: PaginatedResponse(AdminGiftEvent),
      error: ForbiddenError,
    })
  )
  .add(
    // POST /admin/users/:id/revoke-gift - Revoke a gifted subscription
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
    // GET /admin/prompt-preview/:messageId - Preview AI prompt for a message
    HttpApiEndpoint.get('previewPrompt', '/prompt-preview/:messageId', {
      params: { messageId: messageIdParam },
      success: PromptPreviewResponse,
      error: [ChatMessageNotFoundError, ForbiddenError],
    })
  )
  .add(
    // GET /admin/gift-codes - List all gift codes (paginated)
    HttpApiEndpoint.get('listGiftCodes', '/gift-codes', {
      query: PaginationParams,
      success: PaginatedResponse(GiftCode),
      error: ForbiddenError,
    })
  )
  .add(
    // POST /admin/gift-codes - Create a new gift code
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
    // GET /admin/gift-codes/:codeId - Get gift code with redemptions
    HttpApiEndpoint.get('getGiftCode', '/gift-codes/:codeId', {
      params: { codeId: codeIdParam },
      success: GiftCodeWithRedemptions,
      error: [GiftCodeNotFoundError, ForbiddenError],
    })
  )
  .add(
    // PUT /admin/gift-codes/:codeId - Update a gift code
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
    // DELETE /admin/gift-codes/:codeId - Delete a gift code
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
    // GET /admin/users/:id/overview - profile + subscription + stats aggregate
    HttpApiEndpoint.get('getUserOverview', '/users/:id/overview', {
      params: { id: userIdParam },
      success: AdminUserOverview,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    // GET /admin/users/:id/plants - the user's owned plants (paginated)
    HttpApiEndpoint.get('getUserPlants', '/users/:id/plants', {
      params: { id: userIdParam },
      query: PaginationParams,
      success: PlantsListResponse,
      error: [UserNotFoundError, ForbiddenError],
    })
  )
  .add(
    // GET /admin/users/:id/conversations - the user's AI chat conversations
    HttpApiEndpoint.get('listUserConversations', '/users/:id/conversations', {
      params: { id: userIdParam },
      query: PaginationParams,
      success: ChatConversationListResponse,
      error: ForbiddenError,
    })
  )
  .add(
    // GET /admin/users/:id/conversations/:conversationId/messages - the
    // messages (user prompts + AI responses) of one conversation
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
