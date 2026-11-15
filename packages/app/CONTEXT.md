# App domain language

The terms the mobile app adds to the api vocabulary. They name what the Care tab and Home do before a request goes out, the chat and plant detail surfaces, the mascot, and the iOS surfaces outside the app. Plant, care, care plan, canopy and every other concept in `packages/api/CONTEXT.md` keep their api meaning here.

A term listed under **Avoid** is a synonym that means something else in this code. Do not use it for the concept.

## Care tab and home

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Countdown** | The wait of `CARE_TASK_UNDO_TIMEOUT_MS` between completing a due-today or overdue care on the Care tab and the app sending it. A plan step with a care type gets the same countdown. | |
| **Undo** | Cancelling a care during its countdown. The app never sends the request, so the server records nothing. | "untick", which reopens a done plan step on the server (see [Untick](../api/CONTEXT.md)) |
| **Skip waiting** | The per-device setting, stored in AsyncStorage by `useSkipWaitingPreference`, that completes cares at once with no countdown. | |
| **Water all** | The Home action that waters, in one request, every plant whose watering is due today or overdue. | |

## Chat and plant detail

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Ask Lily** | The assistant chat, as the tab and the composer name it. A chat opened from a plant is about that plant. | |
| **Tool renderer** | A component that draws one tool call of an assistant message, registered by tool name in `src/screens/chat/components/tool-renderers.tsx`. A bubble renderer draws inside the message. A full-width renderer draws a card below it. | |
| **Growth journal** | A plant's photos on a timeline grouped by month, on a screen reached from plant detail. | |

## Mascot

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Mascot** | The animated character of the welcome slides, the auth and onboarding screens, empty states and the achievement modal, drawn by `src/components/Mascot.tsx`. | "the plant", which in this code means a user's [Plant](../api/CONTEXT.md) |
| **Clip** | One named mascot animation (`MascotAnimation` in `src/assets/mascot.ts`), stored as a stacked MP4 in `assets/mascot/`. | |

## Session and loading

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Forced logout** | A logout the user did not ask for. The server rejected the token refresh, or the startup or refresh auth check failed. `trackForcedLogout` records the reason. | |
| **Instant code** | The code `send-magic-link` returns when the server skips email verification. The app verifies with it at once, with no email step. | |
| **Skeleton** | The placeholder that mirrors a screen's layout during its first load. It appears only after 300ms. | |

## iOS surfaces

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Glass** | Liquid Glass, the iOS 26 material that the tab bar, headers and floating buttons use when `useGlass` is true. | |
| **Today widget** | The Home Screen widget that lists today's cares. It reads the snapshot the app last wrote to the App Group. | |
| **Snapshot** | The JSON the app writes for the Today widget with `writeTodayWidgetSnapshot`. The Swift decoder in `templates/LilyWidgetsExtension/TodayWidgetSnapshot.swift` reads it, so its shape is a contract. | |
| **Live Activity** | The Lock Screen and Dynamic Island card for the cares due now. The server starts and updates it by push. The app registers the push tokens and ends activities. | |
| **Push-to-start token** | The token iOS issues so the server can start a Live Activity while the app is not running. The app sends it to the api from `src/utils/notifications.ts`. | |

## Relationships

- **api** owns plants, cares, care plans, canopies, delegations, vacations and reminders. The app calls its routes through `src/utils/client.tsx` and uses those terms with their api meaning. See [packages/api/CONTEXT.md](../api/CONTEXT.md).
- **shared** owns the request and response schemas, `API_PREFIX`, `CARE_TASK_UNDO_TIMEOUT_MS`, the luminosity levels and the Live Activity payload. The app bundles the client-safe entry and imports only types from the server-only entry. See [packages/shared/CONTEXT.md](../shared/CONTEXT.md).
- **plant-scanner** owns the scanner terms of the iOS add-plant flow, such as frame analysis, lux level and measure mode. See [packages/plant-scanner/CONTEXT.md](../plant-scanner/CONTEXT.md).
