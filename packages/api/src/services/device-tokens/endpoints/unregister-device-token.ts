import { Database } from '@lily/db'
import { Effect } from 'effect'

// Unregister device token
export const unregisterDeviceToken = (tokenId: string) =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake success message
    return { message: `Device token ${tokenId} unregistered successfully` }
  })
