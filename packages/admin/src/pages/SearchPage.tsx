import { Array, Match, Option, pipe, String } from 'effect'
import { useState } from 'react'
import type { ChunkSearchResult } from '@/hooks/use-search-knowledge'
import { useSearchKnowledge } from '@/hooks/use-search-knowledge'

const categoryLabel = (category: string) =>
  pipe(
    Match.value(category),
    Match.when('watering_advice', () => 'Watering'),
    Match.when('pest_identification', () => 'Pests'),
    Match.when('disease_diagnosis', () => 'Disease'),
    Match.when('light_requirements', () => 'Light'),
    Match.when('soil_nutrients', () => 'Soil'),
    Match.when('propagation', () => 'Propagation'),
    Match.when('general_care', () => 'General'),
    Match.orElse(() => category)
  )

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
    Match.orElse(() => 'text-gray-700 bg-gray-50')
  )

const ChunkCard = ({ chunk }: { readonly chunk: ChunkSearchResult }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="mb-2 flex items-center gap-2">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${similarityColor(chunk.similarity)}`}
      >
        {Math.round(chunk.similarity * 100)}%
      </span>
      {pipe(
        Option.fromNullable(chunk.sourceUrl),
        Option.match({
          onNone: () => (
            <span className="text-xs text-gray-500">{chunk.source}</span>
          ),
          onSome: (url) => (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 underline hover:text-primary-800"
            >
              {chunk.source}
            </a>
          ),
        })
      )}
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
              {categoryLabel(cat)}
            </span>
          ),
        })
      )}
    </div>
    <p className="whitespace-pre-wrap text-sm text-gray-700">{chunk.content}</p>
  </div>
)

export const SearchPage = () => {
  const search = useSearchKnowledge()

  const [query, setQuery] = useState('')
  const [plantType, setPlantType] = useState('')
  const [limit, setLimit] = useState(5)
  const [minSimilarity, setMinSimilarity] = useState(0.7)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedPlantType = pipe(plantType, String.trim)
    search.mutate({
      query,
      ...(String.isNonEmpty(trimmedPlantType)
        ? { plantType: trimmedPlantType }
        : {}),
      limit,
      minSimilarity,
    })
  }

  const results = pipe(
    Option.fromNullable(search.data),
    Option.getOrElse((): ReadonlyArray<ChunkSearchResult> => [])
  )

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Search Knowledge Base</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        <div>
          <label
            htmlFor="query"
            className="block text-sm font-medium text-gray-700"
          >
            Query
          </label>
          <input
            id="query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How often should I water my monstera?"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="plantType"
              className="block text-sm font-medium text-gray-700"
            >
              Plant type filter
            </label>
            <input
              id="plantType"
              type="text"
              value={plantType}
              onChange={(e) => setPlantType(e.target.value)}
              placeholder="Optional — e.g. monstera"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="limit"
              className="block text-sm font-medium text-gray-700"
            >
              Limit
            </label>
            <input
              id="limit"
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="minSimilarity"
              className="block text-sm font-medium text-gray-700"
            >
              Min similarity
            </label>
            <input
              id="minSimilarity"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={minSimilarity}
              onChange={(e) => setMinSimilarity(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            pipe(query, String.trim, String.isEmpty) || search.isPending
          }
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {search.isPending ? 'Searching...' : 'Search'}
        </button>
      </form>

      {search.isError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {search.error.message}
        </div>
      )}

      {search.isSuccess && (
        <div>
          <p className="mb-3 text-sm text-gray-500">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          {Array.isEmptyReadonlyArray(results) ? (
            <p className="text-sm text-gray-500">
              No matching chunks found. Try a different query or relax filters.
            </p>
          ) : (
            <div className="space-y-3">
              {pipe(
                results,
                Array.map((chunk) => <ChunkCard key={chunk.id} chunk={chunk} />)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
