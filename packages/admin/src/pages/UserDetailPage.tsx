import { useQueryClient } from '@tanstack/react-query'
import { Array, Match, Option, pipe } from 'effect'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RoleBadge } from '@/components/RoleBadge'
import { UserStatusBadge } from '@/components/UserStatusBadge'
import { useAdminConversationMessages } from '@/hooks/use-admin-conversation-messages'
import { useAdminUserConversations } from '@/hooks/use-admin-user-conversations'
import {
  type AdminUserOverview,
  type AdminUserProfile,
  useAdminUserOverview,
} from '@/hooks/use-admin-user-overview'
import { useAdminUserPlants } from '@/hooks/use-admin-user-plants'
import {
  type GiftDuration,
  useGiftSubscription,
} from '@/hooks/use-gift-subscription'
import { useRevokeGift } from '@/hooks/use-revoke-gift'
import { formatShortDate } from '@/lib/format'

// ── Formatting helpers ─────────────────────────────────────────────

// Gifted "infinite" subscriptions are stored with a year-2099 sentinel end.
const formatPeriodEnd = (dateStr: string): string =>
  new Date(dateStr).getFullYear() >= 2099
    ? 'Lifetime'
    : formatShortDate(dateStr)

const limitLabel = (max: number | null): string =>
  max === null ? '∞' : String(max)

const durations: ReadonlyArray<{ value: GiftDuration; label: string }> = [
  { value: '7d', label: '7 Days' },
  { value: '1m', label: '1 Month' },
  { value: '1y', label: '1 Year' },
  { value: 'infinite', label: 'Lifetime' },
]

// ── Small presentational helpers ───────────────────────────────────

const Card = ({
  title,
  children,
}: {
  readonly title: string
  readonly children: React.ReactNode
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-6">
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
      {title}
    </h2>
    {children}
  </div>
)

const Field = ({
  label,
  value,
}: {
  readonly label: string
  readonly value: React.ReactNode
}) => (
  <div>
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="text-sm text-gray-900">{value}</dd>
  </div>
)

const BoolPill = ({
  label,
  on,
}: {
  readonly label: string
  readonly on: boolean
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      on ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}
  >
    {label}: {on ? 'On' : 'Off'}
  </span>
)

// ── Stats strip ────────────────────────────────────────────────────

const StatsStrip = ({
  overview,
}: {
  readonly overview: AdminUserOverview | undefined
}) => {
  const cards = [
    { label: 'Plants', value: overview?.stats.plantCount },
    { label: 'Care Logs', value: overview?.stats.careLogsCount },
    { label: 'Achievements', value: overview?.stats.achievementsCount },
    { label: 'Active Devices', value: overview?.stats.activeDeviceCount },
    { label: 'Rooms', value: overview?.stats.roomsCount },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {pipe(
        cards,
        Array.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-semibold">{card.value ?? '—'}</p>
          </div>
        ))
      )}
    </div>
  )
}

// ── Account + preferences ──────────────────────────────────────────

const AccountCard = ({ user }: { readonly user: AdminUserProfile }) => (
  <Card title="Account">
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Field
        label="Email"
        value={
          <span className="flex items-center gap-1.5">
            {user.email}
            {user.emailVerified && (
              <span className="text-xs text-green-600">✓ verified</span>
            )}
          </span>
        }
      />
      <Field label="Handle" value={user.name ?? '—'} />
      <Field
        label="Name"
        value={pipe(
          Array.getSomes([
            Option.fromNullable(user.firstName),
            Option.fromNullable(user.lastName),
          ]),
          Array.join(' '),
          (full) => (full === '' ? '—' : full)
        )}
      />
      <Field label="Timezone" value={user.timezone ?? '—'} />
      <Field label="Language" value={user.language} />
      <Field label="Units" value={user.temperatureUnit} />
      <Field label="Joined" value={formatShortDate(user.createdAt)} />
      <Field label="Updated" value={formatShortDate(user.updatedAt)} />
      <Field
        label="User ID"
        value={<span className="font-mono text-xs">{user.id}</span>}
      />
    </dl>
    {user.bio && <p className="mt-4 text-sm text-gray-600">{user.bio}</p>}
  </Card>
)

const PreferencesCard = ({ user }: { readonly user: AdminUserProfile }) => (
  <Card title="Preferences">
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs text-gray-500">Notifications</p>
        <div className="flex flex-wrap gap-2">
          <BoolPill label="Care reminders" on={user.careReminders} />
          <BoolPill label="Weekly digest" on={user.weeklyDigest} />
          <BoolPill label="Achievements" on={user.achievementNotifications} />
          <BoolPill label="Tips" on={user.tips} />
          <BoolPill label="Product updates" on={user.productUpdates} />
          <BoolPill label="Ads" on={user.ads} />
          <BoolPill label="Do not disturb" on={user.doNotDisturb} />
        </div>
        {user.doNotDisturb && (
          <p className="mt-1 text-xs text-gray-500">
            Quiet hours {user.doNotDisturbStart ?? '?'} –{' '}
            {user.doNotDisturbEnd ?? '?'}
          </p>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-xs text-gray-500">Privacy & location</p>
        <div className="flex flex-wrap gap-2">
          <BoolPill label="Public profile" on={user.publicProfile} />
          <BoolPill label="Share growth data" on={user.shareGrowthData} />
          <BoolPill label="Personalized tips" on={user.personalizedTips} />
          <BoolPill label="Weather" on={user.weatherEnabled} />
        </div>
      </div>
    </div>
  </Card>
)

// ── Subscription panel (with inline gift / revoke) ─────────────────

const SubscriptionPanel = ({
  id,
  overview,
}: {
  readonly id: string
  readonly overview: AdminUserOverview
}) => {
  const queryClient = useQueryClient()
  const gift = useGiftSubscription()
  const revoke = useRevokeGift()
  const [duration, setDuration] = useState<GiftDuration>('1m')

  const { subscription: sub, usage, tierConfig } = overview.subscription
  const blocked = overview.isStorePayer

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-user-overview', id] })

  const handleGift = () => {
    if (blocked) return
    gift.mutate({ userId: id, duration }, { onSuccess: invalidate })
  }

  const handleRevoke = () => {
    if (blocked) return
    if (
      !window.confirm(
        'Revoking will downgrade this user to the free tier. Continue?'
      )
    ) {
      return
    }
    revoke.mutate(id, { onSuccess: invalidate })
  }

  const canRevoke =
    sub != null && sub.tier === 'paid' && sub.status === 'active'

  return (
    <Card title="Subscription">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          label="Tier"
          value={
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                tierConfig.tier === 'paid'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tierConfig.name}
            </span>
          }
        />
        <Field label="Status" value={sub?.status ?? 'none'} />
        <Field
          label="Renews / ends"
          value={sub ? formatPeriodEnd(sub.currentPeriodEnd) : '—'}
        />
        <Field label="Store" value={overview.store ?? 'in-app gift'} />
      </dl>

      <div className="mt-4">
        <p className="mb-1.5 text-xs text-gray-500">Usage this period</p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <span>
            AI chats: {usage?.aiChatsCount ?? 0} /{' '}
            {limitLabel(tierConfig.maxAiChatsMonthly)}
          </span>
          <span>
            Card scans: {usage?.cardScansCount ?? 0} /{' '}
            {limitLabel(tierConfig.maxCardScansMonthly)}
          </span>
          <span>
            Plant IDs: {usage?.plantIdentifiesCount ?? 0} /{' '}
            {limitLabel(tierConfig.maxPlantIdentifiesMonthly)}
          </span>
        </div>
      </div>

      {blocked ? (
        <div className="mt-5 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          This user has an active App Store / Play Store subscription
          {overview.productId ? ` (${overview.productId})` : ''}. Gifting is
          disabled to avoid overwriting their paid subscription.
        </div>
      ) : (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="mb-2 text-xs font-medium text-gray-700">
            Gift a paid subscription
          </p>
          <div className="grid grid-cols-4 gap-3">
            {pipe(
              durations,
              Array.map((d) => (
                <button
                  type="button"
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium ${
                    duration === d.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d.label}
                </button>
              ))
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleGift}
              disabled={gift.isPending}
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gift.isPending ? 'Gifting...' : 'Gift Subscription'}
            </button>
            {canRevoke && (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoke.isPending}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {revoke.isPending ? 'Revoking...' : 'Revoke Gift'}
              </button>
            )}
          </div>

          {gift.isSuccess && (
            <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {gift.data.message}
            </div>
          )}
          {gift.isError && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {gift.error.message}
            </div>
          )}
          {revoke.isSuccess && (
            <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {revoke.data.message}
            </div>
          )}
          {revoke.isError && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {revoke.error.message}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Recent activity ────────────────────────────────────────────────

const activityLabel = (type: string): string =>
  pipe(
    Match.value(type),
    Match.when('watering', () => 'Watered'),
    Match.when('fertilization', () => 'Fertilized'),
    Match.when('misting', () => 'Misted'),
    Match.when('repotting', () => 'Repotted'),
    Match.orElse(() => type)
  )

const RecentActivityCard = ({
  activities,
}: {
  readonly activities: AdminUserOverview['recentActivity']
}) => (
  <Card title="Recent Activity">
    {Array.isEmptyReadonlyArray(activities) ? (
      <p className="text-sm text-gray-500">No recent activity.</p>
    ) : (
      <ul className="space-y-2">
        {pipe(
          activities,
          Array.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="text-gray-900">
                <span className="font-medium">{activityLabel(a.type)}</span>{' '}
                <span className="text-gray-500">{a.plantName}</span>
                {a.notes && <span className="text-gray-400"> — {a.notes}</span>}
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {formatShortDate(a.date)}
              </span>
            </li>
          ))
        )}
      </ul>
    )}
  </Card>
)

// ── Plants table ───────────────────────────────────────────────────

const PlantsTable = ({ id }: { readonly id: string }) => {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminUserPlants(id, page)

  return (
    <Card title="Plants">
      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {data && (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                <th className="py-2">Name</th>
                <th className="py-2">Category</th>
                <th className="py-2">Health</th>
                <th className="py-2">Room</th>
                <th className="py-2">Added</th>
                <th className="py-2">Schedules</th>
              </tr>
            </thead>
            <tbody>
              {Array.isEmptyReadonlyArray(data.items) ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No plants.
                  </td>
                </tr>
              ) : (
                pipe(
                  data.items,
                  Array.map((plant) => (
                    <tr
                      key={plant.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="py-2 font-medium text-gray-900">
                        {plant.isFavorite && (
                          <span className="mr-1 text-yellow-500">★</span>
                        )}
                        {plant.name}
                      </td>
                      <td className="py-2 text-gray-600">
                        {plant.category ?? '—'}
                      </td>
                      <td className="py-2 text-gray-600">{plant.health}</td>
                      <td className="py-2 text-gray-600">
                        {plant.room?.name ?? '—'}
                      </td>
                      <td className="py-2 text-gray-600">
                        {formatShortDate(plant.dateAdded)}
                      </td>
                      <td className="py-2 text-gray-600">
                        {plant.schedules.length}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>

          {data.total > data.limit && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {data.page} of {Math.ceil(data.total / data.limit)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.hasMore}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── Chat viewer (conversations → messages) ─────────────────────────

const ConversationMessages = ({
  userId,
  conversationId,
}: {
  readonly userId: string
  readonly conversationId: string | null
}) => {
  const messages = useAdminConversationMessages(userId, conversationId, 1)

  if (conversationId === null) {
    return (
      <p className="text-sm text-gray-500">
        Select a conversation to view its messages.
      </p>
    )
  }
  if (messages.isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>
  }
  if (!messages.data) return null

  return pipe(
    messages.data.items,
    Array.map((msg) => (
      <div
        key={msg.id}
        className={`mb-3 flex ${
          msg.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
      >
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
            msg.role === 'user'
              ? 'bg-primary-100 text-primary-900'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {msg.imageUrl && (
            <span className="mb-1 block text-xs text-gray-500">
              📎 image attached
            </span>
          )}
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    ))
  )
}

const ChatViewer = ({ id }: { readonly id: string }) => {
  const [selectedConv, setSelectedConv] = useState<string | null>(null)
  const conversations = useAdminUserConversations(id, 1)

  return (
    <Card title="AI Chat">
      <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
        <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
          {conversations.isLoading && (
            <p className="p-3 text-sm text-gray-500">Loading...</p>
          )}
          {conversations.data &&
            Array.isEmptyReadonlyArray(conversations.data.items) && (
              <p className="p-3 text-sm text-gray-500">No conversations.</p>
            )}
          {conversations.data &&
            pipe(
              conversations.data.items,
              Array.map((conv) => (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => setSelectedConv(conv.id)}
                  className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50 ${
                    selectedConv === conv.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <span className="font-medium text-gray-900">
                    {conv.title ??
                      (conv.kind === 'plant' ? 'Plant chat' : 'General')}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatShortDate(conv.lastMessageAt)}
                  </span>
                </button>
              ))
            )}
        </div>

        <div className="max-h-96 overflow-auto rounded-md border border-gray-200 p-3">
          <ConversationMessages userId={id} conversationId={selectedConv} />
        </div>
      </div>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────

export const UserDetailPage = () => {
  const { id = '' } = useParams()
  const overview = useAdminUserOverview(id)

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/users"
          className="text-sm text-primary-600 hover:text-primary-800"
        >
          ← Users
        </Link>
      </div>

      {overview.isError && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Failed to load this user.
        </div>
      )}

      {overview.data && (
        <div className="flex items-center gap-3">
          {overview.data.user.image ? (
            <img
              src={overview.data.user.image}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-500">
              {(overview.data.user.name ?? overview.data.user.email)
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">
              {overview.data.user.name ?? overview.data.user.email}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <RoleBadge role={overview.data.user.role} />
              <UserStatusBadge status={overview.data.user.status} />
              {overview.data.user.deletedAt && (
                <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  Deleted
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <StatsStrip overview={overview.data} />

      {overview.data && (
        <>
          <SubscriptionPanel id={id} overview={overview.data} />
          <AccountCard user={overview.data.user} />
          <PreferencesCard user={overview.data.user} />
          <RecentActivityCard activities={overview.data.recentActivity} />
          <PlantsTable id={id} />
          <ChatViewer id={id} />
        </>
      )}
    </div>
  )
}
