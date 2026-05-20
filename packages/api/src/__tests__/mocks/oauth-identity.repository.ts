import {
  type IOAuthIdentityRepository,
  type OAuthIdentity,
  OAuthIdentityRepository,
} from '@lily/api/repositories/oauth-identity.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

interface Store {
  identities: OAuthIdentity[]
}

export const createMockOAuthIdentityRepository = (
  initial: OAuthIdentity[] = []
): { layer: Layer.Layer<OAuthIdentityRepository>; store: Store } => {
  const store: Store = { identities: [...initial] }

  const repo: IOAuthIdentityRepository = {
    findByProviderId: (provider, providerUserId) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            store.identities,
            (i) =>
              i.provider === provider && i.providerUserId === providerUserId
          ),
          Option.getOrNull
        )
      ),

    link: (data) => {
      const created: OAuthIdentity = {
        id: `oauth-${crypto.randomUUID()}`,
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        providerEmail: data.providerEmail,
        providerName: data.providerName,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      store.identities.push(created)
      return Effect.succeed(created)
    },

    refreshSnapshot: (id, data) => {
      const idx = store.identities.findIndex((i) => i.id === id)
      if (idx === -1) return Effect.succeed(null)
      const updated: OAuthIdentity = {
        ...store.identities[idx]!,
        providerEmail: data.providerEmail,
        providerName: data.providerName,
        updatedAt: new Date(),
      }
      store.identities[idx] = updated
      return Effect.succeed(updated)
    },
  }

  return { layer: Layer.succeed(OAuthIdentityRepository, repo), store }
}
