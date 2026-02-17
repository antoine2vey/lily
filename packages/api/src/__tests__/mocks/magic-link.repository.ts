import {
  type IMagicLinkRepository,
  type MagicLink,
  MagicLinkRepository,
} from '@lily/api/repositories/magic-link.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockMagicLinkRepositoryData {
  magicLinks: MagicLink[]
}

// Internal state for tracking created/updated magic links
let magicLinkStore: MagicLink[] = []

export const createMockMagicLinkRepository = (
  data: MockMagicLinkRepositoryData = { magicLinks: [] }
): Layer.Layer<MagicLinkRepository> => {
  // Initialize store with provided data
  magicLinkStore = [...data.magicLinks]

  const repo: IMagicLinkRepository = {
    create: (email: string, token: string, expiresAt: Date) =>
      Effect.sync(() => {
        const newMagicLink: MagicLink = {
          id: `magic-link-${crypto.randomUUID()}`,
          email: email.toLowerCase().trim(),
          token,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }
        magicLinkStore.push(newMagicLink)
        return newMagicLink
      }),

    findByToken: (token: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(magicLinkStore, (ml) => ml.token === token),
          Option.getOrNull
        )
      ),

    findValidByToken: (token: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            magicLinkStore,
            (ml) =>
              ml.token === token &&
              ml.usedAt === null &&
              ml.expiresAt > new Date()
          ),
          Option.getOrNull
        )
      ),

    findValidAndMarkUsed: (token: string) =>
      Effect.gen(function* () {
        const index = Array.findFirstIndex(
          magicLinkStore,
          (ml) =>
            ml.token === token &&
            ml.usedAt === null &&
            ml.expiresAt > new Date()
        )
        if (Option.isNone(index)) {
          return null
        }

        const magicLink = magicLinkStore[index.value]
        if (!magicLink) {
          return null
        }

        const updated = {
          ...magicLink,
          usedAt: new Date(),
        }
        magicLinkStore[index.value] = updated
        return updated
      }),

    markUsed: (id: string) =>
      Effect.gen(function* () {
        const index = Array.findFirstIndex(magicLinkStore, (ml) => ml.id === id)
        if (Option.isNone(index)) {
          return null
        }

        const magicLink = magicLinkStore[index.value]
        if (!magicLink) {
          return null
        }

        const updated = {
          ...magicLink,
          usedAt: new Date(),
        }
        magicLinkStore[index.value] = updated
        return updated
      }),

    deleteExpired: () =>
      Effect.gen(function* () {
        const now = new Date()
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
        const originalLength = magicLinkStore.length
        magicLinkStore = Array.filter(
          magicLinkStore,
          (ml) => ml.expiresAt >= oneHourAgo
        )
        return originalLength - magicLinkStore.length
      }),

    deleteByEmail: (email: string) =>
      Effect.gen(function* () {
        const normalizedEmail = email.toLowerCase().trim()
        const originalLength = magicLinkStore.length
        magicLinkStore = Array.filter(
          magicLinkStore,
          (ml) => ml.email !== normalizedEmail
        )
        return originalLength - magicLinkStore.length
      }),
  }

  return Layer.succeed(MagicLinkRepository, repo)
}

// Helper to get the current state of the store
export const getMagicLinkStore = () => [...magicLinkStore]

// Helper to clear the store
export const clearMagicLinkStore = () => {
  magicLinkStore = []
}
