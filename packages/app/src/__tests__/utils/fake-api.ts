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

export const ok = (body?: unknown): Reply => ({ status: 200, body })

// Jest runs Node's FormData, which turns the app's `{ name, type, bytes }`
// file part into a string, so a file part records as its field name only.
const formEntries = (form: FormData) =>
  Array.from(form.entries(), ([field, value]) =>
    typeof value === 'string' && value !== '[object Object]'
      ? [field, value]
      : [field, 'file']
  )

const readBody = (body: BodyInit | null | undefined): unknown => {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return JSON.parse(body)
  if (body instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(body))
  }
  if (body instanceof FormData) return formEntries(body)
  return body
}

type Answer = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

let answer: Answer | undefined

// The Effect HTTP client reads `fetch` once and keeps it for the whole file,
// so the file gets one fake and each `stubApi` call swaps what it answers.
const fakeFetch: typeof fetch = (input, init) => {
  if (answer === undefined) throw new Error('fetch called before stubApi')
  return answer(input, init)
}

/**
 * Replace `fetch` with `reply`, the test's stand-in for the API, until the
 * next `stubApi` call. Every API request lands in `sent`, in order. A
 * `file://` read, which the multipart upload makes to get a picked photo's
 * bytes, answers with one byte and is not recorded.
 */
export const stubApi = (reply: (request: SentRequest) => Reply) => {
  const sent: SentRequest[] = []
  const prefix = new URL(`${API_BASE_URL}${API_PREFIX}`).pathname
  global.fetch = fakeFetch
  answer = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.protocol === 'file:') {
      return new Response(new Uint8Array([1]))
    }
    const request: SentRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname.slice(prefix.length),
      query: Object.fromEntries(url.searchParams),
      body: readBody(init?.body),
    }
    sent.push(request)
    const { status, body } = reply(request)
    return body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
  }
  return { sent }
}
