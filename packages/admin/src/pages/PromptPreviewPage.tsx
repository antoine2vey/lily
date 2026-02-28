import { Array, Match, Option, pipe, String } from 'effect'
import { useState } from 'react'
import {
  type PromptPreviewCareEntry,
  type PromptPreviewConversationEntry,
  type PromptPreviewRagChunk,
  type PromptPreviewResponse,
  usePromptPreview,
} from '@/hooks/use-prompt-preview'

// --- Collapsible Section ---

const CollapsibleSection = ({
  step,
  title,
  description,
  color,
  defaultOpen = false,
  children,
}: {
  readonly step: number
  readonly title: string
  readonly description: string
  readonly color: string
  readonly defaultOpen?: boolean
  readonly children: React.ReactNode
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
          role="img"
          aria-label="Toggle section"
        >
          <title>Toggle section</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        className={`transition-all duration-300 ease-in-out ${
          open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="border-t border-gray-100 px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

// --- Copy Button ---

const CopyButton = ({ text }: { readonly text: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// --- Health Badge ---

const healthColor = (health: string) =>
  pipe(
    Match.value(health),
    Match.when('HEALTHY', () => 'bg-green-100 text-green-800'),
    Match.when('NEEDS_ATTENTION', () => 'bg-yellow-100 text-yellow-800'),
    Match.when('SICK', () => 'bg-red-100 text-red-800'),
    Match.orElse(() => 'bg-gray-100 text-gray-800')
  )

// --- Rating Bar ---

const RatingBar = ({
  label,
  value,
  max = 5,
}: {
  readonly label: string
  readonly value: number
  readonly max?: number
}) => (
  <div className="flex items-center gap-2">
    <span className="w-28 text-xs text-gray-600">{label}</span>
    <div className="flex gap-0.5">
      {pipe(
        Array.range(1, max),
        Array.map((i) => (
          <div
            key={i}
            className={`h-2 w-4 rounded-sm ${
              i <= value ? 'bg-primary-500' : 'bg-gray-200'
            }`}
          />
        ))
      )}
    </div>
    <span className="text-xs text-gray-500">
      {value}/{max}
    </span>
  </div>
)

// --- Similarity Badge ---

const similarityColor = (similarity: number) =>
  pipe(
    Match.value(true),
    Match.when(
      () => similarity >= 0.9,
      () => 'text-green-700 bg-green-50'
    ),
    Match.when(
      () => similarity >= 0.8,
      () => 'text-blue-700 bg-blue-50'
    ),
    Match.when(
      () => similarity >= 0.7,
      () => 'text-amber-700 bg-amber-50'
    ),
    Match.orElse(() => 'text-gray-700 bg-gray-50')
  )

// --- RAG Chunk Card ---

const RagChunkCard = ({ chunk }: { readonly chunk: PromptPreviewRagChunk }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-3">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${similarityColor(chunk.similarity)}`}
      >
        {Math.round(chunk.similarity * 100)}%
      </span>
      <span className="text-xs text-gray-500">{chunk.source}</span>
      {pipe(
        Option.fromNullable(chunk.plantType),
        Option.match({
          onNone: () => null,
          onSome: (pt) => (
            <span className="rounded bg-primary-50 px-1.5 py-0.5 text-xs text-primary-700">
              {pt}
            </span>
          ),
        })
      )}
      {pipe(
        Option.fromNullable(chunk.category),
        Option.match({
          onNone: () => null,
          onSome: (cat) => (
            <span className="rounded bg-coral-50 px-1.5 py-0.5 text-xs text-coral-600">
              {cat}
            </span>
          ),
        })
      )}
    </div>
    <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
      {chunk.content}
    </p>
  </div>
)

// --- Section Renderers ---

const MessageSection = ({ data }: { readonly data: PromptPreviewResponse }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          data.message.role === 'user'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {data.message.role}
      </span>
      <span className="text-xs text-gray-500">{data.message.createdAt}</span>
      {data.hasImage && (
        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
          Has image
        </span>
      )}
    </div>
    <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-800">
      {data.message.content}
    </p>
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Model:</span>
      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
        {data.model}
      </span>
    </div>
  </div>
)

const PlantSection = ({ data }: { readonly data: PromptPreviewResponse }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-semibold text-gray-900">{data.plant.name}</h3>
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthColor(data.plant.health)}`}
      >
        {data.plant.health}
      </span>
      {pipe(
        Option.fromNullable(data.plant.category),
        Option.match({
          onNone: () => null,
          onSome: (cat) => (
            <span className="rounded bg-primary-50 px-1.5 py-0.5 text-xs text-primary-700">
              {cat}
            </span>
          ),
        })
      )}
    </div>

    {pipe(
      Option.fromNullable(data.plant.description),
      Option.match({
        onNone: () => null,
        onSome: (desc) => <p className="text-xs text-gray-600">{desc}</p>,
      })
    )}

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-700">Care Ratings</p>
        <RatingBar label="Humidity" value={data.plant.humidityRating} />
        <RatingBar label="Light" value={data.plant.lightingRating} />
        <RatingBar label="Watering" value={data.plant.wateringRating} />
        <RatingBar label="Pet toxicity" value={data.plant.petToxicityRating} />
      </div>
      <div className="space-y-2 text-xs text-gray-600">
        <p className="font-medium text-gray-700">Schedule</p>
        <p>Watering: Every {data.plant.wateringFrequencyDays} days</p>
        {pipe(
          Option.fromNullable(data.plant.lastWateredAt),
          Option.match({
            onNone: () => <p>Last watered: Not recorded</p>,
            onSome: (d) => <p>Last watered: {d}</p>,
          })
        )}
        {pipe(
          Option.fromNullable(data.plant.fertilizationFrequencyDays),
          Option.match({
            onNone: () => <p>Fertilization: Not set</p>,
            onSome: (days) => <p>Fertilization: Every {days} days</p>,
          })
        )}
        <p>In collection: {data.plant.daysSinceAdded} days</p>
      </div>
    </div>
  </div>
)

const CareHistorySection = ({
  careHistory,
}: {
  readonly careHistory: ReadonlyArray<PromptPreviewCareEntry>
}) =>
  Array.isEmptyReadonlyArray(careHistory) ? (
    <p className="text-sm text-gray-500">No care events recorded yet</p>
  ) : (
    <div className="space-y-2">
      {pipe(
        careHistory,
        Array.map((entry) => (
          <div
            key={`${entry.type}-${entry.date}`}
            className="flex items-start gap-3 border-l-2 border-primary-200 pl-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary-50 px-1.5 py-0.5 text-xs font-medium text-primary-700">
                  {entry.type}
                </span>
                <span className="text-xs text-gray-500">{entry.date}</span>
              </div>
              {pipe(
                Option.fromNullable(entry.notes),
                Option.match({
                  onNone: () => null,
                  onSome: (notes) => (
                    <p className="mt-1 text-xs text-gray-600">
                      &quot;{notes}&quot;
                    </p>
                  ),
                })
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )

const RagSection = ({
  translatedQuery,
  ragQuery,
  ragChunks,
}: {
  readonly translatedQuery: string
  readonly ragQuery: string
  readonly ragChunks: ReadonlyArray<PromptPreviewRagChunk>
}) => (
  <div className="space-y-3">
    <div>
      <p className="mb-1 text-xs font-medium text-gray-700">Translated Query</p>
      <p className="rounded bg-amber-50 px-3 py-2 font-mono text-xs text-amber-800">
        {translatedQuery}
      </p>
    </div>
    <div>
      <p className="mb-1 text-xs font-medium text-gray-700">RAG Query</p>
      <p className="rounded bg-purple-50 px-3 py-2 font-mono text-xs text-purple-800">
        {ragQuery}
      </p>
    </div>
    {Array.isEmptyReadonlyArray(ragChunks) ? (
      <p className="text-sm text-gray-500">
        No matching knowledge chunks found
      </p>
    ) : (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          {ragChunks.length} chunk{ragChunks.length !== 1 ? 's' : ''} retrieved
        </p>
        {pipe(
          ragChunks,
          Array.map((chunk) => <RagChunkCard key={chunk.id} chunk={chunk} />)
        )}
      </div>
    )}
  </div>
)

const ConversationSection = ({
  history,
}: {
  readonly history: ReadonlyArray<PromptPreviewConversationEntry>
}) =>
  Array.isEmptyReadonlyArray(history) ? (
    <p className="text-sm text-gray-500">
      First message in conversation — no prior context
    </p>
  ) : (
    <div className="space-y-2">
      {pipe(
        history,
        Array.map((entry) => (
          <div
            key={`${entry.role}-${entry.createdAt}`}
            className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                entry.role === 'user'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap text-xs">{entry.content}</p>
              <p className="mt-1 text-[10px] opacity-60">{entry.createdAt}</p>
            </div>
          </div>
        ))
      )}
    </div>
  )

// --- Main Page ---

export const PromptPreviewPage = () => {
  const preview = usePromptPreview()
  const [messageId, setMessageId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = pipe(messageId, String.trim)
    if (String.isNonEmpty(trimmed)) {
      preview.mutate(trimmed)
    }
  }

  const data = pipe(Option.fromNullable(preview.data), Option.getOrUndefined)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Prompt Preview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter a chat message ID to see the full prompt assembled for the AI,
          including all context sources used to generate the response.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex gap-3 rounded-lg border border-gray-200 bg-white p-4"
      >
        <input
          type="text"
          value={messageId}
          onChange={(e) => setMessageId(e.target.value)}
          placeholder="Enter message UUID (e.g. a1b2c3d4-e5f6-...)"
          className="block flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={
            pipe(messageId, String.trim, String.isEmpty) || preview.isPending
          }
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {preview.isPending ? 'Loading...' : 'Preview'}
        </button>
      </form>

      {preview.isError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {pipe(
            Match.value((preview.error as { status?: number }).status),
            Match.when(404, () => 'Message not found — check the UUID'),
            Match.orElse(() => preview.error.message)
          )}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <CollapsibleSection
            step={1}
            title="Original Message"
            description="The user message that triggered this AI response"
            color="bg-blue-600"
            defaultOpen
          >
            <MessageSection data={data} />
          </CollapsibleSection>

          <CollapsibleSection
            step={2}
            title="Plant Context"
            description="Plant data injected into the system prompt to personalize advice"
            color="bg-green-600"
          >
            <PlantSection data={data} />
          </CollapsibleSection>

          <CollapsibleSection
            step={3}
            title="Care History"
            description="Recent care events providing behavioral context about the plant"
            color="bg-amber-600"
          >
            <CareHistorySection careHistory={data.careHistory} />
          </CollapsibleSection>

          <CollapsibleSection
            step={4}
            title="RAG Knowledge Retrieval"
            description="Knowledge chunks retrieved via semantic search to augment the AI's response"
            color="bg-purple-600"
          >
            <RagSection
              translatedQuery={data.translatedQuery}
              ragQuery={data.ragQuery}
              ragChunks={data.ragChunks}
            />
          </CollapsibleSection>

          <CollapsibleSection
            step={5}
            title="Conversation History"
            description="Previous messages the AI sees as context for this conversation"
            color="bg-gray-600"
          >
            <ConversationSection history={data.conversationHistory} />
          </CollapsibleSection>

          <CollapsibleSection
            step={6}
            title="Formatted RAG Context"
            description="The exact markdown string injected into the system prompt from RAG retrieval"
            color="bg-purple-400"
          >
            <div className="space-y-2">
              <div className="flex justify-end">
                <CopyButton text={data.formattedRagContext} />
              </div>
              {String.isEmpty(data.formattedRagContext) ? (
                <p className="text-sm text-gray-500">
                  No RAG context was generated (no matching chunks)
                </p>
              ) : (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-700">
                  {data.formattedRagContext}
                </pre>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            step={7}
            title="Full System Prompt"
            description="The complete system prompt sent to the AI model — the final assembled instruction"
            color="bg-red-600"
            defaultOpen
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                  {data.model}
                </span>
                <CopyButton text={data.systemPrompt} />
              </div>
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md bg-gray-900 p-4 font-mono text-xs leading-relaxed text-gray-100">
                {data.systemPrompt}
              </pre>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
