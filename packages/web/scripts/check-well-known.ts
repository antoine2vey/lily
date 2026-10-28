import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Array, pipe, Result, Schema } from 'effect'

const wellKnown = join(import.meta.dirname, '../public/.well-known')

const { expo } = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      expo: Schema.Struct({
        ios: Schema.Struct({
          appleTeamId: Schema.String,
          bundleIdentifier: Schema.String,
        }),
        android: Schema.Struct({ package: Schema.String }),
      }),
    })
  )
)(readFileSync(join(import.meta.dirname, '../../app/app.json'), 'utf8'))

const AppleAppSiteAssociation = Schema.Struct({
  applinks: Schema.Struct({
    details: Schema.NonEmptyArray(
      Schema.Struct({
        appIDs: Schema.NonEmptyArray(
          Schema.Literal(`${expo.ios.appleTeamId}.${expo.ios.bundleIdentifier}`)
        ),
        components: Schema.NonEmptyArray(
          Schema.Struct({ '/': Schema.Literal('/join/*') })
        ),
      })
    ),
  }),
})

const AssetLinks = Schema.NonEmptyArray(
  Schema.Struct({
    relation: Schema.Tuple([
      Schema.Literal('delegate_permission/common.handle_all_urls'),
    ]),
    target: Schema.Struct({
      namespace: Schema.Literal('android_app'),
      package_name: Schema.Literal(expo.android.package),
      sha256_cert_fingerprints: Schema.NonEmptyArray(
        Schema.String.check(Schema.isPattern(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/))
      ),
    }),
  })
)

const checks = [
  { file: 'apple-app-site-association', schema: AppleAppSiteAssociation },
  { file: 'assetlinks.json', schema: AssetLinks },
] as const

const failures = Array.filter(checks, ({ file, schema }) =>
  pipe(
    readFileSync(join(wellKnown, file), 'utf8'),
    Schema.decodeResult(Schema.fromJsonString(schema)),
    Result.match({
      onSuccess: () => {
        console.log(`ok ${file}`)
        return false
      },
      onFailure: (error) => {
        console.error(`FAIL ${file}\n${error.message}`)
        return true
      },
    })
  )
)

if (failures.length > 0) process.exit(1)
