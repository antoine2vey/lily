import { ConversationKindDefect } from '@lily/api/errors/defects'
import {
  type ChatConversationRow,
  conversationFromRow,
} from '@lily/api/repositories/chat.repository'
import { defectOf } from '@lily/shared/testing'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const row = (overrides: Partial<ChatConversationRow>): ChatConversationRow => ({
  id: 'conversation-1',
  userId: 'user-1',
  kind: 'plant',
  plantId: 'plant-1',
  title: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  lastMessageAt: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
})

describe('conversationFromRow', () => {
  it('reads a plant row as a plant conversation with its plant', async () => {
    const conversation = await Effect.runPromise(conversationFromRow(row({})))
    expect(conversation).toMatchObject({ kind: 'plant', plantId: 'plant-1' })
  })

  it('reads a general row as a general conversation with no plant', async () => {
    const conversation = await Effect.runPromise(
      conversationFromRow(row({ kind: 'general', plantId: null }))
    )
    expect(conversation.kind).toBe('general')
    expect(conversation).not.toHaveProperty('plantId')
  })

  it.each([
    ['a plant row with no plant', { kind: 'plant', plantId: null }],
    ['a general row with a plant', { kind: 'general', plantId: 'plant-1' }],
    ['an unknown kind', { kind: 'group', plantId: null }],
  ])('dies on %s', async (_, overrides) => {
    const exit = await Effect.runPromiseExit(
      conversationFromRow(row(overrides))
    )
    expect(defectOf(exit)).toEqual(
      new ConversationKindDefect({
        conversationId: 'conversation-1',
        kind: overrides.kind,
        plantId: overrides.plantId,
      })
    )
  })
})
