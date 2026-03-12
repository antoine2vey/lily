import {
  HttpApp,
  HttpBody,
  HttpMiddleware,
  HttpServerResponse,
} from '@effect/platform'
import { TOOL_WIDGETS } from '@lily/mcp/widgets/constants'
import { Array, Effect, Option, Predicate, Record } from 'effect'

/**
 * HTTP middleware that injects `_meta.ui.resourceUri` on tool definitions
 * in `tools/list` responses for ChatGPT widget discovery.
 *
 * The `Tool` schema class in @effect/ai doesn't have `_meta`, so the
 * server's native `tools/list` response lacks widget metadata. This
 * middleware registers a pre-response handler that patches the serialized
 * JSON response body to add `_meta` only to tools that have widget
 * templates registered in TOOL_WIDGETS.
 *
 * Why a pre-response handler instead of a response-modifying middleware?
 * @effect/platform's `toHandled` sends the response to the client BEFORE
 * the outer middleware can modify it. The pre-response handler runs
 * BEFORE the response is sent, allowing body modification.
 *
 * Non-ChatGPT clients silently ignore `_meta` per the MCP spec.
 *
 * Note: patchToolsList operates on raw parsed JSON (unknown types),
 * so it uses Predicate.isRecord and globalThis.Array.isArray for
 * type narrowing at the JSON boundary. This is intentional — Effect
 * Array utilities require typed arrays.
 */
export const toolMetaMiddleware = HttpMiddleware.make((app) =>
  Effect.zipRight(
    HttpApp.appendPreResponseHandler((_request, response) => {
      // Only process Uint8Array bodies (JSON-RPC responses)
      if (response.body._tag !== 'Uint8Array') {
        return Effect.succeed(response)
      }

      const bodyBytes = response.body.body
      const bodyStr = new TextDecoder().decode(bodyBytes)

      // Quick check: skip non-tools/list responses.
      // Use '"tools":[' to avoid false positives from initialize responses
      // which contain "capabilities":{"tools":{"listChanged":true}}
      if (!bodyStr.includes('"tools":[')) {
        return Effect.succeed(response)
      }

      // Parse and patch the JSON-RPC response to inject _meta on tools
      const patched = Effect.try(() => {
        const parsed = JSON.parse(bodyStr)
        const modified = patchToolsList(parsed)
        return JSON.stringify(modified)
      }).pipe(Effect.orElse(() => Effect.succeed(bodyStr)))

      return Effect.map(patched, (body) =>
        HttpServerResponse.setBody(
          response,
          HttpBody.text(body, response.body.contentType)
        )
      )
    }),
    app
  )
)

/**
 * Patches a JSON-RPC response (or batch) to inject `_meta` on tools
 * that have widget templates.
 */
const patchToolsList = (parsed: unknown): unknown => {
  if (!Predicate.isRecord(parsed)) return parsed

  // Handle JSON-RPC batch (array of responses)
  if (globalThis.Array.isArray(parsed)) {
    return Array.map(parsed as unknown[], patchToolsList)
  }

  // Check if this is a tools/list result
  const result = parsed.result
  if (!Predicate.isRecord(result)) return parsed

  const tools = result.tools
  if (!globalThis.Array.isArray(tools)) return parsed

  // Inject _meta on matching tools
  result.tools = Array.map(
    tools as Record<string, unknown>[],
    (tool): Record<string, unknown> => {
      const name = tool.name as string
      const widgetUri = Record.get(TOOL_WIDGETS, name)
      return Option.match(widgetUri, {
        onNone: () => tool,
        onSome: (uri) => ({
          ...tool,
          _meta: {
            ...(Predicate.isRecord(tool._meta)
              ? (tool._meta as Record<string, unknown>)
              : {}),
            ui: { resourceUri: uri },
            'openai/outputTemplate': uri,
          },
        }),
      })
    }
  )

  return parsed
}
