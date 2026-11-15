# Play Console app content

This sheet lists the facts in the code that each answer in the Play Console **App content** section depends on. The answers are legal attestations, and the owner submits them. Check each fact against the code before a new submission. Update this sheet when a change adds a data type, an SDK, a permission or a way for users to reach each other.

## Collected or shared

Google counts data sent to a service provider that processes it only on your behalf as collected, not shared. Mark data as shared only when a third party uses it for its own purposes. These providers receive user data as processors:

- Cloudflare relays every request to `withlily.app` and `api.withlily.app`, so it sees the client IP address and the requested URL. The API reads the client IP from the `cf-connecting-ip` header (`packages/shared/src/services/http/client-ip.ts`).
- OpenAI receives plant photos and chat text (`packages/api/src/services/ai/`). Confirm that the OpenAI API terms still exclude API data from training.
- Google Cloud Storage stores plant photos and profile pictures (`packages/shared/src/services/file/gcs.ts`).
- Resend sends the magic link and other emails to the user's address (`packages/api/src/services/email/resend.provider.ts`).
- Open-Meteo receives the coordinates of a user or a Canopy for the weather signal (`packages/api/src/services/weather/providers/open-meteo.provider.ts`). OpenWeatherMap is the backup provider and receives the same coordinates when `OPENWEATHERMAP_API_KEY` is set (`packages/api/src/services/weather/providers/openweathermap.provider.ts`).
- RevenueCat receives the Lily user ID and the store purchases (`packages/app/src/services/revenuecat.ts`).
- Sentry receives crash reports, performance traces and auth events (`packages/app/src/sentry.ts`, `packages/app/src/utils/auth-telemetry.ts`).
- Honeycomb receives the API's traces, which carry the user ID and plant IDs (`packages/api/src/telemetry/otel.ts`).
- Discord receives the API's error alerts, which carry the user ID and the failed URL (`packages/api/src/services/alerting/discord.provider.ts`).
- Expo delivers push notifications to the device token. The API sends Live Activity updates to APNs directly (`packages/api/src/services/push/apns-live-activity.ts`).
- Expo serves OTA updates. On each launch and each return to the foreground, expo-updates asks `u.expo.dev` for an update (`updates` in `packages/app/app.json`, `packages/app/src/hooks/useOTAUpdates.tsx`). The request carries the IP address, the platform, the runtime version, the channel, the current update IDs, the EAS client ID (a random UUID stored on the device) and, after a failed update, the error message.

## Privacy policy

- The app links to `https://withlily.app/<locale>/privacy`, built by `privacyUrl` in `packages/app/src/constants/urls.ts`.
- The page is `packages/web/src/routes/$locale/privacy.tsx`. Its English copy is in `packages/web/src/i18n/en.ts` and its French copy in `packages/web/src/i18n/fr.ts`.
- Section 5 of the policy names every processor in the list above, plus Railway, Google Analytics for the website and the stores. When a change adds a processor, add it to this list and to section 5 in both locales.

## App access

- Every core feature needs an account. The login screen (`packages/app/app/(auth)/login.tsx`) offers an email magic link and Google sign-in. Apple sign-in appears only on iOS (`useAppleSignInAvailable` in `packages/app/src/components/auth/AppleSignInButton.tsx`). There is no password.
- Give the reviewer an account. `bun run --filter=@lily/db seed:android-reviewer` creates the account named by `ANDROID_REVIEWER_EMAIL`. An address listed in `REVIEWER_EMAILS` signs in without the magic link email. Keep `REVIEWER_EMAILS` empty when no review is in progress.

## Ads

The app contains no ads. `packages/app/package.json` has no ad SDK. The `ads` column in `packages/db/src/schema/users.ts` is a notification preference for marketing messages, not an in-app ad.

## Content rating

- Users interact. They follow each other, open public profiles, send nudges, share a Canopy and delegate care.
- A care delegation can carry a free-text message from the owner to the delegate (`message` in `packages/db/src/schema/delegation.ts`). This is user-to-user text.
- Profiles are public by default. `public_profile` defaults to true. A public profile shows the name, image, bio, follower counts, the count of living plants, and the names and photos of the most recent living plants (`getPublicProfile` in `packages/api/src/repositories/follow.repository.ts`).
- Location reaches other users inside a Canopy. The owner can set the Canopy location from their device. The API returns the coordinates to every member, and the app shows members only whether a location is set (`packages/app/src/screens/canopy/components/CanopyPlaceCard.tsx`).
- The app generates content with AI. Plant chat, identification and diagnosis call OpenAI.
- The app sells digital goods. Subscriptions go through the App Store or Google Play, with RevenueCat.

## Target audience

The app is not designed for children. Leave the under-13 age groups out, because including them brings the Families policy and its requirements.

## Data safety

### Security practices

- **Encryption in transit.** The app reaches the API over HTTPS. Android builds still allow cleartext traffic (`usesCleartextTraffic` in `packages/app/app.json`). Answer yes only while every production URL the app calls is HTTPS.
- **Tokens.** The access and refresh tokens are in `expo-secure-store` (`packages/app/src/utils/storage.ts`).
- **Deletion.** The user deletes the account in the app. `releaseAccount` in `packages/api/src/services/user/helpers/release-account.ts` marks it pending deletion, revokes its refresh tokens and removes its device tokens. The account-cleanup scheduler (`packages/api/src/services/account-cleanup/scheduler.ts`) purges it once `GRACE_PERIOD` (29 days) has passed. The scheduler runs at each API start and then every hour, so a purge lands within an hour of the end of the grace period and a restart does not delay it. The purge deletes the account's stored photos from both buckets before its rows (`packages/api/src/services/user/helpers/erase-account-photos.ts`). When storage fails, the account stays and the next run retries. The privacy policy promises deletion within 30 days. Keep the grace period below that promise. `packages/api/src/__tests__/services/account-cleanup/scheduler.test.ts` fails when a purge lands past it.
- **Export.** The app and the API have no data export. The privacy policy offers a JSON export to a user who emails the privacy address, so a request is answered by hand.

### Data types

| Play data type | Where the code collects it | Notes |
| --- | --- | --- |
| Name | `name`, `firstName` and `lastName` in `packages/db/src/schema/users.ts` | `name` is the public username. `firstName` and `lastName` come from Google or Apple sign-in or from the user's settings. |
| Email address | `email` in `users` | Required. Resend receives it. |
| User IDs | The Lily user ID | RevenueCat receives it through `Purchases.logIn`. The app sets no Sentry user. |
| Purchase history | `user_subscriptions` and `subscription_events` in `packages/db/src/schema/subscriptions.ts`, and RevenueCat | The stores handle payment cards |
| Location | `latitude` and `longitude` in `users` and in `canopy` | See the location note below |
| Photos | Plant photos and the profile picture (`packages/api/src/services/user/endpoints/upload-avatar.ts`) | Both are stored in Google Cloud Storage. Only plant photos go to OpenAI. |
| Other in-app messages | The delegation `message` | User-to-user free text |
| Other user-generated content | Plants, notes, care logs, rooms, bio and chat text | Chat text goes to OpenAI |
| Crash logs and diagnostics | Sentry | The app sets no Sentry user |
| Device or other IDs | The Expo push token from `getExpoPushTokenAsync` in `packages/app/src/utils/notifications.ts`, and the EAS client ID that expo-updates sends to Expo | The push token is stored in `device_tokens` |

**Location.** `packages/app/src/hooks/useLocationPermission.ts` asks for `Location.Accuracy.Balanced`, which expo-location documents as about 100 m. The API stores the raw coordinates. The app also requests `ACCESS_FINE_LOCATION`. Play's form defines precise location as an area under 3 km², so these coordinates read as precise location. Check the form's current definition, or round the coordinates before upload to declare approximate location.

**App interactions.** The app has no analytics SDK in `packages/app/package.json`. These per-user signals exist:

- The API counts each user's chat messages, plant identifications and card scans per month in `subscription_usage`, to enforce plan limits (`packages/api/src/services/subscriptions/usage-tracker.ts`).
- The API counts each user's care history opens in `historyViewCount` on `users`, for an achievement (`incrementHistoryViews` in `packages/api/src/repositories/achievement.repository.ts`).
- `Sentry.wrap` in `packages/app/app/_layout.tsx` records touch breadcrumbs, and `packages/app/src/utils/auth-telemetry.ts` adds auth breadcrumbs. Both travel with Sentry error reports.

The API also keeps daily aggregate counts with no user ID (`analyticsDailySnapshots` in `packages/db/src/schema/analytics.ts`). Only the website loads Google Analytics (`packages/web/src/routes/__root.tsx`).

**Not collected.** Audio, contacts, SMS, web browsing, health and fitness data, and payment card numbers.

**Permissions.** The app uses the managed workflow, so prebuild generates the Android manifest and the iOS `Info.plist`. Run `bun --cwd packages/app node_modules/expo/bin/cli config --type introspect` to list the permissions it generates. Libraries can add more when their manifests merge at build time. `packages/app/src/__tests__/app-config/permissions.test.ts` fails when the generated set changes, so update this sheet with that test.

- Expo applies the expo-camera, expo-image-picker, expo-secure-store and expo-location config plugins, and each one adds permissions by default. `packages/app/app.json` passes options to each plugin to turn off the permissions the app does not use.
- `microphonePermission: false` on expo-camera and expo-image-picker, and `recordAudioAndroid: false` on expo-camera, remove `RECORD_AUDIO` and `NSMicrophoneUsageDescription`. The app records no audio and no video. expo-image-picker also marks `RECORD_AUDIO` as removed, so no library manifest can add it back.
- `faceIDPermission: false` on expo-secure-store removes `NSFaceIDUsageDescription`. On Android, its `androidx.biometric` dependency merges `USE_BIOMETRIC` and `USE_FINGERPRINT`, so `android.blockedPermissions` removes them. The app never passes `requireAuthentication`, the only SecureStore option that uses biometrics.
- `locationAlwaysAndWhenInUsePermission: false` and `locationAlwaysPermission: false` on expo-location remove the iOS background location strings. The app calls only `requestForegroundPermissionsAsync`, and the generated Android manifest does not ask for `ACCESS_BACKGROUND_LOCATION`.
- The AR pot measurement and its motion permission exist only on iOS (`packages/plant-scanner/expo-module.config.json`). Its `NSMotionUsageDescription` text is the `motionUsagePermission` option of expo-location. The Android manifest asks for no motion permission.
- The generated Android manifest marks `RECORD_AUDIO`, `USE_BIOMETRIC` and `USE_FINGERPRINT` with `tools:node="remove"`, so the build drops them from every library manifest it merges.

## Government, financial and health features

None apply. Subscriptions are not a financial feature in Play's sense, which covers banking, loans, payments between users, crypto and insurance. Plant care is not a health feature.

## Category and contact

- **House & Home** fits plant care. **Lifestyle** also fits.
- The website is `https://withlily.app`. The contact email must be an inbox someone reads.
