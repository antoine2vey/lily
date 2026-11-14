import {
  mockPlants,
  type PlantRecord,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockChatFollowUpRepository } from '@lily/api/__tests__/mocks/chat-follow-up.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { requestChatFollowUps } from '@lily/api/services/ai-chat/endpoints/request-chat-follow-ups'
import type { FollowUpSet } from '@lily/api/services/ai-chat/follow-up-set'
import type { LanguageCode } from '@lily/shared'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { Array, Effect, Layer, Order, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const alex = 'user-alex'
const HOUR = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR)

const { scheduleSpecs: _, ...basePlant } = mockPlants[0]!

const plant = (
  id: string,
  overrides: Partial<PlantRecord> = {}
): PlantRecord => ({
  ...basePlant,
  id,
  name: `Plant ${id}`,
  userId: alex,
  createdByUserId: alex,
  ...overrides,
})

interface Chat {
  readonly conversation: ChatConversation
  readonly messages: ChatMessage[]
}

const chatAbout = (
  plantId: string,
  options: {
    readonly userId?: string
    readonly askedHoursAgo?: number
    readonly role?: 'user' | 'assistant'
  } = {}
): Chat => {
  const userId = options.userId ?? alex
  const conversation: ChatConversation = {
    id: `conv-${plantId}-${userId}`,
    userId,
    kind: 'plant',
    plantId,
    createdAt: new Date('2024-02-01'),
    lastMessageAt: new Date('2024-02-01'),
  }
  return {
    conversation,
    messages: [
      {
        id: `msg-${conversation.id}`,
        role: options.role ?? 'user',
        content: 'How often should I water it?',
        conversationId: conversation.id,
        userId,
        createdAt: hoursAgo(options.askedHoursAgo ?? 48),
      },
    ],
  }
}

const setOf = (
  plantId: string,
  overrides: Partial<FollowUpSet> = {}
): FollowUpSet => ({
  userId: alex,
  plantId,
  language: 'en',
  requestedAt: null,
  claimedUntil: null,
  generatedAt: null,
  followUps: [],
  ...overrides,
})

const refresh = async (data: {
  readonly plants: PlantRecord[]
  readonly chats: ReadonlyArray<Chat>
  readonly sets?: FollowUpSet[]
  readonly language?: LanguageCode
}) => {
  const sets = data.sets ?? []
  await Effect.runPromise(
    requestChatFollowUps(data.language ?? 'en').pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockPlantRepository({ plants: data.plants }),
          createMockChatRepository({
            conversations: Array.map(data.chats, (chat) => chat.conversation),
            messages: Array.flatMap(data.chats, (chat) => chat.messages),
          }),
          createMockChatFollowUpRepository(sets),
          createMockCurrentUser({ id: alex })
        )
      )
    )
  )
  return sets
}

const oldestRequestFirst = Order.mapInput(
  Order.Number,
  (set: FollowUpSet) => set.requestedAt?.getTime() ?? 0
)

const requested = (sets: ReadonlyArray<FollowUpSet>) =>
  pipe(
    sets,
    Array.filter((set) => set.requestedAt !== null),
    Array.sort(oldestRequestFirst),
    Array.map((set) => set.plantId)
  )

describe('requestChatFollowUps', () => {
  it('requests a set for a living plant the user has written about', async () => {
    const sets = await refresh({
      plants: [plant('fern'), plant('never-asked')],
      chats: [chatAbout('fern')],
      language: 'fr',
    })

    expect(sets).toEqual([
      expect.objectContaining({
        userId: alex,
        plantId: 'fern',
        language: 'fr',
        claimedUntil: null,
      }),
    ])
    expect(requested(sets)).toEqual(['fern'])
  })

  it('requests nothing for a conversation that holds no message of the user', async () => {
    const sets = await refresh({
      plants: [plant('only-reply'), plant('theirs')],
      chats: [
        chatAbout('only-reply', { role: 'assistant' }),
        chatAbout('theirs', { userId: 'user-lily' }),
      ],
    })

    expect(sets).toEqual([])
  })

  it('requests nothing for a dead plant', async () => {
    const sets = await refresh({
      plants: [plant('buried', { diedAt: new Date('2024-03-01') })],
      chats: [chatAbout('buried')],
    })

    expect(sets).toEqual([])
  })

  it('requests nothing for a plant the user no longer reaches', async () => {
    const sets = await refresh({
      plants: [plant('given-away', { userId: 'user-lily' })],
      chats: [chatAbout('given-away')],
    })

    expect(sets).toEqual([])
  })

  it('leaves a set generated less than 20 hours ago alone', async () => {
    const sets = await refresh({
      plants: [plant('fresh'), plant('stale')],
      chats: [chatAbout('fresh'), chatAbout('stale')],
      sets: [
        setOf('fresh', { generatedAt: hoursAgo(19) }),
        setOf('stale', { generatedAt: hoursAgo(21) }),
      ],
    })

    expect(requested(sets)).toEqual(['stale'])
  })

  it('changes nothing when it runs a second time', async () => {
    const data = {
      plants: [plant('fern'), plant('aloe')],
      chats: [chatAbout('fern'), chatAbout('aloe')],
      sets: [] as FollowUpSet[],
    }
    const first = structuredClone(await refresh(data))
    const second = await refresh(data)

    expect(first).toHaveLength(2)
    expect(second).toEqual(first)
  })

  it('leaves a set a worker holds alone', async () => {
    const held = setOf('fern', {
      requestedAt: hoursAgo(1),
      claimedUntil: new Date(Date.now() + HOUR),
    })
    const sets = await refresh({
      plants: [plant('fern')],
      chats: [chatAbout('fern')],
      sets: [held],
      language: 'fr',
    })

    expect(sets).toEqual([held])
  })

  it('requests plants that need help first, then the most recently asked about', async () => {
    const plants = [
      plant('healthy-recent'),
      plant('healthy-old'),
      plant('sick-old', { health: 'SICK' }),
      ...Array.makeBy(12, (n) => plant(`filler-${n}`)),
    ]
    const sets = await refresh({
      plants,
      chats: [
        chatAbout('healthy-recent', { askedHoursAgo: 1 }),
        chatAbout('healthy-old', { askedHoursAgo: 900 }),
        chatAbout('sick-old', { askedHoursAgo: 800 }),
        ...Array.makeBy(12, (n) =>
          chatAbout(`filler-${n}`, { askedHoursAgo: 100 + n })
        ),
      ],
    })

    const picked = Array.map(sets, (set) => set.plantId)
    expect(picked).toHaveLength(12)
    expect(picked[0]).toBe('sick-old')
    expect(picked[1]).toBe('healthy-recent')
    expect(picked).not.toContain('healthy-old')
  })

  it('counts the sets generated or requested in the last 20 hours against the budget of 12', async () => {
    const used = [
      ...Array.makeBy(7, (n) =>
        setOf(`generated-${n}`, { generatedAt: hoursAgo(2) })
      ),
      ...Array.makeBy(3, (n) =>
        setOf(`requested-${n}`, { requestedAt: hoursAgo(1) })
      ),
    ]
    const waiting = Array.makeBy(5, (n) => `waiting-${n}`)
    const sets = await refresh({
      plants: Array.map(waiting, (id) => plant(id)),
      chats: Array.map(waiting, (id, n) =>
        chatAbout(id, { askedHoursAgo: 10 + n })
      ),
      sets: [...used],
    })

    expect(
      Array.filter(requested(sets), (id) => id.startsWith('waiting-'))
    ).toEqual(['waiting-0', 'waiting-1'])
  })

  it('requests nothing once the budget is spent', async () => {
    const used = Array.makeBy(12, (n) =>
      setOf(`generated-${n}`, { generatedAt: hoursAgo(2) })
    )
    const sets = await refresh({
      plants: [plant('fern')],
      chats: [chatAbout('fern')],
      sets: [...used],
    })

    expect(sets).toEqual(used)
  })
})
