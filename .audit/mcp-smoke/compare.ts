// Usage: bun .audit/mcp-smoke/compare.ts
// Prints v3 vs v4 status and body per smoke request, then checks the
// migration's runtime claims against the v4 transcripts.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = import.meta.dir
const read = (version: string, name: string) =>
  readFileSync(join(dir, version, name), 'utf8')

const parse = (transcript: string) => {
  const response = transcript.split('### response\n')[1] ?? ''
  const status = response.match(/^HTTP\/1\.1 (\d+)/)?.[1] ?? 'none'
  const sessionId = response.match(/^mcp-session-id: (.+)$/im)?.[1]?.trim()
  const body = response.split(/\r?\n\r?\n/).slice(1).join('\n').trim()
  return { status, sessionId, body }
}

const names = readdirSync(join(dir, 'v4')).sort()
for (const name of names) {
  const v3 = parse(read('v3-baseline', name))
  const v4 = parse(read('v4', name))
  console.log(`== ${name}`)
  console.log(`   v3 ${v3.status} ${v3.body.slice(0, 160)}`)
  console.log(`   v4 ${v4.status} ${v4.body.slice(0, 160)}`)
}

const v4 = (name: string) => parse(read('v4', `${name}.txt`))
const checks: Array<[string, boolean]> = []
const check = (label: string, ok: boolean) => checks.push([label, ok])

const init = JSON.parse(v4('01-initialize-string-id').body)
check('(a) initialize echoes string id "init_1"', init.id === 'init_1')

for (const name of ['04-tools-list', '05-tools-call-list-plants', '11-numeric-id']) {
  const body = JSON.parse(v4(name).body)
  check(`(b) ${name} answers a single request with a bare object`, !Array.isArray(body))
}
check('(b) JSON-RPC batch of one is rejected with 400', v4('03-batch-of-one').status === '400')

const widgets: Record<string, string> = {
  list_plants: 'ui://widget/plant-list',
  get_plant_details: 'ui://widget/plant-details',
  get_care_tasks: 'ui://widget/care-tasks',
  get_overdue_plants: 'ui://widget/care-tasks',
  care_plant: 'ui://widget/care-feedback',
}
const tools: Array<{ name: string; _meta?: Record<string, unknown> }> =
  JSON.parse(v4('04-tools-list').body).result.tools
for (const [name, uri] of Object.entries(widgets)) {
  const meta = tools.find((t) => t.name === name)?._meta
  check(
    `(c) tools/list ${name} has _meta ui.resourceUri and openai/outputTemplate = ${uri}`,
    JSON.stringify(meta) ===
      JSON.stringify({ ui: { resourceUri: uri }, 'openai/outputTemplate': uri })
  )
}
check(
  '(c) ask_plant_question has no _meta',
  tools.find((t) => t.name === 'ask_plant_question')?._meta === undefined
)
const call = JSON.parse(v4('05-tools-call-list-plants').body).result
check(
  '(c) tools/call list_plants result carries the widget _meta',
  call._meta?.['openai/outputTemplate'] === 'ui://widget/plant-list'
)

const authFailure = JSON.parse(v4('11c-tools-call-unknown-token').body).result
check(
  'tools/call with an unknown token is an isError result naming the cause',
  authFailure.isError === true &&
    authFailure.content[0].text.includes('Access token not found')
)

check('(d) GET /mcp with bearer is 200', v4('07-get-mcp-with-bearer').status === '200')
check('(d) GET /mcp without bearer is 401', v4('08-get-mcp-without-bearer').status === '401')

console.log()
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
