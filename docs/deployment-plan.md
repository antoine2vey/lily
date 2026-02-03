# Lily Deployment Plan

## Overview

Deploy the Lily monorepo (API + Mobile App) to production, starting small with a clear scaling path.

## Decisions

| Decision | Choice |
|----------|--------|
| Infrastructure | **Railway** |
| Environments | **Production only** (add preprod later when needed) |
| Domains | Provider defaults initially (add custom later) |
| Observability | **Railway built-in logging + metrics** |
| App CI/CD | **GitHub Actions + EAS Update** (OTA updates on push to main) |

---

## Infrastructure: Railway

**Why Railway**:
- Native Bun support (matches existing Dockerfile)
- Zero-config managed PostgreSQL and Redis
- GitHub integration for automatic deployments
- Cost-effective: ~$15-25/month for MVP
- Easy scaling path to multiple replicas
- Can add preprod environment later if needed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       PRODUCTION                             │
│                                                              │
│  ┌─────────┐    ┌─────────────┐    ┌─────────┐              │
│  │ Railway │────│ PostgreSQL  │    │  Redis  │              │
│  │   API   │    │  (managed)  │    │(managed)│              │
│  └─────────┘    └─────────────┘    └─────────┘              │
│       ▲                                                      │
│       │ auto-deploy on push to `main`                        │
└───────┼─────────────────────────────────────────────────────┘
        │
┌───────┴─────────────────────────────────────────────────────┐
│                      MOBILE APP                              │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  EAS Build   │         │  EAS Submit  │                  │
│  │  production  │────────▶│  App Store / │                  │
│  │              │         │  Play Store  │                  │
│  └──────────────┘         └──────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

**Future (when needed)**: Add preprod environment with `develop` branch deployment.

---

## Phase 1: API Deployment Setup

### 1.1 Create Health Endpoint

Add `/health` endpoint for container health checks:

**File**: `packages/api/src/services/health/api.ts`
```typescript
// Health endpoint returning database and redis status
HttpApiEndpoint.get('health', '/health')
  .pipe(HttpApiEndpoint.addSuccess(HealthResponse))
```

### 1.2 Railway Setup

1. Create Railway project (production environment)
2. Add services:
   - PostgreSQL 15 (managed)
   - Redis 7 (managed)
   - API (from Dockerfile.prod)

3. Configure environment variables:
   | Variable | Source |
   |----------|--------|
   | `DATABASE_URL` | Railway auto-generates |
   | `REDIS_URL` | Railway auto-generates |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | Manual (generate strong secret) |
   | `OPENAI_API_KEY` | OpenAI Dashboard |
   | `RESEND_API_KEY` | Resend Dashboard |
   | `STRIPE_*` | Stripe Dashboard |
   | `GCS_*` | GCP Console |

### 1.3 Database Migrations

Railway deployment will run migrations before starting the API:

**Dockerfile.prod** runs migrations on startup:
```dockerfile
CMD ["sh", "-c", "cd /app/packages/db && bun run db:migrate && cd /app/packages/api && bun run src/index.ts"]
```

Or use Railway's deploy command feature to run migrations separately.

---

## Phase 2: CI/CD Pipeline

### 2.1 API Deployment (Railway)

Railway auto-deploys from GitHub:
- `main` branch → production (auto-deploy on push)
- No GitHub Actions needed for API

### 2.2 Mobile App Deployment (OTA Updates)

**Strategy**: Use EAS Update for instant JS/asset changes, full builds only for native code.

**File**: `.github/workflows/update-app.yml`
```yaml
name: Update Mobile App (OTA)

on:
  push:
    branches: [main]
    paths:
      - 'packages/app/**'
      - 'packages/shared/**'

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - run: cd packages/app && bun run test

      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Publish OTA update
        run: cd packages/app && eas update --branch production --message "${{ github.event.head_commit.message }}"
```

### 2.3 Deployment Matrix

| Change Type | Trigger | Action |
|-------------|---------|--------|
| API code | Push to main | Railway auto-deploys |
| App JS/assets | Push to main | EAS Update (instant OTA) |
| App native code | Manual or tag | `eas build --profile production` |

**OTA vs Full Build**:
- **OTA**: JS code, styles, images, translations → instant to users
- **Full build**: Native modules, app.json changes, SDK upgrades → store review

---

## Phase 3: Mobile App Deployment

### 3.1 Update EAS Configuration

**File**: `packages/app/eas.json`
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_API_URL": "https://<railway-url>"
      }
    }
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "YOUR_APP_ID" },
      "android": { "track": "production" }
    }
  }
}
```

### 3.2 Update Flow

1. **Initial release**: Build with `eas build --profile production`, submit to stores
2. **JS/asset changes**: Push to main → OTA update (instant, no store review)
3. **Native changes**: Manually run `eas build --profile production --auto-submit`

### 3.3 Commands

```bash
# First release / native code changes
eas build --profile production --platform all --auto-submit

# Check OTA update status
eas update:list --branch production
```

---

## Phase 4: Observability

### 4.1 Logging

- Railway provides built-in log streaming (7-day retention)
- Effect's structured logging outputs JSON by default
- No external log service needed initially

### 4.2 Monitoring

- Railway built-in metrics (CPU, memory, network)
- Health endpoint (`/health`) for uptime checks

---

## Phase 5: Scaling Path

### When to Scale

| Signal | Action |
|--------|--------|
| P95 latency > 500ms | Add API replicas |
| DB connections > 80% | Add PgBouncer |
| Redis memory > 80% | Upgrade tier |
| Notification queue depth > 1000 | Separate workers |

### Future Architecture (10k+ users)

1. **Separate Workers**: Extract background workers into dedicated service
2. **Database**: Add read replicas, connection pooling
3. **CDN**: CloudFlare for static assets and API caching
4. **Consider**: Migration to Kubernetes if complexity warrants

---

## Implementation Order

### Step 1: API Preparation
1. Add health endpoint (`/health`) to API ✅
2. Update Dockerfile to run migrations on startup ✅

### Step 2: Railway Setup
3. Create Railway project
4. Add PostgreSQL and Redis services
5. Configure environment variables:
   - DATABASE_URL, REDIS_URL (auto from Railway)
   - JWT_SECRET
6. Deploy API from Dockerfile.prod
7. Verify health endpoint and database connectivity
8. Connect Railway to GitHub (`main` branch → auto-deploy)

### Step 3: Mobile App
9. Update `eas.json` with production API URL and channel
10. Create `.github/workflows/update-app.yml` workflow
11. Add `EXPO_TOKEN` secret to GitHub repo (from expo.dev)
12. Do initial build: `eas build --profile production --auto-submit`
13. Submit to TestFlight/Play Internal for testing
14. Release to App Store / Play Store
15. Future JS changes → push to main → instant OTA update

### Future Enhancements
- Add preprod environment when team grows
- Purchase custom domain (e.g., api.lily.app)
- Configure CloudFlare for CDN/SSL
- Add error tracking (Sentry) when needed

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `Dockerfile.dev` | Development Dockerfile with hot reload ✅ |
| `Dockerfile.prod` | Production Dockerfile with migrations ✅ |
| `docker-compose.yml` | Use Dockerfile.dev, removed Jaeger ✅ |
| `docker-compose.prod.yml` | Use Dockerfile.prod ✅ |
| `packages/api/src/services/health/api.ts` | Create health endpoint ✅ |
| `packages/api/src/services/health/handlers.ts` | Create health handlers ✅ |
| `packages/api/src/index.ts` | Add health service ✅ |
| `packages/app/eas.json` | Update with production API URL |
| `.github/workflows/update-app.yml` | Create OTA update workflow |

---

## Estimated Monthly Costs (MVP)

| Service | Cost |
|---------|------|
| Railway API | ~$5-10 |
| PostgreSQL | ~$5-10 |
| Redis | ~$5 |
| **Total** | **~$15-25/month** |

EAS builds: Free tier includes 30 builds/month, sufficient for MVP.

---

## Verification

### API Deployment
1. Health check: `curl https://<railway-url>/health` returns `200 OK` with db/redis status
2. Auth flow: Register → Login → Get token → Access protected endpoint
3. Database: Verify all migrations applied

### Mobile App
1. Build completes successfully on EAS
2. App connects to Railway API URL
3. Auth flow works end-to-end
4. Push notifications register correctly

### CI/CD
1. Push API change to `main` → Railway deploys automatically
2. Push app change to `main` → OTA update published instantly
3. Verify OTA update with `eas update:list --branch production`
4. Users receive update on next app launch
