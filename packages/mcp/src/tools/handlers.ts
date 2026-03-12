import { Tool as AiTool, McpSchema, McpServer } from '@effect/ai'
import type { ApiClient } from '@lily/mcp/api-client'
import type { OAuthService } from '@lily/mcp/auth/oauth-service'
import { provideAuth } from '@lily/mcp/auth/resolve-user'
import {
  askPlantQuestionEffect,
  carePlantEffect,
  getCareTasksEffect,
  getOverduePlantsEffect,
  getPlantDetailsEffect,
  listPlantsEffect,
  waterPlantEffect,
} from '@lily/mcp/tools'
import {
  CarePlant,
  GetCareTasks,
  GetOverduePlants,
  GetPlantDetails,
  ListPlants,
  TextToolkit,
  WaterPlant,
} from '@lily/mcp/tools/definitions'
import { TOOL_WIDGETS } from '@lily/mcp/widgets/constants'
import {
  Cause,
  Context,
  Effect,
  JSONSchema,
  Option,
  Record,
  Schema,
} from 'effect'
import * as AST from 'effect/SchemaAST'

/**
 * Global services that tool effects need, provided at layer construction time.
 * Simplified to ApiClient (for HTTP calls) + OAuthService (for auth resolution).
 */
type ToolDeps = ApiClient | OAuthService

/**
 * Generates a JSON Schema from a schema AST, matching the approach used
 * internally by @effect/ai's toolkit registration.
 *
 * Unlike `JSONSchema.make()`, this omits the top-level `$schema` field
 * to produce schemas identical to those the toolkit generates.
 */
const makeJsonSchema = (ast: AST.AST): object => {
  const props = AST.getPropertySignatures(ast)
  if (props.length === 0) {
    return {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
      additionalProperties: false,
    }
  }
  const $defs: globalThis.Record<string, JSONSchema.JsonSchema7> = {}
  const schema = JSONSchema.fromAST(ast, {
    definitions: $defs,
    topLevelReferenceStrategy: 'skip',
  })
  const out = schema as unknown as globalThis.Record<string, unknown>
  if (Record.keys($defs).length > 0) {
    out.$defs = $defs
  }
  return out
}

/**
 * Builds a McpSchema.Tool from an AiTool definition, replicating what
 * registerToolkit does internally but giving us control over the handler.
 *
 * Uses makeJsonSchema (AST-based) instead of JSONSchema.make to match
 * the exact schema format the toolkit produces (no $schema field).
 */
const toMcpTool = (tool: AiTool.Any) =>
  new McpSchema.Tool({
    name: tool.name,
    description: tool.description,
    inputSchema: makeJsonSchema(tool.parametersSchema.ast),
    annotations: new McpSchema.ToolAnnotations({
      readOnlyHint: Context.get(tool.annotations, AiTool.Readonly),
      destructiveHint: Context.get(tool.annotations, AiTool.Destructive),
      idempotentHint: Context.get(tool.annotations, AiTool.Idempotent),
      openWorldHint: Context.get(tool.annotations, AiTool.OpenWorld),
    }),
  })

/**
 * Creates a CallToolResult with both markdown content and structured
 * data for widget rendering.
 *
 * - content[0].text: readable markdown for non-widget clients
 * - structuredContent: JSON data for widget iframe rendering
 * - _meta.ui.resourceUri: links this result to the HTML widget template
 *   (ChatGPT needs this on BOTH the tool descriptor AND the result
 *   to associate the structured output with the correct widget iframe)
 */
const widgetResult = (
  toolName: string,
  data: { text: string; [key: string]: unknown }
) => {
  const { text, ...structured } = data
  const widgetUri = Record.get(TOOL_WIDGETS, toolName)

  return new McpSchema.CallToolResult({
    content: [{ type: 'text' as const, text }],
    structuredContent: structured,
    _meta: Option.match(widgetUri, {
      onNone: () => undefined,
      onSome: (uri) => ({
        ui: { resourceUri: uri },
        'openai/outputTemplate': uri,
      }),
    }),
  })
}

/**
 * Creates an error CallToolResult with isError: true.
 * Matches the pattern used internally by @effect/ai's toolkit registration
 * so that failures are reported as tool-level errors (visible to the LLM)
 * instead of RPC-level errors (which clients treat as "tool not accessible").
 */
const errorResult = (error: unknown) =>
  new McpSchema.CallToolResult({
    isError: true,
    content: [
      {
        type: 'text' as const,
        text:
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : JSON.stringify(error),
      },
    ],
  })

/**
 * Wires the text-only TextToolkit (ask_plant_question) to its handler.
 * Uses provideAuth to provide CurrentJwt into the effect context.
 */
export const TextToolkitHandlersLive = TextToolkit.toLayer(
  Effect.gen(function* () {
    const ctx = yield* Effect.context<ToolDeps>()

    return {
      ask_plant_question: (params) =>
        askPlantQuestionEffect(params).pipe(
          provideAuth,
          Effect.provide(ctx),
          Effect.orDie
        ),
    }
  })
)

/**
 * Registers widget-enabled tools via McpServer.addTool() to control
 * the CallToolResult shape (structuredContent + _meta for ChatGPT).
 *
 * Each tool handler:
 * 1. Decodes raw JSON-RPC arguments via Schema.decodeUnknown
 * 2. Resolves auth from the bearer token (extracts API JWT)
 * 3. Calls the underlying tool effect with the JWT
 * 4. Returns CallToolResult with markdown + structured data + widget URI
 *
 * Errors are caught via Effect.matchCauseEffect and returned as
 * CallToolResult with isError: true, matching the toolkit's pattern.
 */
export const WidgetToolsLayer = Effect.gen(function* () {
  const registry = yield* McpServer.McpServer
  const ctx = yield* Effect.context<ToolDeps>()

  /**
   * Wraps a tool handler effect with error recovery.
   * Catches both typed errors and defects, returning a CallToolResult
   * with isError: true instead of propagating failures up to the
   * RPC framework (which would produce an opaque JSON-RPC error).
   */
  const handleTool = (
    toolName: string,
    effect: Effect.Effect<{ text: string; [key: string]: unknown }, unknown>
  ) =>
    effect.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) =>
          Effect.succeed(errorResult(Cause.squash(cause))).pipe(
            Effect.tap(() =>
              Effect.logError(`Tool ${toolName} failed`, Cause.squash(cause))
            )
          ),
        onSuccess: (result) => Effect.succeed(widgetResult(toolName, result)),
      })
    )

  /**
   * Registers a widget-enabled tool with decode → auth → handle pipeline.
   * Auth is resolved via provideAuth which provides CurrentJwt into context.
   */
  const register = <P>(
    tool: AiTool.Any,
    effect: (
      params: P
    ) => Effect.Effect<
      { text: string; [key: string]: unknown },
      unknown,
      unknown
    >
  ) => {
    const decode = Schema.decodeUnknown(tool.parametersSchema)
    return registry.addTool({
      tool: toMcpTool(tool),
      handle: (payload: unknown) => {
        const pipeline = decode(payload).pipe(
          Effect.flatMap((params) =>
            effect(params as P).pipe(provideAuth, Effect.provide(ctx))
          )
        ) as Effect.Effect<{ text: string; [key: string]: unknown }, unknown>
        return handleTool(tool.name, pipeline)
      },
    })
  }

  /**
   * Registers a parameterless tool. Auth is resolved via provideAuth.
   */
  const registerNoParams = (
    tool: AiTool.Any,
    effect: () => Effect.Effect<
      { text: string; [key: string]: unknown },
      unknown,
      unknown
    >
  ) =>
    registry.addTool({
      tool: toMcpTool(tool),
      handle: () => {
        const pipeline = effect().pipe(
          provideAuth,
          Effect.provide(ctx)
        ) as Effect.Effect<{ text: string; [key: string]: unknown }, unknown>
        return handleTool(tool.name, pipeline)
      },
    })

  yield* register(ListPlants, listPlantsEffect)
  yield* register(GetPlantDetails, getPlantDetailsEffect)
  yield* registerNoParams(GetCareTasks, getCareTasksEffect)
  yield* registerNoParams(GetOverduePlants, getOverduePlantsEffect)
  yield* register(WaterPlant, waterPlantEffect)
  yield* register(CarePlant, carePlantEffect)
}) as Effect.Effect<void, never, McpServer.McpServer | ToolDeps>
