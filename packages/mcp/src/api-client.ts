import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform'
import type { CareTasksResponse } from '@lily/shared'
import type { AuthResponse, RefreshTokenResponse } from '@lily/shared/auth'
import type { CareLogsListResponse } from '@lily/shared/care-log'
import type { Plant, PlantDetail, PlantsListResponse } from '@lily/shared/plant'
import { Config, Context, Effect, Layer, Option, pipe, Redacted } from 'effect'

// ── Current JWT (request-scoped) ───────────────────────────────────────

/**
 * Request-scoped service carrying the authenticated user's API JWT.
 * Provided per-request via Effect.provideServiceEffect so that
 * HttpClient interceptors can read it from context automatically.
 */
export class CurrentJwt extends Context.Tag('CurrentJwt')<
  CurrentJwt,
  string
>() {}

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
    readonly language?: 'en' | 'fr' | undefined
  }) => Effect.Effect<{ message: string }>

  readonly issueServiceToken: (params: {
    magicLinkCode: string
  }) => Effect.Effect<AuthResponse>

  // ── Authenticated endpoints (JWT injected via HttpClient interceptor)
  readonly listPlants: (
    params?:
      | {
          readonly filter?: string | undefined
          readonly includeCaretaking?: string | undefined
          readonly limit?: string | undefined
        }
      | undefined
  ) => Effect.Effect<PlantsListResponse, never, CurrentJwt>

  readonly getPlant: (
    plantId: string
  ) => Effect.Effect<PlantDetail, never, CurrentJwt>

  readonly getCareLogs: (
    plantId: string,
    params?: { readonly limit?: string | undefined } | undefined
  ) => Effect.Effect<CareLogsListResponse, never, CurrentJwt>

  readonly waterPlant: (
    plantId: string,
    body?: { readonly notes?: string | undefined } | undefined
  ) => Effect.Effect<Plant, never, CurrentJwt>

  readonly carePlant: (
    plantId: string,
    body: {
      readonly careType: 'watering' | 'fertilization'
      readonly notes?: string | undefined
    }
  ) => Effect.Effect<Plant, never, CurrentJwt>

  readonly getCareTasks: () => Effect.Effect<
    CareTasksResponse,
    never,
    CurrentJwt
  >

  readonly queryKnowledge: (
    question: string,
    plantName?: string | undefined
  ) => Effect.Effect<KnowledgeQueryResult, never, CurrentJwt>

  readonly refreshToken: (
    refreshToken: string
  ) => Effect.Effect<RefreshTokenResponse>
}

// ── Context Tag ────────────────────────────────────────────────────────

export class ApiClient extends Context.Tag('ApiClient')<
  ApiClient,
  IApiClient
>() {}

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
export const ApiClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const baseUrl = yield* Config.string('API_BASE_URL')
    const serviceSecret = yield* Config.redacted('SERVICE_TOKEN_SECRET')
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

        /**
         * Pipe operator: request → execute via internal client → JSON.
         * Uses X-Service-Secret auth.
         */
        const internal = <T>(request: HttpClientRequest.HttpClientRequest) =>
          pipe(
            request,
            internalClient.execute,
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((res) => res.json),
            Effect.scoped,
            Effect.orDie
          ) as Effect.Effect<T>

        /**
         * Pipe operator: request → execute via authed client → JSON.
         * Reads JWT from CurrentJwt context.
         */
        const authed = <T>(request: HttpClientRequest.HttpClientRequest) =>
          pipe(
            request,
            authedClient.execute,
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((res) => res.json),
            Effect.scoped,
            Effect.orDie
          ) as Effect.Effect<T, never, CurrentJwt>

        return {
          // ── Internal ──────────────────────────────────────────

          sendMagicLink: (params) =>
            HttpClientRequest.post(`${baseUrl}/internal/magic-link`).pipe(
              HttpClientRequest.bodyUnsafeJson(params),
              internal<{ message: string }>,
              Effect.withSpan('ApiClient.sendMagicLink')
            ),

          issueServiceToken: (params) =>
            HttpClientRequest.post(`${baseUrl}/internal/service-token`).pipe(
              HttpClientRequest.bodyUnsafeJson(params),
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

          waterPlant: (plantId, body) =>
            HttpClientRequest.post(
              `${baseUrl}/api/plants/${plantId}/water`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body ?? {}),
              authed<Plant>,
              Effect.withSpan('ApiClient.waterPlant')
            ),

          carePlant: (plantId, body) =>
            HttpClientRequest.post(
              `${baseUrl}/api/plants/${plantId}/care`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body),
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
              Option.fromNullable(plantName),
              Option.match({
                onNone: () => ({ question }),
                onSome: (name) => ({ question, plantName: name }),
              })
            )
            return HttpClientRequest.post(
              `${baseUrl}/api/knowledge/query`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body),
              authed<KnowledgeQueryResult>,
              Effect.withSpan('ApiClient.queryKnowledge')
            )
          },

          refreshToken: (refreshTokenValue) => {
            const request = HttpClientRequest.post(
              `${baseUrl}/api/auth/refresh`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson({
                refreshToken: refreshTokenValue,
              })
            )
            return pipe(
              request,
              baseClient.execute,
              Effect.flatMap(HttpClientResponse.filterStatusOk),
              Effect.flatMap((res) => res.json),
              Effect.scoped,
              Effect.orDie
            ) as Effect.Effect<RefreshTokenResponse>
          },
        }
      })
    )
  })
)
