#!/usr/bin/env bun
/**
 * Checks the live v4 `Api` against the v3 HTTP contract snapshot written by
 * `scripts/effect-v4-endpoints-codemod.ts --snapshot`.
 *
 * For every endpoint it compares method, full path (api + group prefix),
 * the success status set and the error (tag, status) multiset. Statuses are
 * read the way the v4 server reads them (`HttpApiSchema.getStatus*Schema`),
 * so a missed annotation that would turn a 4xx into a 500 shows up here.
 *
 * Usage (from the repo root):
 *   bun packages/api/scripts/effect-v4-http-contract-check.ts [.audit/http-contract-v3.json]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Api } from '@lily/api/api'
import type { HttpApiGroup } from 'effect/http-api'
import { HttpApiEndpoint, HttpApiSchema } from 'effect/http-api'

type ErrorEntry = { readonly tag: string; readonly status: number }
type Contract = {
  readonly group: string
  readonly identifier: string
  readonly method: string
  readonly path: string
  readonly success: ReadonlyArray<number>
  readonly errors: ReadonlyArray<ErrorEntry>
}

const ROOT = join(import.meta.dir, '../../..')
const snapshotPath = process.argv[2] ?? '.audit/http-contract-v3.json'

/**
 * Tag of a TaggedError class schema: `Schema.TaggedError` records the tag as
 * the class `identifier` annotation, and `HttpApiSchema.status` keeps it.
 */
const tagOf = (ast: unknown): string | undefined => {
  const annotations = (ast as { annotations?: { identifier?: unknown } })
    .annotations
  return typeof annotations?.identifier === 'string'
    ? annotations.identifier
    : undefined
}

const inlineTag = (schema: { ast: { _tag: string } }): string =>
  `inline:${schema.ast._tag}`

const normalizeErrors = (errors: ReadonlyArray<ErrorEntry>): string =>
  [...errors]
    .map((e) => `${e.tag.startsWith('inline:') ? 'inline' : e.tag}@${e.status}`)
    .sort()
    .join(',')

const liveContracts = (): Array<Contract> => {
  const out: Array<Contract> = []
  for (const group of Object.values(Api.groups) as Array<HttpApiGroup.Top>) {
    for (const endpoint of Object.values(
      group.endpoints
    ) as Array<HttpApiEndpoint.Top>) {
      out.push({
        group: group.identifier,
        identifier: endpoint.identifier,
        method: endpoint.method,
        path: endpoint.path,
        success: HttpApiEndpoint.getSuccessSchemas(endpoint).map((s) =>
          HttpApiSchema.getStatusSuccessSchema(s as never)
        ),
        // Declared errors only. `getErrorSchemas` would also fold in each
        // middleware's error (UnauthorizedError 401, ForbiddenError 403),
        // which v3 emitted the same way but never listed on the endpoint.
        errors: [...endpoint.error].map((e) => ({
          tag: tagOf((e as { ast: unknown }).ast) ?? inlineTag(e as never),
          status: HttpApiSchema.getStatusErrorSchema(e as never),
        })),
      })
    }
  }
  return out
}

const main = () => {
  const expected = (
    JSON.parse(readFileSync(join(ROOT, snapshotPath), 'utf8')) as {
      endpoints: Array<Contract>
    }
  ).endpoints
  const live = liveContracts()
  const key = (c: Contract) => `${c.group}.${c.identifier}`
  const liveByKey = new Map(live.map((c) => [key(c), c]))
  const problems: Array<string> = []
  let errorsChecked = 0

  for (const exp of expected) {
    const act = liveByKey.get(key(exp))
    if (act === undefined) {
      problems.push(`${key(exp)}: missing in v4 Api`)
      continue
    }
    if (act.method !== exp.method)
      problems.push(`${key(exp)}: method ${exp.method} -> ${act.method}`)
    if (act.path !== exp.path)
      problems.push(`${key(exp)}: path ${exp.path} -> ${act.path}`)
    const expSuccess = [...exp.success].sort().join(',')
    const actSuccess = [...act.success].sort().join(',')
    if (expSuccess !== actSuccess)
      problems.push(`${key(exp)}: success ${expSuccess} -> ${actSuccess}`)
    const expErrors = normalizeErrors(exp.errors)
    const actErrors = normalizeErrors(act.errors)
    if (expErrors !== actErrors)
      problems.push(`${key(exp)}: errors [${expErrors}] -> [${actErrors}]`)
    errorsChecked += exp.errors.length
  }
  for (const k of liveByKey.keys()) {
    if (!expected.some((e) => key(e) === k))
      problems.push(`${k}: not in v3 snapshot`)
  }

  console.log(
    `http contract check: ${expected.length} v3 endpoints, ${live.length} v4 endpoints, ${errorsChecked} error responses compared`
  )
  for (const p of problems) console.log(`  ${p}`)
  console.log(
    problems.length === 0
      ? '  OK: identical'
      : `  ${problems.length} differences`
  )
  process.exit(problems.length === 0 ? 0 : 1)
}

main()
