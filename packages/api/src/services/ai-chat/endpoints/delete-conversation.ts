import { transactQuietly } from '@lily/api/kernel/transact'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { GCSService } from '@lily/api/services/file/gcs'
import {
  conversationHeld,
  releasing,
} from '@lily/api/services/helpers/release-objects'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deleteConversation = (
  conversationId: string
): Effect.Effect<
  void,
  SqlError,
  | ChatRepository
  | StoredRefRepository
  | GCSService
  | CurrentUser
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    yield* transactQuietly(
      releasing(
        conversationHeld(conversationId, userId),
        chatRepo.deleteConversation({ id: conversationId, userId })
      )
    )
  }).pipe(Effect.withSpan('AIChatService.deleteConversation'))
