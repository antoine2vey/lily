import { Schema } from 'effect'
import { PaginationParams } from '../common/pagination'
import { User, UserRole, UserStatus } from '../user/schema'

// Admin user list request - pagination with filters
export const AdminUserListParams = Schema.Struct({
  ...PaginationParams.fields,
  role: Schema.optional(UserRole),
  status: Schema.optional(UserStatus),
  search: Schema.optional(Schema.String),
})

// Admin update user request - all editable fields
export const AdminUserUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.NullOr(Schema.String)),
  image: Schema.optional(Schema.NullOr(Schema.String)),
  emailVerified: Schema.optional(Schema.Boolean),
  status: Schema.optional(UserStatus),
})

// Role change request
export const AdminRoleChangeRequest = Schema.Struct({
  role: UserRole,
})

// Status change request
export const AdminStatusChangeRequest = Schema.Struct({
  status: UserStatus,
})

// Re-export User as AdminUser for clarity in admin context
export { User as AdminUser }

// Type exports
export type AdminUserListParams = typeof AdminUserListParams.Type
export type AdminUserUpdateRequest = typeof AdminUserUpdateRequest.Type
export type AdminRoleChangeRequest = typeof AdminRoleChangeRequest.Type
export type AdminStatusChangeRequest = typeof AdminStatusChangeRequest.Type
