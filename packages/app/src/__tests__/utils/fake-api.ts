import { AsyncLocalStorage } from 'node:async_hooks'
import { API_PREFIX } from '@lily/shared'
import { API_BASE_URL } from '@/utils/client'

/** A request as the API receives it, with the origin and `API_PREFIX` cut off the path. */
export interface SentRequest {
  readonly method: string
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  readonly body: unknown
}

export interface Reply {
  readonly status: number
  readonly body?: unknown
}

/** A file part of a multipart body, with the local file it was read from. */
interface SentFile {
  readonly name: string
  readonly type: string
  readonly uri: string
}

export const ok = (body?: unknown): Reply => ({ status: 200, body })

interface FilePart {
  readonly name: string
  readonly type: string
  readonly bytes: () => Promise<Uint8Array>
}

// Jest runs Node's FormData, which turns the app's `{ name, type, bytes }`
// file part into a string, so the parts are kept as they were appended.
const appended = new WeakMap<FormData, Array<readonly [string, unknown]>>()
const append = FormData.prototype.append
jest.spyOn(FormData.prototype, 'append').mockImplementation(function (
  this: FormData,
  field,
  value,
  ...rest
) {
  appended.set(this, [...(appended.get(this) ?? []), [field, value]])
  return Reflect.apply(append, this, [field, value, ...rest])
})

// The fake answers a `file://` read with the uri itself, so reading a part's
// bytes gives back the file it came from.
const readPart = async (value: unknown) => {
  if (typeof value === 'string') return value
  const part = value as FilePart
  const uri = new TextDecoder().decode(await part.bytes())
  return { name: part.name, type: part.type, uri } satisfies SentFile
}

const readBody = async (body: BodyInit | null | undefined) => {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return JSON.parse(body)
  if (body instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(body))
  }
  if (body instanceof FormData) {
    return Promise.all(
      (appended.get(body) ?? []).map(
        async ([field, value]) => [field, await readPart(value)] as const
      )
    )
  }
  return body
}

interface Stub {
  readonly test: string
  readonly reply: (request: SentRequest) => Reply | undefined
  readonly sent: SentRequest[]
  readonly unmatched: SentRequest[]
}

const listed = (requests: ReadonlyArray<SentRequest>) =>
  requests.map(({ method, path }) => `${method} ${path}`).join(', ')

// Each request runs in the async context of the test that sent it, so one
// that fires after its test ended is answered and reported as that test's.
const sender = new AsyncLocalStorage<Stub | undefined>()
let running: Stub | undefined
let stubs: Stub[] = []

afterEach(() => {
  const stub = running
  running = undefined
  if (stub === undefined || stub.unmatched.length === 0) return
  const missed = stub.unmatched.splice(0)
  throw new Error(
    `stubApi had no reply for ${listed(missed)}. Answer every request the test makes.`
  )
})

afterAll(() => {
  const late = stubs.filter((stub) => stub.unmatched.length > 0)
  stubs = []
  if (late.length === 0) return
  throw new Error(
    late
      .map(
        (stub) =>
          `"${stub.test}" sent ${listed(stub.unmatched)} after it ended, and stubApi had no reply.`
      )
      .join(' ')
  )
})

const answer = async (
  stub: Stub,
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  const prefix = new URL(`${API_BASE_URL}${API_PREFIX}`).pathname
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.protocol === 'file:') return new Response(url.href)
  const request: SentRequest = {
    method: init?.method ?? 'GET',
    path: url.pathname.slice(prefix.length),
    query: Object.fromEntries(url.searchParams),
    body: await readBody(init?.body),
  }
  stub.sent.push(request)
  const replied = stub.reply(request)
  if (replied === undefined) stub.unmatched.push(request)
  const { status, body } = replied ?? { status: 404 }
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
}

// The Effect HTTP client reads `fetch` once and keeps it for the whole file,
// so the file gets one fake, which answers each request with its sender's stub.
const fakeFetch: typeof fetch = (input, init) => {
  const stub = sender.getStore() ?? running
  if (stub === undefined) throw new Error('fetch called outside stubApi')
  return answer(stub, input, init)
}

/**
 * Replace `fetch` with `reply`, the test's stand-in for the API, for the rest
 * of the test. Every API request lands in `sent`, in order. A request `reply`
 * returns nothing for gets a 404 and fails the test, so a test that expects a
 * 404 returns it. A request sent after the test ended fails the file instead,
 * naming the test.
 */
export const stubApi = (reply: (request: SentRequest) => Reply | undefined) => {
  const stub: Stub = {
    test: expect.getState().currentTestName ?? 'a test',
    reply,
    sent: [],
    unmatched: [],
  }
  sender.enterWith(stub)
  running = stub
  stubs.push(stub)
  global.fetch = fakeFetch
  return { sent: stub.sent }
}
