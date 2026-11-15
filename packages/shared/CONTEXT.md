# Shared domain language

The terms `@lily/shared` defines for itself: its two entry points, the service vocabulary the api implements, notification topics and the plant rating scales. Most schemas here carry the names of concepts that `packages/api/CONTEXT.md` owns, such as plant, care day and canopy. Those keep their api meaning, and this file links to them instead of defining them again.

## Entry points

| Term | Meaning | Avoid |
|---|---|---|
| **Client-safe entry** | `@lily/shared`, from `src/index.ts`. The app and admin bundle it, so everything it reaches runs in a phone or a browser. | |
| **Server-only entry** | `@lily/shared/server`, from `src/server.ts`. It exports the services that need Node or a server SDK. The app may import types from it and nothing else. | |

## Services

| Term | Meaning | Avoid |
|---|---|---|
| **Service interface** | A `Context.Service` tag with an `I<Name>` interface and no implementation, such as `MessageQueue` with `IMessageQueue`. | |
| **Provider** | The layer that implements a service interface. Providers live in the api as `*.provider.ts` files, such as `RedisMessageQueueLive`. | |
| **App event** | One member of `AppEvent`, published on the `EventBus`, such as `PlantCreated` or `CareLogCreated`. Delivery is fire-and-forget, so a subscriber that is not listening misses it. The api's achievements and Live Activities listen for them. | "fact", which is what an api context publishes on the outbox |
| **Queue message** | A `QueueMessage` on the `MessageQueue`. It asks for the delivery of the notifications it names under one notification topic, and the queue delivers it at least once. | |
| **Claim** | The handle `dequeue` returns with a queue message. `ack` finishes it, `refreshClaim` keeps it alive, and `requeueStale` puts back every message whose claim is older than a given duration. The [knowledge-db Claim](../knowledge-db/CONTEXT.md#ingestion) is a different mechanism, on ingest jobs. | |

## Notifications

| Term | Meaning | Avoid |
|---|---|---|
| **Notification topic** | One entry of `NOTIFICATION_TOPICS`, such as `watering_reminder` or `canopy_invitation`. It names the kind of a notification and is a value of the db `notification_type` enum. | "outbox topic", which is an api outbox channel such as `canopy` |
| **Topic category** | The class `TOPIC_CATEGORY` gives each notification topic: care, social or engagement. | |
| **Vacation-muted topics** | `VACATION_MUTED_TOPICS`, every topic outside the social category. A user on an [active vacation](../api/CONTEXT.md#absence) gets none of them. The social ones, such as delegation and canopy messages, still reach them. | |

## Plants

| Term | Meaning | Avoid |
|---|---|---|
| **Rating** | One of `wateringRating`, `lightingRating`, `humidityRating` and `petToxicityRating` on a plant or a catalog entry, on a scale from 0 to 100. | "a score from 1 to 5", the reading the code dropped |
| **Rating level** | The level from 1 to 5 that `ratingLevel` gives a rating, with a step every 20 points. | |
| **Pet safe** | A plant whose `petToxicityRating` is at most `PET_SAFE_UP_TO`, which is 50. | |
| **Luminosity level** | A light level from 1 to 5, from low light to full sun. `luxToLuminosityLevel` turns a lux reading into one, and a room suits a plant when both land on the same level. | |

## Relationships

- [packages/api/CONTEXT.md](../api/CONTEXT.md) owns the concepts most schemas here are named after. It defines [care day, today](../api/CONTEXT.md#time), care type, [care status](../api/CONTEXT.md#care-status), [reminders](../api/CONTEXT.md#reminders), the [canopy](../api/CONTEXT.md#canopy), delegation and vacation under [absence](../api/CONTEXT.md#absence), and the plant itself. `src/domains/care/` implements the care day, care type and care status rules in code, and the api reads them from there.
- The app and admin bundle the client-safe entry. The app decodes most API responses with its schemas through `HttpApiClient`. A few calls skip it, such as multipart uploads and the chat stream.
- The db builds its `notification_type` enum from `NOTIFICATION_TOPICS` in `packages/db/src/schema/enums.ts`.
- The mcp server imports the schemas and `clientIp`.
