import SwiftUI
import WidgetKit

extension TodayEntry: TimelineEntry {}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(date: Date(), content: .placeholder)
  }

  func getSnapshot(
    in context: Context, completion: @escaping (TodayEntry) -> Void
  ) {
    let now = Date()
    let entry =
      TodayTimelinePlan.plan(TodayWidgetStore.load(), now: now).first
      ?? TodayEntry(date: now, content: .unconfigured)
    if context.isPreview, entry.content == .unconfigured {
      completion(placeholder(in: context))
    } else {
      completion(entry)
    }
  }

  func getTimeline(
    in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void
  ) {
    let entries = TodayTimelinePlan.plan(TodayWidgetStore.load(), now: Date())
    completion(Timeline(entries: entries, policy: .never))
  }
}

struct TodayWidget: Widget {
  let kind =
    TodayWidgetChannel.fromInfoPlist()?.todayKind ?? TodayWidgetChannel.defaultKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName(GalleryCopy.name)
    .description(GalleryCopy.description)
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

enum GalleryCopy {
  private static var isFrench: Bool {
    Locale.preferredLanguages.first?.hasPrefix("fr") ?? false
  }

  static var name: String { isFrench ? "Soins du jour" : "Today's care" }

  static var description: String {
    isFrench
      ? "Les plantes à soigner aujourd'hui, retards compris."
      : "Plants to care for today, plus anything overdue."
  }
}
