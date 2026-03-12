import { McpServer } from '@effect/ai'
import { careFeedbackTemplate } from '@lily/mcp/widgets/templates/care-feedback'
import { careTasksTemplate } from '@lily/mcp/widgets/templates/care-tasks'
import { plantDetailsTemplate } from '@lily/mcp/widgets/templates/plant-details'
import { plantListTemplate } from '@lily/mcp/widgets/templates/plant-list'
import { Effect, Layer } from 'effect'

/**
 * Registers HTML widget templates as MCP resources with the
 * `text/html;profile=mcp-app` MIME type.
 *
 * ChatGPT fetches these via `resources/read` when a tool response
 * includes `_meta.ui.resourceUri` matching one of these URIs.
 * Non-ChatGPT clients see these in `resources/list` but can safely
 * ignore them since they don't understand the MIME profile.
 *
 * We return a full ReadResourceResult (not a plain string) so that
 * the mimeType is included in the `resources/read` content blob —
 * @effect/ai's resolveResourceContent only sets { uri, text } for
 * strings, omitting mimeType which ChatGPT needs to identify widgets.
 */

const WIDGET_MIME = 'text/html;profile=mcp-app'

/**
 * Returns a ReadResourceResult with the mimeType set on the content blob
 * and _meta for widget rendering hints.
 *
 * - mimeType on each content blob ensures ChatGPT identifies it as a widget
 * - _meta.ui.prefersBorder hints ChatGPT to render with a card border
 * - _meta["openai/widgetDescription"] reduces redundant model narration
 */
const widgetContent = (uri: string, html: string, description: string) =>
  Effect.succeed({
    contents: [{ uri, mimeType: WIDGET_MIME, text: html }],
    _meta: {
      ui: { prefersBorder: true },
      'openai/widgetDescription': description,
      'openai/widgetPrefersBorder': true,
    },
  })

const PlantListWidgetLayer = McpServer.resource({
  uri: 'ui://widget/plant-list',
  name: 'Plant List Widget',
  description: 'Rich HTML widget for displaying plant collections',
  mimeType: WIDGET_MIME,
  content: widgetContent(
    'ui://widget/plant-list',
    plantListTemplate,
    'Interactive card grid of all plants with health badges and quick actions'
  ),
})

const PlantDetailsWidgetLayer = McpServer.resource({
  uri: 'ui://widget/plant-details',
  name: 'Plant Details Widget',
  description: 'Rich HTML widget for single plant detail view',
  mimeType: WIDGET_MIME,
  content: widgetContent(
    'ui://widget/plant-details',
    plantDetailsTemplate,
    'Detailed plant view with care ratings, schedules, and history'
  ),
})

const CareTasksWidgetLayer = McpServer.resource({
  uri: 'ui://widget/care-tasks',
  name: 'Care Tasks Widget',
  description: 'Rich HTML widget for care task groups',
  mimeType: WIDGET_MIME,
  content: widgetContent(
    'ui://widget/care-tasks',
    careTasksTemplate,
    'Care tasks grouped by overdue, today, and upcoming with action buttons'
  ),
})

const CareFeedbackWidgetLayer = McpServer.resource({
  uri: 'ui://widget/care-feedback',
  name: 'Care Feedback Widget',
  description: 'Rich HTML widget for care action confirmation',
  mimeType: WIDGET_MIME,
  content: widgetContent(
    'ui://widget/care-feedback',
    careFeedbackTemplate,
    'Confirmation card after watering or fertilizing a plant'
  ),
})

/**
 * Combined layer registering all 4 widget template resources.
 */
export const WidgetResourcesLayer = Layer.mergeAll(
  PlantListWidgetLayer,
  PlantDetailsWidgetLayer,
  CareTasksWidgetLayer,
  CareFeedbackWidgetLayer
)
