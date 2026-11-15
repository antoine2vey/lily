import path from 'node:path'
import { Array } from 'effect'
import { checkFlow } from '../flow-check'

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
