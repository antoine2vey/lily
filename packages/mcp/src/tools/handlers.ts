import {
  type ApiClient,
  type CurrentJwt,
  CurrentUserId,
} from '@lily/mcp/api-client'
import type { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import type { OAuthService } from '@lily/mcp/auth/oauth-service'
import { provideAuth } from '@lily/mcp/auth/resolve-user'
import {
  askPlantQuestionEffect,
  carePlantEffect,
  getCareTasksEffect,
  getOverduePlantsEffect,
  getPlantDetailsEffect,
  listPlantsEffect,
} from '@lily/mcp/tools'
import {
  AskPlantQuestion,
  CarePlant,
  GetCareTasks,
  GetOverduePlants,
  GetPlantDetails,
  ListPlants,
} from '@lily/mcp/tools/definitions'
import {
  Cause,
  Context,
  Effect,
  String as EffectString,
  Layer,
  Option,
  Predicate,
  pipe,
  Record,
  Schema,
} from 'effect'
import { McpSchema, McpServer, Tool } from 'effect/ai'

type ToolDeps = ApiClient | OAuthService | OAuthRepository

type ToolOutput = { readonly text: string; readonly [key: string]: unknown }

const widgetMetaOf = (tool: Tool.Any) =>
  Context.getOption(tool.annotations, Tool.Meta)

/**
 * Closed objects (`additionalProperties: false`) keep models from inventing
 * arguments; `Tool.getJsonSchema` would emit `true`. Arguments are still
 * decoded leniently.
 */
const inputJsonSchema = (tool: Tool.Any) => {
  const document = Schema.toJsonSchemaDocument(tool.parametersSchema, {
    onExcessProperty: 'error',
  })
  return Record.isEmptyRecord(document.definitions)
    ? document.schema
    : { ...document.schema, $defs: document.definitions }
}

const toMcpTool = (tool: Tool.Any) =>
  Schema.decodeUnknownEffect(McpSchema.ToolJson)(inputJsonSchema(tool)).pipe(
    Effect.map(
      (inputSchema) =>
        new McpSchema.Tool({
          name: tool.name,
          description: Tool.getDescription(tool),
          inputSchema,
          annotations: {
            readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
            destructiveHint: Context.get(tool.annotations, Tool.Destructive),
            idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
            openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
          },
          _meta: Option.getOrUndefined(widgetMetaOf(tool)),
        })
    ),
    Effect.orDie
  )

/**
 * ChatGPT needs the widget `_meta` on the result as well as on the tool
 * descriptor to bind `structuredContent` to the widget iframe.
 */
const successResult = (tool: Tool.Any, { text, ...structured }: ToolOutput) =>
  Option.match(widgetMetaOf(tool), {
    onNone: () =>
      new McpSchema.CallToolResult({ content: [{ type: 'text', text }] }),
    onSome: (meta) =>
      new McpSchema.CallToolResult({
        content: [{ type: 'text', text }],
        structuredContent: structured,
        _meta: meta,
      }),
  })

/**
 * Failures are reported as a tool result with `isError: true` so the model
 * sees them; a JSON-RPC error makes clients mark the tool as unavailable.
 */
const errorResult = (error: unknown) =>
  new McpSchema.CallToolResult({
    isError: true,
    content: [
      {
        type: 'text',
        // Tagged errors without a message field have message ''.
        text:
          Predicate.hasProperty(error, 'message') &&
          Predicate.isString(error.message) &&
          EffectString.isNonEmpty(error.message)
            ? error.message
            : JSON.stringify(error),
      },
    ],
  })

export const ToolsLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer
    const deps = yield* Effect.context<ToolDeps>()

    const register = <P, E>(
      tool: Tool.Any & { readonly parametersSchema: Schema.Decoder<P> },
      run: (params: P) => Effect.Effect<ToolOutput, E, ApiClient | CurrentJwt>
    ) => {
      const decode = Schema.decodeUnknownEffect(tool.parametersSchema)
      return Effect.flatMap(toMcpTool(tool), (mcpTool) =>
        server.addTool({
          tool: mcpTool,
          annotations: tool.annotations,
          handle: (payload: unknown) =>
            pipe(
              Option.fromNullishOr(payload),
              Option.getOrElse(() => ({})),
              decode,
              Effect.flatMap((params) =>
                run(params).pipe(
                  Effect.tap(() =>
                    Effect.flatMap(CurrentUserId, (userId) =>
                      Effect.log(
                        `tool=${tool.name} userId=${userId} args=${JSON.stringify(params)}`
                      )
                    )
                  ),
                  provideAuth
                )
              ),
              Effect.provide(deps),
              Effect.matchCause({
                onFailure: (cause) => errorResult(Cause.squash(cause)),
                onSuccess: (output) => successResult(tool, output),
              })
            ),
        })
      )
    }

    yield* register(ListPlants, listPlantsEffect)
    yield* register(GetPlantDetails, getPlantDetailsEffect)
    yield* register(GetCareTasks, () => getCareTasksEffect())
    yield* register(GetOverduePlants, () => getOverduePlantsEffect())
    yield* register(CarePlant, carePlantEffect)
    yield* register(AskPlantQuestion, (params) =>
      Effect.map(askPlantQuestionEffect(params), (text) => ({ text }))
    )
  })
)
