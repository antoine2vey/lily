import fs from 'node:fs'
import path from 'node:path'
import { Array, Option, pipe, RegExp as Regex, String } from 'effect'
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
    Array.flatMap((text, index) =>
      pipe(
        text,
        Option.liftPredicate(
          (line) => !pipe(String.trimStart(line), String.startsWith('#'))
        ),
        Option.flatMap(String.match(pattern)),
        Option.flatMap((match) => Option.fromNullishOr(match[1])),
        Option.map((value) => ({ value, line: index + 1 })),
        Option.toArray
      )
    )
  )

// expo-router reads `_layout` and the `+` files (`+not-found`, `+html`,
// `+native-intent`) as configuration, so no link opens them by name.
const isRouteFile = (file: string): boolean =>
  !/^[_+]/.test(path.basename(file))

// `(group)` folders and `index` add no URL segment. `[param]` takes one
// segment and `[...rest]` takes one or more.
const routePattern = (file: string): RegExp =>
  pipe(
    file,
    String.replace(SOURCE_FILE, ''),
    String.split(path.sep),
    Array.filter((part) => !/^\(.*\)$/.test(part) && part !== 'index'),
    Array.map((part) =>
      /^\[\.\.\..*\]$/.test(part)
        ? '.+'
        : /^\[.*\]$/.test(part)
          ? '[^/]+'
          : Regex.escape(part)
    ),
    (parts) => new RegExp(`^${Array.join(parts, '/')}$`)
  )

/** Finds the route file, relative to `app/`, that a `lily:///` link opens. */
export const findRoute = (
  routeFiles: ReadonlyArray<string>,
  link: string
): Option.Option<string> => {
  const urlPath = pipe(
    link,
    String.slice(APP_LINK.length),
    String.replace(/[?#].*$/, ''),
    String.replace(/\/+$/, '')
  )
  return pipe(
    routeFiles,
    Array.filter(isRouteFile),
    Array.findFirst((file) => routePattern(file).test(urlPath))
  )
}

// A `${...}` hole stands for any value, on both sides of the comparison:
// in the app it is the interpolated id, in the flow it is a Maestro `--env`.
const TEMPLATE_HOLE = /\$\{[^}]*\}/g
const TEST_ID = /testID(?:=|:\s*)\{?["'`]([^"'`]+)["'`]/g

const renderedTestIDs = (
  files: ReadonlyArray<string>
): ReadonlyArray<{ readonly id: string; readonly file: string }> =>
  Array.flatMap(files, (file) =>
    pipe(
      fs.readFileSync(file, 'utf8'),
      String.matchAll(TEST_ID),
      Array.fromIterable,
      Array.map((match) => ({
        id: pipe(
          Option.fromNullishOr(match[1]),
          Option.getOrElse(() => ''),
          String.replace(TEMPLATE_HOLE, 'x')
        ),
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
  const routeFiles = Array.map(listFiles(appDir), (file) =>
    path.relative(appDir, file)
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
      Array.filter(({ value }) => String.startsWith(APP_LINK)(value)),
      Array.map(
        ({ value, line }): FlowFinding =>
          Option.match(findRoute(routeFiles, value), {
            onNone: () => ({
              kind: 'route',
              value,
              line,
              ok: false,
              evidence: 'no route file',
            }),
            onSome: (file) => ({
              kind: 'route',
              value,
              line,
              ok: true,
              evidence: path.join('app', file),
            }),
          })
      )
    ),
    ...pipe(
      flowMatches(flow, /^\s*id:\s*"?([^"\s]+)"?\s*$/),
      Array.map(({ value, line }): FlowFinding => {
        // Maestro reads an `id` as a regular expression, so this does too.
        const pattern = new RegExp(
          `^${String.replace(TEMPLATE_HOLE, '.*')(value)}$`
        )
        return Option.match(
          Array.findFirst(testIDs, ({ id }) => pattern.test(id)),
          {
            onNone: (): FlowFinding => ({
              kind: 'testID',
              value,
              line,
              ok: false,
              evidence: 'no component renders it',
            }),
            onSome: ({ file }): FlowFinding => ({
              kind: 'testID',
              value,
              line,
              ok: true,
              evidence: path.relative(packageRoot, file),
            }),
          }
        )
      })
    ),
    ...Array.map(shots, ({ value, line }): FlowFinding => {
      const ok = Array.contains(screens, value)
      return {
        kind: 'screenshot',
        value,
        line,
        ok,
        evidence: ok
          ? 'in SCREENS'
          : 'missing from SCREENS, so compose skips it',
      }
    }),
    ...Array.map(
      screens,
      (screen): FlowFinding =>
        Option.match(
          Array.findFirst(shots, ({ value }) => value === screen),
          {
            onNone: () => ({
              kind: 'screen',
              value: screen,
              line: 0,
              ok: false,
              evidence: 'no takeScreenshot step, so compose has no source',
            }),
            onSome: ({ line }) => ({
              kind: 'screen',
              value: screen,
              line,
              ok: true,
              evidence: 'captured by the flow',
            }),
          }
        )
    ),
  ]
}
