import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { listUsers } from '@lily/api/services/admin/endpoints/list-users'
import { updateRole } from '@lily/api/services/admin/endpoints/update-role'
import { updateStatus } from '@lily/api/services/admin/endpoints/update-status'
import { updateUser } from '@lily/api/services/admin/endpoints/update-user'
import { Effect } from 'effect'

export class AdminService extends Effect.Service<AdminService>()(
  'AdminService',
  {
    effect: Effect.succeed({
      listUsers,
      getUser,
      updateUser,
      updateRole,
      updateStatus,
      deleteUser,
    }),
  }
) {}
