import ExpoModulesCore
import Foundation
import WidgetKit

private struct WidgetChannel {
  let appGroup: String
  let snapshotFile: String
  let todayKind: String

  static func fromInfoPlist(_ bundle: Bundle = .main) -> WidgetChannel? {
    guard
      let dict = bundle.object(forInfoDictionaryKey: "LilyWidgetChannel")
        as? [String: String],
      let appGroup = dict["appGroup"],
      let snapshotFile = dict["snapshotFile"],
      let todayKind = dict["todayKind"]
    else { return nil }
    return WidgetChannel(
      appGroup: appGroup, snapshotFile: snapshotFile, todayKind: todayKind)
  }

  var snapshotURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent(snapshotFile)
  }
}

private enum WriteOutcome: String {
  case written, unchanged, unavailable
}

public class ExpoLilyWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLilyWidgetModule")

    AsyncFunction("writeTodaySnapshot") { (json: String) throws -> String in
      guard let channel = WidgetChannel.fromInfoPlist(),
        let url = channel.snapshotURL
      else { return WriteOutcome.unavailable.rawValue }

      let data = Data(json.utf8)
      if let existing = try? Data(contentsOf: url), existing == data {
        return WriteOutcome.unchanged.rawValue
      }
      try data.write(
        to: url,
        options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      WidgetCenter.shared.reloadTimelines(ofKind: channel.todayKind)
      return WriteOutcome.written.rawValue
    }
  }
}
