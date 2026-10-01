import { WidgetUri } from '@lily/mcp/widgets/constants'
import { careFeedbackTemplate } from '@lily/mcp/widgets/templates/care-feedback'
import { careTasksTemplate } from '@lily/mcp/widgets/templates/care-tasks'
import { plantDetailsTemplate } from '@lily/mcp/widgets/templates/plant-details'
import { plantListTemplate } from '@lily/mcp/widgets/templates/plant-list'
import { Effect, Layer } from 'effect'
import { McpServer } from 'effect/ai'

/**
 * Registers the HTML widget templates as MCP resources with the
 * `text/html;profile=mcp-app` MIME type. ChatGPT fetches one via
 * `resources/read` when a tool's `_meta` names its URI; other clients list
 * them and ignore the profile.
 */

const WIDGET_MIME = 'text/html;profile=mcp-app'

/**
 * Returns a full `ReadResourceResult` rather than a string because the
 * string form omits `mimeType` from the content blob, and ChatGPT needs it
 * to recognise a widget. The `_meta` keys are ChatGPT rendering hints.
 */
const widgetResource = (options: {
  readonly uri: WidgetUri
  readonly name: string
  readonly description: string
  readonly html: string
  readonly widgetDescription: string
}) =>
  McpServer.resource({
    uri: options.uri,
    name: options.name,
    description: options.description,
    mimeType: WIDGET_MIME,
    content: Effect.succeed({
      contents: [
        { uri: options.uri, mimeType: WIDGET_MIME, text: options.html },
      ],
      _meta: {
        ui: { prefersBorder: true },
        'openai/widgetDescription': options.widgetDescription,
        'openai/widgetPrefersBorder': true,
      },
    }),
  })

export const WidgetResourcesLayer = Layer.mergeAll(
  widgetResource({
    uri: WidgetUri.plantList,
    name: 'Plant List Widget',
    description: 'Rich HTML widget for displaying plant collections',
    html: plantListTemplate,
    widgetDescription:
      'Interactive card grid of all plants with health badges and quick actions',
  }),
  widgetResource({
    uri: WidgetUri.plantDetails,
    name: 'Plant Details Widget',
    description: 'Rich HTML widget for single plant detail view',
    html: plantDetailsTemplate,
    widgetDescription:
      'Detailed plant view with care ratings, schedules, and history',
  }),
  widgetResource({
    uri: WidgetUri.careTasks,
    name: 'Care Tasks Widget',
    description: 'Rich HTML widget for care task groups',
    html: careTasksTemplate,
    widgetDescription:
      'Care tasks grouped by overdue, today, and upcoming with action buttons',
  }),
  widgetResource({
    uri: WidgetUri.careFeedback,
    name: 'Care Feedback Widget',
    description: 'Rich HTML widget for care action confirmation',
    html: careFeedbackTemplate,
    widgetDescription:
      'Confirmation card after watering or fertilizing a plant',
  })
)
