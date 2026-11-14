import { Array, Option, pipe, Tracer } from 'effect'

export const recordSpans = () => {
  const spans: Tracer.NativeSpan[] = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const attributesOf = (name: string) =>
    pipe(
      Array.findFirst(spans, (span) => span.name === name),
      Option.map((span) => Object.fromEntries(span.attributes)),
      Option.getOrThrowWith(() => new Error(`no span named ${name}`))
    )
  return { tracer, attributesOf }
}
