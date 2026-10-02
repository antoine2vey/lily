import Foundation

struct TodayWidgetRow: Decodable, Hashable {
  let plantId: String
  let plantName: String
  // Raw strings, not an enum: a care type added later must not make an
  // installed extension reject the whole snapshot.
  let careTypes: [String]
  let detail: String
  let lateLabel: String?
}

struct TodayWidgetDay: Decodable, Hashable {
  enum Status: String, Decodable {
    case due, allDone, clear
  }

  let startsAt: Date
  let status: Status
  let plantCount: Int
  let overdueCount: Int
  let completedCount: Int
  let headline: String
  let caption: String
  let rows: [TodayWidgetRow]
  let moreLabels: [String?]

  func moreLabel(showing shown: Int) -> String? {
    guard shown > 0, shown <= moreLabels.count else { return nil }
    return moreLabels[shown - 1]
  }

  var progress: Double {
    careProgress(completed: completedCount, pending: plantCount)
  }
}

struct TodayWidgetReady: Hashable {
  let title: String
  let firstDay: TodayWidgetDay
  let laterDays: [TodayWidgetDay]
  let staleAt: Date
  let staleMessage: String

  var days: [TodayWidgetDay] { [firstDay] + laterDays }

  // A clock earlier than the first midnight (the user crossed time zones
  // after the app wrote the snapshot) still shows the snapshot's first day.
  func dayShowing(at date: Date) -> TodayWidgetDay {
    days.last { $0.startsAt <= date } ?? firstDay
  }
}

enum TodayWidgetSnapshot: Decodable, Hashable {
  case signedOut(title: String, message: String)
  case ready(TodayWidgetReady)

  static let version = 1

  private enum CodingKeys: String, CodingKey {
    case tag = "_tag"
    case v, title, message, days, staleAt, staleMessage
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let version = try c.decode(Int.self, forKey: .v)
    guard version == Self.version else {
      throw DecodingError.dataCorruptedError(
        forKey: .v, in: c, debugDescription: "Unsupported version \(version)")
    }
    let title = try c.decode(String.self, forKey: .title)
    switch try c.decode(String.self, forKey: .tag) {
    case "SignedOut":
      self = .signedOut(
        title: title, message: try c.decode(String.self, forKey: .message))
    case "Ready":
      let days = try c.decode([TodayWidgetDay].self, forKey: .days)
      guard let firstDay = days.first else {
        throw DecodingError.dataCorruptedError(
          forKey: .days, in: c, debugDescription: "Ready without days")
      }
      self = .ready(
        TodayWidgetReady(
          title: title,
          firstDay: firstDay,
          laterDays: Array(days.dropFirst()),
          staleAt: try c.decode(Date.self, forKey: .staleAt),
          staleMessage: try c.decode(String.self, forKey: .staleMessage)))
    case let tag:
      throw DecodingError.dataCorruptedError(
        forKey: .tag, in: c, debugDescription: "Unknown tag \(tag)")
    }
  }

  static func decode(_ data: Data) throws -> TodayWidgetSnapshot {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return try decoder.decode(TodayWidgetSnapshot.self, from: data)
  }
}

struct TodayWidgetChannel {
  static let defaultKind = "LilyTodayWidget"

  let appGroup: String
  let snapshotFile: String
  let todayKind: String

  static func fromInfoPlist(_ bundle: Bundle = .main) -> TodayWidgetChannel? {
    guard
      let dict = bundle.object(forInfoDictionaryKey: "LilyWidgetChannel")
        as? [String: String],
      let appGroup = dict["appGroup"],
      let snapshotFile = dict["snapshotFile"],
      let todayKind = dict["todayKind"]
    else { return nil }
    return TodayWidgetChannel(
      appGroup: appGroup, snapshotFile: snapshotFile, todayKind: todayKind)
  }

  var snapshotURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent(snapshotFile)
  }
}

enum TodayWidgetStore {
  static func load(_ bundle: Bundle = .main) -> TodayWidgetSnapshot? {
    guard let url = TodayWidgetChannel.fromInfoPlist(bundle)?.snapshotURL,
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? TodayWidgetSnapshot.decode(data)
  }
}

enum TodayContent: Hashable {
  case placeholder
  case unconfigured
  case signedOut(title: String, message: String)
  case day(title: String, day: TodayWidgetDay)
  case stale(title: String, message: String)
}

struct TodayEntry: Hashable {
  let date: Date
  let content: TodayContent
}

enum TodayTimelinePlan {
  static func plan(_ load: TodayWidgetSnapshot?, now: Date) -> [TodayEntry] {
    switch load {
    case nil:
      return [TodayEntry(date: now, content: .unconfigured)]
    case .signedOut(let title, let message):
      return [
        TodayEntry(date: now, content: .signedOut(title: title, message: message))
      ]
    case .ready(let ready):
      let stale = TodayContent.stale(
        title: ready.title, message: ready.staleMessage)
      guard now < ready.staleAt else {
        return [TodayEntry(date: now, content: stale)]
      }
      let upcoming = ready.days.filter { $0.startsAt > now }
      return [
        TodayEntry(
          date: now, content: .day(title: ready.title, day: ready.dayShowing(at: now)))
      ]
        + upcoming.map {
          TodayEntry(date: $0.startsAt, content: .day(title: ready.title, day: $0))
        }
        + [TodayEntry(date: ready.staleAt, content: stale)]
    }
  }
}
