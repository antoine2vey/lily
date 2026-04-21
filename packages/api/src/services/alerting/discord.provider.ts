import {
  type AlertEvent,
  Alerter,
  AlerterConfig,
  type AlertMeta,
  type AlertTransport,
  makeAlerter,
  normalizePath,
} from '@lily/api/services/alerting/service'
import {
  Config,
  Data,
  Effect,
  Layer,
  Match,
  Redacted,
  String as Str,
} from 'effect'

class DiscordWebhookError extends Data.TaggedError('DiscordWebhookError')<{
  readonly message: string
  readonly status?: number
}> {}

const COLOR_RED = 15158332 // 0xE74C3C — 5xx / defect
const COLOR_ORANGE = 15105570 // 0xE67E22 — provider error
const COLOR_YELLOW = 15844367 // 0xF1C40F — warning

// Discord embed limits: description 4096 chars, field value 1024, 25 fields max
const DESC_MAX = 1800
const FIELD_VALUE_MAX = 1000

const clamp = (s: string, n: number): string =>
  s.length > n ? `${Str.slice(0, n - 1)(s)}…` : s

type EmbedField = {
  readonly name: string
  readonly value: string
  readonly inline?: boolean
}

type Embed = {
  readonly title: string
  readonly description?: string
  readonly color: number
  readonly fields: readonly EmbedField[]
  readonly timestamp: string
}

const titleFor = (event: AlertEvent, environment: string): string =>
  Match.value(event).pipe(
    Match.tag(
      'HttpError5xx',
      (e) =>
        `[${environment}] 🚨 HTTP ${e.status} — ${e.method} ${normalizePath(e.url)}`
    ),
    Match.tag(
      'ProviderError',
      (e) => `[${environment}] ⚠️ Provider error — ${e.provider} (${e.errorTag})`
    ),
    Match.tag(
      'UnhandledDefect',
      (e) => `[${environment}] 💥 Unhandled defect — ${e.source}`
    ),
    Match.tag(
      'OperationalWarning',
      (e) => `[${environment}] ⚠️ Warning — ${e.source}`
    ),
    Match.exhaustive
  )

const colorFor = (event: AlertEvent): number =>
  Match.value(event).pipe(
    Match.tag('HttpError5xx', () => COLOR_RED),
    Match.tag('UnhandledDefect', () => COLOR_RED),
    Match.tag('ProviderError', () => COLOR_ORANGE),
    Match.tag('OperationalWarning', () => COLOR_YELLOW),
    Match.exhaustive
  )

const fieldsFor = (event: AlertEvent): readonly EmbedField[] =>
  Match.value(event).pipe(
    Match.tag('HttpError5xx', (e) => [
      { name: 'Method', value: e.method, inline: true },
      { name: 'Status', value: String(e.status), inline: true },
      ...(e.durationMs !== undefined
        ? [{ name: 'Duration', value: `${e.durationMs}ms`, inline: true }]
        : []),
      { name: 'URL', value: clamp(e.url, FIELD_VALUE_MAX), inline: false },
    ]),
    Match.tag('ProviderError', (e) => [
      { name: 'Provider', value: e.provider, inline: true },
      { name: 'Error tag', value: e.errorTag, inline: true },
      ...(e.userId !== undefined
        ? [{ name: 'User ID', value: e.userId, inline: true }]
        : []),
    ]),
    Match.tag('UnhandledDefect', (e) => [
      { name: 'Source', value: e.source, inline: true },
      ...(e.stack !== undefined
        ? [
            {
              name: 'Stack',
              value: `\`\`\`${clamp(e.stack, FIELD_VALUE_MAX - 8)}\`\`\``,
            },
          ]
        : []),
    ]),
    Match.tag('OperationalWarning', (e) => {
      const ctxKeys = Object.keys(e.context)
      if (ctxKeys.length === 0) return []
      const ctxStr = JSON.stringify(e.context, null, 2)
      return [
        {
          name: 'Context',
          value: `\`\`\`json\n${clamp(ctxStr, FIELD_VALUE_MAX - 12)}\n\`\`\``,
        },
      ]
    }),
    Match.exhaustive
  )

const descriptionFor = (event: AlertEvent): string =>
  Match.value(event).pipe(
    Match.tag('HttpError5xx', () => ''),
    Match.tag('ProviderError', (e) => clamp(e.message, DESC_MAX)),
    Match.tag('UnhandledDefect', (e) => clamp(e.message, DESC_MAX)),
    Match.tag('OperationalWarning', (e) => clamp(e.summary, DESC_MAX)),
    Match.exhaustive
  )

const buildEmbed = (event: AlertEvent, meta: AlertMeta): Embed => {
  const base: Embed = {
    title: titleFor(event, meta.environment),
    color: colorFor(event),
    fields: fieldsFor(event),
    timestamp: new Date().toISOString(),
  }
  const description = descriptionFor(event)
  const suffix =
    meta.duplicateCount > 0
      ? `\n\n_(+${meta.duplicateCount} similar suppressed since last alert)_`
      : ''
  const fullDesc = `${description}${suffix}`
  return fullDesc.length > 0 ? { ...base, description: fullDesc } : base
}

const postWebhook = (webhookUrl: string, embed: Embed) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        }),
      catch: (error) =>
        new DiscordWebhookError({
          message: error instanceof Error ? error.message : String(error),
        }),
    })
    if (!response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new DiscordWebhookError({
            message: 'Failed to read response body',
            status: response.status,
          }),
      })
      return yield* new DiscordWebhookError({
        message: `Discord webhook rejected: ${body.slice(0, 200)}`,
        status: response.status,
      })
    }
  })

export const DiscordAlerterLive = Layer.effect(
  Alerter,
  Effect.gen(function* () {
    const webhookUrl = yield* Config.redacted('DISCORD_WEBHOOK_URL')
    const settings = yield* AlerterConfig
    const url = Redacted.value(webhookUrl)

    const transport: AlertTransport = (event, meta) =>
      postWebhook(url, buildEmbed(event, meta))

    yield* Effect.log('Discord alerter initialized', {
      environment: settings.environment,
    })

    return yield* makeAlerter(transport, settings)
  })
)
