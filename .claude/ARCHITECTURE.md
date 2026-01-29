# Lily Architecture Map

Quick reference for navigating the Lily codebase.

## Monorepo Structure

```
packages/
├── api/      # Backend API server (Effect Platform)
├── db/       # Drizzle ORM schema and migrations
├── shared/   # Shared types, schemas, and utilities
└── app/      # React Native mobile app (Expo)
```

## Package Entry Points

| Package | Entry Point | Purpose |
|---------|-------------|---------|
| api | `src/index.ts` | Server bootstrap, layer composition |
| api | `src/api.ts` | API group composition |
| db | `src/index.ts` | DrizzleLive export, schema re-exports |
| shared | `src/index.ts` | All domain schemas and service abstractions |
| app | `src/App.tsx` | App entry, navigation setup |

---

## API Services

**Location**: `packages/api/src/services/`

### HTTP API Domains (12)

| Domain | Path | Key Endpoints |
|--------|------|---------------|
| auth | `services/auth/` | magic-link, verify, sign-out, refresh-token, set-username |
| plants | `services/plants/` | CRUD, water, fertilize, photos, ai-identify, scan-card |
| care-logs | `services/care-logs/` | CRUD for care history |
| care-tasks | `services/care-tasks/` | Daily care task aggregation |
| user | `services/user/` | settings, avatar upload |
| subscriptions | `services/subscriptions/` | billing, limits, usage, RevenueCat webhooks |
| notifications | `services/notifications/` | push notifications, mark read |
| achievements | `services/achievements/` | gamification, event-driven unlocks |
| ai-chat | `services/ai-chat/` | plant care chat, streaming responses |
| admin | `services/admin/` | user management (role-protected) |
| device-tokens | `services/device-tokens/` | push token registration |
| username | `services/username/` | username availability |

### Internal Services (12)

| Service | Path | Purpose |
|---------|------|---------|
| ai | `services/ai/` | OpenAI integration |
| email | `services/email/` | Resend email sending |
| event-bus | `services/event-bus/` | Event publishing (Memory/Redis) |
| jwt | `services/jwt/` | Token generation/validation |
| message-queue | `services/message-queue/` | Redis message queue |
| notification-scheduler | `services/notification-scheduler/` | Scheduled notifications |
| push | `services/push/` | Expo push notifications |
| rate-limiter | `services/rate-limiter/` | Request rate limiting |
| rag | `services/rag/` | Retrieval-augmented generation |
| knowledge-ingestion | `services/knowledge-ingestion/` | Knowledge base ingestion |
| helpers | `services/helpers/` | Shared utilities |

---

## Repositories

**Location**: `packages/api/src/repositories/`

| Repository | File | Domain |
|------------|------|--------|
| UserRepository | `user.repository.ts` | User CRUD |
| PlantRepository | `plant.repository.ts` | Plants, photos |
| CareLogRepository | `care-log.repository.ts` | Care history |
| AchievementRepository | `achievement.repository.ts` | Achievements |
| NotificationRepository | `notification.repository.ts` | Notifications |
| ChatRepository | `chat.repository.ts` | AI chat history |
| SubscriptionRepository | `subscription.repository.ts` | Subscriptions, usage |
| DeviceTokenRepository | `device-token.repository.ts` | Push tokens |
| MagicLinkRepository | `magic-link.repository.ts` | Magic link auth |
| RefreshTokenRepository | `refresh-token.repository.ts` | Token refresh |
| ScanRepository | `scan.repository.ts` | Plant card scans |
| DeadLetterRepository | `dead-letter.repository.ts` | Failed events |

---

## Domain Schemas

**Location**: `packages/shared/src/domains/`

| Domain | Files | Key Exports |
|--------|-------|-------------|
| plant | `schema.ts`, `errors.ts`, `selectors.ts` | Plant, PlantPhoto, PlantDetail, AIIdentifyResponse |
| user | `schema.ts`, `errors.ts` | User, UserSettings, UserProfile |
| auth | `schema.ts` | LoginRequest, Session, Token, AuthResponse |
| care-log | `schema.ts`, `errors.ts` | CareLog, CareLogType, RecentActivitiesListResponse |
| care-task | `schema.ts` | CareTask, CareTasksResponse |
| subscriptions | `schema.ts`, `errors.ts` | Subscription, TierConfig, Usage, LimitExceededError |
| achievement | `schema.ts`, `definitions.ts` | Achievement, AchievementDefinition |
| notification | `schema.ts`, `errors.ts` | Notification, NotificationPrefs |
| ai-chat | `schema.ts` | ChatRequest, ChatResponse, ChatHistoryListResponse |
| device-token | `schema.ts` | DeviceToken, DeviceTokenCreateRequest |
| admin | `schema.ts` | AdminUser, AdminRoleChangeRequest |
| username | `schema.ts` | UsernameRequest, UsernameAvailability |
| common | `errors.ts`, `pagination.ts`, `date.ts` | DatabaseError, PaginatedResponse, date utilities |
| knowledge-ingestion | `schema.ts` | Knowledge base schemas |

---

## Database Schema

**Location**: `packages/db/src/schema/`

| File | Tables |
|------|--------|
| `users.ts` | users (profiles, roles, settings) |
| `auth.ts` | magic_links, refresh_tokens, rate_limits |
| `plants.ts` | plants, plant_photos, plant_scans |
| `plant-history.ts` | plant_history (care events) |
| `care-logs.ts` | care_logs |
| `notifications.ts` | notifications, device_tokens |
| `achievements.ts` | user_achievements |
| `chat.ts` | chat_messages |
| `subscriptions.ts` | subscription_tiers, user_subscriptions, subscription_usage, subscription_events |
| `dead-letter.ts` | dead_letter_messages |
| `enums.ts` | PostgreSQL enum types |

---

## Service Abstractions

**Location**: `packages/shared/src/services/`

| Service | Path | Implementations |
|---------|------|-----------------|
| AI | `ai/service.ts` | OpenAI (in api) |
| Email | `email/service.ts` | Resend (in api) |
| EventBus | `event-bus/service.ts` | Memory, Redis (in api) |
| FileService | `file/fileservice.ts` | GCS (in api) |
| MessageQueue | `message-queue/service.ts` | Redis (in api) |
| PushService | `push/service.ts` | Expo (in api) |

---

## Mobile App Structure

**Location**: `packages/app/src/`

### Screens (19)

| Screen | Path | Purpose |
|--------|------|---------|
| Splash | `screens/splash/` | App loading |
| Onboarding | `screens/onboarding/` | New user flow |
| Home | `screens/home/` | Dashboard |
| Plants | `screens/plants/` | Plant list |
| PlantDetail | `screens/plant-detail/` | Plant info, photos, gallery |
| AddPlant | `screens/add-plant/` | Create plant |
| EditPlant | `screens/edit-plant/` | Update plant |
| LogCare | `screens/log-care/` | Log care activity |
| Care | `screens/care/` | Care tasks list |
| CareHistory | `screens/care-history/` | Care history view |
| Chat | `screens/chat/` | AI plant assistant |
| Achievements | `screens/achievements/` | Gamification |
| NotificationSettings | `screens/notification-settings/` | Push preferences |
| Settings | `screens/settings/` | App settings |
| Profile | `screens/profile/` | User profile |
| EditProfile | `screens/edit-profile/` | Update profile |
| PrivacySettings | `screens/privacy-settings/` | Privacy options |
| About | `screens/about/` | App info |
| Subscription | `screens/subscription/` | Premium tier |

### Hooks (37)

**Data Fetching:**
- `usePlants`, `usePlant`, `useCareHistory`, `useCareTasks`
- `useAchievements`, `useUser`, `useNotificationSettings`
- `useSubscription`, `useRecentActivities`, `usePhotos`
- `useChatHistory`, `useSubscriptionUsage`

**Mutations:**
- `useCreatePlant`, `useUpdatePlant`, `useDeletePlant`
- `useSaveCareLog`, `useUpdateCareLog`, `useDeleteCareLog`
- `useWaterPlant`, `useWaterAll`, `useFertilizePlant`, `useCompleteTask`
- `useIdentifyPlant`, `useScanCard`, `useUploadPhoto`, `useDeletePhoto`
- `usePlantChat`, `useUpdateProfile`, `useDeleteAccount`, `useExportData`
- `useDeviceToken`, `useOnboardingComplete`, `useSubscriptionSync`

**Utilities:**
- `useAppStateSync`, `useTheme`

### Contexts

- `AuthContext` - User session management
- `RevenueCatContext` - Subscription/payment handling

---

## Test Structure

**Location**: `packages/api/src/__tests__/`

```
__tests__/
├── fixtures/          # Mock data (12 files)
│   ├── users.ts, plants.ts, care-logs.ts, care-tasks.ts
│   ├── achievements.ts, notifications.ts, device-tokens.ts
│   ├── chat.ts, auth.ts, magic-links.ts, refresh-tokens.ts, jwt.ts
├── mocks/             # Mock layers (23+ files)
│   ├── *.repository.ts    # Repository mocks
│   └── *.service.ts       # Service mocks
├── integration/       # Integration tests
└── services/          # Unit tests by domain (60+ tests)
```

---

## Quick Reference Patterns

| To find... | Search pattern |
|------------|----------------|
| Service endpoints | `services/{domain}/endpoints/*.ts` |
| API definitions | `services/{domain}/api.ts` |
| Business logic | `services/{domain}/service.ts` |
| Repository interface | `repositories/{domain}.repository.ts` |
| Domain schemas | `shared/src/domains/{domain}/schema.ts` |
| Domain errors | `shared/src/domains/{domain}/errors.ts` |
| DB table schema | `db/src/schema/{table}.ts` |
| Tests for feature | `__tests__/services/{domain}/*.test.ts` |
| Mock for testing | `__tests__/mocks/{domain}.*.ts` |
| App screen | `app/src/screens/{screen}/` |
| App hook | `app/src/hooks/use{Feature}.ts` |

---

## Statistics

| Metric | Count |
|--------|-------|
| API Service Domains | 12 |
| Internal Services | 12 |
| Repositories | 12 |
| Database Tables | 11 |
| Domain Schemas | 14 |
| Service Abstractions | 6 |
| Mobile Screens | 19 |
| Custom Hooks | 37 |
| Test Files | 60+ |
