import type { CareTasksResponse, CareType, LanguageCode } from '@lily/shared'
import { ExternalServiceError } from '@lily/shared'
import type { AuthResponse, RefreshTokenResponse } from '@lily/shared/auth'
import type { CareLogsListResponse } from '@lily/shared/care-log'
import type { Plant, PlantDetail, PlantsListResponse } from '@lily/shared/plant'
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Redacted,
} from 'effect'
import {
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http'

// ── Request-scoped context ─────────────────────────────────────────────

/**
 * Request-scoped service carrying the authenticated user's API JWT.
 * Provided per-request via provideAuth so that HttpClient interceptors
 * can read it from context automatically.
 */
export class CurrentJwt extends Context.Service<CurrentJwt, string>()(
  'CurrentJwt'
) {}

/**
 * Request-scoped service carrying the authenticated user's ID.
 * Provided alongside CurrentJwt by provideAuth.
 */
export class CurrentUserId extends Context.Service<CurrentUserId, string>()(
  'CurrentUserId'
) {}

// ── Response types for knowledge query ─────────────────────────────────

export interface KnowledgeQueryResult {
  readonly answer: string
  readonly sources: readonly {
    readonly title: string
    readonly content: string
    readonly similarity: number
  }[]
}

// ── Interface ──────────────────────────────────────────────────────────

export interface IApiClient {
  // ── Internal endpoints (service-secret auth) ──────────────────────
  readonly sendMagicLink: (params: {
    readonly email: string
    readonly callbackUrl: string
    readonly language?: LanguageCode | undefined
  }) => Effect.Effect<{ message: string }, ExternalServiceError>

  readonly issueServiceToken: (params: {
    magicLinkCode: string
  }) => Effect.Effect<AuthResponse, ExternalServiceError>

  // ── Authenticated endpoints (JWT injected via HttpClient interceptor)
  readonly listPlants: (
    params?:
      | {
          readonly filter?: string | undefined
          readonly includeCaretaking?: string | undefined
          readonly limit?: string | undefined
        }
      | undefined
  ) => Effect.Effect<PlantsListResponse, ExternalServiceError, CurrentJwt>

  readonly getPlant: (
    plantId: string
  ) => Effect.Effect<PlantDetail, ExternalServiceError, CurrentJwt>

  readonly getCareLogs: (
    plantId: string,
    params?: { readonly limit?: string | undefined } | undefined
  ) => Effect.Effect<CareLogsListResponse, ExternalServiceError, CurrentJwt>

  readonly carePlant: (
    plantId: string,
    body: {
      readonly careType: CareType
      readonly notes?: string | undefined
    }
  ) => Effect.Effect<Plant, ExternalServiceError, CurrentJwt>

  readonly getCareTasks: () => Effect.Effect<
    CareTasksResponse,
    ExternalServiceError,
    CurrentJwt
  >

  readonly queryKnowledge: (
    question: string,
    plantName?: string | undefined
  ) => Effect.Effect<KnowledgeQueryResult, ExternalServiceError, CurrentJwt>

  readonly refreshToken: (
    refreshToken: string
  ) => Effect.Effect<RefreshTokenResponse, ExternalServiceError>
}

// ── Timeouts ───────────────────────────────────────────────────────────

// API request spans ran p99 0.17 s and at most 5.2 s over the 14 days to
// 2026-10-19, so 15 s only cuts off a hung API.
const API_TIMEOUT = Duration.seconds(15)

// /api/knowledge/query embeds the question (RagService.retrieve at most 3.2 s
// over 60 days) under the API's own 30 s embedding deadline. 45 s lets that
// deadline report its own error first.
const KNOWLEDGE_QUERY_TIMEOUT = Duration.seconds(45)

/**
 * What an MCP client may see of a failed API call. The upstream message
 * carries the internal API URL, so it stays in the logs.
 */
export const publicApiFailure = (error: ExternalServiceError): string =>
  Match.value(error.statusCode).pipe(
    Match.when(
      Match.is(403, 404),
      () => 'Not found, or not one of your plants.'
    ),
    Match.when(429, () => 'Too many requests. Try again in a minute.'),
    Match.orElse(
      () => 'The Lily service could not complete this request. Try again later.'
    )
  )

// ── Context Tag ────────────────────────────────────────────────────────

export class ApiClient extends Context.Service<ApiClient, IApiClient>()(
  'ApiClient'
) {}

// ── Live Layer ─────────────────────────────────────────────────────────

/**
 * Live implementation of ApiClient.
 *
 * Two HttpClient interceptors handle auth + response parsing:
 * - internal: service-secret header → execute → parse JSON
 * - authed: JWT from CurrentJwt → execute → parse JSON
 *
 * Methods just build requests and pipe through the right client.
 */
export const ApiClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const baseUrl = yield* Config.String('API_BASE_URL')
    const serviceSecret = yield* Config.Redacted('SERVICE_TOKEN_SECRET')
    const secretValue = Redacted.value(serviceSecret)

    return Layer.effect(
      ApiClient,
      Effect.gen(function* () {
        const baseClient = yield* HttpClient.HttpClient

        // ── HttpClient interceptors ──────────────────────────────

        const internalClient = pipe(
          baseClient,
          HttpClient.mapRequest(
            HttpClientRequest.setHeader('X-Service-Secret', secretValue)
          )
        )

        const authedClient = pipe(
          baseClient,
          HttpClient.mapRequestEffect((req) =>
            Effect.map(CurrentJwt, (jwt) =>
              pipe(
                req,
                HttpClientRequest.setHeader('Authorization', `Bearer ${jwt}`)
              )
            )
          )
        )

        // ── Execute + parse pipelines ────────────────────────────

        const wrapHttpError = (err: HttpClientError.HttpClientError) =>
          new ExternalServiceError({
            service: 'lily-api',
            method: err.request.method,
            url: err.request.url,
            ...Option.match(Option.fromNullishOr(err.response), {
              onNone: () => ({}),
              onSome: (response) => ({ statusCode: response.status }),
            }),
            message: err.message,
          })

        /**
         * Builds a pipe operator: request → execute via `client` → JSON,
         * failing with ExternalServiceError when the API answers non-2xx or
         * not at all within `timeout` (the request is aborted then).
         */
        const send =
          <R>(
            client: HttpClient.HttpClient.With<
              HttpClientError.HttpClientError,
              R
            >
          ) =>
          <T>(
            request: HttpClientRequest.HttpClientRequest,
            timeout: Duration.Duration = API_TIMEOUT
          ) =>
            pipe(
              request,
              client.execute,
              Effect.flatMap(HttpClientResponse.filterStatusOk),
              Effect.flatMap((res) => res.json),
              Effect.scoped,
              Effect.mapError(wrapHttpError),
              Effect.timeoutOrElse({
                duration: timeout,
                orElse: () =>
                  Effect.fail(
                    new ExternalServiceError({
                      service: 'lily-api',
                      method: request.method,
                      url: request.url,
                      message: `No response within ${Duration.format(timeout)}`,
                    })
                  ),
              })
            ) as Effect.Effect<T, ExternalServiceError, R>

        // X-Service-Secret auth
        const internal = send(internalClient)
        // JWT from the CurrentJwt context
        const authed = send(authedClient)
        // No auth headers, for public endpoints like token refresh
        const unauthenticated = send(baseClient)

        return {
          // ── Internal ──────────────────────────────────────────

          sendMagicLink: (params) =>
            HttpClientRequest.post(`${baseUrl}/internal/magic-link`).pipe(
              HttpClientRequest.bodyJsonUnsafe(params),
              internal<{ message: string }>,
              Effect.withSpan('ApiClient.sendMagicLink')
            ),

          issueServiceToken: (params) =>
            HttpClientRequest.post(`${baseUrl}/internal/service-token`).pipe(
              HttpClientRequest.bodyJsonUnsafe(params),
              internal<AuthResponse>,
              Effect.withSpan('ApiClient.issueServiceToken')
            ),

          // ── Authenticated ─────────────────────────────────────

          listPlants: (params) => {
            const query = new URLSearchParams()
            if (params?.filter) query.set('filter', params.filter)
            if (params?.includeCaretaking)
              query.set('includeCaretaking', params.includeCaretaking)
            if (params?.limit) query.set('limit', params.limit)
            const qs = query.toString()
            return HttpClientRequest.get(
              `${baseUrl}/api/plants${qs ? `?${qs}` : ''}`
            ).pipe(
              authed<PlantsListResponse>,
              Effect.withSpan('ApiClient.listPlants')
            )
          },

          getPlant: (plantId) =>
            HttpClientRequest.get(`${baseUrl}/api/plants/${plantId}`).pipe(
              authed<PlantDetail>,
              Effect.withSpan('ApiClient.getPlant')
            ),

          getCareLogs: (plantId, params) => {
            const query = new URLSearchParams()
            if (params?.limit) query.set('limit', params.limit)
            const qs = query.toString()
            return HttpClientRequest.get(
              `${baseUrl}/api/plants/${plantId}/logs${qs ? `?${qs}` : ''}`
            ).pipe(
              authed<CareLogsListResponse>,
              Effect.withSpan('ApiClient.getCareLogs')
            )
          },

          carePlant: (plantId, body) =>
            HttpClientRequest.post(
              `${baseUrl}/api/plants/${plantId}/care`
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe(body),
              authed<Plant>,
              Effect.withSpan('ApiClient.carePlant')
            ),

          getCareTasks: () =>
            HttpClientRequest.get(`${baseUrl}/api/care-tasks`).pipe(
              authed<CareTasksResponse>,
              Effect.withSpan('ApiClient.getCareTasks')
            ),

          queryKnowledge: (question, plantName) => {
            const body = pipe(
              Option.fromNullishOr(plantName),
              Option.match({
                onNone: () => ({ question }),
                onSome: (name) => ({ question, plantName: name }),
              })
            )
            return HttpClientRequest.post(
              `${baseUrl}/api/knowledge/query`
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe(body),
              (request) =>
                authed<KnowledgeQueryResult>(request, KNOWLEDGE_QUERY_TIMEOUT),
              Effect.withSpan('ApiClient.queryKnowledge')
            )
          },

          refreshToken: (refreshTokenValue) =>
            HttpClientRequest.post(`${baseUrl}/api/auth/refresh`).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                refreshToken: refreshTokenValue,
              }),
              unauthenticated<RefreshTokenResponse>,
              Effect.withSpan('ApiClient.refreshToken')
            ),
        }
      })
    )
  })
)
