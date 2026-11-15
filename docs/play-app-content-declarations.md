# Play Console app content

This sheet lists the facts in the code that each answer in the Play Console **App content** section depends on. The answers are legal attestations, and the owner submits them. Check each fact against the code before a new submission. Update this sheet when a change adds a data type, an SDK, a permission or a way for users to reach each other.

## Collected or shared

Google counts data sent to a service provider that processes it only on your behalf as collected, not shared. Mark data as shared only when a third party uses it for its own purposes. These providers receive user data as processors:

- OpenAI receives plant photos and chat text (`packages/api/src/services/ai/`). Confirm that the OpenAI API terms still exclude API data from training.
- Google Cloud Storage stores plant photos (`packages/shared/src/services/file/gcs.ts`).
- Resend sends the magic link and other emails to the user's address (`packages/api/src/services/email/resend.provider.ts`).
- OpenWeatherMap receives the coordinates of a user or a Canopy for the weather signal.
- RevenueCat receives the Lily user ID and the store purchases (`packages/app/src/services/revenuecat.ts`).
- Sentry receives crash reports (`packages/app/src/sentry.ts`).
- Expo delivers push notifications to the device token.

## Privacy policy

- The app links to `https://withlily.app/<locale>/privacy`, built by `privacyUrl` in `packages/app/src/constants/urls.ts`.
- The page is `packages/web/src/routes/$locale/privacy.tsx`. Its English copy is in `packages/web/src/i18n/en.ts`.
- Section 5 of the policy names Railway, Google Analytics, an unnamed AI provider for photos, Expo and the stores. It does not name Sentry, RevenueCat, Google Cloud Storage, Resend or OpenWeatherMap. It does not say that chat text goes to the AI provider. Update the policy before you declare these processors.

## App access

- Every core feature needs an account. The login screen (`packages/app/app/(auth)/login.tsx`) offers Google, Apple and an email magic link.
- Give the reviewer an account. `bun run --filter=@lily/db seed:android-reviewer` creates the account named by `ANDROID_REVIEWER_EMAIL`. An address listed in `REVIEWER_EMAILS` signs in without the magic link email. Keep `REVIEWER_EMAILS` empty when no review is in progress.

## Ads

The app contains no ads. `packages/app/package.json` has no ad SDK. The `ads` column in `packages/db/src/schema/users.ts` is a notification preference for marketing messages, not an in-app ad.

## Content rating

- Users interact. They follow each other, open public profiles, send nudges, share a Canopy and delegate care.
- A care delegation can carry a free-text message from the owner to the delegate (`message` in `packages/db/src/schema/delegation.ts`). This is user-to-user text.
- Profiles are public by default. `public_profile` defaults to true. A public profile shows the name, image, bio, follower counts and the count of living plants.
- Location reaches other users inside a Canopy. The owner can set the Canopy location from their device. The API returns the coordinates to every member, and the app shows members only whether a location is set (`packages/app/src/screens/canopy/components/CanopyPlaceCard.tsx`).
- The app generates content with AI. Plant chat, identification and diagnosis call OpenAI.
- The app sells digital goods. Subscriptions go through the App Store or Google Play, with RevenueCat.

## Target audience

The app is not designed for children. Leave the under-13 age groups out, because including them brings the Families policy and its requirements.

## Data safety

### Security practices

- **Encryption in transit.** The app reaches the API over HTTPS. Android builds still allow cleartext traffic (`usesCleartextTraffic` in `packages/app/app.json`). Answer yes only while every production URL the app calls is HTTPS.
- **Tokens.** The access and refresh tokens are in `expo-secure-store` (`packages/app/src/utils/storage.ts`).
- **Deletion.** The user deletes the account in the app. `releaseAccount` in `packages/api/src/services/user/helpers/release-account.ts` marks it pending deletion, revokes its refresh tokens and removes its device tokens. The account-cleanup scheduler (`packages/api/src/services/account-cleanup/scheduler.ts`) purges it after `GRACE_PERIOD_DAYS`. The privacy policy promises deletion within 30 days, so keep the two in step.
- **Export.** The app and the API have no data export. The privacy policy offers a JSON export to a user who emails the privacy address, so a request is answered by hand.

### Data types

| Play data type | Where the code collects it | Notes |
| --- | --- | --- |
| Name | `name`, `firstName` and `lastName` in `packages/db/src/schema/users.ts` | `name` is the public username |
| Email address | `email` in `users` | Required. Resend receives it. |
| User IDs | The Lily user ID | RevenueCat receives it through `Purchases.logIn`. Sentry receives no user. |
| Purchase history | `user_subscriptions` and `subscription_events` in `packages/db/src/schema/subscriptions.ts`, and RevenueCat | The stores handle payment cards |
| Location | `latitude` and `longitude` in `users` and in `canopy` | See the location note below |
| Photos | Plant photos | Stored in Google Cloud Storage and sent to OpenAI |
| Other in-app messages | The delegation `message` | User-to-user free text |
| Other user-generated content | Plants, notes, care logs, rooms, bio and chat text | Chat text goes to OpenAI |
| Crash logs and diagnostics | Sentry | No user is attached |
| Device or other IDs | The Expo push token from `getExpoPushTokenAsync` in `packages/app/src/utils/notifications.ts` | Stored in `device_tokens` |

**Location.** `packages/app/src/hooks/useLocationPermission.ts` asks for `Location.Accuracy.Balanced`, which expo-location documents as about 100 m. The API stores the raw coordinates. The app also requests `ACCESS_FINE_LOCATION`. Play's form defines precise location as an area under 3 km², so these coordinates read as precise location. Check the form's current definition, or round the coordinates before upload to declare approximate location.

**App interactions.** The app sends no per-user usage events. The api keeps only daily aggregate counts (`analyticsDailySnapshots` in `packages/db/src/schema/analytics.ts`).

**Not collected.** Audio, contacts, SMS, web browsing, health and fitness data, and payment card numbers. The app declares no microphone permission.

## Government, financial and health features

None apply. Subscriptions are not a financial feature in Play's sense, which covers banking, loans, payments between users, crypto and insurance. Plant care is not a health feature.

## Category and contact

- **House & Home** fits plant care. **Lifestyle** also fits.
- The website is `https://withlily.app`. The contact email must be an inbox someone reads.
