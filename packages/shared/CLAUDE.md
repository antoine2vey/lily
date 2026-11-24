# packages/shared

This package holds the Effect schemas, typed errors and domain helpers that the api, app, admin, mcp and db packages import as `@lily/shared`. Nothing runs it. Every `exports` entry in `package.json` points at a `.ts` file under `src/`, so each consumer compiles the source itself and Metro bundles it into the app. Code here ships to phones as well as to servers. Code that only the api uses lives in `packages/api`, so that an edit to it does not publish an OTA update.

## Commands

| Command | What it does |
|---|---|
| `bun run --filter=@lily/shared tsc` | Typecheck this package |
| `bun run --filter=@lily/shared test` | Vitest over `src/__tests__/` |
| `bun run --filter=@lily/shared lint` | Biome |
| `bun run --filter=@lily/shared lint:fix` | Biome, writing the fixes |

## Layout

- `src/index.ts` is the client-safe entry, `@lily/shared`. The app and admin bundle everything it reaches, so all of that code must run in a phone or a browser. Code that needs Node or a server SDK belongs in the package that runs it, such as `packages/api`, not here.
- `package.json` adds narrower subpaths. A domain subpath narrows an import to one domain, as `@lily/shared/plant` does for `src/domains/plant/schema.ts`. `@lily/shared/services/*` maps to `src/services/*.ts`, which holds the two server helpers that a package besides the api imports: `clientIp` (`src/services/http/client-ip.ts`) for the mcp, and `mintStoredRef` (`src/services/file/stored-ref-mint.ts`) for the db.
- `@lily/shared/indoor-demand` (`src/domains/weather/indoor-demand/index.ts`) is the indoor watering-demand model, its coefficients and `adjustedWateringDays`. The api computes care adjustments with it, and the web runs it in the browser for the watering calculator (`packages/web/src/lib/watering-calculator.ts`). `src/index.ts` does not re-export it, so the app does not bundle it. Nothing that `src/index.ts` reaches may import it.
- `@lily/shared/plant-catalog` (`src/domains/plant-catalog/catalog.ts`) is the static plant catalog that `packages/db/scripts/seed-plant-catalog.ts` inserts, and that the calculator reads in the browser. It holds the same plants, fields and translations as the `plant_catalog` rows the migrations leave, which `packages/api/src/__tests__/integration/plant-catalog-parity.integration.test.ts` checks. It stays out of `src/index.ts` for the same reason.
- `src/domains/<domain>/` holds one area. `schema.ts` has its schemas and `errors.ts` its typed errors. Helpers sit beside them, such as `src/domains/plant/rating.ts` and `src/domains/username/rules.ts`.
- `src/domains/care/` implements the care day, today, care type and care status of `packages/api/CONTEXT.md` as `CareDay`, `CareDays`, `CareType` and `careStatus`. Keep their meaning in step with that file.
- `src/domains/common/api.ts` holds `API_PREFIX`, the versioned path every client calls. Build API URLs from it.
- `src/domains/notification/topics.ts` holds the notification topics, `NOTIFICATION_TOPICS` and their categories. The app, the db enum and the api read them.
- `@lily/shared/testing` (`src/testing/exit.ts`) holds `failureOf` and `defectOf`, which every package's tests use to read the error of an `Exit`. `failureOf` also reads the failure of a `Result`. Only tests import it.
- `src/__tests__/` holds every test. Vitest collects only `src/__tests__/**/*.test.ts`.

## Rules

- **A push to `main` ships to phones.** Any change under `packages/shared/` other than Markdown publishes an OTA update to production (`.github/workflows/ota-update.yml`). The update waits neither for CI nor for the API deploy, so phones can run the new schemas against the old API. `docs/agents/releases.md` has the whole release path.
- **Installed app builds keep decoding.** The app decodes most API responses with these schemas through `HttpApiClient` (`packages/app/src/utils/client.tsx`), and an installed build keeps the schemas it shipped with. A few calls use plain `fetch` instead, such as the multipart uploads in `packages/app/src/utils/upload.ts` and the chat stream. Give a new response field `Schema.optionalKey` or a decoding default. Make a new request field optional or give it a default, because installed builds do not send it. Prefer an existing union literal or error code over a new one, because an installed build fails to decode a value it does not know. `callOpenAI` (`packages/api/src/services/ai/call-openai.ts`) reports a timeout as the existing `server_error` code for this reason.
- **Typecheck the consumers.** `bun run tsc` from the root checks every package. The shared `tsc` alone never sees the api or app code that a schema change breaks.
- **Schemas are structs.** Declare a domain schema with `Schema.Struct` and export its type beside it as `export type X = typeof X.Type`.
- **Errors the API returns carry their status.** Declare them with `Schema.TaggedError` and `{ httpApiStatus }` in the domain's `errors.ts`. The ai-chat errors are the exception. They carry no status, and each endpoint sets one with `HttpApiSchema.status`, as `packages/api/src/services/plants/api.ts` does.
- **Field defaults are a pair.** Give a field a default with `Schema.withDecodingDefaultType(Effect.succeed(x))` and `Schema.withConstructorDefault(Effect.succeed(x))`, as `src/domains/plant/errors.ts` does. The first fills the field when the decoded input lacks it. The second fills it when code constructs the value.
- **New export.** Re-export a new domain file from `src/index.ts`. Add a `package.json` subpath only when a consumer needs a narrower import. The indoor-demand and plant-catalog subpaths of Layout are the exception. They stay out of `src/index.ts` on purpose.
- **New notification topic.** Append it to the end of `NOTIFICATION_TOPICS` in `src/domains/notification/topics.ts` and give it a category in `TOPIC_CATEGORY`. `tsc` fails on a topic without one. The db builds its `notification_type` enum from the list (`packages/db/src/schema/enums.ts`), so the topic also needs a migration that appends it with `ALTER TYPE ... ADD VALUE`, in list order. `packages/api/src/__tests__/integration/schema-parity.integration.test.ts` checks the order. `VACATION_MUTED_TOPICS`, `CARE_TOPICS` and `ENGAGEMENT_TOPICS` follow from the categories.
- **Plant ratings run from 0 to 100.** That holds for `wateringRating`, `lightingRating`, `humidityRating` and `petToxicityRating`. Read them with `ratingLevel` for the five levels and `isPetSafe` for pet safety, both in `src/domains/plant/rating.ts`. A plant created without a watering rating gets `wateringRatingFromFrequency` of its watering frequency, from the same file.
- **Rate-limit keys come from `clientIp(headers)`** (`src/services/http/client-ip.ts`). It believes `cf-connecting-ip` only when `x-real-ip` is a Cloudflare address, so a caller who reaches the origin directly cannot choose their own key.
- **Effect conventions live in `CODING_STANDARDS.md`.** That covers service declarations, `Schema.TaggedError`, the singular `DateTime` part keys and the date helpers in `src/domains/common/date/`.
