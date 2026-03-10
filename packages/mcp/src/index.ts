import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { consentPageHandler } from '@lily/mcp/auth/consent'
import { LilyOAuthServerModel } from '@lily/mcp/auth/oauth'
import { mcpRuntime } from '@lily/mcp/runtime'
import { createMcpServer } from '@lily/mcp/server'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  DateTime,
  Duration,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'
import express from 'express'
import {
  authenticateHandler,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
  OAuthServer,
  requireBearerAuth,
} from 'mcp-oauth-server'

// ── Configuration ────────────────────────────────────────────────────

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3001'
const MCP_PORT = Number(process.env.MCP_PORT ?? '3001')

const mcpServerUrl = new URL(`${MCP_SERVER_URL}/mcp`)
const issuerUrl = new URL(MCP_SERVER_URL)

// ── Bootstrap ────────────────────────────────────────────────────────

async function main() {
  // Extract a raw PgDrizzle instance for the OAuth model
  // (the model uses plain async methods, not Effect)
  const db = await mcpRuntime.runPromise(PgDrizzle.PgDrizzle)

  const oauthModel = new LilyOAuthServerModel(db)

  const oauthServer = new OAuthServer({
    model: oauthModel,
    authorizationUrl: new URL(`${MCP_SERVER_URL}/consent`),
    resourceServerUrl: mcpServerUrl,
    scopesSupported: ['plants:read', 'plants:write', 'knowledge:read'],
    accessTokenLifetime: 3600, // 1 hour
    refreshTokenLifetime: 2592000, // 30 days
    modifyAuthorizationRedirectUrl: (url, client) => {
      // Pass client metadata to the consent page
      if (client.client_name) {
        url.searchParams.set('client_name', client.client_name)
      }
      if (client.client_uri) {
        url.searchParams.set('client_uri', client.client_uri)
      }
      if (client.logo_uri) {
        url.searchParams.set('logo_uri', client.logo_uri)
      }
    },
  })

  // ── Express App ──────────────────────────────────────────────────

  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // OAuth routes (metadata, authorize, token, register, revoke)
  app.use(
    mcpAuthRouter({
      provider: oauthServer,
      issuerUrl,
      resourceServerUrl: mcpServerUrl,
      scopesSupported: ['plants:read', 'plants:write', 'knowledge:read'],
      resourceName: 'Lily Plant Care',
      clientRegistrationOptions: {
        clientIdGeneration: true,
      },
    })
  )

  // ── Consent Page (GET /consent) ──────────────────────────────────

  app.get('/consent', consentPageHandler)

  // ── Confirm Handler (POST /confirm) ──────────────────────────────
  //
  // The authenticateHandler expects getUser to return a userId string.
  // In our flow, we need to:
  // 1. Receive the email → send magic link → throw to short-circuit
  // 2. The /verify endpoint (below) handles the callback after magic link click

  app.use(
    '/confirm',
    authenticateHandler({
      provider: oauthServer,
      rateLimit: false,
      getUser: async (req) => {
        const email = req.body?.email as string | undefined
        if (!email) {
          throw new Error('Email is required')
        }

        const normalizedEmail = pipe(
          email,
          EffectString.toLowerCase,
          EffectString.trim
        )

        // Build the callback URL pointing to /verify with the OAuth params
        const oauthParams = new URLSearchParams(
          req.query as Record<string, string>
        )

        const token = crypto.randomUUID()
        const expiresAt = DateTime.toDateUtc(
          DateTime.addDuration(
            DateTime.unsafeNow(),
            Duration.millis(10 * 60 * 1000)
          )
        )

        await mcpRuntime.runPromise(
          Effect.gen(function* () {
            const magicLinkRepo = yield* MagicLinkRepository
            const rateLimiter = yield* RateLimiterService

            yield* rateLimiter.checkRateLimit(
              `mcp-magic-link:${normalizedEmail}`,
              RATE_LIMITS.MAGIC_LINK
            )

            yield* magicLinkRepo.deleteByEmail(normalizedEmail)
            yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)
          })
        )

        const callbackUrl = new URL(`${MCP_SERVER_URL}/verify`)
        callbackUrl.searchParams.set('code', token)
        for (const [key, value] of oauthParams.entries()) {
          callbackUrl.searchParams.set(key, value)
        }

        // Send the magic link email (swallow errors)
        await mcpRuntime
          .runPromise(
            sendMagicLinkEmail({
              email: normalizedEmail,
              token,
              callbackUrl: callbackUrl.toString(),
            }).pipe(Effect.catchAll(() => Effect.succeed(undefined)))
          )
          .catch(() => {})

        // Throw to short-circuit — the user hasn't verified yet
        throw new SendMagicLinkResponse()
      },
    })
  )

  // ── Verify Handler (GET /verify) ─────────────────────────────────
  //
  // Called when the user clicks the magic link in their email.
  // Verifies the code, resolves the user, then calls oauthServer.authenticate()
  // to issue an auth code and redirect back to the MCP client.

  app.get('/verify', async (req, res) => {
    try {
      const code = req.query.code as string
      if (!code) {
        res.status(400).send('Missing verification code')
        return
      }

      const userId = await mcpRuntime.runPromise(
        Effect.gen(function* () {
          const magicLinkRepo = yield* MagicLinkRepository
          const userRepo = yield* UserRepository

          const magicLink = yield* magicLinkRepo.findValidAndMarkUsed(code)
          if (!magicLink) {
            return yield* Effect.fail(new Error('Invalid or expired code'))
          }

          const normalizedEmail = pipe(
            magicLink.email,
            EffectString.toLowerCase,
            EffectString.trim
          )

          const user = yield* userRepo.findByEmail(normalizedEmail)
          if (!user) {
            return yield* Effect.fail(
              new Error('No account found for this email')
            )
          }

          return user.id
        })
      )

      // Get the client to call authenticate
      const clientId = req.query.client_id as string
      if (!clientId) {
        res.status(400).send('Missing client_id')
        return
      }

      const client = await oauthModel.getClient(clientId)
      if (!client) {
        res.status(400).send('Unknown client')
        return
      }

      // Call oauthServer.authenticate() to create an auth code
      // and redirect the user back to the MCP client
      const scopes = (req.query.scope as string | undefined)?.split(' ')
      const resource = req.query.resource
        ? new URL(req.query.resource as string)
        : undefined

      await oauthServer.authenticate(
        client,
        {
          redirectUri: req.query.redirect_uri as string,
          codeChallenge: req.query.code_challenge as string,
          scopes: scopes ?? [],
          ...(req.query.state != null
            ? { state: req.query.state as string }
            : {}),
          ...(resource != null ? { resource } : {}),
        },
        userId,
        res
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed'
      res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:2rem;text-align:center">
          <h2>Authentication failed</h2>
          <p>${message}</p>
          <p>Please close this window and try again.</p>
        </body></html>
      `)
    }
  })

  // ── MCP Endpoint ─────────────────────────────────────────────────

  const bearerAuth = requireBearerAuth({
    verifier: oauthServer,
    requiredScopes: ['plants:read'],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
  })

  app.post('/mcp', bearerAuth)

  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined as unknown as () => string,
      enableJsonResponse: true,
    })

    res.on('close', () => {
      transport.close()
    })

    const authInfo = req.auth as typeof req.auth & { userId?: string }
    const mcpServer = createMcpServer(
      authInfo!,
      mcpRuntime as Parameters<typeof createMcpServer>[1]
    )
    await mcpServer.connect(
      transport as Parameters<typeof mcpServer.connect>[0]
    )
    await transport.handleRequest(req, res, req.body)
  })

  app.get('/mcp', bearerAuth)

  app.get('/mcp', async (_req, res) => {
    res
      .status(405)
      .json({ error: 'GET not supported. Use POST for MCP requests.' })
  })

  // ── Health Check ─────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lily-mcp' })
  })

  // ── Error Handler ────────────────────────────────────────────────
  //
  // Catch the SendMagicLinkResponse thrown by the confirm handler
  // and return a 200 with a success message.

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof SendMagicLinkResponse) {
        res.status(200).json({ message: 'Magic link sent' })
        return
      }
      next(err)
    }
  )

  // ── Start Server ─────────────────────────────────────────────────

  app.listen(MCP_PORT, '0.0.0.0', () => {
    console.log(`Lily MCP server running on port ${MCP_PORT}`)
    console.log(
      `  OAuth: ${MCP_SERVER_URL}/.well-known/oauth-authorization-server`
    )
    console.log(`  MCP:   ${MCP_SERVER_URL}/mcp`)
  })
}

/**
 * Custom error thrown to short-circuit authenticateHandler's getUser
 * callback after sending the magic link email. The Express error handler
 * catches this and returns a 200 (magic link sent) response.
 */
class SendMagicLinkResponse extends Error {
  constructor() {
    super('Magic link sent — awaiting verification')
    this.name = 'SendMagicLinkResponse'
  }
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err)
  process.exit(1)
})
