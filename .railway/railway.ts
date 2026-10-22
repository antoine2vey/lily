import {
  database,
  defineRailway,
  github,
  image,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac'

export default defineRailway(() => {
  const lily = github('antoine2vey/lily', { branch: 'main', checkSuites: true })

  // Pinned: postgres() defaults to postgres-ssl:18, a major upgrade the v17 data dir cannot boot.
  const Postgres = database('Postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:17',
    output: 'DATABASE_URL',
    defaultMountPath: '/var/lib/postgresql/data',
    region: 'europe-west4-drams3a',
  })
  Postgres.networking = {
    privateNetworkEndpoint: 'postgres',
    tcpProxies: { '5432': {} },
  }
  const Redis = redis('Redis', { region: 'europe-west4-drams3a' })
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  }
  Redis.networking = {
    privateNetworkEndpoint: 'redis',
    tcpProxies: { '6379': {} },
  }
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 500,
  })
  const pgvectorVolume = volume('pgvector-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 5000,
  })
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 500,
  })
  const pgvector = service('pgvector', {
    source: image('pgvector/pgvector:pg18'),
    build: { builder: 'RAILPACK' },
    start:
      '/bin/sh -c "unset PGPORT; docker-entrypoint.sh postgres --port=5432"',
    replicas: { 'europe-west4-drams3a': 1 },
    networking: { tcpProxies: { '5432': {} } },
    volumeMounts: { '/var/lib/postgresql': pgvectorVolume },
    env: {
      DATABASE_URL: preserve(),
      DATABASE_URL_PRIVATE: preserve(),
      KNOWLEDGE_DATABASE_URL: preserve(),
      PGDATA: preserve(),
      PGDATABASE: preserve(),
      PGHOST: preserve(),
      PGHOST_PRIVATE: preserve(),
      PGPASSWORD: preserve(),
      PGPORT: preserve(),
      PGPORT_PRIVATE: preserve(),
      PGUSER: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_USER: preserve(),
    },
  })
  const MCP = service('MCP', {
    source: lily,
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: '/Dockerfile.mcp',
      watchPatterns: [
        '/Dockerfile.mcp',
        '/packages/mcp/**',
        '/packages/shared/**',
        '/packages/db/**',
      ],
    },
    replicas: { 'europe-west4-drams3a': 1 },
    domains: [{ domain: 'mcp.withlily.app', port: 3001 }],
    networking: { privateNetworkEndpoint: 'unique-achievement' },
    env: {
      API_BASE_URL: preserve(),
      DATABASE_URL: preserve(),
      MCP_PORT: preserve(),
      MCP_SERVER_URL: preserve(),
      SERVICE_TOKEN_SECRET: preserve(),
    },
  })
  const API = service('API', {
    source: lily,
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: '/Dockerfile.prod',
      watchPatterns: [
        '/packages/shared/**',
        '/packages/api/**',
        '/packages/db/**',
        '/packages/knowledge-db/**',
        '/Dockerfile.prod',
      ],
    },
    replicas: { 'europe-west4-drams3a': 1 },
    domains: [{ domain: 'api.withlily.app', port: 3000 }],
    networking: { privateNetworkEndpoint: 'api-withlily' },
    env: {
      ALERT_ENVIRONMENT_NAME: preserve(),
      APNS_BUNDLE_ID: preserve(),
      APNS_ENVIRONMENT: preserve(),
      APNS_KEY_ID: preserve(),
      APNS_PRIVATE_KEY: preserve(),
      APNS_TEAM_ID: preserve(),
      BLOG_GENERATION_ENABLED: preserve(),
      DATABASE_URL: preserve(),
      DISABLE_LIMITS: preserve(),
      DISABLE_MAGIC_LINK_VERIFICATION: preserve(),
      DISCORD_WEBHOOK_URL: preserve(),
      EMAIL_FROM_ADDRESS: preserve(),
      EMAIL_FROM_NAME: preserve(),
      GCP_PROJECT_ID: preserve(),
      GCS_AI_BUCKET: preserve(),
      GCS_CREDENTIALS_JSON: preserve(),
      GCS_PLANT_BUCKET: preserve(),
      GITHUB_REPO: preserve(),
      GITHUB_TOKEN: preserve(),
      GOOGLE_OAUTH_ANDROID_CLIENT_ID: preserve(),
      GOOGLE_OAUTH_IOS_CLIENT_ID: preserve(),
      GOOGLE_OAUTH_WEB_CLIENT_ID: preserve(),
      JWT_SECRET: preserve(),
      KNOWLEDGE_DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
      OPENAI_API_KEY: preserve(),
      OTEL_ENABLED: preserve(),
      OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
      OTEL_EXPORTER_OTLP_HEADERS: preserve(),
      OTEL_SERVICE_NAME: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_USER: preserve(),
      REDIS_URL: preserve(),
      RESEND_API_KEY: preserve(),
      REVENUECAT_API_KEY: preserve(),
      REVENUECAT_WEBHOOK_AUTH_KEY: preserve(),
      REVIEWER_EMAILS: preserve(),
      SERVICE_TOKEN_SECRET: preserve(),
      TIPS_GENERATION_ENABLED: preserve(),
    },
  })
  const lily2 = service('lily', {
    source: github('antoine2vey/lily', {
      branch: 'main',
      checkSuites: true,
      rootDirectory: '/',
    }),
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: '/packages/web/Dockerfile',
      watchPatterns: ['/packages/web/**'],
    },
    replicas: { 'europe-west4-drams3a': 1 },
    deploy: {
      limitOverride: { containers: { cpu: 8, memoryBytes: 8000000000 } },
    },
    domains: ['withlily.app'],
  })

  return project('balanced-manifestation', {
    // @ts-expect-error railway/iac 3.16 types omit `variables`; the CLI reads it (`config plan` prints "variables: managed")
    variables: { managed: true },
    resources: [
      pgvector,
      Postgres,
      Redis,
      MCP,
      API,
      lily2,
      redisVolume,
      pgvectorVolume,
      postgresVolume,
    ],
  })
})
