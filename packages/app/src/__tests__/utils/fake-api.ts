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

type Answer = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

let answer: Answer | undefined
let unmatched: SentRequest[] = []

afterEach(() => {
  const missed = unmatched
  answer = undefined
  unmatched = []
  if (missed.length > 0) {
    throw new Error(
      `stubApi had no reply for ${missed.map(({ method, path }) => `${method} ${path}`).join(', ')}. Answer every request the test makes.`
    )
  }
})

// The Effect HTTP client reads `fetch` once and keeps it for the whole file,
// so the file gets one fake and each `stubApi` call swaps what it answers.
const fakeFetch: typeof fetch = (input, init) => {
  if (answer === undefined) throw new Error('fetch called outside stubApi')
  return answer(input, init)
}

/**
 * Replace `fetch` with `reply`, the test's stand-in for the API, for the rest
 * of the test. Every API request lands in `sent`, in order. A request `reply`
 * returns nothing for gets a 404 and fails the test, so a test that expects a
 * 404 returns it.
 */
export const stubApi = (reply: (request: SentRequest) => Reply | undefined) => {
  const sent: SentRequest[] = []
  const prefix = new URL(`${API_BASE_URL}${API_PREFIX}`).pathname
  global.fetch = fakeFetch
  answer = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.protocol === 'file:') return new Response(url.href)
    const request: SentRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname.slice(prefix.length),
      query: Object.fromEntries(url.searchParams),
      body: await readBody(init?.body),
    }
    sent.push(request)
    const replied = reply(request)
    if (replied === undefined) unmatched.push(request)
    const { status, body } = replied ?? { status: 404 }
    return body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
  }
  return { sent }
}
