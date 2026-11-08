import { runInNewContext } from 'node:vm'
import { careFeedbackTemplate } from '@lily/mcp/widgets/templates/care-feedback'
import { careTasksTemplate } from '@lily/mcp/widgets/templates/care-tasks'
import { plantDetailsTemplate } from '@lily/mcp/widgets/templates/plant-details'
import { plantListTemplate } from '@lily/mcp/widgets/templates/plant-list'
import { describe, expect, it } from 'vitest'

const payload = `x" onmouseover="alert(1)`

const renderWidget = (template: string, toolOutput: unknown): string => {
  const scripts = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  const source = scripts[scripts.length - 1]?.[1] ?? ''
  const root = { innerHTML: '', addEventListener: () => undefined }
  const window = {
    openai: { toolOutput },
    addEventListener: () => undefined,
  }
  runInNewContext(source, {
    window,
    document: { getElementById: () => root },
    setInterval: () => 0,
    clearInterval: () => undefined,
    navigator: {},
  })
  return root.innerHTML
}

const task = {
  plantName: payload,
  careType: 'watering',
  dueDate: 'today',
  actionable: true,
}

const cases = [
  [
    'plant list',
    plantListTemplate,
    {
      plants: [
        {
          id: payload,
          name: payload,
          healthColor: 'green',
          healthLabel: 'Healthy',
        },
      ],
    },
  ],
  [
    'plant details',
    plantDetailsTemplate,
    {
      plant: {
        name: payload,
        healthColor: 'green',
        healthLabel: 'Healthy',
        needsWatering: true,
        needsFertilizing: true,
        schedules: [],
        recentCare: [],
      },
    },
  ],
  ['care tasks', careTasksTemplate, { tasks: { overdue: [task] } }],
  [
    'care feedback',
    careFeedbackTemplate,
    {
      feedback: {
        careLabel: 'Watered',
        careType: 'watering',
        plantName: payload,
      },
    },
  ],
] as const

describe('widget templates escape plant names in attributes', () => {
  it.each(cases)('%s', (_name, template, data) => {
    const html = renderWidget(template, data)

    expect(html).toContain('&quot;')
    expect(html).not.toContain(payload)
    expect(html).not.toMatch(/"\s*onmouseover=/)
  })
})
