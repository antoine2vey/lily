import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { Array, Option, pipe, String as Str } from 'effect'

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// The first launch on a fresh CI runner pages the Chrome binary in from a cold disk. On 24 runners, right after the
// web build, it took 0.4 to 11.1 s, longer as the disk's IO pressure rose. The second launch took under 0.5 s.
const STARTUP_MS = 60_000
const TAIL_LINES = 20
const LISTENING = /DevTools listening on ws:\/\/\S+:(\d+)\//

export interface Chrome {
  readonly port: string
  readonly close: () => Promise<void>
}

interface Running {
  readonly proc: Subprocess<'ignore', 'ignore', 'pipe'>
  readonly profile: string
}

const removeProfile = (profile: string) =>
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 })

const running = new Set<Running>()
process.once('exit', () => {
  for (const { proc, profile } of running) {
    proc.kill('SIGKILL')
    removeProfile(profile)
  }
})
process.once('SIGINT', () => process.exit(130))
process.once('SIGTERM', () => process.exit(143))

const spawn = (profile: string, flags: ReadonlyArray<string>) => {
  try {
    return Bun.spawn(
      [
        CHROME,
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--use-mock-keychain',
        '--password-store=basic',
        '--no-first-run',
        ...flags,
        'about:blank',
      ],
      { stdout: 'ignore', stderr: 'pipe' }
    )
  } catch (error) {
    removeProfile(profile)
    throw error
  }
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms).unref())

// Resolves once Chrome listens for DevTools. Rejects with the tail of its stderr as soon as it exits, or after
// STARTUP_MS. close() or the script's exit stops Chrome and deletes its profile.
export const launchChrome = async (
  flags: ReadonlyArray<string> = []
): Promise<Chrome> => {
  const profile = mkdtempSync(join(tmpdir(), 'lily-chrome-'))
  const proc = spawn(profile, flags)
  const entry: Running = { proc, profile }
  running.add(entry)
  const close = async () => {
    if (!running.delete(entry)) return
    proc.kill()
    await proc.exited
    removeProfile(profile)
  }

  const tail: Array<string> = []
  let onLine = (_line: string) => {}
  // Chrome blocks once the pipe fills, so stderr is read for as long as Chrome runs.
  const drained = (async () => {
    const decoder = new TextDecoder()
    let partial = ''
    for await (const chunk of proc.stderr) {
      const lines = Str.split(
        partial + decoder.decode(chunk, { stream: true }),
        '\n'
      )
      partial = lines.pop() ?? ''
      for (const line of lines) {
        tail.push(line)
        if (tail.length > TAIL_LINES) tail.shift()
        onLine(line)
      }
    }
    if (partial !== '') tail.push(partial)
  })()

  const port = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(`Chrome opened no debugging port within ${STARTUP_MS / 1000} s`),
      STARTUP_MS
    )
    onLine = (line) =>
      pipe(
        line,
        Str.match(LISTENING),
        Option.flatMap((match) => Array.get(match, 1)),
        Option.map((found) => {
          clearTimeout(timer)
          resolve(found)
        })
      )
    void proc.exited.then(async (code) => {
      clearTimeout(timer)
      // Chrome's helper processes inherit stderr and hold it open for seconds after the browser exits.
      await Promise.race([drained, delay(1000)])
      reject(
        `Chrome exited with ${proc.signalCode ?? `code ${code}`} before it opened a debugging port`
      )
    })
  })

  try {
    return { port: await port, close }
  } catch (reason) {
    await close()
    throw new Error(
      `${reason}. ${CHROME} wrote to stderr:\n${tail.length === 0 ? '(nothing)' : Array.join(tail, '\n')}`
    )
  }
}
