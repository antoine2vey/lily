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

const groups = Record.values(
  Api.groups as unknown as Record<string, HttpApiGroup.Top>
)

const endpointsOf = (group: HttpApiGroup.Top) =>
  Record.values(
    group.endpoints as unknown as Record<string, HttpApiEndpoint.Top>
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
  groups,
  Array.flatMap((group) =>
    pipe(
      endpointsOf(group),
      Array.flatMap((endpoint) =>
        pipe(
          Array.fromIterable(endpoint.middlewares),
          Array.map((key) => key as unknown as HttpApiMiddleware.AnyService),
          Array.filter(HttpApiMiddleware.isSecurity),
          Array.flatMap((middleware) =>
            pipe(
              Array.fromIterable(middleware.error),
              Array.map(
                (schema): SecuredEndpoint => ({
                  name: `${group.identifier}.${endpoint.identifier}`,
                  method: endpoint.method,
                  path: endpoint.path,
                  middleware: middleware.key,
                  tag: tagOf(schema),
                  status: statusOf(schema),
                })
              )
            )
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
const placeholderGroup = (group: HttpApiGroup.Top) =>
  groupUntyped(Api, group.identifier, (handlers) =>
    Array.reduce(endpointsOf(group), handlers, (built, endpoint) =>
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
      Array.reduce(groups, Layer.empty, (merged, group) =>
        Layer.merge(merged, placeholderGroup(group))
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
