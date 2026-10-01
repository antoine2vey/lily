#!/usr/bin/env bun
/**
 * Effect v3 -> v4 mechanical renames.
 *
 * Source of truth: `.audit/effect-v4-catalog.md` section 13, the lists above
 * "Codemod-able but structural". Every site is resolved through the type
 * checker to its `effect` import, so aliases (`Array as Arr`) are followed and
 * shadowing locals are left alone. Sites the codemod cannot rewrite safely are
 * written to `.audit/codemod-skipped.txt` instead of being guessed.
 *
 * Rerunnable and idempotent: a second run over its own output changes nothing.
 * Rules whose v3 name still exists in v4 (`Schema.Date`, ...) are listed as
 * rerun hazards in the summary: rerunning after hand-written v4 code lands
 * would rewrite that code too.
 *
 * Usage (from the repo root):
 *   bun scripts/effect-v4-codemod.ts [--dry-run] [--package <name>]...
 *     [--skip <Module.member>]...
 *
 * `--skip Schema.Date` disables one member rename, for reruns over packages
 * that already hold hand-written v4 code using that name.
 */
import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  type CallExpression,
  type Identifier,
  type ImportDeclaration,
  Node,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
  type Type,
  type TypeChecker,
} from 'ts-morph'

const ROOT = join(import.meta.dir, '..')
const SKIPPED_PATH = join(ROOT, '.audit/codemod-skipped.txt')
const PACKAGE_ORDER = [
  'shared',
  'db',
  'knowledge-db',
  'api',
  'mcp',
  'admin',
  'web',
  'app',
  'plant-scanner',
]
const MAX_PASSES = 8

// ---------------------------------------------------------------------------
// Rule data
// ---------------------------------------------------------------------------

/** `Module.member` renames, keyed by the v3 module a namespace resolves to. */
const EITHER_MEMBERS: Record<string, string> = {
  right: 'succeed',
  left: 'fail',
  isRight: 'isSuccess',
  isLeft: 'isFailure',
  isEither: 'isResult',
  Either: 'Result',
  Left: 'Failure',
  Right: 'Success',
}
const MEMBER_RENAMES: Record<string, Record<string, string>> = {
  Option: { fromNullable: 'fromNullishOr' },
  Array: {
    isEmptyArray: 'isArrayEmpty',
    isEmptyReadonlyArray: 'isReadonlyArrayEmpty',
    isNonEmptyArray: 'isArrayNonEmpty',
    isNonEmptyReadonlyArray: 'isReadonlyArrayNonEmpty',
    unsafeGet: 'getUnsafe',
  },
  Order: { number: 'Number', string: 'String', reverse: 'flip' },
  Predicate: { isRecord: 'isObject' },
  DateTime: {
    unsafeNow: 'nowUnsafe',
    unsafeMake: 'makeUnsafe',
    unsafeMakeZoned: 'makeZonedUnsafe',
    zoneUnsafeMakeNamed: 'zoneMakeNamedUnsafe',
    greaterThan: 'isGreaterThan',
    greaterThanOrEqualTo: 'isGreaterThanOrEqualTo',
    lessThan: 'isLessThan',
    lessThanOrEqualTo: 'isLessThanOrEqualTo',
  },
  Duration: { greaterThan: 'isGreaterThan', lessThan: 'isLessThan' },
  Deferred: { unsafeDone: 'doneUnsafe' },
  Effect: {
    catchAll: 'catch',
    catchAllCause: 'catchCause',
    zipRight: 'andThen',
    either: 'result',
    fork: 'forkChild',
    forkDaemon: 'forkDetach',
    async: 'callback',
    orElse: 'catch',
    runtime: 'context',
  },
  Layer: {
    scoped: 'effect',
    scopedDiscard: 'effectDiscard',
    unwrapEffect: 'unwrap',
  },
  Stream: { unwrapScoped: 'unwrap' },
  Config: {
    string: 'String',
    boolean: 'Boolean',
    duration: 'Duration',
    integer: 'Int',
    nonEmptyString: 'NonEmptyString',
    redacted: 'Redacted',
  },
  ConfigProvider: { fromJson: 'fromUnknown' },
  Cause: { failureOption: 'findErrorOption' },
  Either: EITHER_MEMBERS,
  // Same table under the v4 name, so a pass that already renamed the import
  // still finishes the members. None of these names exist on v4 `Result`.
  Result: EITHER_MEMBERS,
  Schema: {
    Date: 'DateFromString',
    decode: 'decodeEffect',
    decodeUnknown: 'decodeUnknownEffect',
    encode: 'encodeEffect',
  },
  HttpApiEndpoint: { del: 'delete' },
  HttpClientRequest: { bodyUnsafeJson: 'bodyJsonUnsafe' },
  HttpServer: { layerContext: 'layerServices' },
}

/** Where each v4 module lives, for the startup existence check. */
const V4_MODULE_PATH: Record<string, string> = {
  Either: 'effect/Result',
  Result: 'effect/Result',
  HttpApiEndpoint: 'effect/http-api/HttpApiEndpoint',
  HttpApiSchema: 'effect/http-api/HttpApiSchema',
  HttpApiSwagger: 'effect/http-api/HttpApiSwagger',
  HttpClientRequest: 'effect/http/HttpClientRequest',
  HttpServer: 'effect/http/HttpServer',
  HttpRouter: 'effect/http/HttpRouter',
  TestClock: 'effect/testing/TestClock',
}
const v4PathOf = (module: string) =>
  V4_MODULE_PATH[module] ?? `effect/${module}`

/** v4 names the special rules write, checked to exist before any edit. */
const SPECIAL_TARGETS: ReadonlyArray<readonly [string, string]> = [
  ['Schema', 'Literals'],
  ['Schema', 'Union'],
  ['Schema', 'Record'],
  ['Schema', 'optionalKey'],
  ['Schema', 'check'],
  ['Schema', 'isInt'],
  ['Schema', 'isBetween'],
  ['Schema', 'isMaxLength'],
  ['Schema', 'isPattern'],
  ['Schema', 'isGUID'],
  ['Schema', 'String'],
  ['Schema', 'decodeTo'],
  ['Schema', 'fromJsonString'],
  ['Schema', 'Unknown'],
  ['Schema', 'Top'],
  ['HttpApiSchema', 'asMultipart'],
  ['HttpApiSwagger', 'layer'],
  ['HttpRouter', 'cors'],
  ['ConfigProvider', 'layer'],
  ['ConfigProvider', 'ConfigProvider'],
  ['Effect', 'provideService'],
  ['Effect', 'runPromiseWith'],
  ['Effect', 'runForkWith'],
  ['References', 'MinimumLogLevel'],
  ['TestClock', 'layer'],
  ['Context', 'Service'],
  ['Context', 'Context'],
  ['Config', 'ConfigError'],
  ['Duration', 'toMillis'],
  ['Record', 'toEntries'],
]

/** Whole-specifier moves: the import clause is kept, only the path changes. */
const SPECIFIER_MOVES: Record<string, string> = {
  '@effect/platform/Multipart': 'effect/http/Multipart',
  '@effect/platform/FileSystem': 'effect/FileSystem',
  '@effect/platform/Error': 'effect/PlatformError',
  '@effect/sql/SqlError': 'effect/sql/SqlError',
  '@effect/sql/SqlClient': 'effect/sql/SqlClient',
  '@effect/ai': 'effect/ai',
  '@effect/sql-drizzle/Pg': '@lily/db/effect-drizzle',
}

/** Imported-binding renames; unaliased local references follow the import. */
const BINDING_RENAMES: ReadonlyArray<{
  source: string
  from: string
  to: string
}> = [
  { source: 'effect', from: 'Either', to: 'Result' },
  { source: '@effect/platform-bun', from: 'BunContext', to: 'BunServices' },
]

/** Named imports that move to another barrel. */
const NAMED_MOVES: ReadonlyArray<{ from: string; name: string; to: string }> = [
  { from: 'effect', name: 'TestClock', to: 'effect/testing' },
]

/** Error `_tag` strings, renamed only as `catchTag`/`catchTags` keys. */
const TAG_RENAMES: Record<string, string> = {
  UnknownException: 'UnknownError',
  TimeoutException: 'TimeoutError',
  ParseError: 'SchemaError',
}

/**
 * Renames that need the receiver's (or the object literal's contextual) type:
 * applied only when that type lacks `from` and has one of `to`, declared in
 * the v4 file matched by `dts`.
 */
const TYPED_RENAMES: ReadonlyArray<{
  rule: string
  from: string
  to: ReadonlyArray<string>
  dts: RegExp
}> = [
  {
    rule: 'typed/result-left-right',
    from: 'left',
    to: ['failure'],
    dts: /\/effect\/dist\/Result\.d\.ts$/,
  },
  {
    rule: 'typed/result-left-right',
    from: 'right',
    to: ['success'],
    dts: /\/effect\/dist\/Result\.d\.ts$/,
  },
  ...(
    [
      ['hours', ['hour']],
      ['minutes', ['minute']],
      ['seconds', ['second']],
      ['millis', ['millisecond', 'milliseconds']],
    ] as const
  ).map(([from, to]) => ({
    rule: 'typed/datetime-parts',
    from,
    to,
    dts: /\/effect\/dist\/DateTime\.d\.ts$/,
  })),
  {
    rule: 'typed/managed-runtime-context',
    from: 'runtime',
    to: ['context'],
    dts: /\/effect\/dist\/ManagedRuntime\.d\.ts$/,
  },
  {
    rule: 'typed/schema-annotate',
    from: 'annotations',
    to: ['annotate'],
    dts: /\/effect\/dist\/Schema\.d\.ts$/,
  },
  {
    rule: 'typed/http-client-params',
    from: 'path',
    to: ['params'],
    dts: /\/effect\/dist\/http-api\//,
  },
  {
    rule: 'typed/http-client-params',
    from: 'urlParams',
    to: ['query'],
    dts: /\/effect\/dist\/http-api\//,
  },
]
const TYPED_FROM = new Set(TYPED_RENAMES.map((r) => r.from))

/** Imports the rules can leave unreferenced, by source; dropped when unused. */
const REMOVABLE_IF_UNUSED: Record<string, ReadonlySet<string>> = {
  effect: new Set([
    'Logger',
    'LogLevel',
    'Runtime',
    'TestContext',
    'Struct',
    'Layer',
  ]),
  'effect/http-api': new Set(['HttpApiSchema']),
}

const LOG_LEVELS = new Set([
  'All',
  'Fatal',
  'Error',
  'Warning',
  'Warn',
  'Info',
  'Debug',
  'Trace',
  'None',
])

// ---------------------------------------------------------------------------
// Edit model
// ---------------------------------------------------------------------------

interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}
interface PendingImport {
  readonly module: string
  readonly name: string
}
interface Change {
  readonly rule: string
  readonly edits: ReadonlyArray<Edit>
  readonly imports: ReadonlyArray<PendingImport>
}
interface Skip {
  readonly rule: string
  readonly file: string
  readonly line: number
  readonly reason: string
  readonly snippet: string
}

interface FileCtx {
  readonly sf: SourceFile
  readonly rel: string
  readonly changes: Array<Change>
  /** Identifier texts used in reference position, for name-conflict checks. */
  readonly referencedNames: Set<string>
}

const skips = new Map<string, Skip>()
const counts = new Map<string, Map<string, number>>()

const bump = (rule: string, pkg: string, by = 1) => {
  const byPkg = counts.get(rule) ?? new Map<string, number>()
  byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + by)
  counts.set(rule, byPkg)
}

const skip = (ctx: FileCtx, node: Node, rule: string, reason: string) => {
  const line = node.getStartLineNumber()
  const key = `${ctx.rel}:${line}:${rule}:${reason}`
  if (skips.has(key)) return
  const snippet = node.getText().replace(/\s+/g, ' ').slice(0, 140)
  skips.set(key, { rule, file: ctx.rel, line, reason, snippet })
}

const replace = (node: Node, text: string): Edit => ({
  start: node.getStart(),
  end: node.getEnd(),
  text,
})
const insert = (pos: number, text: string): Edit => ({
  start: pos,
  end: pos,
  text,
})
const range = (start: number, end: number, text: string): Edit => ({
  start,
  end,
  text,
})

const add = (
  ctx: FileCtx,
  rule: string,
  edits: ReadonlyArray<Edit>,
  imports: ReadonlyArray<PendingImport> = []
) => {
  ctx.changes.push({ rule, edits, imports })
}

// ---------------------------------------------------------------------------
// Symbol resolution
// ---------------------------------------------------------------------------

/** Barrels whose named imports are module namespaces. */
const BARRELS = new Set([
  'effect',
  'effect/http',
  'effect/http-api',
  'effect/ai',
  'effect/testing',
  '@effect/platform',
  '@effect/platform-bun',
  '@effect/ai',
])
const NAMESPACE_PATH = /^(?:effect|@effect\/[a-z-]+)(?:\/[a-z-]+)*\/([A-Z]\w*)$/

const isRequireActualEffect = (node: Node | undefined) =>
  node !== undefined &&
  Node.isCallExpression(node) &&
  node.getExpression().getText() === 'jest.requireActual' &&
  node.getArguments()[0]?.getText().slice(1, -1) === 'effect'

/**
 * The v3 module an identifier stands for (`Arr` in `import { Array as Arr }`
 * resolves to `Array`), or undefined when it is anything else, including a
 * local that shadows an Effect name.
 */
const moduleOf = (node: Node): string | undefined => {
  if (!Node.isIdentifier(node)) return undefined
  const symbol = node.getSymbol()
  if (symbol === undefined) return undefined
  for (const decl of symbol.getDeclarations()) {
    if (Node.isImportSpecifier(decl)) {
      const source = decl.getImportDeclaration().getModuleSpecifierValue()
      if (BARRELS.has(source)) return decl.getName()
    } else if (Node.isNamespaceImport(decl)) {
      const importDecl = decl.getFirstAncestorByKind(
        SyntaxKind.ImportDeclaration
      )
      const match = NAMESPACE_PATH.exec(
        importDecl?.getModuleSpecifierValue() ?? ''
      )
      if (match) return match[1]
    } else if (Node.isBindingElement(decl)) {
      const pattern = decl.getParent()
      const holder = pattern.getParent()
      if (
        Node.isVariableDeclaration(holder) &&
        isRequireActualEffect(holder.getInitializer())
      ) {
        return (decl.getPropertyNameNode() ?? decl.getNameNode()).getText()
      }
    }
  }
  return undefined
}

/** `X.member` where X resolves to `module`: returns the member name node. */
const memberOf = (
  node: Node,
  modules: ReadonlyArray<string>
): { module: string; name: Identifier; ns: Node } | undefined => {
  if (!Node.isPropertyAccessExpression(node)) return undefined
  const ns = node.getExpression()
  const module = moduleOf(ns)
  if (module === undefined || !modules.includes(module)) return undefined
  return { module, name: node.getNameNode() as Identifier, ns }
}

const calleeMember = (
  call: CallExpression,
  module: string,
  member: string
): Node | undefined => {
  const callee = call.getExpression()
  const hit = memberOf(callee, [module])
  return hit !== undefined && hit.name.getText() === member ? hit.ns : undefined
}

/** True when an identifier only names a property, not a binding. */
const isNameOnly = (id: Node): boolean => {
  const parent = id.getParent()
  if (parent === undefined) return false
  if (Node.isPropertyAccessExpression(parent))
    return parent.getNameNode() === id
  if (Node.isQualifiedName(parent)) return parent.getRight() === id
  if (Node.isImportSpecifier(parent)) {
    return parent.getAliasNode() !== undefined && parent.getNameNode() === id
  }
  if (Node.isExportSpecifier(parent)) return parent.getAliasNode() === id
  if (Node.isBindingElement(parent)) return parent.getPropertyNameNode() === id
  if (
    Node.isPropertyAssignment(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isPropertyDeclaration(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isMethodSignature(parent) ||
    Node.isEnumMember(parent) ||
    Node.isGetAccessorDeclaration(parent) ||
    Node.isSetAccessorDeclaration(parent) ||
    Node.isJsxAttribute(parent)
  ) {
    return parent.getNameNode() === id
  }
  return false
}

const collectReferencedNames = (sf: SourceFile): Set<string> => {
  const names = new Set<string>()
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!isNameOnly(id)) names.add(id.getText())
  }
  return names
}

/** Barrel sources that will hold `name` after the import moves. */
const sourcesFor = (target: string): ReadonlyArray<string> =>
  target === 'effect/http' || target === 'effect/http-api'
    ? [target, '@effect/platform']
    : target === 'effect/testing'
      ? [target, 'effect']
      : [target]

/**
 * The local name to write for `name` from `target`. Reuses an existing import
 * (alias included); otherwise asks for a new import, unless the name is
 * already taken in this file (then undefined: the caller skips the site).
 */
const useName = (
  ctx: FileCtx,
  target: string,
  name: string,
  imports: Array<PendingImport>
): string | undefined => {
  const sources = sourcesFor(target)
  for (const decl of ctx.sf.getImportDeclarations()) {
    if (!sources.includes(decl.getModuleSpecifierValue())) continue
    for (const spec of decl.getNamedImports()) {
      if (spec.getName() !== name) continue
      const local = spec.getAliasNode()?.getText() ?? name
      if (spec.isTypeOnly() || decl.isTypeOnly())
        imports.push({ module: target, name })
      return local
    }
  }
  if (ctx.referencedNames.has(name)) return undefined
  imports.push({ module: target, name })
  return name
}

const hasComment = (text: string) => /\/\/|\/\*/.test(text)

/** Wraps an expression in parens when `.pipe(...)` cannot follow it as is. */
const asReceiver = (node: Node) =>
  Node.isIdentifier(node) ||
  Node.isPropertyAccessExpression(node) ||
  Node.isCallExpression(node) ||
  Node.isElementAccessExpression(node) ||
  Node.isParenthesizedExpression(node)
    ? undefined
    : node

// ---------------------------------------------------------------------------
// Typed checks
// ---------------------------------------------------------------------------

const constituents = (type: Type): ReadonlyArray<Type> =>
  type.isUnion() ? type.getUnionTypes() : [type]

const hasProp = (type: Type, prop: string) =>
  constituents(type).some((t) => t.getProperty(prop) !== undefined)

const hasEffectProp = (type: Type, prop: string, dts: RegExp) =>
  constituents(type).some((t) =>
    (t.getProperty(prop)?.getDeclarations() ?? []).some((d) =>
      dts.test(d.getSourceFile().getFilePath())
    )
  )

const typedTarget = (
  type: Type | undefined,
  from: string
): { rule: string; to: string } | undefined => {
  if (type === undefined || type.isAny() || hasProp(type, from))
    return undefined
  for (const rename of TYPED_RENAMES) {
    if (rename.from !== from) continue
    const to = rename.to.find((t) => hasEffectProp(type, t, rename.dts))
    if (to !== undefined) return { rule: rename.rule, to }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const visitImport = (ctx: FileCtx, decl: ImportDeclaration) => {
  const source = decl.getModuleSpecifierValue()
  const moved = SPECIFIER_MOVES[source]
  if (moved !== undefined) {
    add(ctx, `import/move ${source}`, [
      replace(decl.getModuleSpecifier(), `'${moved}'`),
    ])
    return
  }
  if (source === '@effect/platform') {
    platformSplit(ctx, decl)
    return
  }
  for (const rename of BINDING_RENAMES) {
    if (rename.source !== source) continue
    const spec = decl.getNamedImports().find((s) => s.getName() === rename.from)
    if (spec === undefined) continue
    const edits: Array<Edit> = [replace(spec.getNameNode(), rename.to)]
    if (spec.getAliasNode() === undefined) {
      if (ctx.referencedNames.has(rename.to)) {
        skip(
          ctx,
          spec,
          `import/rename ${rename.from}`,
          `${rename.to} already bound in file`
        )
        continue
      }
      const refs = bindingRefs(ctx, spec.getNameNode() as Identifier)
      edits.push(...refs.map((r) => renameRef(r, rename.from, rename.to)))
    }
    add(ctx, `import/rename ${rename.from}`, edits)
  }
  for (const move of NAMED_MOVES) {
    if (move.from !== source || decl.isTypeOnly()) continue
    const specs = decl.getNamedImports()
    const spec = specs.find((s) => s.getName() === move.name)
    if (spec === undefined || spec.getAliasNode() !== undefined) continue
    const rest = specs.filter((s) => s !== spec).map((s) => s.getText())
    const edit =
      rest.length === 0 && decl.getDefaultImport() === undefined
        ? removeLine(ctx, decl)
        : replace(decl, `import { ${rest.join(', ')} } from '${source}'`)
    add(
      ctx,
      `import/move ${move.name}`,
      [edit],
      [{ module: move.to, name: move.name }]
    )
  }
  if (source === 'effect/ConfigError') configErrorImport(ctx, decl)
}

const renameRef = (ref: Identifier, from: string, to: string): Edit => {
  const parent = ref.getParent()
  return Node.isShorthandPropertyAssignment(parent)
    ? replace(ref, `${from}: ${to}`)
    : replace(ref, to)
}

/** Identifiers in this file that reference an import binding. */
const bindingRefs = (ctx: FileCtx, nameNode: Identifier): Array<Identifier> => {
  const symbol = nameNode.getSymbol()?.compilerSymbol
  const name = nameNode.getText()
  return ctx.sf
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (id) =>
        id !== nameNode &&
        id.getText() === name &&
        !isNameOnly(id) &&
        id.getSymbol()?.compilerSymbol === symbol
    )
}

/** Deletes a statement together with its line break. */
const removeLine = (ctx: FileCtx, node: Node): Edit => {
  const end = node.getEnd()
  return range(
    node.getStart(),
    ctx.sf.getFullText()[end] === '\n' ? end + 1 : end,
    ''
  )
}

const platformTarget = (name: string): string | undefined => {
  if (name.startsWith('HttpApi') || name === 'OpenApi') return 'effect/http-api'
  if (
    name.startsWith('Http') ||
    [
      'FetchHttpClient',
      'Multipart',
      'Headers',
      'Cookies',
      'UrlParams',
    ].includes(name)
  ) {
    return 'effect/http'
  }
  if (name === 'FileSystem') return 'effect'
  return undefined
}

const platformSplit = (ctx: FileCtx, decl: ImportDeclaration) => {
  if (decl.getNamespaceImport() !== undefined || decl.getDefaultImport()) {
    skip(ctx, decl, 'import/platform', 'namespace or default import')
    return
  }
  const groups = new Map<string, Array<string>>()
  const edits: Array<Edit> = []
  for (const spec of decl.getNamedImports()) {
    const name = spec.getName()
    const target = platformTarget(name) ?? '@effect/platform'
    if (target === '@effect/platform') {
      skip(ctx, spec, 'import/platform', `no mechanical v4 home for ${name}`)
    }
    const alias = spec.getAliasNode()?.getText()
    const renamed = name === 'HttpApp' ? 'HttpEffect' : name
    if (renamed !== name && alias === undefined) {
      const refs = bindingRefs(ctx, spec.getNameNode() as Identifier)
      edits.push(...refs.map((r) => renameRef(r, name, renamed)))
    }
    const text = `${spec.isTypeOnly() ? 'type ' : ''}${renamed}${alias ? ` as ${alias}` : ''}`
    groups.set(target, [...(groups.get(target) ?? []), text])
  }
  if (groups.size === 1 && groups.has('@effect/platform')) return
  const typeOnly = decl.isTypeOnly() ? 'type ' : ''
  const text = [...groups]
    .map(
      ([target, specs]) =>
        `import ${typeOnly}{ ${specs.join(', ')} } from '${target}'`
    )
    .join('\n')
  edits.push(replace(decl, text))
  add(ctx, 'import/platform', edits)
}

/** `import type { ConfigError } from 'effect/ConfigError'` -> `Config.ConfigError`. */
const configErrorImport = (ctx: FileCtx, decl: ImportDeclaration) => {
  const specs = decl.getNamedImports()
  const spec = specs[0]
  if (
    specs.length !== 1 ||
    spec === undefined ||
    spec.getName() !== 'ConfigError'
  ) {
    skip(ctx, decl, 'import/ConfigError', 'unexpected import shape')
    return
  }
  const refs = bindingRefs(
    ctx,
    (spec.getAliasNode() ?? spec.getNameNode()) as Identifier
  )
  if (refs.some((r) => !Node.isTypeReference(r.getParent()))) {
    skip(
      ctx,
      decl,
      'import/ConfigError',
      'ConfigError used outside a type reference'
    )
    return
  }
  const imports: Array<PendingImport> = []
  const config = useName(ctx, 'effect', 'Config', imports)
  if (config === undefined) {
    skip(ctx, decl, 'import/ConfigError', 'Config already bound in file')
    return
  }
  add(
    ctx,
    'import/ConfigError',
    [
      removeLine(ctx, decl),
      ...refs.map((r) => replace(r, `${config}.ConfigError`)),
    ],
    imports
  )
}

const visitExport = (ctx: FileCtx, node: Node) => {
  if (!Node.isExportDeclaration(node)) return
  const source = node.getModuleSpecifierValue()
  if (source === undefined) return
  const moved = SPECIFIER_MOVES[source]
  const spec = node.getModuleSpecifier()
  if (moved !== undefined && spec !== undefined) {
    add(ctx, `import/move ${source}`, [replace(spec, `'${moved}'`)])
  }
  for (const rename of BINDING_RENAMES) {
    if (rename.source !== source) continue
    for (const exp of node.getNamedExports()) {
      if (exp.getName() === rename.from) {
        add(ctx, `import/rename ${rename.from}`, [
          replace(exp.getNameNode(), rename.to),
        ])
      }
    }
  }
}

/**
 * v4 reuses `Schema.decode`/`Schema.encode` for transformation builders that
 * take an options object; v3 calls take a schema. Leaving object-literal calls
 * alone keeps reruns from rewriting hand-written v4 code.
 */
const V4_SHAPED_CALL = new Set(['Schema.decode', 'Schema.encode'])

const isV4ShapedCall = (key: string, name: Node) => {
  if (!V4_SHAPED_CALL.has(key)) return false
  const call = name.getParent()?.getParent()
  return (
    Node.isCallExpression(call) &&
    Node.isObjectLiteralExpression(call.getArguments()[0])
  )
}

/** `Module.member` table renames in value and type positions. */
const visitMember = (ctx: FileCtx, ns: Node, name: Node) => {
  const module = moduleOf(ns)
  if (module === undefined) return
  const to = MEMBER_RENAMES[module]?.[name.getText()]
  if (to === undefined || to === name.getText()) return
  const key = `${module}.${name.getText()}`
  if (isV4ShapedCall(key, name)) return
  add(ctx, `member/${key}`, [replace(name, to)])
}

const visitCall = (ctx: FileCtx, call: CallExpression) => {
  const callee = call.getExpression()
  const args = call.getArguments()
  const first = args[0]

  if (Node.isPropertyAccessExpression(callee)) {
    const module = moduleOf(callee.getExpression())
    const member = callee.getName()
    const nsText = callee.getExpression().getText()
    if (module === 'Schema') schemaCall(ctx, call, member, nsText)
    if (module === 'Either' || module === 'Result') {
      if (member === 'match') eitherMatch(ctx, call)
    }
    if (module === 'DateTime' && member === 'distance') distance(ctx, call)
    if (module === 'HttpApiSchema') httpApiSchemaCall(ctx, call, member, nsText)
    if (module === 'HttpApiBuilder' && member === 'middlewareCors') {
      const imports: Array<PendingImport> = []
      const router = useName(ctx, 'effect/http', 'HttpRouter', imports)
      if (router === undefined) {
        skip(ctx, call, 'http/middlewareCors', 'HttpRouter already bound')
      } else {
        add(
          ctx,
          'http/middlewareCors',
          [replace(callee, `${router}.cors`)],
          imports
        )
      }
    }
    if (module === 'HttpApiBuilder' && member === 'group') handlers(ctx, call)
    if (
      module === 'HttpApiSwagger' &&
      member === 'layer' &&
      args.length === 0
    ) {
      swaggerLayer(ctx, call)
    }
    if (module === 'Layer' && member === 'setConfigProvider' && first) {
      const imports: Array<PendingImport> = []
      const cp = useName(ctx, 'effect', 'ConfigProvider', imports)
      if (cp === undefined) {
        skip(
          ctx,
          call,
          'config/setConfigProvider',
          'ConfigProvider already bound'
        )
      } else {
        add(
          ctx,
          'config/setConfigProvider',
          [replace(callee, `${cp}.layer`)],
          imports
        )
      }
    }
    if (module === 'Effect' && member === 'withConfigProvider' && first) {
      const imports: Array<PendingImport> = []
      const cp = useName(ctx, 'effect', 'ConfigProvider', imports)
      const provider = args[args.length - 1]
      if (cp === undefined || provider === undefined || args.length > 2) {
        skip(
          ctx,
          call,
          'config/withConfigProvider',
          'ConfigProvider bound or unexpected arity'
        )
      } else {
        add(
          ctx,
          'config/withConfigProvider',
          [
            replace(callee.getNameNode(), 'provideService'),
            insert(provider.getStart(), `${cp}.ConfigProvider, `),
          ],
          imports
        )
      }
    }
    if (module === 'Logger' && member === 'withMinimumLogLevel') {
      minimumLogLevel(ctx, call)
    }
    if (module === 'Struct' && member === 'entries') {
      const imports: Array<PendingImport> = []
      const record = useName(ctx, 'effect', 'Record', imports)
      if (record === undefined) {
        skip(
          ctx,
          call,
          'struct/entries',
          'Record already bound (global Record type?)'
        )
      } else {
        add(
          ctx,
          'struct/entries',
          [replace(callee, `${record}.toEntries`)],
          imports
        )
      }
    }
    if (
      module === 'Runtime' &&
      (member === 'runPromise' || member === 'runFork')
    ) {
      const imports: Array<PendingImport> = []
      const effect = useName(ctx, 'effect', 'Effect', imports)
      if (effect === undefined || args.length !== 1) {
        skip(
          ctx,
          call,
          'runtime/run-with-context',
          'Effect bound or data-first call'
        )
      } else {
        add(
          ctx,
          'runtime/run-with-context',
          [replace(callee, `${effect}.${member}With`)],
          imports
        )
      }
    }
    if (member === 'catchTag' || member === 'catchTags') {
      if (module !== undefined) catchTagKeys(ctx, call, member)
    }
  }

  // class X extends Context.Tag(id)<X, S>() {}
  if (Node.isCallExpression(callee) && args.length === 0) {
    const inner = callee
    const innerCallee = inner.getExpression()
    if (
      Node.isPropertyAccessExpression(innerCallee) &&
      innerCallee.getName() === 'Tag' &&
      moduleOf(innerCallee.getExpression()) === 'Context' &&
      call.getTypeArguments().length > 0 &&
      inner.getArguments().length === 1
    ) {
      const id = inner.getArguments()[0] as Node
      const tail = ctx.sf
        .getFullText()
        .slice(innerCallee.getEnd(), inner.getEnd())
      if (hasComment(tail)) {
        skip(ctx, call, 'context/tag-to-service', 'comment inside Tag(...)')
        return
      }
      add(ctx, 'context/tag-to-service', [
        replace(innerCallee.getNameNode(), 'Service'),
        range(innerCallee.getEnd(), inner.getEnd(), ''),
        insert(call.getEnd(), `(${id.getText()})`),
      ])
    }
  }
}

const schemaCall = (
  ctx: FileCtx,
  call: CallExpression,
  member: string,
  ns: string
) => {
  const args = call.getArguments()
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return
  const nameNode = callee.getNameNode()
  const spread = args.some((a) => Node.isSpreadElement(a))

  if (member === 'Literal' && args.length >= 2) {
    if (spread) return skip(ctx, call, 'schema/literals', 'spread arguments')
    add(ctx, 'schema/literals', [
      replace(nameNode, 'Literals'),
      insert((args[0] as Node).getStart(), '['),
      insert((args[args.length - 1] as Node).getEnd(), ']'),
    ])
  }

  if (member === 'Union' && args.length >= 1) {
    const only = args[0] as Node
    if (args.length === 1 && Node.isArrayLiteralExpression(only)) return
    if (args.length === 1 && Node.isSpreadElement(only)) {
      add(ctx, 'schema/union-array', [
        range(only.getStart(), only.getExpression().getStart(), ''),
      ])
      return
    }
    if (spread) return skip(ctx, call, 'schema/union-array', 'spread arguments')
    add(ctx, 'schema/union-array', [
      insert(only.getStart(), '['),
      insert((args[args.length - 1] as Node).getEnd(), ']'),
    ])
  }

  if (member === 'Record' && args.length === 1) {
    const obj = args[0] as Node
    if (!Node.isObjectLiteralExpression(obj)) return
    const props = obj.getProperties()
    const key = obj.getProperty('key')
    const value = obj.getProperty('value')
    if (
      props.length !== 2 ||
      !Node.isPropertyAssignment(key) ||
      !Node.isPropertyAssignment(value)
    ) {
      return skip(ctx, call, 'schema/record-args', 'unexpected Record options')
    }
    const k = key.getInitializerOrThrow()
    const v = value.getInitializerOrThrow()
    if (key.getStart() > value.getStart()) {
      add(ctx, 'schema/record-args', [
        replace(obj, `${k.getText()}, ${v.getText()}`),
      ])
      return
    }
    const text = ctx.sf.getFullText()
    if (
      hasComment(text.slice(obj.getStart(), k.getStart())) ||
      hasComment(text.slice(k.getEnd(), v.getStart())) ||
      hasComment(text.slice(v.getEnd(), obj.getEnd()))
    ) {
      return skip(ctx, call, 'schema/record-args', 'comment inside options')
    }
    add(ctx, 'schema/record-args', [
      range(obj.getStart(), k.getStart(), ''),
      range(k.getEnd(), v.getStart(), ', '),
      range(v.getEnd(), obj.getEnd(), ''),
    ])
  }

  if (member === 'optionalWith' && args.length === 2) {
    const [schema, options] = args as [Node, Node]
    if (
      Node.isObjectLiteralExpression(options) &&
      options.getProperties().length === 1 &&
      options.getProperty('exact')?.getText().replace(/\s/g, '') ===
        'exact:true'
    ) {
      add(ctx, 'schema/optional-key', [
        replace(nameNode, 'optionalKey'),
        range(schema.getEnd(), options.getEnd(), ''),
      ])
    }
  }

  const filters: Record<string, string> = {
    int: 'isInt',
    maxLength: 'isMaxLength',
    pattern: 'isPattern',
    between: 'isBetween',
  }
  const filter = filters[member]
  if (filter !== undefined) {
    const annotationIndex = member === 'int' ? 0 : member === 'between' ? 2 : 1
    if (args.length > annotationIndex + 1) {
      return skip(ctx, call, 'schema/check-filter', 'unexpected arity')
    }
    const annotations = args[annotationIndex]
    const edits: Array<Edit> = [
      insert(call.getStart(), `${ns}.check(`),
      replace(nameNode, filter),
      insert(call.getEnd(), ')'),
    ]
    if (member === 'between') {
      const [min, max] = args as [Node, Node]
      if (min === undefined || max === undefined) {
        return skip(ctx, call, 'schema/check-filter', 'between without bounds')
      }
      edits.push(
        insert(min.getStart(), '{ minimum: '),
        range(min.getEnd(), max.getStart(), ', maximum: '),
        insert(max.getEnd(), ' }')
      )
    }
    if (annotations !== undefined) {
      const fixed = filterAnnotations(annotations)
      if (fixed === undefined) {
        return skip(
          ctx,
          call,
          'schema/check-filter',
          'annotations need a hand port (message is not a constant thunk)'
        )
      }
      edits.push(...fixed)
    }
    add(ctx, 'schema/check-filter', edits)
  }

  if (member === 'compose' && args.length === 2) {
    const [from, to] = args as [Node, Node]
    const text = ctx.sf.getFullText()
    if (hasComment(text.slice(from.getEnd(), to.getStart()))) {
      return skip(ctx, call, 'schema/compose', 'comment between arguments')
    }
    const wrap = asReceiver(from) !== undefined
    add(ctx, 'schema/compose', [
      range(call.getStart(), from.getStart(), wrap ? '(' : ''),
      range(
        from.getEnd(),
        to.getStart(),
        `${wrap ? ')' : ''}.pipe(${ns}.decodeTo(`
      ),
      range(to.getEnd(), call.getEnd(), '))'),
    ])
  }

  if (member === 'parseJson') {
    if (args.length === 0) {
      add(ctx, 'schema/from-json-string', [
        replace(call, `${ns}.fromJsonString(${ns}.Unknown)`),
      ])
    } else if (args.length === 1) {
      add(ctx, 'schema/from-json-string', [replace(nameNode, 'fromJsonString')])
    } else {
      skip(
        ctx,
        call,
        'schema/from-json-string',
        'parseJson options differ in v4'
      )
    }
  }
}

/**
 * v3 filter annotations -> v4 `Annotations.Filter`. The only incompatible key
 * in this repo is `message`, a thunk in v3 and a string in v4; a constant
 * thunk unwraps to its string.
 */
const filterAnnotations = (node: Node): Array<Edit> | undefined => {
  if (!Node.isObjectLiteralExpression(node)) return undefined
  const message = node.getProperty('message')
  if (message === undefined) return []
  if (!Node.isPropertyAssignment(message)) return undefined
  const init = message.getInitializerOrThrow()
  if (!Node.isArrowFunction(init) || init.getParameters().length > 0) {
    return undefined
  }
  const body = init.getBody()
  if (
    !Node.isStringLiteral(body) &&
    !Node.isNoSubstitutionTemplateLiteral(body)
  ) {
    return undefined
  }
  return [range(init.getStart(), body.getStart(), '')]
}

const httpApiSchemaCall = (
  ctx: FileCtx,
  call: CallExpression,
  member: string,
  ns: string
) => {
  const args = call.getArguments()
  const first = args[0]
  if (member === 'annotations' && args.length === 1 && first) {
    const status = Node.isObjectLiteralExpression(first)
      ? first.getProperty('status')
      : undefined
    if (
      !Node.isObjectLiteralExpression(first) ||
      first.getProperties().length !== 1 ||
      !Node.isPropertyAssignment(status)
    ) {
      return skip(
        ctx,
        call,
        'http/status-annotation',
        'annotations other than status'
      )
    }
    add(ctx, 'http/status-annotation', [
      replace(
        call,
        `{ httpApiStatus: ${status.getInitializerOrThrow().getText()} }`
      ),
    ])
  }
  if (member === 'Multipart' && args.length === 1 && first) {
    const wrap = asReceiver(first) !== undefined
    add(ctx, 'http/multipart', [
      range(call.getStart(), first.getStart(), wrap ? '(' : ''),
      range(
        first.getEnd(),
        call.getEnd(),
        `${wrap ? ')' : ''}.pipe(${ns}.asMultipart())`
      ),
    ])
  }
}

const swaggerLayer = (ctx: FileCtx, call: CallExpression) => {
  const apis = ctx.sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => calleeMember(c, 'HttpApiBuilder', 'api') !== undefined)
  const api = apis[0]?.getArguments()[0]
  if (apis.length !== 1 || api === undefined) {
    return skip(
      ctx,
      call,
      'http/swagger-layer',
      'no single HttpApiBuilder.api(Api) in file'
    )
  }
  const close = call.getEnd() - 1
  add(ctx, 'http/swagger-layer', [insert(close, api.getText())])
}

const eitherMatch = (ctx: FileCtx, call: CallExpression) => {
  const options = call.getArguments().at(-1)
  if (!Node.isObjectLiteralExpression(options)) {
    return skip(
      ctx,
      call,
      'result/match-keys',
      'match options are not an object literal'
    )
  }
  const keys: Record<string, string> = {
    onLeft: 'onFailure',
    onRight: 'onSuccess',
  }
  const edits: Array<Edit> = []
  for (const prop of options.getProperties()) {
    if (
      !Node.isPropertyAssignment(prop) &&
      !Node.isMethodDeclaration(prop) &&
      !Node.isShorthandPropertyAssignment(prop)
    ) {
      continue
    }
    const name = prop.getNameNode()
    const to = keys[name.getText()]
    if (to === undefined) continue
    edits.push(
      Node.isShorthandPropertyAssignment(prop)
        ? replace(name, `${to}: ${name.getText()}`)
        : replace(name, to)
    )
  }
  if (edits.length > 0) add(ctx, 'result/match-keys', edits)
}

/** `DateTime.distance(a, b)` keeps v3's number via `Duration.toMillis(...)`. */
const distance = (ctx: FileCtx, call: CallExpression) => {
  if (call.getArguments().length !== 2) {
    return skip(
      ctx,
      call,
      'datetime/distance-millis',
      'curried distance(that); wrap the applied call by hand'
    )
  }
  const parent = call.getParent()
  if (Node.isCallExpression(parent)) {
    const parentCallee = parent.getExpression()
    if (
      Node.isPropertyAccessExpression(parentCallee) &&
      moduleOf(parentCallee.getExpression()) === 'Duration'
    ) {
      return
    }
  }
  const imports: Array<PendingImport> = []
  const duration = useName(ctx, 'effect', 'Duration', imports)
  if (duration === undefined) {
    return skip(ctx, call, 'datetime/distance-millis', 'Duration already bound')
  }
  add(
    ctx,
    'datetime/distance-millis',
    [
      insert(call.getStart(), `${duration}.toMillis(`),
      insert(call.getEnd(), ')'),
    ],
    imports
  )
}

const minimumLogLevel = (ctx: FileCtx, call: CallExpression) => {
  const arg = call.getArguments()[0]
  const level =
    arg !== undefined &&
    call.getArguments().length === 1 &&
    Node.isPropertyAccessExpression(arg) &&
    moduleOf(arg.getExpression()) === 'LogLevel'
      ? arg.getName()
      : undefined
  if (level === undefined || !LOG_LEVELS.has(level)) {
    return skip(
      ctx,
      call,
      'logger/minimum-log-level',
      'level is not a LogLevel constant'
    )
  }
  const imports: Array<PendingImport> = []
  const effect = useName(ctx, 'effect', 'Effect', imports)
  const references = useName(ctx, 'effect', 'References', imports)
  if (effect === undefined || references === undefined) {
    return skip(
      ctx,
      call,
      'logger/minimum-log-level',
      'Effect or References already bound'
    )
  }
  const v4Level = level === 'Warning' ? 'Warn' : level
  add(
    ctx,
    'logger/minimum-log-level',
    [
      replace(
        call,
        `${effect}.provideService(${references}.MinimumLogLevel, '${v4Level}')`
      ),
    ],
    imports
  )
}

const catchTagKeys = (ctx: FileCtx, call: CallExpression, member: string) => {
  const edits: Array<Edit> = []
  for (const arg of call.getArguments()) {
    if (member === 'catchTag' && Node.isStringLiteral(arg)) {
      const to = TAG_RENAMES[arg.getLiteralText()]
      if (to !== undefined) edits.push(replace(arg, `'${to}'`))
    }
    if (member === 'catchTags' && Node.isObjectLiteralExpression(arg)) {
      for (const prop of arg.getProperties()) {
        if (!Node.isPropertyAssignment(prop) && !Node.isMethodDeclaration(prop))
          continue
        const name = prop.getNameNode()
        const key = name.getText().replace(/^['"]|['"]$/g, '')
        const to = TAG_RENAMES[key]
        if (to !== undefined) edits.push(replace(name, to))
      }
    }
  }
  if (edits.length > 0) add(ctx, 'errors/catch-tag-keys', edits)
}

/** HttpApi handler args: `path` -> `params`, `urlParams` -> `query`. */
const HANDLER_KEYS: Record<string, string> = {
  path: 'params',
  urlParams: 'query',
}

const handlers = (ctx: FileCtx, group: CallExpression) => {
  const build = group.getArguments()[2]
  if (build === undefined) return
  for (const call of build.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression()
    if (
      !Node.isPropertyAccessExpression(callee) ||
      !['handle', 'handleRaw'].includes(callee.getName())
    ) {
      continue
    }
    const handler = call.getArguments()[1]
    if (handler === undefined) continue
    if (!Node.isArrowFunction(handler) && !Node.isFunctionExpression(handler)) {
      skip(
        ctx,
        handler,
        'http/handler-args',
        'handler is not inline; rename its path/urlParams by hand'
      )
      continue
    }
    const param = handler.getParameters()[0]?.getNameNode()
    if (param === undefined) continue
    const edits: Array<Edit> = []
    if (Node.isObjectBindingPattern(param)) {
      for (const el of param.getElements()) {
        const prop = el.getPropertyNameNode()
        const key = (prop ?? el.getNameNode()).getText()
        const to = HANDLER_KEYS[key]
        if (to === undefined) continue
        edits.push(
          prop !== undefined
            ? replace(prop, to)
            : insert(el.getNameNode().getStart(), `${to}: `)
        )
      }
    } else if (Node.isIdentifier(param)) {
      const symbol = param.getSymbol()?.compilerSymbol
      for (const access of handler.getDescendantsOfKind(
        SyntaxKind.PropertyAccessExpression
      )) {
        const to = HANDLER_KEYS[access.getName()]
        const target = access.getExpression()
        if (
          to !== undefined &&
          Node.isIdentifier(target) &&
          target.getSymbol()?.compilerSymbol === symbol
        ) {
          edits.push(replace(access.getNameNode(), to))
        }
      }
    }
    if (edits.length > 0) add(ctx, 'http/handler-args', edits)
  }
}

/** `TestContext.TestContext` -> `TestClock.layer()` from `effect/testing`. */
const testContext = (ctx: FileCtx, node: Node) => {
  const imports: Array<PendingImport> = []
  const testClock = useName(ctx, 'effect/testing', 'TestClock', imports)
  if (testClock === undefined) {
    return skip(ctx, node, 'testing/test-context', 'TestClock already bound')
  }
  add(
    ctx,
    'testing/test-context',
    [replace(node, `${testClock}.layer()`)],
    imports
  )
}

/** Type positions: `Either.Left<L, R>`, `Schema.Schema.Any`, `Runtime.Runtime<R>`. */
const visitTypeReference = (ctx: FileCtx, node: Node) => {
  if (!Node.isTypeReference(node)) return
  const name = node.getTypeName()
  if (!Node.isQualifiedName(name)) return
  const left = name.getLeft()
  const right = name.getRight().getText()

  if (Node.isQualifiedName(left)) {
    if (
      right === 'Any' &&
      left.getRight().getText() === 'Schema' &&
      moduleOf(left.getLeft()) === 'Schema'
    ) {
      add(ctx, 'schema/top', [replace(name, `${left.getLeft().getText()}.Top`)])
    }
    if (
      moduleOf(left.getLeft()) === 'Context' &&
      left.getRight().getText() === 'Tag'
    ) {
      skip(
        ctx,
        node,
        'context/tag-to-service',
        'Context.Tag.* type helper needs a hand port'
      )
    }
    return
  }
  const module = moduleOf(left)
  if (
    (module === 'Either' || module === 'Result') &&
    (right === 'Left' || right === 'Right')
  ) {
    const args = node.getTypeArguments()
    if (args.length !== 2) {
      return skip(
        ctx,
        node,
        'result/type-args',
        'Left/Right without two type arguments'
      )
    }
    const [a, b] = args as unknown as [Node, Node]
    add(ctx, 'result/type-args', [
      range(a.getStart(), b.getEnd(), `${b.getText()}, ${a.getText()}`),
    ])
  }
  if (module === 'Runtime' && right === 'Runtime') {
    const imports: Array<PendingImport> = []
    const context = useName(ctx, 'effect', 'Context', imports)
    if (context === undefined) {
      return skip(
        ctx,
        node,
        'runtime/run-with-context',
        'Context already bound'
      )
    }
    add(
      ctx,
      'runtime/run-with-context',
      [replace(name, `${context}.Context`)],
      imports
    )
  }
}

/** Renames that need the type checker (see TYPED_RENAMES). */
const visitTyped = (ctx: FileCtx, node: Node, checker: TypeChecker) => {
  if (Node.isPropertyAccessExpression(node)) {
    const name = node.getName()
    if (!TYPED_FROM.has(name)) return
    const hit = typedTarget(
      checker.getTypeAtLocation(node.getExpression()).getNonNullableType(),
      name
    )
    if (hit) add(ctx, hit.rule, [replace(node.getNameNode(), hit.to)])
    return
  }
  if (Node.isBindingElement(node)) {
    const prop = node.getPropertyNameNode()
    const nameNode = node.getNameNode()
    const key = (prop ?? nameNode).getText()
    if (!TYPED_FROM.has(key)) return
    const pattern = node.getParent()
    const hit = typedTarget(checker.getTypeAtLocation(pattern), key)
    if (hit === undefined) return
    add(ctx, hit.rule, [
      prop !== undefined
        ? replace(prop, hit.to)
        : insert(nameNode.getStart(), `${hit.to}: `),
    ])
    return
  }
  if (Node.isObjectLiteralExpression(node)) {
    typedObjectLiteral(ctx, node)
  }
}

const typedObjectLiteral = (ctx: FileCtx, obj: ObjectLiteralExpression) => {
  const props = obj
    .getProperties()
    .filter(
      (p) =>
        (Node.isPropertyAssignment(p) ||
          Node.isShorthandPropertyAssignment(p)) &&
        TYPED_FROM.has(p.getName())
    )
  if (props.length === 0) return
  const contextual = obj.getContextualType()
  for (const prop of props) {
    if (
      !Node.isPropertyAssignment(prop) &&
      !Node.isShorthandPropertyAssignment(prop)
    )
      continue
    const name = prop.getNameNode()
    const hit = typedTarget(contextual, name.getText())
    if (hit === undefined) continue
    add(ctx, hit.rule, [
      Node.isShorthandPropertyAssignment(prop)
        ? replace(name, `${hit.to}: ${name.getText()}`)
        : replace(name, hit.to),
    ])
  }
}

/** Effect requireActual destructuring: `{ Either: X } = jest.requireActual('effect')`. */
const visitBindingRename = (ctx: FileCtx, node: Node) => {
  if (!Node.isBindingElement(node)) return
  const prop = node.getPropertyNameNode()
  const holder = node.getParent().getParent()
  if (
    prop === undefined ||
    !Node.isVariableDeclaration(holder) ||
    !isRequireActualEffect(holder.getInitializer())
  ) {
    return
  }
  const rename = BINDING_RENAMES.find(
    (r) => r.source === 'effect' && r.from === prop.getText()
  )
  if (rename)
    add(ctx, `import/rename ${rename.from}`, [replace(prop, rename.to)])
}

/** Tag strings outside catchTag/catchTags are recorded, never rewritten. */
const visitTagMention = (ctx: FileCtx, node: Node) => {
  const text = Node.isStringLiteral(node)
    ? node.getLiteralText()
    : Node.isIdentifier(node) && Node.isPropertyAssignment(node.getParent())
      ? node.getText()
      : undefined
  if (text === undefined || TAG_RENAMES[text] === undefined) return
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression)
  const callee = call?.getExpression()
  const inCatch =
    callee !== undefined &&
    Node.isPropertyAccessExpression(callee) &&
    ['catchTag', 'catchTags'].includes(callee.getName()) &&
    (Node.isStringLiteral(node)
      ? node.getParent() === call
      : node.getParent()?.getParent()?.getParent() === call)
  if (!inCatch) {
    skip(
      ctx,
      node,
      'errors/catch-tag-keys',
      `${text} outside catchTag/catchTags; v4 tag is ${TAG_RENAMES[text]}`
    )
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const analyze = (ctx: FileCtx, checker: TypeChecker) => {
  ctx.sf.forEachDescendant((node) => {
    switch (node.getKind()) {
      case SyntaxKind.ImportDeclaration:
        visitImport(ctx, node as ImportDeclaration)
        return
      case SyntaxKind.ExportDeclaration:
        visitExport(ctx, node)
        return
      case SyntaxKind.PropertyAccessExpression: {
        if (!Node.isPropertyAccessExpression(node)) return
        visitMember(ctx, node.getExpression(), node.getNameNode())
        if (
          node.getName() === 'TestContext' &&
          moduleOf(node.getExpression()) === 'TestContext'
        ) {
          testContext(ctx, node)
        }
        if (
          node.getName() === 'UUID' &&
          moduleOf(node.getExpression()) === 'Schema'
        ) {
          const ns = node.getExpression().getText()
          add(ctx, 'schema/uuid-guid', [
            replace(node, `${ns}.String.check(${ns}.isGUID())`),
          ])
        }
        visitTyped(ctx, node, checker)
        return
      }
      case SyntaxKind.QualifiedName:
        if (Node.isQualifiedName(node)) {
          visitMember(ctx, node.getLeft(), node.getRight())
        }
        return
      case SyntaxKind.TypeReference:
        visitTypeReference(ctx, node)
        return
      case SyntaxKind.CallExpression:
        visitCall(ctx, node as CallExpression)
        return
      case SyntaxKind.BindingElement:
        visitBindingRename(ctx, node)
        visitTyped(ctx, node, checker)
        return
      case SyntaxKind.ObjectLiteralExpression:
        visitTyped(ctx, node, checker)
        return
      case SyntaxKind.StringLiteral:
      case SyntaxKind.Identifier:
        visitTagMention(ctx, node)
        return
    }
  })
}

const overlaps = (a: Edit, b: Edit) => {
  if (a.start === a.end && b.start === b.end) return a.start === b.start
  if (a.start === a.end) return b.start < a.start && a.start < b.end
  if (b.start === b.end) return a.start < b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

const span = (c: Change) =>
  Math.max(...c.edits.map((e) => e.end)) -
  Math.min(...c.edits.map((e) => e.start))

/**
 * Applies the largest set of non-overlapping changes, innermost first. A
 * deferred change is recomputed on the next pass against the updated text.
 */
const applyChanges = (sf: SourceFile, changes: ReadonlyArray<Change>) => {
  const accepted: Array<Change> = []
  const taken: Array<Edit> = []
  const seen = new Set<string>()
  for (const change of [...changes].sort((a, b) => span(a) - span(b))) {
    const key = JSON.stringify(change.edits)
    if (seen.has(key)) continue
    seen.add(key)
    if (change.edits.some((e) => taken.some((t) => overlaps(e, t)))) continue
    accepted.push(change)
    taken.push(...change.edits)
  }
  if (accepted.length === 0) return accepted
  const text = sf.getFullText()
  const ordered = [...taken].sort(
    (a, b) => a.start - b.start || a.end - a.start - (b.end - b.start)
  )
  let out = ''
  let cursor = 0
  for (const edit of ordered) {
    out += text.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  sf.replaceWithText(out + text.slice(cursor))
  return accepted
}

const addImport = (
  sf: SourceFile,
  { module, name }: PendingImport
): boolean => {
  const decls = sf
    .getImportDeclarations()
    .filter(
      (d) =>
        d.getModuleSpecifierValue() === module &&
        !d.isTypeOnly() &&
        d.getNamespaceImport() === undefined
    )
  for (const decl of decls) {
    const spec = decl
      .getNamedImports()
      .find((s) => s.getName() === name && s.getAliasNode() === undefined)
    if (spec === undefined) continue
    if (!spec.isTypeOnly()) return false
    spec.setIsTypeOnly(false)
    return true
  }
  const target = decls[0]
  if (target) target.addNamedImport(name)
  else
    sf.addImportDeclaration({ moduleSpecifier: module, namedImports: [name] })
  return true
}

/** Drops `REMOVABLE_IF_UNUSED` effect imports that no longer have references. */
const removeUnusedImports = (sf: SourceFile): number => {
  let removed = 0
  for (const decl of sf.getImportDeclarations()) {
    const removable = REMOVABLE_IF_UNUSED[decl.getModuleSpecifierValue()]
    if (removable === undefined) continue
    const specs = decl.getNamedImports()
    const dead = specs.filter((s) => {
      const local = s.getAliasNode()?.getText() ?? s.getName()
      return removable.has(s.getName()) && !usedElsewhere(sf, local)
    })
    if (dead.length === 0) continue
    removed += dead.length
    if (dead.length === specs.length && decl.getDefaultImport() === undefined) {
      decl.remove()
    } else {
      for (const s of dead) s.remove()
    }
  }
  return removed
}

/** A name counts as used when an identifier other than its import specifier references it. */
const usedElsewhere = (sf: SourceFile, local: string) =>
  sf
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (id) =>
        id.getText() === local &&
        !isNameOnly(id) &&
        !Node.isImportSpecifier(id.getParent())
    )

const inScope = (rel: string, pkg: string) =>
  new RegExp(
    `^packages/${pkg}/(src|scripts${pkg === 'app' ? '|app' : ''})/.*\\.tsx?$`
  ).test(rel) &&
  !rel.endsWith('.d.ts') &&
  !/\/(node_modules|dist)\/|\.gen\./.test(rel)

const assertTargetsExist = (project: Project) => {
  const pairs = new Set<string>()
  for (const [module, renames] of Object.entries(MEMBER_RENAMES)) {
    for (const to of Object.values(renames)) pairs.add(`${module}\t${to}`)
  }
  for (const [module, member] of SPECIAL_TARGETS)
    pairs.add(`${module}\t${member}`)
  const modules = [
    ...new Set([...pairs].map((p) => p.split('\t')[0] as string)),
  ]
  const probe = project.createSourceFile(
    join(ROOT, 'packages/shared/src/__effect_v4_codemod_probe__.ts'),
    modules.map((m, i) => `import * as M${i} from '${v4PathOf(m)}'`).join('\n'),
    { overwrite: true }
  )
  const missing: Array<string> = []
  const hazards: Array<string> = []
  try {
    modules.forEach((module, i) => {
      const decl = probe.getImportDeclarations()[i]
      const target = decl?.getModuleSpecifierSourceFile()
      if (target === undefined) {
        missing.push(`${v4PathOf(module)} (module not found)`)
        return
      }
      const exported = target.getExportedDeclarations()
      for (const pair of pairs) {
        const [m, member] = pair.split('\t') as [string, string]
        if (m === module && !exported.has(member))
          missing.push(`${m}.${member}`)
      }
      for (const from of Object.keys(MEMBER_RENAMES[module] ?? {})) {
        const key = `${module}.${from}`
        if (
          exported.has(from) &&
          module !== 'Result' &&
          !V4_SHAPED_CALL.has(key)
        ) {
          hazards.push(key)
        }
      }
    })
  } finally {
    project.removeSourceFile(probe)
  }
  if (missing.length > 0) {
    throw new Error(`v4 targets missing from effect: ${missing.join(', ')}`)
  }
  return hazards
}

const runPackage = (
  pkg: string,
  dryRun: boolean,
  onProject: (p: Project) => void
) => {
  const tsConfigFilePath = join(ROOT, 'packages', pkg, 'tsconfig.json')
  const project = new Project({
    tsConfigFilePath,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  })
  onProject(project)
  // Some packages keep scripts/ outside their tsconfig `include`.
  project.addSourceFilesAtPaths(
    ['src', 'scripts', ...(pkg === 'app' ? ['app'] : [])].flatMap((dir) => [
      join(ROOT, 'packages', pkg, dir, '**/*.{ts,tsx}'),
      `!${join(ROOT, 'packages', pkg, dir, '**/node_modules/**')}`,
    ])
  )
  const files = project
    .getSourceFiles()
    .filter((sf) => inScope(relative(ROOT, sf.getFilePath()), pkg))
  const touched = new Set<SourceFile>()
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const checker = project.getTypeChecker()
    const contexts = files.map<FileCtx>((sf) => ({
      sf,
      rel: relative(ROOT, sf.getFilePath()),
      changes: [],
      referencedNames: collectReferencedNames(sf),
    }))
    for (const ctx of contexts) analyze(ctx, checker)
    let applied = 0
    for (const ctx of contexts) {
      if (ctx.changes.length === 0) continue
      const accepted = applyChanges(ctx.sf, ctx.changes)
      if (accepted.length === 0) continue
      touched.add(ctx.sf)
      applied += accepted.length
      for (const change of accepted) bump(change.rule, pkg)
      for (const pending of accepted.flatMap((c) => c.imports)) {
        if (addImport(ctx.sf, pending)) bump('import/add', pkg)
      }
      const removed = removeUnusedImports(ctx.sf)
      if (removed > 0) bump('import/remove-unused', pkg, removed)
    }
    if (applied === 0) break
    if (pass === MAX_PASSES)
      throw new Error(`${pkg}: no fixpoint after ${MAX_PASSES} passes`)
  }
  if (!dryRun) {
    for (const sf of touched) sf.saveSync()
  }
  return { files: files.length, changed: touched.size }
}

const main = () => {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const only = argv.flatMap((a, i) => (argv[i - 1] === '--package' ? [a] : []))
  for (const key of argv.flatMap((a, i) =>
    argv[i - 1] === '--skip' ? [a] : []
  )) {
    const [module, member] = key.split('.')
    const renames = module === undefined ? undefined : MEMBER_RENAMES[module]
    if (renames === undefined || member === undefined || !(member in renames))
      throw new Error(`--skip ${key}: no such member rename`)
    delete renames[member]
  }
  const packages = PACKAGE_ORDER.filter(
    (p) => only.length === 0 || only.includes(p)
  )
  let hazards: Array<string> = []
  const fileStats: Array<string> = []
  for (const pkg of packages) {
    const started = performance.now()
    const stats = runPackage(pkg, dryRun, (project) => {
      if (hazards.length === 0 && pkg === packages[0])
        hazards = assertTargetsExist(project)
    })
    const secs = ((performance.now() - started) / 1000).toFixed(1)
    fileStats.push(
      `${pkg}: ${stats.changed}/${stats.files} files changed (${secs}s)`
    )
    console.error(fileStats.at(-1))
  }

  const rules = [...counts.keys()].sort()
  const header = ['rule', ...packages, 'total']
  const rows = rules.map((rule) => {
    const byPkg = counts.get(rule) ?? new Map<string, number>()
    const cells = packages.map((p) => byPkg.get(p) ?? 0)
    return [
      rule,
      ...cells.map(String),
      String(cells.reduce((a, b) => a + b, 0)),
    ]
  })
  const totals = packages.map((p) =>
    rules.reduce((sum, r) => sum + (counts.get(r)?.get(p) ?? 0), 0)
  )
  rows.push([
    'TOTAL',
    ...totals.map(String),
    String(totals.reduce((a, b) => a + b, 0)),
  ])
  const widths = header.map((_, i) =>
    Math.max(...[header, ...rows].map((r) => (r[i] ?? '').length))
  )
  const fmt = (r: ReadonlyArray<string>) =>
    r
      .map((c, i) =>
        i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)
      )
      .join('  ')
  console.log(`effect-v4-codemod${dryRun ? ' (dry run)' : ''}`)
  console.log(fmt(header))
  for (const row of rows) console.log(fmt(row))
  console.log(
    `\nskipped/ambiguous sites: ${skips.size} (${relative(ROOT, SKIPPED_PATH)})`
  )
  if (hazards.length > 0) {
    console.log(
      `rerun hazards (v3 name still exists in v4): ${hazards.join(', ')}`
    )
  }

  const sorted = [...skips.values()].sort(
    (a, b) =>
      a.rule.localeCompare(b.rule) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line
  )
  const lines = sorted.map(
    (s) => `${s.rule}\t${s.file}:${s.line}\t${s.reason}\t${s.snippet}`
  )
  if (!dryRun) {
    writeFileSync(
      SKIPPED_PATH,
      `# effect-v4-codemod skipped sites: rule, location, reason, snippet (tab-separated)\n${lines.join('\n')}\n`
    )
  }
}

main()
