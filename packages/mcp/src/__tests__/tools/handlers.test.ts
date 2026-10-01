import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import { ToolsLayer } from '@lily/mcp/tools/handlers'
import { Array, Effect, Layer, Record } from 'effect'
import { McpServer } from 'effect/ai'
import { describe, expect, it } from 'vitest'

const registeredTools = Effect.gen(function* () {
  const server = yield* McpServer.McpServer
  return Array.map(server.tools, ({ tool }) => tool)
}).pipe(
  Effect.provide(
    ToolsLayer.pipe(
      Layer.provideMerge(McpServer.McpServer.layer),
      Layer.provide(
        Layer.mergeAll(
          createMockApiClient(),
          Layer.mock(OAuthService)({}),
          Layer.mock(OAuthRepository)({})
        )
      )
    )
  )
)

const widgetMeta = (uri: string) => ({
  ui: { resourceUri: uri },
  'openai/outputTemplate': uri,
})

describe('ToolsLayer', () => {
  it('lists widget tools with the _meta ChatGPT needs to render them', async () => {
    const tools = await Effect.runPromise(registeredTools)
    const metaByName = Record.fromEntries(
      Array.map(tools, (tool) => [tool.name, tool._meta])
    )

    expect(metaByName).toEqual({
      list_plants: widgetMeta('ui://widget/plant-list'),
      get_plant_details: widgetMeta('ui://widget/plant-details'),
      get_care_tasks: widgetMeta('ui://widget/care-tasks'),
      get_overdue_plants: widgetMeta('ui://widget/care-tasks'),
      care_plant: widgetMeta('ui://widget/care-feedback'),
      ask_plant_question: undefined,
    })
  })

  it('emits closed object input schemas', async () => {
    const tools = await Effect.runPromise(registeredTools)

    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      })
    }
  })
})
