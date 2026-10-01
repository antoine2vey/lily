#!/usr/bin/env bun
/**
 * Effect v3 -> v4 HttpApiEndpoint rewrite for packages/api.
 *
 * Turns the v3 builder chain
 *
 *   HttpApiEndpoint.get('getPlant')`/${plantIdParam}`
 *     .setUrlParams(Q).setPayload(P).setHeaders(H)
 *     .addSuccess(S, { status: 201 })
 *     .addError(E, { status: 404 })
 *     .middleware(M)
 *
 * into the v4 options form
 *
 *   HttpApiEndpoint.get('getPlant', '/:id', {
 *     params: { id: plantIdParam }, query: Q, headers: H, payload: P,
 *     success: S.pipe(HttpApiSchema.status(201)),
 *     error: [E.pipe(HttpApiSchema.status(404))],
 *   }).middleware(M)
 *
 * and `const x = HttpApiSchema.param('id', S)` into `const x = S`.
 *
 * Status preservation: every v3 explicit status is kept. When the error class
 * already carries the same `httpApiStatus` annotation the explicit pipe is
 * dropped (same wire result, less noise); when the class status is unknown or
 * differs, the pipe stays.
 *
 * With `--snapshot <path>` the v3 contract (method, full path, success
 * statuses, error tag -> status) is written before rewriting, so
 * `scripts/effect-v4-http-contract-check.ts` can diff it against the v4
 * runtime. Only v3-form endpoints feed the snapshot, so a rerun on converted
 * code never overwrites it with an empty one.
 *
 * Rerunnable and idempotent: a second run finds no v3 chains and changes
 * nothing.
 *
 * Usage (from the repo root):
 *   bun scripts/effect-v4-endpoints-codemod.ts [--dry-run] [--snapshot .audit/http-contract-v3.json]
 */
import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  type CallExpression,
  type Expression,
  Node,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
  type TaggedTemplateExpression,
} from 'ts-morph'

const ROOT = join(import.meta.dir, '..')
const API_SRC = join(ROOT, 'packages/api/src')
const HTTP_API_MODULE = 'effect/http-api'

type ParamRef = { readonly name: string; readonly varName: string }
type Responder = {
  readonly expr: string
  readonly explicitStatus: number | undefined
  readonly tag: string | undefined
  readonly classStatus: number | undefined
}
type EndpointSpec = {
  readonly file: string
  readonly groupId: string
  readonly groupExport: string
  readonly groupPrefix: string
  readonly identifier: string
  readonly method: string
  readonly path: string
  readonly params: ReadonlyArray<ParamRef>
  readonly query: string | undefined
  readonly headers: string | undefined
  readonly payload: string | undefined
  readonly success: ReadonlyArray<Responder>
  readonly errors: ReadonlyArray<Responder>
  readonly middlewares: ReadonlyArray<string>
}
type Contract = {
  readonly group: string
  readonly identifier: string
  readonly method: string
  readonly path: string
  readonly success: ReadonlyArray<number>
  readonly errors: ReadonlyArray<{
    readonly tag: string
    readonly status: number
  }>
  readonly middlewares: ReadonlyArray<string>
}
type Change = {
  readonly start: number
  readonly end: number
  readonly text: string
}

const V3_CHAIN_METHODS = new Set([
  'setUrlParams',
  'setPayload',
  'setHeaders',
  'setPath',
  'addSuccess',
  'addError',
  'middleware',
])
const V3_DEFAULT_ERROR_STATUS = 500
const V3_DEFAULT_SUCCESS_STATUS = 200
const V3_NO_CONTENT_STATUS = 204

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

const statusFromOptions = (arg: Expression | undefined): number | undefined => {
  if (arg === undefined || !Node.isObjectLiteralExpression(arg))
    return undefined
  const prop = arg.getProperty('status')
  if (prop === undefined || !Node.isPropertyAssignment(prop)) return undefined
  const init = prop.getInitializer()
  return init !== undefined && Node.isNumericLiteral(init)
    ? init.getLiteralValue()
    : undefined
}

/** `class E extends Schema.TaggedError<E>()('Tag', fields, { httpApiStatus })` */
const resolveErrorClass = (
  expr: Expression
): { tag: string | undefined; status: number | undefined } => {
  if (!Node.isIdentifier(expr)) return { tag: undefined, status: undefined }
  const symbol = expr.getSymbol()
  const target = symbol?.getAliasedSymbol() ?? symbol
  const decls = target?.getDeclarations() ?? []
  for (const decl of decls) {
    if (!Node.isClassDeclaration(decl)) continue
    const base = decl.getExtends()?.getExpression()
    if (base === undefined) continue
    let tag: string | undefined
    let status: number | undefined
    base.forEachDescendant((n) => {
      if (tag === undefined && Node.isStringLiteral(n)) tag = n.getLiteralText()
      if (Node.isPropertyAssignment(n) && n.getName() === 'httpApiStatus') {
        const init = n.getInitializer()
        if (init !== undefined && Node.isNumericLiteral(init))
          status = init.getLiteralValue()
      }
    })
    return { tag, status }
  }
  return { tag: undefined, status: undefined }
}

/** Tag used in the contract for non-class error schemas (inline structs). */
const inlineTag = (expr: string): string => `inline:${expr.replace(/\s+/g, '')}`

// ---------------------------------------------------------------------------
// Parsing the v3 chain
// ---------------------------------------------------------------------------

type ChainCall = {
  readonly name: string
  readonly args: ReadonlyArray<Expression>
}

/** Walks outward from the `HttpApiEndpoint.m(...)` root through `.x(...)` calls. */
const collectChain = (
  root: Node
): { outer: Node; calls: ReadonlyArray<ChainCall> } => {
  const calls: Array<ChainCall> = []
  let outer: Node = root
  for (;;) {
    const access = outer.getParent()
    if (
      !Node.isPropertyAccessExpression(access) ||
      access.getExpression() !== outer
    )
      break
    const call = access.getParent()
    if (!Node.isCallExpression(call) || call.getExpression() !== access) break
    const name = access.getName()
    if (!V3_CHAIN_METHODS.has(name)) break
    calls.push({ name, args: call.getArguments() as Array<Expression> })
    outer = call
  }
  return { outer, calls }
}

const templatePath = (
  tpl: TaggedTemplateExpression,
  paramVars: ReadonlyMap<string, string>
): { path: string; params: Array<ParamRef> } => {
  const literal = tpl.getTemplate()
  if (Node.isNoSubstitutionTemplateLiteral(literal)) {
    return { path: literal.getLiteralText(), params: [] }
  }
  const params: Array<ParamRef> = []
  let path = literal.getHead().getLiteralText()
  for (const span of literal.getTemplateSpans()) {
    const expr = span.getExpression()
    const varName = expr.getText()
    const name = paramVars.get(varName)
    if (name === undefined) {
      throw new Error(
        `${tpl.getSourceFile().getFilePath()}:${tpl.getStartLineNumber()}: template param \`${varName}\` is not a local HttpApiSchema.param const`
      )
    }
    params.push({ name, varName })
    path += `:${name}${span.getLiteral().getLiteralText()}`
  }
  return { path, params }
}

/** `HttpApiEndpoint.<method>('id')` call expression, or undefined. */
const endpointRoot = (
  node: Node
): { call: CallExpression; method: string; identifier: string } | undefined => {
  if (!Node.isCallExpression(node)) return undefined
  const callee = node.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return undefined
  if (callee.getExpression().getText() !== 'HttpApiEndpoint') return undefined
  const [first] = node.getArguments()
  if (first === undefined || !Node.isStringLiteral(first)) return undefined
  return {
    call: node,
    method: callee.getName(),
    identifier: first.getLiteralText(),
  }
}

const groupContext = (
  node: Node
): { groupId: string; groupExport: string; groupPrefix: string } => {
  const decl = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
  if (decl === undefined)
    throw new Error(
      `${node.getSourceFile().getFilePath()}: endpoint outside a group const`
    )
  let groupId: string | undefined
  let groupPrefix = ''
  const init = decl.getInitializerOrThrow()
  // The outermost call (often the trailing `.prefix(...)`) is not its own descendant.
  const calls = [init, ...init.getDescendantsOfKind(SyntaxKind.CallExpression)]
  for (const call of calls) {
    if (!Node.isCallExpression(call)) continue
    const callee = call.getExpression()
    if (!Node.isPropertyAccessExpression(callee)) continue
    const [arg] = call.getArguments()
    if (
      callee.getText() === 'HttpApiGroup.make' &&
      arg !== undefined &&
      Node.isStringLiteral(arg)
    ) {
      groupId = arg.getLiteralText()
    }
    if (
      callee.getName() === 'prefix' &&
      arg !== undefined &&
      Node.isStringLiteral(arg)
    ) {
      groupPrefix = arg.getLiteralText()
    }
  }
  if (groupId === undefined)
    throw new Error(
      `${node.getSourceFile().getFilePath()}: no HttpApiGroup.make for ${decl.getName()}`
    )
  return { groupId, groupExport: decl.getName(), groupPrefix }
}

const parseEndpoint = (
  root: CallExpression,
  method: string,
  identifier: string,
  paramVars: ReadonlyMap<string, string>
): { spec: EndpointSpec; outer: Node } | undefined => {
  const sf = root.getSourceFile()
  const parent = root.getParent()
  let pathInfo: { path: string; params: Array<ParamRef> }
  let chainStart: Node
  if (Node.isTaggedTemplateExpression(parent) && parent.getTag() === root) {
    pathInfo = templatePath(parent, paramVars)
    chainStart = parent
  } else {
    const [, pathArg, options] = root.getArguments()
    if (
      pathArg === undefined ||
      !Node.isStringLiteral(pathArg) ||
      options !== undefined
    ) {
      return undefined
    }
    pathInfo = { path: pathArg.getLiteralText(), params: [] }
    chainStart = root
  }
  const { outer, calls } = collectChain(chainStart)
  if (chainStart === root && calls.length === 0) return undefined

  let query: string | undefined
  let headers: string | undefined
  let payload: string | undefined
  const success: Array<Responder> = []
  const errors: Array<Responder> = []
  const middlewares: Array<string> = []
  for (const { name, args } of calls) {
    const [first, second] = args
    if (first === undefined)
      throw new Error(`${sf.getFilePath()}: .${name}() without argument`)
    if (name === 'setUrlParams') query = first.getText()
    else if (name === 'setHeaders') headers = first.getText()
    else if (name === 'setPayload') payload = first.getText()
    else if (name === 'setPath')
      throw new Error(
        `${sf.getFilePath()}: .setPath is not supported, use a template path`
      )
    else if (name === 'middleware') middlewares.push(first.getText())
    else {
      const explicitStatus = statusFromOptions(second)
      const target = name === 'addSuccess' ? success : errors
      const resolved =
        name === 'addError'
          ? resolveErrorClass(first)
          : { tag: undefined, status: undefined }
      target.push({
        expr: first.getText(),
        explicitStatus,
        tag: resolved.tag,
        classStatus: resolved.status,
      })
    }
  }
  const group = groupContext(root)
  return {
    outer,
    spec: {
      file: relative(ROOT, sf.getFilePath()),
      ...group,
      identifier,
      method,
      path: pathInfo.path,
      params: pathInfo.params,
      query,
      headers,
      payload,
      success,
      errors,
      middlewares,
    },
  }
}

// ---------------------------------------------------------------------------
// Printing the v4 form
// ---------------------------------------------------------------------------

const withStatus = (r: Responder): string => {
  if (r.explicitStatus === undefined || r.explicitStatus === r.classStatus)
    return r.expr
  return `${r.expr}.pipe(HttpApiSchema.status(${r.explicitStatus}))`
}

const listOrSingle = (items: ReadonlyArray<string>): string => {
  const [only, ...rest] = items
  return only !== undefined && rest.length === 0
    ? only
    : `[${items.join(', ')}]`
}

const printEndpoint = (spec: EndpointSpec): string => {
  const method = spec.method === 'del' ? 'delete' : spec.method
  const options: Array<string> = []
  if (spec.params.length > 0) {
    options.push(
      `params: { ${spec.params.map((p) => `${p.name}: ${p.varName}`).join(', ')} }`
    )
  }
  if (spec.query !== undefined) options.push(`query: ${spec.query}`)
  if (spec.headers !== undefined) options.push(`headers: ${spec.headers}`)
  if (spec.payload !== undefined) options.push(`payload: ${spec.payload}`)
  if (spec.success.length > 0)
    options.push(`success: ${listOrSingle(spec.success.map(withStatus))}`)
  if (spec.errors.length > 0)
    options.push(`error: ${listOrSingle(spec.errors.map(withStatus))}`)
  const optionsText =
    options.length === 0
      ? ''
      : `, {\n${options.map((o) => `${o},`).join('\n')}\n}`
  const middleware = spec.middlewares.map((m) => `.middleware(${m})`).join('')
  return `HttpApiEndpoint.${method}('${spec.identifier}', '${spec.path}'${optionsText})${middleware}`
}

const toContract = (spec: EndpointSpec, apiPrefix: string): Contract => ({
  group: spec.groupId,
  identifier: spec.identifier,
  method: spec.method === 'del' ? 'DELETE' : spec.method.toUpperCase(),
  path:
    `${apiPrefix}${spec.groupPrefix}${spec.path}`.replace(/\/+$/, '') || '/',
  success:
    spec.success.length === 0
      ? [V3_NO_CONTENT_STATUS]
      : spec.success.map((s) => s.explicitStatus ?? V3_DEFAULT_SUCCESS_STATUS),
  errors: spec.errors.map((e) => ({
    tag: e.tag ?? inlineTag(e.expr),
    status: e.explicitStatus ?? e.classStatus ?? V3_DEFAULT_ERROR_STATUS,
  })),
  middlewares: spec.middlewares,
})

// ---------------------------------------------------------------------------
// Per-file rewrite
// ---------------------------------------------------------------------------

/** `const x = HttpApiSchema.param('name', S)` -> varName -> name, plus the rewrite. */
const collectParamConsts = (
  sf: SourceFile
): { paramVars: Map<string, string>; changes: Array<Change> } => {
  const paramVars = new Map<string, string>()
  const changes: Array<Change> = []
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer()
    if (init === undefined || !Node.isCallExpression(init)) continue
    if (init.getExpression().getText() !== 'HttpApiSchema.param') continue
    const [nameArg, schemaArg] = init.getArguments()
    if (
      nameArg === undefined ||
      !Node.isStringLiteral(nameArg) ||
      schemaArg === undefined
    ) {
      throw new Error(
        `${sf.getFilePath()}:${decl.getStartLineNumber()}: unsupported HttpApiSchema.param shape`
      )
    }
    paramVars.set(decl.getName(), nameArg.getLiteralText())
    changes.push({
      start: init.getStart(),
      end: init.getEnd(),
      text: schemaArg.getText(),
    })
  }
  return { paramVars, changes }
}

/**
 * `Schema.optionalWith(S, { default: () => v })` in endpoint-definition files
 * -> `S.pipe(Schema.withDecodingDefaultType(Effect.succeed(v)), Schema.withConstructorDefault(Effect.succeed(v)))`,
 * the shape `@lily/shared` already uses (see `domains/common/pagination.ts`).
 * Same semantics as v3: key absent or undefined decodes to the default.
 */
const rewriteOptionalWithDefaults = (sf: SourceFile): number => {
  const changes: Array<Change> = []
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== 'Schema.optionalWith') continue
    const [schema, options] = call.getArguments()
    if (
      schema === undefined ||
      options === undefined ||
      !Node.isObjectLiteralExpression(options)
    )
      continue
    const prop = options.getProperty('default')
    if (
      options.getProperties().length !== 1 ||
      prop === undefined ||
      !Node.isPropertyAssignment(prop)
    ) {
      throw new Error(
        `${sf.getFilePath()}:${call.getStartLineNumber()}: unsupported optionalWith options`
      )
    }
    const init = prop.getInitializerOrThrow()
    const body = Node.isArrowFunction(init) ? init.getBody() : undefined
    const value =
      body !== undefined && !Node.isBlock(body)
        ? `Effect.succeed(${body.getText()})`
        : `Effect.sync(${init.getText()})`
    changes.push({
      start: call.getStart(),
      end: call.getEnd(),
      text: `${schema.getText()}.pipe(Schema.withDecodingDefaultType(${value}), Schema.withConstructorDefault(${value}))`,
    })
  }
  if (changes.length === 0) return 0
  changes.sort((a, b) => b.start - a.start)
  for (const c of changes) sf.replaceText([c.start, c.end], c.text)
  const effectImport = sf.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === 'effect'
  )
  if (effectImport === undefined) {
    sf.addImportDeclaration({
      moduleSpecifier: 'effect',
      namedImports: ['Effect'],
    })
  } else if (
    !effectImport.getNamedImports().some((n) => n.getName() === 'Effect')
  ) {
    const names = [
      ...effectImport.getNamedImports().map((n) => n.getText()),
      'Effect',
    ].sort()
    for (const n of effectImport.getNamedImports()) n.remove()
    effectImport.addNamedImports(names)
  }
  return changes.length
}

const syncHttpApiSchemaImport = (sf: SourceFile): void => {
  const decl = sf.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === HTTP_API_MODULE
  )
  if (decl === undefined) return
  const named = decl
    .getNamedImports()
    .find((n) => n.getName() === 'HttpApiSchema')
  const bodyUsesIt = sf
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .some((p) => p.getExpression().getText() === 'HttpApiSchema')
  if (bodyUsesIt && named === undefined) {
    decl.addNamedImport('HttpApiSchema')
    const sorted = decl
      .getNamedImports()
      .map((n) => n.getText())
      .sort()
    for (const n of decl.getNamedImports()) n.remove()
    decl.addNamedImports(sorted)
  } else if (!bodyUsesIt && named !== undefined) {
    named.remove()
  }
}

/** Endpoint definition files, plus the api-local error classes they reference. */
const isApiSurfaceFile = (sf: SourceFile): boolean =>
  sf.getFilePath().endsWith('/errors.ts') ||
  sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((c) => c.getExpression().getText() === 'HttpApiGroup.make')

const rewriteFile = (
  sf: SourceFile,
  onSpec: (spec: EndpointSpec) => void
): { endpoints: number; defaults: number } => {
  if (!isApiSurfaceFile(sf)) return { endpoints: 0, defaults: 0 }
  // Defaults first: they sit inside endpoint arguments, and the endpoint
  // rewrite copies argument text verbatim.
  const defaults = rewriteOptionalWithDefaults(sf)
  const { paramVars, changes } = collectParamConsts(sf)
  let count = 0
  for (const node of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const root = endpointRoot(node)
    if (root === undefined) continue
    const parsed = parseEndpoint(
      root.call,
      root.method,
      root.identifier,
      paramVars
    )
    if (parsed === undefined) continue
    onSpec(parsed.spec)
    changes.push({
      start: parsed.outer.getStart(),
      end: parsed.outer.getEnd(),
      text: printEndpoint(parsed.spec),
    })
    count++
  }
  if (changes.length === 0) return { endpoints: 0, defaults }
  changes.sort((a, b) => b.start - a.start)
  for (const c of changes) sf.replaceText([c.start, c.end], c.text)
  syncHttpApiSchemaImport(sf)
  return { endpoints: count, defaults }
}

/** `Api = HttpApi.make('Api').add(X.prefix('/api')).add(Y)` -> X -> '/api', Y -> ''. */
const apiPrefixes = (sf: SourceFile): Map<string, string> => {
  const prefixes = new Map<string, string>()
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression()
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'add')
      continue
    const [arg] = call.getArguments()
    if (arg === undefined) continue
    if (Node.isIdentifier(arg)) prefixes.set(arg.getText(), '')
    else if (Node.isCallExpression(arg)) {
      const inner = arg.getExpression()
      const [prefix] = arg.getArguments()
      if (
        Node.isPropertyAccessExpression(inner) &&
        inner.getName() === 'prefix' &&
        prefix !== undefined &&
        Node.isStringLiteral(prefix)
      ) {
        prefixes.set(inner.getExpression().getText(), prefix.getLiteralText())
      }
    }
  }
  return prefixes
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const snapshotIdx = argv.indexOf('--snapshot')
  const snapshotPath = snapshotIdx === -1 ? undefined : argv[snapshotIdx + 1]

  const project = new Project({
    tsConfigFilePath: join(ROOT, 'packages/api/tsconfig.json'),
    manipulationSettings: { quoteKind: QuoteKind.Single },
  })
  const files = project
    .getSourceFiles()
    .filter(
      (sf) =>
        sf.getFilePath().startsWith(API_SRC) &&
        !sf.getFilePath().includes('__tests__')
    )
  const prefixes = apiPrefixes(
    project.getSourceFileOrThrow(join(API_SRC, 'api.ts'))
  )

  const specs: Array<EndpointSpec> = []
  const perFile: Array<[string, number, number]> = []
  const touched: Array<SourceFile> = []
  for (const sf of files) {
    const { endpoints, defaults } = rewriteFile(sf, (spec) => specs.push(spec))
    if (endpoints === 0 && defaults === 0) continue
    perFile.push([relative(ROOT, sf.getFilePath()), endpoints, defaults])
    touched.push(sf)
  }

  console.log(`effect-v4-endpoints-codemod${dryRun ? ' (dry run)' : ''}`)
  console.log('  endpoints defaults file')
  for (const [file, n, d] of perFile)
    console.log(
      `  ${n.toString().padStart(9)} ${d.toString().padStart(8)} ${file}`
    )
  const defaultsTotal = perFile.reduce((acc, [, , d]) => acc + d, 0)
  console.log(
    `  ${specs.length} endpoints and ${defaultsTotal} optionalWith defaults in ${perFile.length} files`
  )

  if (snapshotPath !== undefined && specs.length > 0) {
    const apiPrefixOf = (spec: EndpointSpec): string => {
      const prefix = prefixes.get(spec.groupExport)
      if (prefix === undefined)
        throw new Error(
          `group ${spec.groupExport} is not registered in src/api.ts`
        )
      return prefix
    }
    const contracts = specs.map((s) => toContract(s, apiPrefixOf(s)))
    const unresolved = specs.flatMap((s) =>
      s.errors.flatMap((e) =>
        e.explicitStatus === undefined && e.classStatus === undefined
          ? [`${s.groupId}.${s.identifier}: ${e.expr}`]
          : []
      )
    )
    if (!dryRun) {
      writeFileSync(
        join(ROOT, snapshotPath),
        `${JSON.stringify({ endpoints: contracts }, null, 2)}\n`
      )
      console.log(`  wrote ${snapshotPath} (${contracts.length} endpoints)`)
    }
    if (unresolved.length > 0) {
      console.log(
        `  ${unresolved.length} errors without explicit or class status (contract assumes ${V3_DEFAULT_ERROR_STATUS}):`
      )
      for (const u of unresolved) console.log(`    ${u}`)
    }
  }

  if (!dryRun && touched.length > 0) {
    for (const sf of touched) sf.saveSync()
    const paths = touched.map((sf) => sf.getFilePath())
    const result = Bun.spawnSync(
      ['bunx', 'biome', 'format', '--write', ...paths],
      { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' }
    )
    if (result.exitCode !== 0) throw new Error('biome format failed')
  }
}

main()
