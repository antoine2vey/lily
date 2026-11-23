// Fixture for lint/one-chrome-launch.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
import { execFile, spawn } from 'node:child_process'

declare const CHROME: string
declare const chromePath: string
declare const profile: string
declare const port: number
declare const flags: ReadonlyArray<string>

export const flagged = () => {
  Bun.spawn( // flag
    [
      CHROME,
      '--headless=new',
      '--remote-debugging-port=0', // flag
      `--user-data-dir=${profile}`,
    ],
    { stdout: 'ignore', stderr: 'ignore' }
  )
  Bun.spawn([CHROME, ...flags]) // flag
  Bun.spawnSync([process.env.CHROME_PATH ?? 'google-chrome', '--version']) // flag
  spawn(chromePath, flags) // flag
  execFile('/usr/bin/chromium', ['--headless']) // flag
  spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', []) // flag
  const pipe = ['--remote-debugging-pipe'] // flag
  const debugging = `--remote-debugging-port=${port}` // flag
  return [pipe, debugging]
}

export const clean = () => {
  Bun.spawn(['bunx', '--bun', 'lighthouse@12', `--port=${port}`])
  spawn('chromatic', ['--project-token=x'])
  Bun.spawn(['bunx', 'lighthouse@12', '--chrome-flags=--headless=new'])
  Bun.spawn(['nginx', '-g', 'daemon off;'])
  const note = 'remote debugging is off'
  const chrome = { port: String(port) }
  return [note, chrome]
}
