import path from 'node:path'
import { Array, Option } from 'effect'
import { checkFlow, findRoute } from '../flow-check'

const findings = checkFlow(path.join(__dirname, '../../..'))

describe('.maestro/capture.yaml', () => {
  it('opens only routes that exist and waits only for testIDs the app renders', () => {
    expect(Array.filter(findings, ({ ok }) => !ok)).toEqual([])
  })

  it('reads the deep links, testIDs and screenshots of the flow', () => {
    const count = (kind: string) =>
      Array.filter(findings, (finding) => finding.kind === kind).length

    expect(count('route')).toBeGreaterThanOrEqual(5)
    expect(count('testID')).toBeGreaterThanOrEqual(10)
    expect(count('screenshot')).toBeGreaterThanOrEqual(5)
  })
})

describe('findRoute', () => {
  const settings = '(app)/settings.tsx'

  it('skips the `+` files of expo-router, which are not routes', () => {
    const files = ['+not-found.tsx', '+html.tsx', '+native-intent.ts', settings]

    expect(findRoute(files, 'lily:///settings')).toEqual(Option.some(settings))
    expect(findRoute(files, 'lily:///+not-found')).toEqual(Option.none())
  })

  it('matches a catch-all route over several segments', () => {
    const files = ['docs/[...slug].tsx']

    expect(findRoute(files, 'lily:///docs/a/b')).toEqual(
      Option.some('docs/[...slug].tsx')
    )
    expect(findRoute(files, 'lily:///docs')).toEqual(Option.none())
  })

  it('keeps a `[param]` route to one segment', () => {
    const files = ['plant/[plantId].tsx']

    expect(findRoute(files, 'lily:///plant/42')).toEqual(
      Option.some('plant/[plantId].tsx')
    )
    expect(findRoute(files, 'lily:///plant/42/edit')).toEqual(Option.none())
  })

  it('ignores a trailing slash', () => {
    expect(findRoute([settings], 'lily:///settings/')).toEqual(
      Option.some(settings)
    )
  })

  it('ignores a fragment and a query', () => {
    expect(findRoute([settings], 'lily:///settings#top')).toEqual(
      Option.some(settings)
    )
    expect(findRoute([settings], 'lily:///settings/?a=1#top')).toEqual(
      Option.some(settings)
    )
  })

  it('reads a dot in a file name as a literal', () => {
    expect(findRoute(['a.b.tsx'], 'lily:///axb')).toEqual(Option.none())
  })
})
