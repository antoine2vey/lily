// v4 DateTime.make/makeUnsafe are generic over their input, so v3 plural
// parts keys (hours, minutes, ...) typecheck and are silently dropped,
// turning the time into midnight. tsc cannot catch this; this check does.
import { Node, Project, SyntaxKind } from 'ts-morph'

const project = new Project({ skipAddingFilesFromTsConfig: true })
project.addSourceFilesAtPaths([
  'packages/*/src/**/*.{ts,tsx}',
  'packages/*/scripts/**/*.ts',
  '!**/node_modules/**',
])

const ctor =
  /^DateTime\.(make|makeUnsafe|makeZoned|makeZonedUnsafe|setParts|setPartsUtc)$/
const v3Keys = new Set(['hours', 'minutes', 'seconds', 'millis'])

const hits = project.getSourceFiles().flatMap((sf) =>
  sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => ctor.test(call.getExpression().getText()))
    .flatMap((call) =>
      call
        .getArguments()
        .filter(Node.isObjectLiteralExpression)
        .flatMap((arg) => {
          const bad = arg
            .getProperties()
            .filter(
              (p) =>
                (Node.isPropertyAssignment(p) ||
                  Node.isShorthandPropertyAssignment(p)) &&
                v3Keys.has(p.getName())
            )
            .map((p) => p.getText().split(':')[0].trim())
          return bad.length > 0
            ? [
                `${sf.getFilePath().replace(`${process.cwd()}/`, '')}:${call.getStartLineNumber()} ${call.getExpression().getText()} {${bad.join(',')}}`,
              ]
            : []
        })
    )
)

for (const hit of hits) console.log(hit)
console.log(`${hits.length} DateTime parts literals with v3 plural keys`)
process.exit(hits.length > 0 ? 1 : 0)
