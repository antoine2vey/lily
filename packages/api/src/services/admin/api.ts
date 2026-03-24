import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import { PaginatedResponse, PaginationParams } from '@lily/shared'
import {
  AdminGiftEvent,
  AdminGiftSubscriptionRequest,
  AdminGiftSubscriptionResponse,
  AdminRevokeGiftResponse,
  AdminRoleChangeRequest,
  AdminStatusChangeRequest,
  AdminUser,
  AdminUserListParams,
  AdminUserUpdateRequest,
  PromptPreviewResponse,
} from '@lily/shared/admin'
import {
  CannotModifySelfError,
  ChatMessageNotFoundError,
  ForbiddenError,
} from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Schema } from 'effect'

// Path parameter for user ID
const userIdParam = HttpApiSchema.param('id', Schema.UUID)

// Path parameter for message ID (prompt preview)
const messageIdParam = HttpApiSchema.param('messageId', Schema.UUID)

// Define the Admin API group
export const AdminApi = HttpApiGroup.make('admin')
  .add(
    // GET /admin/users - List all users (paginated with filters)
    HttpApiEndpoint.get('listUsers')`/users`
      .setUrlParams(AdminUserListParams)
      .addSuccess(PaginatedResponse(AdminUser))
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // GET /admin/users/:id - Get user by ID
    HttpApiEndpoint.get('getUser')`/users/${userIdParam}`
      .addSuccess(AdminUser)
      .addError(UserNotFoundError, { status: 404 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // PUT /admin/users/:id - Update user
    HttpApiEndpoint.put('updateUser')`/users/${userIdParam}`
      .setPayload(AdminUserUpdateRequest)
      .addSuccess(AdminUser)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // PUT /admin/users/:id/role - Change user role
    HttpApiEndpoint.put('updateUserRole')`/users/${userIdParam}/role`
      .setPayload(AdminRoleChangeRequest)
      .addSuccess(AdminUser)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // PUT /admin/users/:id/status - Change user status
    HttpApiEndpoint.put('updateUserStatus')`/users/${userIdParam}/status`
      .setPayload(AdminStatusChangeRequest)
      .addSuccess(AdminUser)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // DELETE /admin/users/:id - Delete user
    HttpApiEndpoint.del('deleteUser')`/users/${userIdParam}`
      .addSuccess(AdminUser)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // POST /admin/users/:id/gift-subscription - Gift a paid subscription
    HttpApiEndpoint.post(
      'giftSubscription'
    )`/users/${userIdParam}/gift-subscription`
      .setPayload(AdminGiftSubscriptionRequest)
      .addSuccess(AdminGiftSubscriptionResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // GET /admin/gift-history - List gift subscription events
    HttpApiEndpoint.get('listGiftHistory')`/gift-history`
      .setUrlParams(PaginationParams)
      .addSuccess(PaginatedResponse(AdminGiftEvent))
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // POST /admin/users/:id/revoke-gift - Revoke a gifted subscription
    HttpApiEndpoint.post(
      'revokeGiftSubscription'
    )`/users/${userIdParam}/revoke-gift`
      .addSuccess(AdminRevokeGiftResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(CannotModifySelfError, { status: 400 })
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    // GET /admin/prompt-preview/:messageId - Preview AI prompt for a message
    HttpApiEndpoint.get('previewPrompt')`/prompt-preview/${messageIdParam}`
      .addSuccess(PromptPreviewResponse)
      .addError(ChatMessageNotFoundError, { status: 404 })
      .addError(ForbiddenError, { status: 403 })
  )
  .prefix('/admin')
  .middleware(AdminAuth)
