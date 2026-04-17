import { Array, Match, Option, pipe } from 'effect'
import { DateRangeFilter } from '@/components/analytics/DateRangeFilter'
import { Histogram } from '@/components/analytics/Histogram'
import { HorizontalBar } from '@/components/analytics/HorizontalBar'
import { KpiCard } from '@/components/analytics/KpiCard'
import { LineChart } from '@/components/analytics/LineChart'
import { StackedAreaChart } from '@/components/analytics/StackedAreaChart'
import { useActiveSubscribersByTier } from '@/hooks/analytics/use-active-subscribers'
import { useAiChatVolume } from '@/hooks/analytics/use-ai-chat-volume'
import { useAnalyticsFilters } from '@/hooks/analytics/use-analytics-filters'
import { useCareLogVolumeByType } from '@/hooks/analytics/use-care-log-volume'
import { useDauWauMau } from '@/hooks/analytics/use-dau-wau-mau'
import { useDeadLetterVolume } from '@/hooks/analytics/use-dead-letter-volume'
import { useDiagnosisResolutionRate } from '@/hooks/analytics/use-diagnosis-resolution-rate'
import { useMrrEstimate } from '@/hooks/analytics/use-mrr-estimate'
import { useNotificationToCareAction } from '@/hooks/analytics/use-notification-to-care-action'
import { usePaidChurn } from '@/hooks/analytics/use-paid-churn'
import { usePaywallAttribution } from '@/hooks/analytics/use-paywall-attribution'
import { usePlantsPerUserDistribution } from '@/hooks/analytics/use-plants-per-user'
import { useSignupToFirstPlant } from '@/hooks/analytics/use-signup-to-first-plant'
import { useTrialToPaid } from '@/hooks/analytics/use-trial-to-paid'
import { useUsersByStatus } from '@/hooks/analytics/use-users-by-status'

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  suspended: '#f59e0b',
  banned: '#dc2626',
  pending_deletion: '#6b7280',
}

const TIER_COLORS: Record<string, string> = {
  free: '#94a3b8',
  paid: '#2563eb',
}

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) => (
  <section className="mt-8">
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
    </div>
    {children}
  </section>
)

const Panel = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="mb-3 text-sm font-medium text-gray-700">{title}</div>
    {children}
  </div>
)

const LoadingOrError = ({ state }: { state: 'loading' | 'error' | 'empty' }) =>
  pipe(
    Match.value(state),
    Match.when('loading', () => (
      <p className="text-sm text-gray-500">Loading…</p>
    )),
    Match.when('error', () => (
      <p className="text-sm text-red-600">Failed to load.</p>
    )),
    Match.when('empty', () => (
      <p className="text-sm text-gray-500">No data in this range.</p>
    )),
    Match.exhaustive
  )

export const AnalyticsPage = () => {
  const filters = useAnalyticsFilters()

  const usersByStatus = useUsersByStatus()
  const subs = useActiveSubscribersByTier()
  const plantsDist = usePlantsPerUserDistribution()
  const careVolume = useCareLogVolumeByType()
  const deadLetters = useDeadLetterVolume()
  const aiChat = useAiChatVolume()
  const diagnosisRate = useDiagnosisResolutionRate()
  const paywall = usePaywallAttribution()
  const signupFunnel = useSignupToFirstPlant()
  const trialFunnel = useTrialToPaid()
  const notifFunnel = useNotificationToCareAction()
  const mrr = useMrrEstimate()
  const dauWauMau = useDauWauMau()
  const churn = usePaidChurn()

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <DateRangeFilter filters={filters} />
      </div>

      {/* Overview KPIs */}
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Users (non-deleted)"
            value={(usersByStatus.data?.total ?? 0).toLocaleString()}
            hint={
              dauWauMau.data
                ? `DAU ${dauWauMau.data.dau.toLocaleString()} · MAU ${dauWauMau.data.mau.toLocaleString()}`
                : undefined
            }
          />
          <KpiCard
            label="Active + Trialing subs"
            value={(subs.data?.total ?? 0).toLocaleString()}
            hint={
              churn.data
                ? `churn ${Math.round(churn.data.currentRate * 100)}% (last month)`
                : undefined
            }
          />
          <KpiCard
            label="MRR estimate"
            value={
              mrr.data
                ? `$${(mrr.data.currentCents / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`
                : '—'
            }
            hint="Updated every 6h from active paid subs"
          />
          <KpiCard
            label={`Care logs (${filters.preset})`}
            value={(careVolume.data?.totalInRange ?? 0).toLocaleString()}
          />
        </div>
      </Section>

      {/* Growth & Retention */}
      <Section
        title="Growth & Retention"
        subtitle="Snapshot metrics written by the analytics scheduler every 6 hours."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="DAU trend (30d)">
            {dauWauMau.isLoading ? (
              <LoadingOrError state="loading" />
            ) : dauWauMau.isError ? (
              <LoadingOrError state="error" />
            ) : dauWauMau.data && dauWauMau.data.trend.length > 0 ? (
              <>
                <LineChart
                  series={[
                    {
                      key: 'dau',
                      points: dauWauMau.data.trend,
                    },
                  ]}
                  height={220}
                />
                <div className="mt-2 text-xs text-gray-500">
                  Stickiness (DAU/MAU):{' '}
                  {Math.round(dauWauMau.data.stickiness * 100)}% · WAU{' '}
                  {dauWauMau.data.wau.toLocaleString()}
                </div>
              </>
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>

          <Panel title="MRR trend (30d)">
            {mrr.isLoading ? (
              <LoadingOrError state="loading" />
            ) : mrr.isError ? (
              <LoadingOrError state="error" />
            ) : mrr.data && mrr.data.trend.length > 0 ? (
              <LineChart
                series={[
                  {
                    key: 'mrr ($)',
                    points: mrr.data.trend.map((p) => ({
                      date: p.date,
                      value: Math.round(p.value / 100),
                    })),
                  },
                ]}
                height={220}
                colors={['#16a34a']}
              />
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>
        </div>

        <div className="mt-4">
          <Panel title="Monthly paid churn (rate)">
            {churn.isLoading ? (
              <LoadingOrError state="loading" />
            ) : churn.isError ? (
              <LoadingOrError state="error" />
            ) : churn.data && churn.data.trend.length > 0 ? (
              <LineChart
                series={[
                  {
                    key: 'churn %',
                    points: churn.data.trend.map((p) => ({
                      date: p.date,
                      value: Math.round(p.value * 10000) / 100,
                    })),
                  },
                ]}
                height={200}
                colors={['#dc2626']}
              />
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>
        </div>
      </Section>

      {/* Users & Plants */}
      <Section
        title="Users & Plants"
        subtitle="Snapshot — as of now, independent of the date range filter."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="Users by status">
            {usersByStatus.isLoading ? (
              <LoadingOrError state="loading" />
            ) : usersByStatus.isError ? (
              <LoadingOrError state="error" />
            ) : usersByStatus.data ? (
              <HorizontalBar
                total={usersByStatus.data.total}
                rows={pipe(
                  usersByStatus.data.byStatus,
                  Array.map((row) => ({
                    label: row.status,
                    count: row.count,
                    accent: STATUS_COLORS[row.status] ?? '#2563eb',
                  }))
                )}
              />
            ) : null}
          </Panel>

          <Panel title="Plants per user">
            {plantsDist.isLoading ? (
              <LoadingOrError state="loading" />
            ) : plantsDist.isError ? (
              <LoadingOrError state="error" />
            ) : plantsDist.data ? (
              <Histogram
                data={plantsDist.data.buckets.map((b) => ({
                  label: b.label,
                  count: b.count,
                }))}
              />
            ) : null}
          </Panel>
        </div>
      </Section>

      {/* Subscriptions */}
      <Section
        title="Subscriptions"
        subtitle="Active + trialing subscribers, grouped by tier + status."
      >
        <Panel title="Active subscribers by tier">
          {subs.isLoading ? (
            <LoadingOrError state="loading" />
          ) : subs.isError ? (
            <LoadingOrError state="error" />
          ) : subs.data && subs.data.total > 0 ? (
            <HorizontalBar
              total={subs.data.total}
              rows={pipe(
                subs.data.byTier,
                Array.map((row) => ({
                  label: `${row.tier} · ${row.status}`,
                  count: row.count,
                  accent: TIER_COLORS[row.tier] ?? '#2563eb',
                }))
              )}
            />
          ) : (
            <LoadingOrError state="empty" />
          )}
        </Panel>
      </Section>

      {/* Engagement */}
      <Section
        title="Plant Engagement"
        subtitle="Care-log volume stacked by type over the selected range."
      >
        <Panel title="Care logs by type">
          {careVolume.isLoading ? (
            <LoadingOrError state="loading" />
          ) : careVolume.isError ? (
            <LoadingOrError state="error" />
          ) : careVolume.data && careVolume.data.series.length > 0 ? (
            <StackedAreaChart
              series={careVolume.data.series.map((s) => ({
                key: s.type,
                points: s.points,
              }))}
            />
          ) : (
            <LoadingOrError state="empty" />
          )}
        </Panel>
      </Section>

      {/* AI & Diagnostics */}
      <Section
        title="AI & Diagnostics"
        subtitle="AI chat engagement and disease diagnosis lifecycle."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Panel title="AI chat volume">
              {aiChat.isLoading ? (
                <LoadingOrError state="loading" />
              ) : aiChat.isError ? (
                <LoadingOrError state="error" />
              ) : aiChat.data && aiChat.data.trend.length > 0 ? (
                <LineChart
                  series={[
                    {
                      key: 'messages',
                      points: aiChat.data.trend.map((p) => ({
                        date: p.date,
                        value: p.messages,
                      })),
                    },
                    {
                      key: 'users',
                      points: aiChat.data.trend.map((p) => ({
                        date: p.date,
                        value: p.users,
                      })),
                    },
                  ]}
                />
              ) : (
                <LoadingOrError state="empty" />
              )}
            </Panel>
          </div>
          <div className="space-y-4">
            <KpiCard
              label={`Chat messages (${filters.preset})`}
              value={(aiChat.data?.totalMessages ?? 0).toLocaleString()}
              hint={`peak ${(aiChat.data?.uniqueUsers ?? 0).toLocaleString()} unique users / day`}
            />
            <KpiCard
              label="Diagnosis resolution"
              value={
                diagnosisRate.data
                  ? `${Math.round(diagnosisRate.data.resolutionRate * 100)}%`
                  : '—'
              }
              hint={
                diagnosisRate.data
                  ? `${diagnosisRate.data.resolved.toLocaleString()} / ${diagnosisRate.data.total.toLocaleString()} — median ${pipe(
                      Option.fromNullable(
                        diagnosisRate.data.medianHoursToResolve
                      ),
                      Option.map((h) => `${Math.round(h)}h`),
                      Option.getOrElse(() => '—')
                    )}`
                  : null
              }
            />
          </div>
        </div>
      </Section>

      {/* Conversion funnels */}
      <Section
        title="Conversion Funnels"
        subtitle="Key activation + monetization funnels."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Signup → first plant">
            {signupFunnel.isLoading ? (
              <LoadingOrError state="loading" />
            ) : signupFunnel.isError ? (
              <LoadingOrError state="error" />
            ) : signupFunnel.data && signupFunnel.data.cohortSize > 0 ? (
              <>
                <HorizontalBar
                  total={signupFunnel.data.cohortSize}
                  rows={pipe(
                    signupFunnel.data.steps,
                    Array.map((s) => ({
                      label: s.label,
                      count: s.count,
                    }))
                  )}
                />
                <div className="mt-3 text-xs text-gray-500">
                  Median time to first plant:{' '}
                  {pipe(
                    Option.fromNullable(
                      signupFunnel.data.medianHoursToFirstPlant
                    ),
                    Option.map((h) =>
                      h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`
                    ),
                    Option.getOrElse(() => '—')
                  )}
                </div>
              </>
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>

          <Panel title="Trial → paid (14d)">
            {trialFunnel.isLoading ? (
              <LoadingOrError state="loading" />
            ) : trialFunnel.isError ? (
              <LoadingOrError state="error" />
            ) : trialFunnel.data && trialFunnel.data.trialsStarted > 0 ? (
              <>
                <HorizontalBar
                  total={trialFunnel.data.trialsStarted}
                  rows={[
                    {
                      label: 'Trial started',
                      count: trialFunnel.data.trialsStarted,
                    },
                    {
                      label: 'Converted (paid)',
                      count: trialFunnel.data.converted,
                    },
                  ]}
                />
                <div className="mt-3 text-xs text-gray-500">
                  {Math.round(trialFunnel.data.conversionRate * 100)}%
                  conversion · median{' '}
                  {pipe(
                    Option.fromNullable(trialFunnel.data.medianDaysToConvert),
                    Option.map((d) => `${Math.round(d)}d`),
                    Option.getOrElse(() => '—')
                  )}
                </div>
              </>
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>

          <Panel title={`Reminder → care (24h, ${filters.preset})`}>
            {notifFunnel.isLoading ? (
              <LoadingOrError state="loading" />
            ) : notifFunnel.isError ? (
              <LoadingOrError state="error" />
            ) : notifFunnel.data && notifFunnel.data.remindersSent > 0 ? (
              <>
                <HorizontalBar
                  total={notifFunnel.data.remindersSent}
                  rows={[
                    {
                      label: 'Reminders sent',
                      count: notifFunnel.data.remindersSent,
                    },
                    {
                      label: 'Acted within 24h',
                      count: notifFunnel.data.actedOnWithin24h,
                    },
                  ]}
                />
                <div className="mt-3 text-xs text-gray-500">
                  {Math.round(notifFunnel.data.actionRate * 100)}% act within
                  24h of reminder
                </div>
              </>
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>
        </div>
      </Section>

      {/* Monetization: paywall attribution */}
      <Section
        title="Paywall Attribution"
        subtitle="For each conversion, the limit that triggered the paywall within 72h prior. Requires usage_limit_reached events to be logged."
      >
        <Panel title="Conversions by attributed limit">
          {paywall.isLoading ? (
            <LoadingOrError state="loading" />
          ) : paywall.isError ? (
            <LoadingOrError state="error" />
          ) : paywall.data && paywall.data.totalConversions > 0 ? (
            <HorizontalBar
              total={paywall.data.totalConversions}
              rows={pipe(
                paywall.data.byLimit,
                Array.map((row) => ({
                  label: row.label,
                  count: row.count,
                }))
              )}
            />
          ) : (
            <LoadingOrError state="empty" />
          )}
        </Panel>
      </Section>

      {/* Ops health */}
      <Section
        title="Ops Health"
        subtitle="Dead-letter queue volume + top failing topics/errors."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Panel title="Dead letters by topic">
              {deadLetters.isLoading ? (
                <LoadingOrError state="loading" />
              ) : deadLetters.isError ? (
                <LoadingOrError state="error" />
              ) : deadLetters.data && deadLetters.data.series.length > 0 ? (
                <StackedAreaChart
                  series={deadLetters.data.series.map((s) => ({
                    key: s.topic,
                    points: s.points,
                  }))}
                  colors={['#dc2626', '#ea580c', '#ca8a04', '#9333ea']}
                />
              ) : (
                <LoadingOrError state="empty" />
              )}
            </Panel>
          </div>
          <Panel title="Top errors">
            {deadLetters.data && deadLetters.data.topErrors.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {pipe(
                  deadLetters.data.topErrors,
                  Array.map((row) => (
                    <li
                      key={`${row.topic}-${row.error}`}
                      className="rounded border border-gray-100 p-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-700">
                          {row.topic}
                        </span>
                        <span className="text-gray-500">
                          ×{row.count.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-gray-500">
                        {row.error}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <LoadingOrError state="empty" />
            )}
          </Panel>
        </div>
      </Section>
    </div>
  )
}
