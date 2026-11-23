// Usage: bun scripts/codemods/assert-which-error.ts <test file...>
// Rewrites the assertions lint/assert-which-error.grit flags into failureOf or
// defectOf from @lily/shared/testing, when the test already names the error in
// a following check or in its title. It leaves every other site as it is, for a
// hand fix. Running it again changes nothing.
import { readFileSync, writeFileSync } from 'node:fs'

const EXIT = String.raw`[\w.]+`
const quote = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const flaggedLine = new RegExp(
  String.raw`^\s*expect\((?:Exit\.isFailure\((${EXIT})\)\)\.toBe\(true\)|(${EXIT})\._tag\)\.toBe\('Failure'\))\s*$`
)

const inlineRewrites: ReadonlyArray<[RegExp, string]> = [
  [
    new RegExp(
      String.raw`Exit\.isFailure\((${EXIT})\)\s*&&\s*Cause\.hasDies\(\1\.cause\)\s*\?\s*String\(Cause\.squash\(\1\.cause\)\)\s*:\s*'[^']*'`,
      'g'
    ),
    'String(defectOf($1))',
  ],
  [
    new RegExp(
      String.raw`Exit\.isFailure\((${EXIT})\)\s*&&\s*Cause\.hasDies\(\1\.cause\)\s*\?\s*Cause\.squash\(\1\.cause\)\s*:\s*\1\b`,
      'g'
    ),
    'defectOf($1)',
  ],
  [
    new RegExp(
      String.raw`Exit\.isFailure\((${EXIT})\)\s*&&\s*Cause\.squash\(\1\.cause\)(\s*\)\.toEqual\(\s*new \w+Defect\b)`,
      'g'
    ),
    'defectOf($1)$2',
  ],
  [
    new RegExp(String.raw`Exit\.isFailure\((${EXIT})\)\s*&&\s*failureOf\(\1\)`, 'g'),
    'failureOf($1)',
  ],
]

const guardedBodies = (exit: string): ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> => {
  const x = quote(exit)
  return [
    [
      new RegExp(
        String.raw`^const error = Cause\.findErrorOption\(${x}\.cause\)\s*expect\(error\._tag\)\.toBe\('Some'\)\s*if \(error\._tag === 'Some'\) \{\s*expect\(error\.value\._tag\)\.toBe\('(\w+)'\)\s*\}$`
      ),
      (m) => `expect(failureOf(${exit})._tag).toBe('${m[1]}')`,
    ],
    [
      new RegExp(
        String.raw`^(?:const (\w+) = ${x}\.cause\s*)?expect\((?:String\((?:${x}\.cause|\w+)\)|${x}\.cause\.toString\(\))\)\.toContain\('(\w+)'\)$`
      ),
      (m) => `expect(failureOf(${exit})._tag).toBe('${m[2]}')`,
    ],
    [
      new RegExp(
        String.raw`^const error = failureOf\(${x}\)\s*expect\(error\)\.toBeInstanceOf\((\w+)\)$`
      ),
      (m) => `expect(failureOf(${exit})).toBeInstanceOf(${m[1]})`,
    ],
    [
      new RegExp(
        String.raw`^const error = Cause\.findErrorOption\(${x}\.cause\)\s*expect\(Option\.isSome\(error\)\)\.toBe\(true\)\s*if \(Option\.isSome\(error\)\) \{\s*expect\(error\.value(\.\w+)?\)(\.\w+\([^()]*\))\s*\}$`
      ),
      (m) => `expect(failureOf(${exit})${m[1] ?? ''})${m[2]}`,
    ],
    [
      new RegExp(
        String.raw`^const error = Option\.getOrThrow\(Cause\.findErrorOption\(${x}\.cause\)\)\s*([\s\S]*)$`
      ),
      (m) => `const error = failureOf(${exit})\n${m[1]}`,
    ],
  ]
}

const errorNamedByTitle = (title: string) => {
  const names = new Set(title.match(/\b[A-Z]\w*(?:Error|Defect)\b/g) ?? [])
  return names.size === 1 ? [...names][0] : undefined
}

const titleAbove = (lines: ReadonlyArray<string>, at: number) => {
  for (let i = at; i >= 0; i--) {
    const m = /^\s*(?:it|test)(?:\.\w+)?\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?/.exec(lines[i])
    if (m) return m[1] ?? m[2] ?? m[3] ?? lines[i + 1]?.trim() ?? ''
  }
  return ''
}

const blockEnd = (lines: ReadonlyArray<string>, start: number) => {
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === '{') depth++
      if (c === '}') depth--
    }
    if (depth === 0) return i
  }
  return -1
}

const rewriteOnce = (source: string) => {
  let text = source
  for (const [pattern, replacement] of inlineRewrites) text = text.replace(pattern, replacement)

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = flaggedLine.exec(lines[i])
    if (!m) continue
    const exit = m[1] ?? m[2]
    const indent = /^\s*/.exec(lines[i])?.[0] ?? ''
    let next = i + 1
    while (next < lines.length && lines[next].trim() === '') next++

    if (lines[next]?.includes(`failureOf(${exit})`)) {
      lines.splice(i, next - i)
      i--
      continue
    }

    const guard = new RegExp(
      String.raw`^\s*if \((?:Exit\.isFailure\(${quote(exit)}\)|${quote(exit)}\._tag === 'Failure')\) \{\s*$`
    )
    if (guard.test(lines[next] ?? '')) {
      const end = blockEnd(lines, next)
      const body = lines
        .slice(next + 1, end)
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .join('\n')
      const read = guardedBodies(exit).find(([pattern]) => pattern.test(body))
      if (read) {
        const assertion = read[1](body.match(read[0]) as RegExpMatchArray)
        lines.splice(i, end - i + 1, ...assertion.split('\n').map((l) => indent + l))
        continue
      }
    }

    const named = errorNamedByTitle(titleAbove(lines, i))
    if (named && !guard.test(lines[next] ?? '')) {
      lines[i] = `${indent}expect(failureOf(${exit})._tag).toBe('${named}')`
    }
  }
  return lines.join('\n')
}

const rewrite = (source: string): string => {
  const next = rewriteOnce(source)
  return next === source ? source : rewrite(next)
}

const addImport = (text: string, name: 'failureOf' | 'defectOf') => {
  if (!new RegExp(String.raw`\b${name}\(`).test(text)) return text
  const existing = /import \{([^}]*)\} from '@lily\/shared\/testing'/.exec(text)
  if (existing) {
    if (new RegExp(String.raw`\b${name}\b`).test(existing[1])) return text
    return text.replace(existing[0], `import {${existing[1].replace(/,?\s*$/, '')}, ${name} } from '@lily/shared/testing'`)
  }
  if (new RegExp(String.raw`(?:const|function) ${name}\b`).test(text)) return text
  return `import { ${name} } from '@lily/shared/testing'\n${text}`
}

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, 'utf8')
  const after = addImport(addImport(rewrite(before), 'failureOf'), 'defectOf')
  if (after !== before) {
    writeFileSync(file, after)
    console.log(`rewrote ${file}`)
  }
}
