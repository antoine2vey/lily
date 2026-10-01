import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { Api } from '@lily/api/api'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { ServiceAuthenticationLive } from '@lily/api/services/internal/middleware.impl'
import {
  Array,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  pipe,
  Record,
  SchemaAST,
  String,
} from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  type HttpApiEndpoint,
  type HttpApiGroup,
  HttpApiMiddleware,
} from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Every endpoint behind a security middleware, paired with the wire shape
 * that middleware promises when it rejects the request: the `_tag` of its
 * declared error and that error's HTTP status.
 */
type SecuredEndpoint = {
  readonly name: string
  readonly method: string
  readonly path: string
  readonly middleware: string
  readonly tag: string
  readonly status: number
}

type ErrorSchema = HttpApiMiddleware.AnyService['error'] extends ReadonlySet<
  infer S
>
  ? S
  : never

type ReflectedEndpoint = {
  readonly group: HttpApiGroup.Top
  readonly endpoint: HttpApiEndpoint.Top
  readonly middleware: ReadonlySet<HttpApiMiddleware.AnyService>
}

const reflectEndpoints = (): ReadonlyArray<ReflectedEndpoint> => {
  let collected: ReadonlyArray<ReflectedEndpoint> = []
  HttpApi.reflect(Api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, middleware }) => {
      collected = Array.append(collected, { group, endpoint, middleware })
    },
  })
  return collected
}

const endpoints = reflectEndpoints()

const endpointsByGroup = Array.groupBy(
  endpoints,
  ({ group }) => group.identifier
)

const tagOf = (schema: ErrorSchema): string =>
  pipe(
    Option.fromNullishOr(SchemaAST.resolveAt<string>('identifier')(schema.ast)),
    Option.getOrElse(() => '<untagged>')
  )

const statusOf = (schema: ErrorSchema): number =>
  pipe(
    Option.fromNullishOr(
      SchemaAST.resolveAt<number>('httpApiStatus')(schema.ast)
    ),
    Option.getOrElse(() => 500)
  )

const securedEndpoints: ReadonlyArray<SecuredEndpoint> = pipe(
  endpoints,
  Array.flatMap(({ group, endpoint, middleware }) =>
    pipe(
      Array.fromIterable(middleware),
      Array.filter(HttpApiMiddleware.isSecurity),
      Array.flatMap((security) =>
        pipe(
          Array.fromIterable(security.error),
          Array.map(
            (schema): SecuredEndpoint => ({
              name: `${group.identifier}.${endpoint.identifier}`,
              method: endpoint.method,
              path: endpoint.path,
              middleware: security.key,
              tag: tagOf(schema),
              status: statusOf(schema),
            })
          )
        )
      )
    )
  )
)

const ConfigLive = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    JWT_SECRET: 'middleware-error-tag-test-secret',
    SERVICE_TOKEN_SECRET: 'middleware-error-tag-service-secret',
  })
)

const MiddlewareLive = Layer.mergeAll(
  AuthenticationLive,
  AdminAuthLive,
  ServiceAuthenticationLive
).pipe(Layer.provide(createMockPgDrizzle()), Layer.provide(ConfigLive))

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

type AnyHandlers = {
  readonly handle: (
    identifier: string,
    handler: () => Effect.Effect<never>
  ) => AnyHandlers
}

const groupUntyped = HttpApiBuilder.group as unknown as (
  api: typeof Api,
  identifier: string,
  build: (handlers: AnyHandlers) => AnyHandlers
) => Layer.Layer<never>

/**
 * Every handler dies if reached, so any status other than the middleware's
 * own means the middleware let a bad credential through.
 */
const placeholderGroup = (
  identifier: string,
  groupEndpoints: ReadonlyArray<ReflectedEndpoint>
) =>
  groupUntyped(Api, identifier, (handlers) =>
    Array.reduce(groupEndpoints, handlers, (built, { endpoint }) =>
      built.handle(endpoint.identifier, () =>
        Effect.die(new Error(`Unhandled endpoint: ${endpoint.identifier}`))
      )
    )
  )

const makeHandler = () => {
  // The untyped group builder hides which group services and middleware
  // the placeholder layers provide and need, so the composed layer is
  // asserted closed; `HttpApiBuilder.layer` dies at build time if a group
  // is actually missing.
  const apiLayer = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(
      Array.reduce(
        Record.toEntries(endpointsByGroup),
        Layer.empty,
        (merged, [identifier, groupEndpoints]) =>
          Layer.merge(merged, placeholderGroup(identifier, groupEndpoints))
      )
    ),
    Layer.provide(MiddlewareLive),
    Layer.provide(PlatformLive)
  ) as unknown as Layer.Layer<never>
  return HttpRouter.toWebHandler(apiLayer, { disableLogger: true })
}

const requestPath = (path: string): string =>
  pipe(
    String.split(path, '/'),
    Array.map((segment) =>
      String.startsWith(':')(segment) ? 'test-id' : segment
    ),
    Array.join('/')
  )

describe('security middleware errors on the wire', () => {
  let web: ReturnType<typeof makeHandler>

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('enumerates the secured endpoints from the live Api', () => {
    const names = Array.map(securedEndpoints, (e) => e.name)
    expect(names).toContain('auth.getCurrentUser')
    expect(names).toContain('plants.getPlants')
    expect(names).toContain('admin.listUsers')
    expect(names).toContain('internal.issueServiceToken')
  })

  it.each(securedEndpoints)(
    '$name ($method $path) rejects a bad credential with $status {_tag: $tag}',
    async ({ method, path, status, tag }) => {
      const response = await web.handler(
        new Request(`http://localhost${requestPath(path)}`, {
          method,
          headers: {
            authorization: 'Bearer not-a-jwt',
            'x-service-secret': 'wrong-service-secret',
          },
        })
      )
      const body: unknown = await response.json()

      expect({ status: response.status, body }).toMatchObject({
        status,
        body: { _tag: tag },
      })
    }
  )
})
