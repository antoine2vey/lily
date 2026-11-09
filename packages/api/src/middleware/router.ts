import { LegacyApiPrefixMiddleware } from '@lily/api/middleware/legacy-api-prefix'
import { SecurityHeadersMiddleware } from '@lily/api/middleware/security-headers'
import { Layer } from 'effect'
import { HttpRouter } from 'effect/http'

export const GlobalRouterMiddleware = Layer.mergeAll(
  HttpRouter.cors({ maxAge: 86400 }),
  HttpRouter.middleware(SecurityHeadersMiddleware, { global: true }),
  HttpRouter.middleware(LegacyApiPrefixMiddleware, { global: true })
)
