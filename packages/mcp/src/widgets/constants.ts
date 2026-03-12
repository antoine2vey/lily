/**
 * Maps widget-enabled tool names to their HTML template resource URIs.
 *
 * Used by both:
 * - addTool handlers (to set `_meta.ui.resourceUri` on CallToolResult)
 * - tool-meta middleware (to inject `_meta` into tools/list responses)
 */
export const TOOL_WIDGETS: Record<string, string> = {
  list_plants: 'ui://widget/plant-list',
  get_plant_details: 'ui://widget/plant-details',
  get_care_tasks: 'ui://widget/care-tasks',
  get_overdue_plants: 'ui://widget/care-tasks',
  water_plant: 'ui://widget/care-feedback',
  care_plant: 'ui://widget/care-feedback',
}
