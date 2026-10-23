#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  Array,
  Console,
  Data,
  Effect,
  Option,
  pipe,
  Record,
  String,
} from 'effect'
import { keyCheckerboard, SOLID_PARTICLES, TRANSLUCENT_PARTICLES } from './key'

// Masko exports each clip as a "stacked" MP4 (its Android format): the color
// frame on top and its alpha mask below, so the video is twice as tall as it
// is wide. The app plays the same file on iOS and Android and recombines the
// two halves in a Skia shader. This script keys the particles Masko leaves
// out of the mask back in (see key.ts) and shrinks the clips to the size the
// app ships.
//
// Usage: bun run --filter=@lily/app mascot:encode [source-dir]
// source-dir defaults to ~/Downloads and must hold lily-<clip>-android.mp4.

class MissingToolError extends Data.TaggedError('MissingToolError')<{
  readonly tool: string
}> {}

class CommandError extends Data.TaggedError('CommandError')<{
  readonly command: string
  readonly exitCode: number | null
  readonly stderr: string
}> {}

class FileSystemError extends Data.TaggedError('FileSystemError')<{
  readonly path: string
  readonly cause: unknown
}> {}

class UnknownClipError extends Data.TaggedError('UnknownClipError')<{
  readonly slug: string
}> {}

class NotStackedError extends Data.TaggedError('NotStackedError')<{
  readonly file: string
  readonly width: number
  readonly height: number
}> {}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const OUTPUT_DIR = path.join(PACKAGE_ROOT, 'assets/mascot')
const SOURCE_PREFIX = 'lily-'
const SOURCE_SUFFIX = '-android.mp4'

// 3x a 180 pt mascot. The output is OUTPUT_WIDTH x (2 * OUTPUT_WIDTH).
const OUTPUT_WIDTH = 540
const CRF = '24'

interface Clip {
  // The asset name the app refers to.
  readonly name: string
  // Leading frames to cut. Masko's envelope clip opens on a frame with no
  // envelope, which then pops in on the next one.
  readonly cut?: number
  // Distance at which particles turn opaque (key.ts). Defaults to solid.
  readonly particles?: number
}

// Masko clip slug -> how to encode it.
const CLIPS: Record<string, Clip> = {
  bell: { name: 'bell' },
  confetti: { name: 'celebrate' },
  enveloppe: { name: 'send-envelope', cut: 1 },
  hello: { name: 'hello' },
  jump: { name: 'jump' },
  'left-right': { name: 'look-around' },
  rainy: { name: 'rainy', particles: TRANSLUCENT_PARTICLES },
  scan: { name: 'scan' },
  sunbath: { name: 'sunbathing' },
}

const runCmd = (
  cmd: string,
  args: ReadonlyArray<string>,
  stdin?: Uint8Array
): Effect.Effect<Buffer, MissingToolError | CommandError> =>
  Effect.callback<Buffer, MissingToolError | CommandError>((resume) => {
    const child = spawn(cmd, [...args], {
      stdio: 'pipe',
    })
    const stdout: Array<Buffer> = []
    let stderr = ''
    // A command that exits early breaks the pipe; its exit code reports it.
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.stdout.on('data', (d: Buffer) => {
      stdout.push(d)
    })
    child.stderr.on('data', (d) => {
      stderr += `${d}`
    })
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resume(Effect.fail(new MissingToolError({ tool: cmd })))
        return
      }
      resume(
        Effect.fail(
          new CommandError({ command: cmd, exitCode: null, stderr: `${err}` })
        )
      )
    })
    child.on('close', (code) => {
      if (code === 0) resume(Effect.succeed(Buffer.concat(stdout)))
      else
        resume(
          Effect.fail(
            new CommandError({ command: cmd, exitCode: code, stderr })
          )
        )
    })
  })

const fileSize = (file: string) =>
  Effect.tryPromise({
    try: () => stat(file),
    catch: (cause) => new FileSystemError({ path: file, cause }),
  }).pipe(Effect.map((s) => s.size))

const formatKb = (bytes: number) => `${Math.round(bytes / 1024)} KB`

const probeStacked = (file: string) =>
  Effect.gen(function* () {
    const out = yield* runCmd('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate',
      '-of',
      'csv=p=0',
      file,
    ])
    const [width = '0', height = '0', frameRate = '24'] = pipe(
      String.trim(out.toString()),
      String.split(',')
    )
    if (Number(height) !== Number(width) * 2) {
      return yield* new NotStackedError({
        file,
        width: Number(width),
        height: Number(height),
      })
    }
    return { size: Number(width), frameRate }
  })

const encodeClip = (sourceDir: string, fileName: string) =>
  Effect.gen(function* () {
    const slug = pipe(
      fileName,
      String.slice(SOURCE_PREFIX.length, -SOURCE_SUFFIX.length)
    )
    const { name, cut, particles } = yield* Effect.fromOption(
      Record.get(CLIPS, slug)
    ).pipe(
      Effect.map((clip) => ({ cut: 0, particles: SOLID_PARTICLES, ...clip })),
      Effect.mapError(() => new UnknownClipError({ slug }))
    )
    const source = path.join(sourceDir, fileName)
    const output = path.join(OUTPUT_DIR, `${name}.mp4`)

    const { size, frameRate } = yield* probeStacked(source)
    const decoded = yield* runCmd('ffmpeg', [
      '-v',
      'error',
      '-i',
      source,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ])
    const frames = decoded.subarray(cut * size * size * 2 * 3)
    yield* Effect.sync(() => keyCheckerboard(frames, size, particles))
    yield* runCmd(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${size}x${size * 2}`,
        '-r',
        frameRate,
        '-i',
        '-',
        '-vf',
        `scale=${OUTPUT_WIDTH}:${OUTPUT_WIDTH * 2}:flags=lanczos`,
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        CRF,
        '-preset',
        'slow',
        '-movflags',
        '+faststart',
        '-an',
        output,
      ],
      frames
    )

    const before = yield* fileSize(source)
    const after = yield* fileSize(output)
    yield* Console.log(
      `${fileName} -> assets/mascot/${name}.mp4 (${formatKb(before)} -> ${formatKb(after)})`
    )
    return after
  })

const program = Effect.gen(function* () {
  const sourceDir = pipe(
    Array.get(process.argv, 2),
    Option.getOrElse(() => path.join(os.homedir(), 'Downloads'))
  )

  const files = yield* Effect.tryPromise({
    try: () => readdir(sourceDir),
    catch: (cause) => new FileSystemError({ path: sourceDir, cause }),
  })
  const clips = pipe(
    files,
    Array.filter(
      (f) =>
        String.startsWith(SOURCE_PREFIX)(f) && String.endsWith(SOURCE_SUFFIX)(f)
    ),
    Array.sort(String.Order)
  )

  if (Array.isReadonlyArrayEmpty(clips)) {
    yield* Console.log(
      `No ${SOURCE_PREFIX}<clip>${SOURCE_SUFFIX} files in ${sourceDir}`
    )
    return
  }

  yield* Effect.tryPromise({
    try: () => mkdir(OUTPUT_DIR, { recursive: true }),
    catch: (cause) => new FileSystemError({ path: OUTPUT_DIR, cause }),
  })

  const sizes = yield* Effect.forEach(clips, (f) => encodeClip(sourceDir, f))
  const total = Array.reduce(sizes, 0, (sum, s) => sum + s)
  yield* Console.log(
    `\nEncoded ${Array.length(clips)} clips, ${formatKb(total)} total`
  )
})

const failWith = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync((): void => {
        process.exit(1)
      })
    )
  )

const handled = program.pipe(
  Effect.catchTags({
    MissingToolError: (e) =>
      failWith(`Missing tool: ${e.tool}. Install it with: brew install ffmpeg`),
    CommandError: (e) =>
      failWith(`${e.command} failed (exit=${e.exitCode}):\n${e.stderr}`),
    FileSystemError: (e) => failWith(`Cannot access ${e.path}: ${e.cause}`),
    UnknownClipError: (e) =>
      failWith(
        `Unknown clip "${e.slug}". Add it to CLIPS in scripts/mascot/encode.ts with the asset name the app should use.`
      ),
    NotStackedError: (e) =>
      failWith(
        `${e.file} is ${e.width}x${e.height}. Expected a stacked export twice as tall as it is wide (Masko's Android format).`
      ),
  })
)

Effect.runPromise(handled)
