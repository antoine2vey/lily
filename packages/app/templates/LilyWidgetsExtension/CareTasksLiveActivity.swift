import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct CareTasksLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CareTasksAttributes.self) { context in
      CareTasksLockScreenView(state: context.state)
        .widgetURL(URL(string: "lily://care"))
    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded presentation (long-press / tap). Same design language
        // as the lock-screen card — app icon on the leading edge, remaining
        // plant count on the trailing edge, title + tinted pill row +
        // progress bar stacked across the wide bottom region.
        DynamicIslandExpandedRegion(.leading) {
          AppIconView(size: 32)
        }
        DynamicIslandExpandedRegion(.trailing) {
          DIRemainingCount(totalPlants: context.state.totalPlants)
        }
        DynamicIslandExpandedRegion(.bottom) {
          DIExpandedBottom(state: context.state)
        }
      } compactLeading: {
        AppIconView(size: 20)
      } compactTrailing: {
        Text("\(context.state.totalPlants)")
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundColor(Color(red: 0.36, green: 0.55, blue: 0.36))
      } minimal: {
        AppIconView(size: 20)
      }
      .widgetURL(URL(string: "lily://care"))
    }
  }
}

@available(iOS 16.2, *)
struct CareTasksLockScreenView: View {
  let state: CareTasksAttributes.ContentState

  private var ratio: Double {
    let total = state.completedToday + state.totalPlants
    guard total > 0 else { return 0 }
    return min(1, max(0, Double(state.completedToday) / Double(total)))
  }

  var body: some View {
    // The vertical "padding" is implemented as fixed-height `Color.clear`
    // spacers rather than `.padding(.vertical, …)` — iOS strips view
    // padding inside Live Activities for snapshot-budget reasons, but it
    // can't strip actual layout-participating views. The horizontal padding
    // is applied normally because iOS leaves that alone.
    // Vertical "padding" via Rectangle spacers (Rectangle is non-flexible,
    // so iOS won't compress it under layout pressure the way it would
    // compress a `Color`). Internal content is sized conservatively to
    // leave the spacers room within the lock-screen's content budget.
    VStack(alignment: .leading, spacing: 0) {
      Rectangle().fill(Color.clear).frame(height: 20)

      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .center, spacing: 12) {
          AppIconView(size: 36)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
              Text("🌱")
                .font(.system(size: 20))
              Text(state.title)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            }
            Text(state.headline)
              .font(.footnote)
              .foregroundColor(.secondary)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
        }

        // Single-line tinted pill row. Much shorter vertically than the
        // hero-badge version, which gives us real vertical margin budget.
        HStack(spacing: 8) {
          ForEach(Array(state.groups.prefix(4).enumerated()), id: \.offset) {
            _, group in
            CarePill(group: group)
          }
          Spacer(minLength: 0)
        }

        ProgressBar(ratio: ratio)
      }

      Rectangle().fill(Color.clear).frame(height: 20)
    }
    .padding(.horizontal, 20)
    .modifier(LiveActivityContainerBackground())
  }
}

@available(iOS 16.2, *)
struct LiveActivityContainerBackground: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(for: .widget) { Color.clear }
    } else {
      content
    }
  }
}

@available(iOS 16.2, *)
struct AppIconView: View {
  let size: CGFloat

  var body: some View {
    Image("WidgetAppIcon")
      .renderingMode(.original)
      .resizable()
      .aspectRatio(contentMode: .fill)
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
  }
}

// Per-care-type compact pill: emoji + count in a tinted capsule. Single
// horizontal line — chosen over the taller hero-badge layout to free
// vertical budget for visible top/bottom margins within the lock-screen
// Live Activity's fixed content area.
@available(iOS 16.2, *)
struct CarePill: View {
  let group: CareTasksAttributes.ContentState.Group

  var body: some View {
    let tint = careTint(group.careType)
    HStack(spacing: 4) {
      Text(careEmoji(group.careType))
        .font(.system(size: 15))
      Text("\(group.count)")
        .font(.system(size: 14, weight: .bold, design: .rounded))
        .foregroundColor(tint)
        .monospacedDigit()
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(Capsule().fill(tint.opacity(0.18)))
  }
}

// Dynamic Island trailing region — the remaining-plants count as a big
// rounded green number with a small descriptive label underneath. Mirrors
// the "key stat" pattern Apple uses in their own DI samples (delivery ETA,
// score, etc.).
@available(iOS 16.2, *)
struct DIRemainingCount: View {
  let totalPlants: Int

  var body: some View {
    // Just the number — previously had 🪴 but that now conflicts with the
    // repotting pill's glyph. Keeping it number-only avoids the visual
    // collision and matches Apple's own DI trailing patterns (single bold
    // stat).
    Text("\(totalPlants)")
      .font(.system(size: 22, weight: .bold, design: .rounded))
      .foregroundColor(Color(red: 0.36, green: 0.55, blue: 0.36))
      .monospacedDigit()
  }
}

// Dynamic Island `.bottom` region — condensed version of the lock-screen
// design. Title row + pill row + progress bar. Vertical spacing is tighter
// (8pt vs 14pt) because the DI expanded area is shorter than the lock
// screen card.
@available(iOS 16.2, *)
struct DIExpandedBottom: View {
  let state: CareTasksAttributes.ContentState

  private var ratio: Double {
    let total = state.completedToday + state.totalPlants
    guard total > 0 else { return 0 }
    return min(1, max(0, Double(state.completedToday) / Double(total)))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        Text("🌱")
          .font(.system(size: 18))
        Text(state.title)
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .lineLimit(1)
          .minimumScaleFactor(0.85)
      }

      HStack(spacing: 8) {
        ForEach(Array(state.groups.prefix(4).enumerated()), id: \.offset) {
          _, group in
          CarePill(group: group)
        }
        Spacer(minLength: 0)
      }

      ProgressBar(ratio: ratio)
    }
    .padding(.top, 4)
  }
}

// Full-width 6pt progress bar with a gradient fill and a diagonal-stripe
// overlay for visual texture. Apple ignores SwiftUI animation modifiers
// inside Live Activities, so the stripes can't actually flow — but the
// pattern itself reads as "in progress / active" on a static snapshot.
@available(iOS 16.2, *)
struct ProgressBar: View {
  let ratio: Double

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.green.opacity(0.15))
        Capsule()
          .fill(
            LinearGradient(
              colors: [
                Color(red: 0.36, green: 0.55, blue: 0.36),
                Color(red: 0.45, green: 0.70, blue: 0.45),
              ],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
          .overlay(
            Stripes(spacing: 10, lineWidth: 3, angle: .degrees(-35))
              .fill(Color.white.opacity(0.22))
              .clipShape(Capsule())
          )
          // Explicit width preserves proper capsule rounding at any ratio.
          // `scaleEffect` compresses the corner radii and can make the
          // trailing edge of the fill read as flat at low ratios.
          .frame(width: max(0, geo.size.width * ratio))
      }
    }
    .frame(height: 12)
  }
}

@available(iOS 16.2, *)
struct Stripes: Shape {
  var spacing: CGFloat = 10
  var lineWidth: CGFloat = 3
  var angle: Angle = .degrees(-35)

  func path(in rect: CGRect) -> Path {
    var p = Path()
    let radians = angle.radians
    let dx = spacing / max(0.001, abs(cos(radians)))
    let length = (rect.width + rect.height) * 1.5
    let count = Int((rect.width + rect.height) / dx) + 4
    for i in -count...count {
      let x = CGFloat(i) * dx
      let start = CGPoint(x: x, y: 0)
      let end = CGPoint(
        x: x + length * cos(radians),
        y: length * sin(radians)
      )
      p.move(to: start)
      p.addLine(to: end)
    }
    return p.strokedPath(StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
  }
}

// MARK: - CareType → presentation helpers
//
// Strings here mirror the CareType union in
// `packages/shared/src/domains/care/types.ts`. Update both sides together.

@available(iOS 16.2, *)
private func careEmoji(_ careType: String) -> String {
  switch careType {
  case "watering": return "💧"
  case "fertilization": return "🌿"
  // 💦 (splash / fine droplets) reads as "mist" better than a single
  // droplet; ☁️ was too ambiguous (weather vs care action).
  case "misting": return "💦"
  // 🪴 "potted plant" — literal match for repotting.
  case "repotting": return "🪴"
  default: return "🌱"
  }
}

@available(iOS 16.2, *)
private func careTint(_ careType: String) -> Color {
  switch careType {
  case "watering": return Color(red: 0.30, green: 0.55, blue: 0.85)
  case "fertilization": return Color(red: 0.36, green: 0.55, blue: 0.36)
  case "misting": return Color(red: 0.45, green: 0.65, blue: 0.85)
  case "repotting": return Color(red: 0.65, green: 0.45, blue: 0.30)
  default: return .gray
  }
}

