import SwiftUI
import WidgetKit

enum WidgetLinks {
  static let root = URL(string: "lily://")!
  static let care = URL(string: "lily://care")!

  static func plant(_ id: String) -> URL {
    URL(string: "lily://plant/\(id)") ?? care
  }
}

struct TodayWidgetView: View {
  let entry: TodayEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    content.modifier(TodayWidgetContainer())
  }

  @ViewBuilder private var content: some View {
    switch entry.content {
    case .placeholder:
      DayView(title: GalleryCopy.name, day: .redactedPlaceholder, family: family)
        .redacted(reason: .placeholder)
    case .unconfigured:
      MessageView(title: GalleryCopy.name, message: nil)
        .widgetURL(WidgetLinks.root)
    case .signedOut(let title, let message):
      MessageView(title: title, message: message)
        .widgetURL(WidgetLinks.root)
    case .stale(let title, let message):
      MessageView(title: title, message: message)
        .widgetURL(WidgetLinks.care)
    case .day(let title, let day):
      DayView(title: title, day: day, family: family)
        .widgetURL(WidgetLinks.care)
    }
  }
}

private struct DayView: View {
  let title: String
  let day: TodayWidgetDay
  let family: WidgetFamily

  var body: some View {
    switch family {
    case .systemMedium:
      MediumDayView(title: title, day: day)
    default:
      SmallDayView(title: title, day: day)
    }
  }
}

private let widgetProgressHeight: CGFloat = 8

private struct SmallDayView: View {
  let title: String
  let day: TodayWidgetDay

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      WidgetHeader(title: title)
      Text(day.headline)
        .font(.footnote.weight(.semibold))
        .lineLimit(2)
        .minimumScaleFactor(0.85)
      Spacer(minLength: 0)
      if day.status == .due {
        ViewThatFits(in: .vertical) {
          CompactPlantList(day: day, limit: 2)
          CompactPlantList(day: day, limit: 1)
        }
        .layoutPriority(1)
        // Equal to the spacer above, so the list sits centred between the
        // headline and the bar.
        Spacer(minLength: 0)
      }
      if day.status != .clear {
        ProgressBar(ratio: day.progress, height: widgetProgressHeight)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

private struct MediumDayView: View {
  let title: String
  let day: TodayWidgetDay
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top, spacing: 14) {
        VStack(alignment: .leading, spacing: 4) {
          WidgetHeader(title: title)
          DayBadge(day: day, size: 34)
          caption
        }
        .frame(maxWidth: day.status == .due ? 124 : .infinity, alignment: .leading)

        if day.status == .due {
          ViewThatFits(in: .vertical) {
            DetailedPlantList(day: day, limit: 3)
            DetailedPlantList(day: day, limit: 2)
            DetailedPlantList(day: day, limit: 1)
          }
          .frame(maxWidth: .infinity, alignment: .topLeading)
        }
      }
      .layoutPriority(1)
      Spacer(minLength: 0)
      if day.status != .clear {
        ProgressBar(ratio: day.progress, height: widgetProgressHeight)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  @ViewBuilder private var caption: some View {
    if day.status == .due {
      Text(day.caption)
        .font(.caption.weight(.semibold))
        .foregroundColor(countColor(day, scheme))
        .lineLimit(2)
    } else {
      Text(day.caption)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
  }
}

private func countColor(_ day: TodayWidgetDay, _ scheme: ColorScheme) -> Color {
  day.overdueCount > 0 ? LilyPalette.coral : LilyPalette.brand(scheme)
}

private struct WidgetHeader: View {
  let title: String

  var body: some View {
    HStack(alignment: .center, spacing: 6) {
      AppIconView(size: 20)
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}

private struct DayBadge: View {
  let day: TodayWidgetDay
  let size: CGFloat
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    switch day.status {
    case .due:
      Text("\(day.plantCount)")
        .font(.system(size: size, weight: .bold, design: .rounded))
        .monospacedDigit()
        .foregroundColor(countColor(day, scheme))
        .widgetAccentable()
    case .allDone:
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: size * 0.8, weight: .semibold))
        .foregroundColor(LilyPalette.brand(scheme))
        .widgetAccentable()
    case .clear:
      Text("🌱").font(.system(size: size * 0.75))
    }
  }
}

private struct CareGlyphs: View {
  let careTypes: [String]
  @ScaledMetric(relativeTo: .caption) private var size: CGFloat = 12

  var body: some View {
    HStack(spacing: -size * 0.2) {
      ForEach(Array(careTypes.prefix(2)), id: \.self) { type in
        Text(careEmoji(type)).font(.system(size: size))
      }
    }
    .padding(.horizontal, size * 0.45)
    .padding(.vertical, size * 0.25)
    .background(Capsule().fill(careTint(careTypes.first ?? "").opacity(0.18)))
  }
}

private struct CompactPlantList: View {
  let day: TodayWidgetDay
  let limit: Int

  var body: some View {
    let shown = Array(day.rows.prefix(limit))
    VStack(alignment: .leading, spacing: 3) {
      ForEach(shown, id: \.plantId) { row in
        HStack(spacing: 6) {
          CareGlyphs(careTypes: row.careTypes)
          Text(row.plantName)
            .font(.caption.weight(.medium))
            .lineLimit(1)
          Spacer(minLength: 2)
          if row.lateLabel != nil {
            Circle().fill(LilyPalette.coral).frame(width: 6, height: 6)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(row))
      }
      if let more = day.moreLabel(showing: shown.count) {
        MoreLabel(text: more)
      }
    }
  }
}

private struct DetailedPlantList: View {
  let day: TodayWidgetDay
  let limit: Int

  var body: some View {
    let shown = Array(day.rows.prefix(limit))
    VStack(alignment: .leading, spacing: 5) {
      ForEach(shown, id: \.plantId) { row in
        Link(destination: WidgetLinks.plant(row.plantId)) {
          DetailedPlantRow(row: row)
        }
      }
      if let more = day.moreLabel(showing: shown.count) {
        MoreLabel(text: more)
      }
    }
  }
}

private struct DetailedPlantRow: View {
  let row: TodayWidgetRow

  var body: some View {
    HStack(spacing: 8) {
      CareGlyphs(careTypes: row.careTypes)
      VStack(alignment: .leading, spacing: 0) {
        Text(row.plantName)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let late = row.lateLabel {
          Text(late)
            .font(.caption2.weight(.medium))
            .foregroundColor(LilyPalette.coral)
            .lineLimit(1)
        } else {
          Text(row.detail)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(rowAccessibilityLabel(row))
  }
}

private struct MoreLabel: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(.secondary)
      .lineLimit(1)
  }
}

private func rowAccessibilityLabel(_ row: TodayWidgetRow) -> String {
  [row.plantName, row.detail, row.lateLabel].compactMap { $0 }.joined(
    separator: ", ")
}

private struct MessageView: View {
  let title: String
  let message: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      AppIconView(size: 30)
      Spacer(minLength: 0)
      Text(title)
        .font(.headline)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
      if let message {
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(3)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

private struct TodayWidgetBackground: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack {
      Color(uiColor: .systemBackground)
      LinearGradient(
        colors: [
          LilyPalette.brand(scheme).opacity(scheme == .dark ? 0.18 : 0.10),
          .clear,
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    }
  }
}

// iOS 17 requires containerBackground and adds the content margins itself;
// iOS 16 needs both done by hand.
private struct TodayWidgetContainer: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(for: .widget) { TodayWidgetBackground() }
    } else {
      content.padding(16).background(TodayWidgetBackground())
    }
  }
}

extension TodayWidgetDay {
  fileprivate static let redactedPlaceholder = TodayWidgetDay(
    startsAt: Date(timeIntervalSince1970: 0),
    status: .due,
    plantCount: 3,
    overdueCount: 0,
    completedCount: 1,
    headline: "3 plants need care",
    caption: "plants need care",
    rows: [
      TodayWidgetRow(
        plantId: "a", plantName: "Monstera", careTypes: ["watering"],
        detail: "Water", lateLabel: nil),
      TodayWidgetRow(
        plantId: "b", plantName: "Boston Fern", careTypes: ["misting"],
        detail: "Mist", lateLabel: nil),
      TodayWidgetRow(
        plantId: "c", plantName: "Pothos", careTypes: ["fertilization"],
        detail: "Fertilize", lateLabel: nil),
    ],
    moreLabels: ["+2 plants", "+1 plant", nil]
  )
}
