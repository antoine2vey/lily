import fs from 'node:fs'
import path from 'node:path'
import { Array, pipe, String } from 'effect'
import { SCREENS } from './copy'

export interface FlowFinding {
  readonly kind: 'route' | 'testID' | 'screenshot' | 'screen'
  readonly value: string
  readonly line: number
  readonly ok: boolean
  readonly evidence: string
}

const APP_LINK = 'lily:///'
const SOURCE_FILE = /\.tsx?$/
const TEST_FILE = /__tests__|\.test\./

const listFiles = (dir: string): ReadonlyArray<string> =>
  pipe(
    fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }),
    Array.filter((file) => SOURCE_FILE.test(file) && !TEST_FILE.test(file)),
    Array.map((file) => path.join(dir, file))
  )

const flowMatches = (
  flow: string,
  pattern: RegExp
): ReadonlyArray<{ readonly value: string; readonly line: number }> =>
  pipe(
    String.split(flow, '\n'),
    Array.flatMap((text, index) => {
      const match = String.trimStart(text).startsWith('#')
        ? null
        : pattern.exec(text)
      return match?.[1] ? [{ value: match[1], line: index + 1 }] : []
    })
  )

// `(group)` folders and `index` add no URL segment, and `[param]` takes any.
const routePattern = (appDir: string, file: string): RegExp =>
  pipe(
    path.relative(appDir, file).replace(SOURCE_FILE, ''),
    String.split(path.sep),
    Array.filter((part) => !/^\(.*\)$/.test(part) && part !== 'index'),
    Array.map((part) => (/^\[.*\]$/.test(part) ? '[^/]+' : part)),
    (parts) => new RegExp(`^${Array.join(parts, '/')}$`)
  )

// A `${...}` hole stands for any value, on both sides of the comparison:
// in the app it is the interpolated id, in the flow it is a Maestro `--env`.
const TEMPLATE_HOLE = /\$\{[^}]*\}/g
const TEST_ID = /testID(?:=|:\s*)\{?["'`]([^"'`]+)["'`]/g

const renderedTestIDs = (
  files: ReadonlyArray<string>
): ReadonlyArray<{ readonly id: string; readonly file: string }> =>
  Array.flatMap(files, (file) =>
    pipe(
      Array.fromIterable(fs.readFileSync(file, 'utf8').matchAll(TEST_ID)),
      Array.map((match) => ({
        id: (match[1] ?? '').replace(TEMPLATE_HOLE, 'x'),
        file,
      }))
    )
  )

export const checkFlow = (packageRoot: string): ReadonlyArray<FlowFinding> => {
  const flow = fs.readFileSync(
    path.join(packageRoot, '.maestro/capture.yaml'),
    'utf8'
  )
  const appDir = path.join(packageRoot, 'app')
  const relative = (file: string) => path.relative(packageRoot, file)

  const routes = pipe(
    listFiles(appDir),
    Array.filter((file) => !path.basename(file).startsWith('_')),
    Array.map((file) => ({ file, pattern: routePattern(appDir, file) }))
  )
  const testIDs = renderedTestIDs([
    ...listFiles(appDir),
    ...listFiles(path.join(packageRoot, 'src')),
  ])
  const shots = flowMatches(flow, /takeScreenshot:\s*"\$\{OUTPUT_DIR\}\/(.+)"/)
  const screens: ReadonlyArray<string> = SCREENS

  return [
    ...pipe(
      flowMatches(flow, /openLink:\s*"([^"]+)"/),
      Array.filter(({ value }) => value.startsWith(APP_LINK)),
      Array.map(({ value, line }): FlowFinding => {
        const urlPath = value.slice(APP_LINK.length).replace(/\?.*$/, '')
        const route = Array.findFirst(routes, ({ pattern }) =>
          pattern.test(urlPath)
        )
        return {
          kind: 'route',
          value,
          line,
          ok: route._tag === 'Some',
          evidence:
            route._tag === 'Some'
              ? relative(route.value.file)
              : 'no route file',
        }
      })
    ),
    ...pipe(
      flowMatches(flow, /^\s*id:\s*"?([^"\s]+)"?\s*$/),
      Array.map(({ value, line }): FlowFinding => {
        const pattern = new RegExp(`^${value.replace(TEMPLATE_HOLE, '.*')}$`)
        const rendered = Array.findFirst(testIDs, ({ id }) => pattern.test(id))
        return {
          kind: 'testID',
          value,
          line,
          ok: rendered._tag === 'Some',
          evidence:
            rendered._tag === 'Some'
              ? relative(rendered.value.file)
              : 'no component renders it',
        }
      })
    ),
    ...Array.map(
      shots,
      ({ value, line }): FlowFinding => ({
        kind: 'screenshot',
        value,
        line,
        ok: Array.contains(screens, value),
        evidence: Array.contains(screens, value)
          ? 'in SCREENS'
          : 'missing from SCREENS, so compose skips it',
      })
    ),
    ...Array.map(screens, (screen): FlowFinding => {
      const shot = Array.findFirst(shots, ({ value }) => value === screen)
      return {
        kind: 'screen',
        value: screen,
        line: shot._tag === 'Some' ? shot.value.line : 0,
        ok: shot._tag === 'Some',
        evidence:
          shot._tag === 'Some'
            ? 'captured by the flow'
            : 'no takeScreenshot step, so compose has no source',
      }
    }),
  ]
}
