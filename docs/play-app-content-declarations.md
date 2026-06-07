# Play Console — "App content" declarations (fill-in sheet)

Evidence-based answers derived from a codebase audit (2026-06-07). **You** enter/submit these — they are legal attestations. Each answer cites why. Verify before submitting.

> **Key definition — "Collected" vs "Shared":** Google treats data sent to a **service provider that only processes it on your behalf** as *collected*, **not shared**. OpenAI (API, no training by default), Sentry, RevenueCat, and Expo Push are service providers → declare as **collected, not shared**. Only mark "shared" if a third party uses the data for its *own* purposes. Confirm OpenAI's API data-use terms still say "no training on API data."

---

## 1. Set privacy policy
- **URL:** `https://withlily.app/en/privacy`
- Source: `packages/app/src/constants/urls.ts`; page served from `packages/web/src/app/[locale]/privacy/page.tsx`.
- ⚠️ **Action before submitting:** the policy should explicitly state that **plant photos and AI-chat text are sent to OpenAI** for processing, and that **Sentry** receives crash diagnostics. If it doesn't, update the web page first.

## 2. Sign in details (App access)
- All core functionality is **behind login** (Google / Apple OAuth only — no email/password).
- Choose **"All or some functionality is restricted"** → provide reviewer access.
- ⚠️ OAuth-only is awkward for reviewers. Options: (a) add a **demo/test account** path, or (b) provide a test Google account credential + instructions. You'll likely need to set this up — reviewers can't use arbitrary OAuth.

## 3. Ads
- **Answer: No, my app does not contain ads.**
- No ad SDKs found (no AdMob/Meta/etc.). The `ads` boolean in the user schema is an *email* marketing preference, not in-app ads.

## 4. Content rating (IARC questionnaire)
Category: **Reference, News, or Educational** or **Utility** (plant care). Key answers:
- Violence / Sexual / Profanity / Controlled substances / Gambling / Horror: **No** to all.
- **Does the app let users interact / communicate?** **Yes** — social follow, care delegation/nudges, opt-in **public profiles** (`get-public-profile`). No direct user-to-user messaging.
- **User-generated content shared with others?** **Yes (limited)** — public profile shows username/bio/plant count when opted in.
- **Shares user's current location with other users?** **No** (location used only for weather, never shared between users).
- **AI-generated content?** **Yes** — AI chat (OpenAI). Answer the AI-content question truthfully; for a plant assistant the content is non-objectionable.
- **Digital purchases?** **Yes** (subscriptions).
- **Expected outcome:** ESRB **Everyone** / PEGI **3** / "Users interact" + "Digital purchases" flags.

## 5. Target audience and content
- **Target age groups:** **13–17 and 18+** (do **NOT** include under-13 — that triggers the Families policy and stricter requirements; the app isn't child-directed).
- **"Is your app designed for children?"** **No.**
- **Appeals to children?** **No** (utility app, no child-oriented design).

## 6. Data safety
**Security practices:**
- **Encrypted in transit?** **Yes** (HTTPS enforced; cleartext disabled; OAuth tokens in `expo-secure-store`).
- **Way to request data deletion?** **Yes — in-app account deletion** (`packages/api/.../user/endpoints/delete-account.ts`, cascades related data). You can also offer the deletion URL.
- **Committed to Play Families Policy?** **No** (not targeting children).

**Data collected/shared** — declare each as **Collected = Yes, Shared = No** (service-provider exception) unless noted. Mark "encrypted in transit" + "can be deleted" for all.

| Play data type | Collected | Required/Optional | Purposes | Evidence |
|---|---|---|---|---|
| **Name** | Yes | Optional | App functionality, Account management | users.firstName/lastName/name (OAuth) |
| **Email address** | Yes | Required | Account management, App functionality | users.email |
| **User IDs** | Yes | Required | App functionality, Account management, Analytics, Fraud prevention/security | auth user id; RevenueCat app-user-id; Sentry user context |
| **Purchase history** | Yes | Optional | App functionality | RevenueCat (subscription mgmt). Payment card info NOT collected (store handles it) |
| **Approximate location** | Yes | Optional | App functionality | `useLocationPermission.ts` uses **Balanced** accuracy (~±2km) → **approximate, not precise**; for weather-based care |
| **Photos** | Yes | Optional | App functionality | Plant photos; sent to OpenAI for identification (processor) |
| **Other user-generated content** | Yes | Optional | App functionality | Plants, notes, care logs, room names, **AI chat text** (also sent to OpenAI) |
| **App interactions** | Yes | Optional | Analytics, App functionality | internal analytics schema |
| **Crash logs** | Yes | — | Analytics (diagnostics) | Sentry |
| **Diagnostics** | Yes | — | Analytics | Sentry; OpenTelemetry (only if `OTEL_ENABLED`) |
| **Device or other IDs** | Yes | Required | App functionality (push), Analytics | Expo push tokens; device tokens table |

**Not collected:** Audio (RECORD_AUDIO is declared but **unused** — see cleanup note), precise location, contacts, SMS, web browsing, health/fitness, payment card numbers.

> The "AI chat text" classification is a judgment call — Play's "Messages" type is meant for user-to-user messaging, so user↔AI content fits better under **"Other user-generated content."** Stated above accordingly.

## 7. Government apps
- **Answer: No** — not a government app.

## 8. Financial features
- **Answer: No / "My app doesn't have any of these financial features."**
- Subscriptions are **not** "financial features" (that section = banking, loans, crypto, investing, insurance). None present.

## 9. Health
- **Answer: No health features / not a health app.**
- Plant care, not human health; no health data accessed. (Only declare health if you picked a Health/Medical category — you shouldn't.)

## 10. App category + contact details
- **Category:** **House & Home** (gardening fit) or **Lifestyle** — either is defensible; House & Home is more specific for plant care.
- **Contact email:** your support address (e.g. `support@withlily.app`) — must be monitored.
- **Website:** `https://withlily.app`
- **Store listing:** ✅ already done (en-US + fr-FR title/desc, icon, 8 screenshots). Still missing **feature graphic 1024×500** for production.

---

## Recommended code cleanups (improve declaration accuracy)
These reduce permission scrutiny and make the data-safety form truthful:
1. **Remove `RECORD_AUDIO`** (Android manifest) + `NSMicrophoneUsageDescription` (iOS) — declared, never used.
2. **Remove `NSFaceIDUsageDescription`** (iOS) — declared, never used.
3. **Sentry PII:** add a `beforeSend` hook to scrub user IDs / sensitive strings from error payloads (currently minimal scrubbing).
4. Consider a **data export** mechanism (deletion exists; export is good-practice for GDPR though not required by Play data safety).

Keep `ACCESS_FINE/COARSE_LOCATION`, `CAMERA`, `VIBRATE`, motion (AR pot measurement) — all actually used.
