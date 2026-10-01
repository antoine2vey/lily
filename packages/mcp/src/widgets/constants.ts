/** HTML widget template resource URIs, registered in `widgets/resources.ts`. */
export const WidgetUri = {
  plantList: 'ui://widget/plant-list',
  plantDetails: 'ui://widget/plant-details',
  careTasks: 'ui://widget/care-tasks',
  careFeedback: 'ui://widget/care-feedback',
} as const

export type WidgetUri = (typeof WidgetUri)[keyof typeof WidgetUri]

/**
 * MCP `_meta` linking a tool (in `tools/list`) or a tool result (in
 * `tools/call`) to its widget template. ChatGPT reads `openai/outputTemplate`;
 * MCP Apps clients read `ui.resourceUri`. Other clients ignore `_meta`.
 */
export const widgetMeta = (uri: WidgetUri) => ({
  ui: { resourceUri: uri },
  'openai/outputTemplate': uri,
})
